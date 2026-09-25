"""Copy the office Mac's WorkDesk + ExpenseFlow data (SQLite + files) into Supabase for Intelli Workspace.

Run on a computer that has the office folder "Expense Tracker Claude" (stop WorkDesk on the Mac first, so the
database is complete), after supabase/004_workspace.sql has been run:

    pip install "psycopg[binary]"
    set DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
    set SUPABASE_URL=https://<ref>.supabase.co
    set SUPABASE_SERVICE_ROLE_KEY=<service_role or secret key>
    python scripts/migrate_workspace.py "path/to/Expense Tracker Claude"            # refuses if data already exists
    python scripts/migrate_workspace.py "path/to/Expense Tracker Claude" --replace  # wipes the online data first

(On macOS/Linux use `export NAME=value` instead of `set`.)
"""
import argparse
import hashlib
import mimetypes
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from _workspace import pg  # noqa: E402

import psycopg  # noqa: E402

WORKDESK_TABLES = ["employees", "clients", "projects", "tasks", "time_logs", "expenses", "comments", "activity",
                   "notifications", "conversations", "conversation_members", "messages", "attendance", "leaves",
                   "compliance", "client_fees", "notes", "suggestions", "holidays"]
# Settings that only made sense on the Mac (cloud backups there went to a local iCloud/Drive folder)
SKIP_SETTINGS = {"backup_target", "backup_last", "backup_last_status", "backup_auto"}  # nightly backup defaults to on online
EXPENSEFLOW_TABLES = ["projects", "categories", "expenses", "attachments", "api_keys"]


def pg_columns(cur, schema, table):
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s", (schema, table))
    return [r[0] for r in cur.fetchall()]


def copy_table(lite, cur, schema, table, transform=None):
    src_cols = [r[1] for r in lite.execute(f"PRAGMA table_info({table})")]
    if not src_cols:
        return 0
    cols = [c for c in src_cols if c in set(pg_columns(cur, schema, table))]
    data = [tuple(r) for r in lite.execute(f"SELECT {','.join(cols)} FROM {table}")]
    if transform:
        data = [transform(cols, r) for r in data]
    if data:
        cur.executemany(f"INSERT INTO {schema}.{table} ({','.join(cols)}) VALUES ({','.join(['%s'] * len(cols))})", data)
    if "id" in cols and schema == "workdesk":
        cur.execute(f"SELECT setval(pg_get_serial_sequence('{schema}.{table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {schema}.{table}")
    return len(data)


def upload(folder, names, prefix):
    done = missing = 0
    for name in sorted(set(n for n in names if n)):
        f = folder / name
        if not f.is_file():
            missing += 1
            continue
        pg.put_file(prefix + name, f.read_bytes(), mimetypes.guess_type(name)[0] or "application/octet-stream")
        done += 1
    return done, missing


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", help='the office "Expense Tracker Claude" folder')
    ap.add_argument("--replace", action="store_true", help="delete the online WorkDesk/ExpenseFlow data first")
    ap.add_argument("--set-pin", action="append", default=[], metavar='"NAME=PIN"',
                    help='give someone a new PIN after copying, e.g. --set-pin "Ankit Aggarwal=482913" (repeatable)')
    a = ap.parse_args()
    root = Path(a.folder)
    wd_db, ef_db = root / "workdesk" / "workdesk.db", root / "backend" / "expenses.db"
    for p in (wd_db, ef_db):
        if not p.is_file():
            sys.exit(f"Not found: {p}")

    for k in ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):   # pasted values often carry quotes/newlines
        if k in os.environ:
            os.environ[k] = os.environ[k].strip().strip('"').strip("'").strip()
    conn = psycopg.connect(os.environ["DATABASE_URL"], prepare_threshold=None)
    cur = conn.cursor()
    cur.execute("SELECT (SELECT COUNT(*) FROM workdesk.employees) + (SELECT COUNT(*) FROM expenseflow.expenses)")
    if cur.fetchone()[0] and not a.replace:
        sys.exit("The online workspace already has data. Re-run with --replace to overwrite it.")
    if a.replace:
        cur.execute("TRUNCATE " + ", ".join(f"workdesk.{t}" for t in WORKDESK_TABLES + ["settings", "push_subs", "scans", "login_attempts"])
                    + ", " + ", ".join(f"expenseflow.{t}" for t in EXPENSEFLOW_TABLES) + " RESTART IDENTITY CASCADE")

    # WorkDesk
    lite = sqlite3.connect(str(wd_db))
    counts = {}
    for key, value in lite.execute("SELECT key, value FROM settings"):
        if key not in SKIP_SETTINGS:
            cur.execute("INSERT INTO workdesk.settings (key, value) VALUES (%s,%s) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", (key, value))
    for t in WORKDESK_TABLES:
        counts[t] = copy_table(lite, cur, "workdesk", t)
    receipts = [r[0] for r in lite.execute("SELECT receipt_file FROM expenses WHERE receipt_file IS NOT NULL")]
    chats = [r[0] for r in lite.execute("SELECT file FROM messages WHERE file IS NOT NULL AND deleted=0")]
    lite.close()
    # Phone notification subscriptions belong to the old address, so staff turn notifications on again online.

    # ExpenseFlow (API keys were stored as-is; online they are stored hashed)
    lite = sqlite3.connect(str(ef_db))

    def hash_key(cols, r):
        r = list(r)
        i = cols.index("key_hash")
        r[i] = hashlib.sha256(r[i].encode()).hexdigest()
        return tuple(r)
    for t in EXPENSEFLOW_TABLES:
        counts["expenseflow." + t] = copy_table(lite, cur, "expenseflow", t, hash_key if t == "api_keys" else None)
    attachments = [r[0] for r in lite.execute("SELECT filename FROM attachments")]
    lite.close()
    for item in a.set_pin:
        name, _, pin = item.partition("=")
        if len(pin.strip()) < 4:
            sys.exit(f"--set-pin {item!r}: the PIN must be at least 4 digits")
        from werkzeug.security import generate_password_hash
        cur.execute("UPDATE workdesk.employees SET pin_hash=%s WHERE lower(trim(name))=lower(trim(%s))",
                    (generate_password_hash(pin.strip(), method="pbkdf2:sha256"), name))
        print(f"New PIN set for {name.strip()}" if cur.rowcount else f"Warning: nobody named {name.strip()!r} — PIN not set")
    conn.commit()

    print("Rows copied:")
    for t, n in counts.items():
        print(f"  {t:32} {n}")
    for label, folder, names, prefix in (("receipts", root / "workdesk" / "receipts", receipts, "receipts/"),
                                         ("chat files", root / "workdesk" / "chat_files", chats, "chat/"),
                                         ("ExpenseFlow attachments", root / "backend" / "uploads", attachments, "expenseflow/")):
        done, missing = upload(folder, names, prefix)
        print(f"Uploaded {done} {label}" + (f" ({missing} listed in the database but not found on disk)" if missing else ""))
    print("Done. Staff sign in at https://intellitaxadvisors.com/employeeworkspace/ with their existing PINs.")


if __name__ == "__main__":
    main()
