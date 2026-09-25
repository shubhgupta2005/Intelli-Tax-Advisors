"""ExpenseFlow — project expense tracker with bank-statement import (Intelli Workspace).

Runs on Vercel at intellitaxadvisors.com/employeeworkspace/expenses. Data: Supabase schema `expenseflow`;
attachments in the private `workspace` bucket under expenseflow/.
Sign-in is WorkDesk's: any active WorkDesk employee may use it (shared session cookie), or an API key (X-API-Key).
"""
import os
import re
import csv
import io
import time
import uuid
import json
import hashlib
from datetime import datetime, date
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, g, session, redirect
from werkzeug.utils import secure_filename

from . import pg

os.environ["TZ"] = "Asia/Kolkata"
if hasattr(time, "tzset"):
    time.tzset()

BASE = "/employeeworkspace/expenses"
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "employeeworkspace" / "expenses"

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip'}
MAX_FILE_SIZE = int(4.4 * 1024 * 1024)  # Vercel's request limit is 4.5 MB

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


class PrefixMiddleware:
    def __init__(self, wsgi):
        self.wsgi = wsgi

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path == BASE or path.startswith(BASE + "/"):
            environ["PATH_INFO"] = path[len(BASE):] or "/"
            environ["SCRIPT_NAME"] = BASE
        return self.wsgi(environ, start_response)


app.wsgi_app = PrefixMiddleware(app.wsgi_app)


# ── DB helpers ──────────────────────────────────────────────────────────────

def get_db():
    if 'db' not in g:
        g.db = pg.connect("expenseflow, wscompat")
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db:
        db.close()

def init_db():
    """Default categories and project on an empty database. Returns WorkDesk's session secret (shared sign-in)."""
    db = pg.connect("expenseflow, wscompat")
    try:
        if not db.execute("SELECT 1 FROM categories LIMIT 1").fetchone():
            default_categories = [
                ('Travel', '✈️', '#f59e0b'),
                ('Food & Dining', '🍽️', '#ef4444'),
                ('Software & Tools', '💻', '#8b5cf6'),
                ('Office Supplies', '📎', '#3b82f6'),
                ('Marketing', '📣', '#ec4899'),
                ('Utilities', '⚡', '#10b981'),
                ('Consulting', '🤝', '#6366f1'),
                ('Hardware', '🖥️', '#f97316'),
                ('Training', '📚', '#06b6d4'),
                ('Miscellaneous', '📦', '#6b7280'),
            ]
            for name, icon, color in default_categories:
                db.execute("INSERT OR IGNORE INTO categories (id, name, icon, color) VALUES (?,?,?,?)",
                           (str(uuid.uuid4()), name, icon, color))
        if not db.execute("SELECT 1 FROM projects LIMIT 1").fetchone():
            db.execute("INSERT INTO projects (id, name, description, color, budget) VALUES (?,?,?,?,?)",
                       (str(uuid.uuid4()), 'General', 'Default project for uncategorized expenses', '#6366f1', 10000))
        db.commit()
        r = db.execute("SELECT value FROM workdesk.settings WHERE key='secret'").fetchone()
        if not r:
            raise RuntimeError("WorkDesk isn't set up yet — open /employeeworkspace/ once, then reload ExpenseFlow.")
        return r[0]
    finally:
        db.close()


# ── Access: a signed-in WorkDesk employee, or a valid API key ────────────────

def key_hash(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


@app.before_request
def require_login():
    if request.path in ('/api/health', '/', '/index.html'):
        return None
    db = get_db()
    key = request.headers.get('X-API-Key')
    if key:
        row = db.execute("SELECT id FROM api_keys WHERE key_hash=?", (key_hash(key),)).fetchone()
        if not row:
            return jsonify({"error": "Invalid API key"}), 401
        db.execute("UPDATE api_keys SET last_used=datetime('now') WHERE id=?", (row['id'],))
        db.commit()
        return None
    uid = session.get("uid")
    if uid and db.execute("SELECT 1 FROM workdesk.employees WHERE id=? AND active=1", (uid,)).fetchone():
        return None
    return jsonify({"error": "Please sign in to Intelli Workspace", "login": "/employeeworkspace/"}), 401


def row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, (list, dict)):
                    d[k] = parsed
            except (json.JSONDecodeError, ValueError):
                pass
    return d


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ── Projects ─────────────────────────────────────────────────────────────────

@app.route('/api/projects', methods=['GET'])
def list_projects():
    db = get_db()
    projects = [row_to_dict(r) for r in db.execute("SELECT * FROM projects ORDER BY created_at DESC, id")]
    for p in projects:
        total = db.execute(
            "SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE project_id=?", (p['id'],)
        ).fetchone()['t']
        p['total_spent'] = total
        p['expense_count'] = db.execute(
            "SELECT COUNT(*) as c FROM expenses WHERE project_id=?", (p['id'],)
        ).fetchone()['c']
    return jsonify({"data": projects, "count": len(projects)})


@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "name is required"}), 400
    pid = str(uuid.uuid4())
    db = get_db()
    db.execute(
        "INSERT INTO projects (id, name, description, color, budget, status) VALUES (?,?,?,?,?,?)",
        (pid, data['name'], data.get('description'), data.get('color', '#6366f1'),
         data.get('budget', 0), data.get('status', 'active'))
    )
    db.commit()
    project = row_to_dict(db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())
    return jsonify({"data": project}), 201


@app.route('/api/projects/<pid>', methods=['GET'])
def get_project(pid):
    db = get_db()
    project = row_to_dict(db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())
    if not project:
        return jsonify({"error": "Not found"}), 404
    project['total_spent'] = db.execute(
        "SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE project_id=?", (pid,)
    ).fetchone()['t']
    expenses = [row_to_dict(r) for r in db.execute(
        "SELECT * FROM expenses WHERE project_id=? ORDER BY date DESC LIMIT 10", (pid,)
    )]
    project['recent_expenses'] = expenses
    return jsonify({"data": project})


@app.route('/api/projects/<pid>', methods=['PUT'])
def update_project(pid):
    db = get_db()
    data = request.get_json()
    fields = {k: v for k, v in data.items() if k in ('name', 'description', 'color', 'budget', 'status')}
    if not fields:
        return jsonify({"error": "No valid fields"}), 400
    fields['updated_at'] = datetime.utcnow().isoformat()
    set_clause = ', '.join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE projects SET {set_clause} WHERE id=?", list(fields.values()) + [pid])
    db.commit()
    return jsonify({"data": row_to_dict(db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())})


@app.route('/api/projects/<pid>', methods=['DELETE'])
def delete_project(pid):
    db = get_db()
    db.execute("DELETE FROM projects WHERE id=?", (pid,))
    db.commit()
    return jsonify({"message": "Deleted"})


# ── Categories ───────────────────────────────────────────────────────────────

@app.route('/api/categories', methods=['GET'])
def list_categories():
    db = get_db()
    cats = [row_to_dict(r) for r in db.execute("SELECT * FROM categories ORDER BY name")]
    return jsonify({"data": cats})


@app.route('/api/categories', methods=['POST'])
def create_category():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "name is required"}), 400
    cid = str(uuid.uuid4())
    db = get_db()
    try:
        db.execute(
            "INSERT INTO categories (id, name, icon, color) VALUES (?,?,?,?)",
            (cid, data['name'], data.get('icon', '📦'), data.get('color', '#6b7280'))
        )
        db.commit()
    except pg.IntegrityError:
        db.rollback()
        return jsonify({"error": "Category already exists"}), 409
    return jsonify({"data": row_to_dict(db.execute("SELECT * FROM categories WHERE id=?", (cid,)).fetchone())}), 201


@app.route('/api/categories/<cid>', methods=['DELETE'])
def delete_category(cid):
    db = get_db()
    db.execute("DELETE FROM categories WHERE id=?", (cid,))
    db.commit()
    return jsonify({"message": "Deleted"})


# ── Expenses ─────────────────────────────────────────────────────────────────

@app.route('/api/expenses', methods=['GET'])
def list_expenses():
    db = get_db()
    q = "SELECT e.*, p.name as project_name, p.color as project_color, c.name as category_name, c.icon as category_icon, c.color as category_color FROM expenses e LEFT JOIN projects p ON e.project_id=p.id LEFT JOIN categories c ON e.category_id=c.id WHERE 1=1"
    params = []

    if request.args.get('project_id'):
        q += " AND e.project_id=?"
        params.append(request.args['project_id'])
    if request.args.get('category_id'):
        q += " AND e.category_id=?"
        params.append(request.args['category_id'])
    if request.args.get('status'):
        q += " AND e.status=?"
        params.append(request.args['status'])
    if request.args.get('date_from'):
        q += " AND e.date>=?"
        params.append(request.args['date_from'])
    if request.args.get('date_to'):
        q += " AND e.date<=?"
        params.append(request.args['date_to'])
    if request.args.get('search'):
        q += " AND (e.title LIKE ? OR e.description LIKE ? OR e.vendor LIKE ?)"
        s = f"%{request.args['search']}%"
        params.extend([s, s, s])
    if request.args.get('min_amount'):
        q += " AND e.amount>=?"
        params.append(float(request.args['min_amount']))
    if request.args.get('max_amount'):
        q += " AND e.amount<=?"
        params.append(float(request.args['max_amount']))

    q += " ORDER BY e.date DESC, e.created_at DESC, e.id"

    limit = int(request.args.get('limit', 100))
    offset = int(request.args.get('offset', 0))
    q += f" LIMIT {limit} OFFSET {offset}"

    expenses = []
    for r in db.execute(q, params):
        exp = row_to_dict(r)
        exp['attachments'] = [row_to_dict(a) for a in db.execute(
            "SELECT * FROM attachments WHERE expense_id=?", (exp['id'],)
        )]
        expenses.append(exp)

    total_count = db.execute(
        "SELECT COUNT(*) as c FROM expenses e WHERE 1=1" +
        (" AND e.project_id=?" if request.args.get('project_id') else ""),
        [request.args['project_id']] if request.args.get('project_id') else []
    ).fetchone()['c']

    return jsonify({"data": expenses, "count": len(expenses), "total": total_count})


@app.route('/api/expenses', methods=['POST'])
def create_expense():
    data = request.get_json()
    if not data or not data.get('title') or data.get('amount') is None:
        return jsonify({"error": "title and amount are required"}), 400
    eid = str(uuid.uuid4())
    db = get_db()
    db.execute(
        """INSERT INTO expenses (id, title, amount, currency, date, project_id, category_id,
           description, status, paid_by, vendor, tags)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (eid, data['title'], float(data['amount']), data.get('currency', 'USD'),
         data.get('date', date.today().isoformat()),
         data.get('project_id'), data.get('category_id'),
         data.get('description'), data.get('status', 'pending'),
         data.get('paid_by'), data.get('vendor'),
         json.dumps(data.get('tags', [])))
    )
    db.commit()
    return jsonify({"data": _get_expense(db, eid)}), 201


@app.route('/api/expenses/<eid>', methods=['GET'])
def get_expense(eid):
    db = get_db()
    exp = _get_expense(db, eid)
    if not exp:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"data": exp})


@app.route('/api/expenses/<eid>', methods=['PUT'])
def update_expense(eid):
    db = get_db()
    data = request.get_json()
    allowed = ('title', 'amount', 'currency', 'date', 'project_id', 'category_id',
                'description', 'status', 'paid_by', 'vendor', 'tags')
    fields = {}
    for k in allowed:
        if k in data:
            fields[k] = json.dumps(data[k]) if k == 'tags' else data[k]
    if not fields:
        return jsonify({"error": "No valid fields"}), 400
    fields['updated_at'] = datetime.utcnow().isoformat()
    set_clause = ', '.join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE expenses SET {set_clause} WHERE id=?", list(fields.values()) + [eid])
    db.commit()
    return jsonify({"data": _get_expense(db, eid)})


@app.route('/api/expenses/<eid>', methods=['DELETE'])
def delete_expense(eid):
    db = get_db()
    # Delete attachment files
    files = ["expenseflow/" + att['filename'] for att in db.execute("SELECT filename FROM attachments WHERE expense_id=?", (eid,))]
    db.execute("DELETE FROM expenses WHERE id=?", (eid,))
    db.commit()
    _delete_quietly(files)
    return jsonify({"message": "Deleted"})


def _get_expense(db, eid):
    row = db.execute(
        """SELECT e.*, p.name as project_name, p.color as project_color,
           c.name as category_name, c.icon as category_icon, c.color as category_color
           FROM expenses e
           LEFT JOIN projects p ON e.project_id=p.id
           LEFT JOIN categories c ON e.category_id=c.id
           WHERE e.id=?""", (eid,)
    ).fetchone()
    if not row:
        return None
    exp = row_to_dict(row)
    exp['attachments'] = [row_to_dict(a) for a in db.execute(
        "SELECT * FROM attachments WHERE expense_id=? ORDER BY created_at", (eid,)
    )]
    return exp


# ── Attachments ───────────────────────────────────────────────────────────────

@app.route('/api/expenses/<eid>/attachments', methods=['POST'])
def upload_attachment(eid):
    db = get_db()
    if not db.execute("SELECT id FROM expenses WHERE id=?", (eid,)).fetchone():
        return jsonify({"error": "Expense not found"}), 404
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    if not file.filename or not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400

    ext = file.filename.rsplit('.', 1)[1].lower()
    unique_name = f"{uuid.uuid4()}.{ext}"
    content = file.read()
    pg.put_file("expenseflow/" + unique_name, content, file.content_type)
    file_size = len(content)

    aid = str(uuid.uuid4())
    db.execute(
        "INSERT INTO attachments (id, expense_id, filename, original_name, file_size, mime_type) VALUES (?,?,?,?,?,?)",
        (aid, eid, unique_name, secure_filename(file.filename), file_size, file.content_type)
    )
    db.commit()
    return jsonify({"data": row_to_dict(db.execute("SELECT * FROM attachments WHERE id=?", (aid,)).fetchone())}), 201


@app.route('/api/attachments/<aid>', methods=['DELETE'])
def delete_attachment(aid):
    db = get_db()
    att = db.execute("SELECT * FROM attachments WHERE id=?", (aid,)).fetchone()
    if not att:
        return jsonify({"error": "Not found"}), 404
    db.execute("DELETE FROM attachments WHERE id=?", (aid,))
    db.commit()
    _delete_quietly(["expenseflow/" + att['filename']])
    return jsonify({"message": "Deleted"})


def _delete_quietly(paths):
    try:
        pg.delete_files(paths)
    except Exception as e:
        print(f"[storage] delete failed: {e}", flush=True)


@app.route('/api/uploads/<filename>')
def serve_upload(filename):
    att = get_db().execute("SELECT original_name FROM attachments WHERE filename=?", (filename,)).fetchone()
    if not att:
        return jsonify({"error": "Not found"}), 404
    try:
        resp = redirect(pg.signed_url("expenseflow/" + filename), 302)
    except Exception:
        return jsonify({"error": "Not found"}), 404
    resp.headers["Cache-Control"] = "private, no-store"
    return resp


# ── Dashboard / Analytics ────────────────────────────────────────────────────

@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    db = get_db()
    try:
        period = max(1, min(int(request.args.get('period', 30)), 3650))  # days
    except ValueError:
        period = 30

    total = db.execute(f"SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE date >= date('now', '-{period} days')").fetchone()['t']
    total_all = db.execute("SELECT COALESCE(SUM(amount),0) as t FROM expenses").fetchone()['t']
    count = db.execute(f"SELECT COUNT(*) as c FROM expenses WHERE date >= date('now', '-{period} days')").fetchone()['c']

    # By project
    by_project = []
    for r in db.execute("""
        SELECT p.id, p.name, p.color, p.budget, COALESCE(SUM(e.amount),0) as total, COUNT(e.id) as count
        FROM projects p LEFT JOIN expenses e ON p.id=e.project_id
        GROUP BY p.id ORDER BY total DESC
    """):
        by_project.append(row_to_dict(r))

    # By category
    by_category = []
    for r in db.execute("""
        SELECT c.id, c.name, c.icon, c.color, COALESCE(SUM(e.amount),0) as total, COUNT(e.id) as count
        FROM categories c LEFT JOIN expenses e ON c.id=e.category_id
        GROUP BY c.id ORDER BY total DESC LIMIT 10
    """):
        by_category.append(row_to_dict(r))

    # Monthly trend (last 12 months)
    monthly = []
    for r in db.execute("""
        SELECT strftime('%Y-%m', date) as month, COALESCE(SUM(amount),0) as total, COUNT(*) as count
        FROM expenses WHERE date >= date('now', '-12 months')
        GROUP BY month ORDER BY month
    """):
        monthly.append(row_to_dict(r))

    # By status
    by_status = []
    for r in db.execute("SELECT status, COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses GROUP BY status"):
        by_status.append(row_to_dict(r))

    # Recent expenses
    recent = [_get_expense(db, r['id']) for r in db.execute(
        "SELECT id FROM expenses ORDER BY created_at DESC LIMIT 5"
    )]

    # Top vendors
    top_vendors = []
    for r in db.execute("""
        SELECT vendor, COALESCE(SUM(amount),0) as total, COUNT(*) as count
        FROM expenses WHERE vendor IS NOT NULL AND vendor != ''
        GROUP BY vendor ORDER BY total DESC LIMIT 5
    """):
        top_vendors.append(row_to_dict(r))

    project_count = db.execute("SELECT COUNT(*) as c FROM projects WHERE status='active'").fetchone()['c']

    return jsonify({
        "summary": {
            "total_period": total,
            "total_all": total_all,
            "expense_count": count,
            "active_projects": project_count,
            "period_days": int(period)
        },
        "by_project": by_project,
        "by_category": by_category,
        "monthly_trend": monthly,
        "by_status": by_status,
        "recent_expenses": recent,
        "top_vendors": top_vendors
    })


# ── API Key management ────────────────────────────────────────────────────────

@app.route('/api/keys', methods=['GET'])
def list_keys():
    db = get_db()
    keys = [row_to_dict(r) for r in db.execute("SELECT id, name, permissions, last_used, created_at FROM api_keys ORDER BY created_at DESC")]
    return jsonify({"data": keys})


@app.route('/api/keys', methods=['POST'])
def create_key():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "name is required"}), 400
    kid = str(uuid.uuid4())
    raw_key = f"etk_{uuid.uuid4().hex}"
    db = get_db()
    db.execute(
        "INSERT INTO api_keys (id, name, key_hash, permissions) VALUES (?,?,?,?)",
        (kid, data['name'], key_hash(raw_key), json.dumps(data.get('permissions', ['read', 'write'])))
    )
    db.commit()
    key_row = row_to_dict(db.execute("SELECT id, name, permissions, last_used, created_at FROM api_keys WHERE id=?", (kid,)).fetchone())
    key_row['raw_key'] = raw_key  # Only shown once
    return jsonify({"data": key_row}), 201


@app.route('/api/keys/<kid>', methods=['DELETE'])
def delete_key(kid):
    db = get_db()
    db.execute("DELETE FROM api_keys WHERE id=?", (kid,))
    db.commit()
    return jsonify({"message": "Deleted"})


# ── Reports ──────────────────────────────────────────────────────────────────

@app.route('/api/reports/summary', methods=['GET'])
def report_summary():
    db = get_db()
    date_from = request.args.get('date_from', '2020-01-01')
    date_to = request.args.get('date_to', date.today().isoformat())
    project_id = request.args.get('project_id')

    base_q = "FROM expenses WHERE date BETWEEN ? AND ?"
    base_params = [date_from, date_to]
    if project_id:
        base_q += " AND project_id=?"
        base_params.append(project_id)

    total = db.execute(f"SELECT COALESCE(SUM(amount),0) as t {base_q}", base_params).fetchone()['t']
    count = db.execute(f"SELECT COUNT(*) as c {base_q}", base_params).fetchone()['c']
    avg = total / count if count else 0

    weekly = []
    for r in db.execute(f"""
        SELECT strftime('%Y-W%W', date) as week, SUM(amount) as total, COUNT(*) as count
        {base_q} GROUP BY week ORDER BY week
    """, base_params):
        weekly.append(row_to_dict(r))

    return jsonify({
        "period": {"from": date_from, "to": date_to},
        "total": total,
        "count": count,
        "average": round(avg, 2),
        "weekly_breakdown": weekly
    })


# ── Bank Statement Import ─────────────────────────────────────────────────────

# Keyword → category name mapping for auto-classification
CATEGORY_RULES = {
    "Travel": [
        "airline","airways","air india","indigo","spicejet","vistara","delta","united","southwest",
        "american airlines","emirates","lufthansa","british airways","hotel","marriott","hilton",
        "hyatt","sheraton","airbnb","booking.com","expedia","makemytrip","yatra","irctc","railway",
        "uber","lyft","ola","rapido","taxi","cab","metro","bus pass","toll","parking","hertz","avis",
        "flight","travel","trip","voyage","transit",
    ],
    "Food & Dining": [
        "restaurant","cafe","coffee","starbucks","mcdonald","burger king","kfc","subway","domino",
        "pizza","zomato","swiggy","uber eats","doordash","grubhub","dunkin","dining","food","bistro",
        "bar ","pub ","bakery","canteen","luncheon","catering","tiffin",
    ],
    "Software & Tools": [
        "aws","amazon web services","azure","google cloud","gcp","heroku","digitalocean","netlify",
        "vercel","github","gitlab","bitbucket","jira","confluence","notion","slack","zoom","teams",
        "figma","adobe","canva","dropbox","box.com","salesforce","hubspot","zendesk","intercom",
        "stripe","twilio","sendgrid","cloudflare","datadog","newrelic","splunk","tableau","mixpanel",
        "software","saas","subscription","license","api","cloud",
    ],
    "Hardware": [
        "apple","macbook","iphone","ipad","dell","lenovo","hp inc","asus","acer","samsung",
        "logitech","corsair","keychron","monitor","keyboard","mouse","headphone","webcam","printer",
        "scanner","hard drive","ssd","ram","cpu","gpu","router","switch","cable","charger","hardware",
    ],
    "Marketing": [
        "facebook ads","meta ads","google ads","adwords","twitter ads","linkedin ads","instagram",
        "youtube ads","tiktok","snapchat","marketing","advertising","campaign","promotion",
        "mailchimp","klaviyo","hubspot","buffer","hootsuite","semrush","ahrefs","moz","branding",
    ],
    "Consulting": [
        "consulting","consultant","advisory","legal","attorney","lawyer","accountant","auditor",
        "cpa","chartered","freelance","contractor","agency","outsource","professional services",
    ],
    "Utilities": [
        "electricity","electric","power bill","water bill","gas bill","internet","broadband",
        "comcast","at&t","verizon","t-mobile","airtel","jio","bsnl","telephone","utility","pg&e",
        "duke energy","con ed","sewage","waste management",
    ],
    "Office Supplies": [
        "staples","office depot","amazon","flipkart","paper","toner","cartridge","stationery",
        "pen ","pencil","notebook","binder","whiteboard","chair","desk","furniture","supplies",
    ],
    "Training": [
        "udemy","coursera","pluralsight","linkedin learning","skillshare","edx","codecademy",
        "a cloud guru","cloud academy","training","course","certification","conference","seminar",
        "workshop","bootcamp","education","tuition","book","textbook",
    ],
    "Miscellaneous": [],
}

DATE_FORMATS = [
    "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%m-%d-%Y",
    "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
    "%Y%m%d", "%d/%m/%y", "%m/%d/%y",
]

# Common bank CSV column aliases
COL_ALIASES = {
    "date": ["date","transaction date","trans date","posted date","value date","txn date","booking date","entry date"],
    "description": ["description","narration","details","memo","transaction details","particulars","remarks",
                    "transaction description","payee","merchant","beneficiary name"],
    "amount": ["amount","transaction amount","debit","credit","inr amount","usd amount","sum","value"],
    "debit": ["debit","withdrawal","dr","debit amount","dr amount","amount debited","withdrawals"],
    "credit": ["credit","deposit","cr","credit amount","cr amount","amount credited","deposits"],
    "balance": ["balance","closing balance","available balance","running balance"],
    "ref": ["reference","reference no","txn id","transaction id","cheque no","utr","rrn"],
}

def _normalize_col(name):
    return re.sub(r'[^a-z0-9]', '', name.lower().strip())

def _map_columns(headers):
    norm_headers = {_normalize_col(h): h for h in headers}
    mapping = {}
    for field, aliases in COL_ALIASES.items():
        if field in mapping:
            continue
        for alias in aliases:
            key = _normalize_col(alias)
            # Exact match first
            if key in norm_headers:
                mapping[field] = norm_headers[key]
                break
            # Prefix match: "withdrawal" matches "withdrawalamt"
            for norm_h, orig_h in norm_headers.items():
                if norm_h.startswith(key) or key.startswith(norm_h):
                    mapping[field] = orig_h
                    break
            if field in mapping:
                break
    return mapping

def _parse_date(s):
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None

def _parse_amount(s):
    if not s:
        return None
    cleaned = re.sub(r'[^\d.\-]', '', s.replace(',', ''))
    try:
        return float(cleaned)
    except ValueError:
        return None

def _auto_categorize(description, categories_map):
    desc_lower = description.lower()
    for cat_name, keywords in CATEGORY_RULES.items():
        for kw in keywords:
            if kw in desc_lower:
                cat_id = categories_map.get(cat_name) or categories_map.get("Miscellaneous")
                return cat_name, cat_id, round(len(kw) / max(len(desc_lower), 1) * 100 + 40, 0)
    return "Miscellaneous", categories_map.get("Miscellaneous"), 10

def _parse_csv_statement(content_bytes, encoding="utf-8"):
    """Parse a bank statement CSV into a list of raw row dicts."""
    try:
        text = content_bytes.decode(encoding)
    except UnicodeDecodeError:
        text = content_bytes.decode("latin-1")

    # Strip BOM
    text = text.lstrip('﻿')

    # Try to sniff dialect
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=',\t|;')
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows = list(reader)
    return rows, reader.fieldnames or []


@app.route('/api/import/preview', methods=['POST'])
def import_preview():
    """Parse uploaded bank statement and return transactions with auto-categories."""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in ('csv', 'tsv', 'txt'):
        return jsonify({"error": "Only CSV/TSV/TXT files supported for import"}), 400

    content = file.read()
    # The office version kept a copy of every uploaded statement; online we don't store bank statements at all.
    import_filename = f"import_{uuid.uuid4().hex[:8]}_{secure_filename(file.filename)}"

    rows, fieldnames = _parse_csv_statement(content)
    if not rows:
        return jsonify({"error": "No data found in file"}), 400

    col_map = _map_columns(fieldnames or [])

    # Load categories for auto-mapping
    db = get_db()
    cats = {r['name']: r['id'] for r in db.execute("SELECT id, name FROM categories")}

    transactions = []
    skipped = 0

    for i, row in enumerate(rows):
        # Get date
        date_col = col_map.get('date')
        raw_date = row.get(date_col, '').strip() if date_col else ''
        parsed_date = _parse_date(raw_date) if raw_date else None
        if not parsed_date:
            skipped += 1
            continue

        # Get description
        desc_col = col_map.get('description')
        description = row.get(desc_col, '').strip() if desc_col else ''
        if not description:
            # Try any column with meaningful text
            for k, v in row.items():
                if v and len(v.strip()) > 3 and k not in (date_col,):
                    description = v.strip()
                    break

        # Get amount — handle debit/credit split or single amount column
        amount = None
        tx_type = "debit"

        debit_col = col_map.get('debit')
        credit_col = col_map.get('credit')
        amount_col = col_map.get('amount')

        if debit_col and credit_col:
            debit_val = _parse_amount(row.get(debit_col, ''))
            credit_val = _parse_amount(row.get(credit_col, ''))
            if debit_val and debit_val > 0:
                amount = abs(debit_val)
                tx_type = "debit"
            elif credit_val and credit_val > 0:
                amount = abs(credit_val)
                tx_type = "credit"
        elif amount_col:
            raw_amount = _parse_amount(row.get(amount_col, ''))
            if raw_amount is not None:
                if raw_amount < 0:
                    amount = abs(raw_amount)
                    tx_type = "debit"
                else:
                    amount = raw_amount
                    tx_type = "credit"

        if amount is None or amount == 0:
            skipped += 1
            continue

        # Reference number
        ref_col = col_map.get('ref')
        ref = row.get(ref_col, '').strip() if ref_col else ''

        # Balance
        bal_col = col_map.get('balance')
        balance = row.get(bal_col, '').strip() if bal_col else ''

        # Auto-categorize
        cat_name, cat_id, confidence = _auto_categorize(description, cats)

        # Clean up description as a title
        title = re.sub(r'\s+', ' ', description).strip()
        title = title[:120] if len(title) > 120 else title

        # Extract vendor hint from description
        vendor = title.split('/')[0].split('-')[0].strip()[:60]

        transactions.append({
            "row_index": i,
            "date": parsed_date,
            "description": description,
            "title": title,
            "vendor": vendor,
            "amount": round(amount, 2),
            "type": tx_type,
            "reference": ref,
            "balance": balance,
            "suggested_category_id": cat_id,
            "suggested_category_name": cat_name,
            "confidence": int(confidence),
            "selected": tx_type == "debit",  # Pre-select debits (expenses)
            "raw": {k: v for k, v in row.items()},
        })

    # Sort by date desc
    transactions.sort(key=lambda x: x['date'], reverse=True)

    return jsonify({
        "transactions": transactions,
        "total": len(transactions),
        "skipped": skipped,
        "columns_detected": col_map,
        "all_columns": list(fieldnames or []),
        "import_file": import_filename,
        "auto_selected": sum(1 for t in transactions if t['selected']),
    })


@app.route('/api/import/confirm', methods=['POST'])
def import_confirm():
    """Save selected transactions from the preview as expenses."""
    data = request.get_json()
    if not data or not data.get('transactions'):
        return jsonify({"error": "No transactions provided"}), 400

    db = get_db()
    created = []
    errors = []

    default_project = data.get('default_project_id')
    default_status = data.get('default_status', 'pending')
    import_tag = data.get('import_tag', f"import-{date.today().isoformat()}")

    for tx in data['transactions']:
        if not tx.get('selected'):
            continue
        try:
            eid = str(uuid.uuid4())
            tags = [import_tag]
            if tx.get('type') == 'credit':
                tags.append('income')
            db.execute(
                """INSERT INTO expenses (id, title, amount, currency, date, project_id, category_id,
                   description, status, vendor, tags)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (eid,
                 tx.get('title') or tx.get('description', 'Imported transaction'),
                 float(tx['amount']),
                 tx.get('currency', 'USD'),
                 tx['date'],
                 tx.get('project_id') or default_project,
                 tx.get('category_id'),
                 tx.get('description', ''),
                 tx.get('status', default_status),
                 tx.get('vendor', ''),
                 json.dumps(tags))
            )
            created.append(eid)
        except Exception as e:
            errors.append({"row": tx.get('row_index'), "error": str(e)})

    db.commit()

    return jsonify({
        "imported": len(created),
        "errors": errors,
        "expense_ids": created,
        "message": f"Successfully imported {len(created)} transactions"
    })


@app.route('/api/import/templates', methods=['GET'])
def import_templates():
    """Return sample CSV templates for common banks."""
    templates = {
        "generic": "Date,Description,Amount\n2024-01-15,AWS Cloud Services,-4200.00\n2024-01-14,Office Supplies,-340.00\n2024-01-13,Client Payment,10000.00",
        "chase": "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n01/15/2024,01/16/2024,AMAZON WEB SERVICES,Shopping,Sale,-4200.00,\n01/14/2024,01/15/2024,UBER *TRIP,Travel,Sale,-45.50,",
        "boa": "Posted Date,Reference Number,Payee,Address,Amount\n01/15/2024,REF123456,AMAZON WEB SERVICES INC,,\"-4,200.00\"\n01/14/2024,REF123457,UBER *TRIP HELP.UBER.COM,,-45.50",
        "hdfc": "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n15/01/2024,AWS CLOUD SERVICES,REF123456,15/01/2024,\"4,200.00\",,\"50,000.00\"\n14/01/2024,UBER INDIA,REF123457,14/01/2024,45.50,,\"54,200.00\"",
        "icici": "S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )\n1,15-01-2024,15-01-2024,,AWS CLOUD SERVICES,4200.00,,50000.00\n2,14-01-2024,14-01-2024,,UBER INDIA PVT LTD,45.50,,54200.00",
    }
    return jsonify({"templates": templates})


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "version": "1.0.0", "timestamp": datetime.utcnow().isoformat()})


# Served by Vercel as a static file; this route is for running locally.
@app.route('/')
def serve_index():
    return send_from_directory(str(FRONTEND_DIR), 'index.html')


app.wsgi_app = pg.StartupGuard(app, init_db)  # connects on the first request, not at import
app.config.update(SESSION_COOKIE_NAME="wd_session", SESSION_COOKIE_PATH="/employeeworkspace",
                  SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=os.environ.get("WORKDESK_INSECURE_COOKIES") != "1",
                  SESSION_REFRESH_EACH_REQUEST=False)  # never re-issue WorkDesk's cookie from here

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=False)
