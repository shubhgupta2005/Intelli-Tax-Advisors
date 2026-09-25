"""Postgres (Supabase) access for WorkDesk and ExpenseFlow, shaped like the sqlite3 API the apps were written for.

The apps' SQL was written for SQLite. `translate()` rewrites the few SQLite-only pieces on the fly:
  ?  → %s placeholders            date()/strftime()/julianday() → wscompat.sq_* functions (supabase/004_workspace.sql)
  LIKE → ILIKE (SQLite's LIKE ignores case)      INSERT OR IGNORE / OR REPLACE → ON CONFLICT
  INSERT … → INSERT … RETURNING id, so cursor.lastrowid works.
Rows come back as dicts that also allow row[0], like sqlite3.Row. Numeric (Decimal) values become floats.

Environment:
  DATABASE_URL               Supabase "Transaction pooler" connection string (port 6543)
  SUPABASE_URL               https://<project>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  service_role / secret key, used only here on the server for Storage
"""
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

IntegrityError = psycopg.IntegrityError

# Tables whose primary key is an integer "id" (INSERTs into them return it as lastrowid).
_NO_ID = {"settings", "conversation_members", "live", "scans", "login_attempts"}
# INSERT OR REPLACE → upsert: table → (conflict target, columns in the VALUES list when none are named)
_UPSERT = {"settings": ("key", ("key", "value")), "leaves": ("employee_id, day", None)}

_local = threading.local()


class Row(dict):
    """dict that also supports positional access (row[0]) like sqlite3.Row."""
    def __getitem__(self, k):
        if isinstance(k, int):
            return list(self.values())[k]
        return dict.__getitem__(self, k)


def _row_factory(cursor):
    base = dict_row(cursor)

    def make(values):
        d = base(values)
        return Row((k, float(v) if isinstance(v, Decimal) else v) for k, v in d.items())
    return make


def _split_quotes(sql):
    """Yield (is_literal, text) chunks so rewrites never touch quoted strings."""
    out, i, n = [], 0, len(sql)
    while i < n:
        j = sql.find("'", i)
        if j < 0:
            out.append((False, sql[i:]))
            break
        out.append((False, sql[i:j]))
        k = j + 1
        while k < n:
            if sql[k] == "'":
                if k + 1 < n and sql[k + 1] == "'":
                    k += 2
                    continue
                break
            k += 1
        out.append((True, sql[j:k + 1]))
        i = k + 1
    return out


_FUNCS = re.compile(r"\b(date|datetime|strftime|julianday)\s*\(", re.I)
_LIKE = re.compile(r"\bLIKE\b", re.I)
# Postgres needs AS before these keywords when they name a column (SQLite doesn't): "SUM(x) month," → "SUM(x) AS month,"
_BARE_KEYWORD_ALIAS = re.compile(r"\)(\s+)(day|month|year|hour|minute|second)\b(?=\s*(,|FROM\b|$))", re.I)


def translate(sql):
    parts = []
    for literal, text in _split_quotes(sql):
        text = text.replace("%", "%%")
        if not literal:
            text = text.replace("?", "%s")
            text = _FUNCS.sub(lambda m: f"wscompat.sq_{m.group(1).lower()}(", text)
            text = _LIKE.sub("ILIKE", text)
            text = _BARE_KEYWORD_ALIAS.sub(r")\1AS \2", text)
        parts.append(text)
    sql = "".join(parts)
    head = sql.lstrip()[:40].upper()
    if head.startswith("INSERT OR IGNORE"):
        sql = re.sub(r"INSERT\s+OR\s+IGNORE", "INSERT", sql, count=1, flags=re.I) + " ON CONFLICT DO NOTHING"
    elif head.startswith("INSERT OR REPLACE"):
        m = re.match(r"\s*INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*(\(([^)]*)\))?", sql, re.I)
        table = m.group(1)
        target, default_cols = _UPSERT[table]
        cols = [c.strip() for c in m.group(3).split(",")] if m.group(3) else list(default_cols)
        keys = {c.strip() for c in target.split(",")}
        sets = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols if c not in keys)
        sql = re.sub(r"INSERT\s+OR\s+REPLACE", "INSERT", sql, count=1, flags=re.I) + f" ON CONFLICT ({target}) DO UPDATE SET {sets}"
    return sql


def _params(args):
    if args is None:
        return ()
    if isinstance(args, dict):
        return {k: int(v) if isinstance(v, bool) else v for k, v in args.items()}
    return tuple(int(v) if isinstance(v, bool) else v for v in args)


class Cursor:
    def __init__(self, cur, lastrowid=None):
        self._cur, self.lastrowid = cur, lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount

    def fetchone(self):
        return self._cur.fetchone() if self._cur.description else None

    def fetchall(self):
        return self._cur.fetchall() if self._cur.description else []

    def __iter__(self):
        return iter(self.fetchall())


class Connection:
    """sqlite3.Connection look-alike over one psycopg connection, pinned to a schema."""

    def __init__(self, raw, search_path):
        self.raw, self.search_path = raw, search_path

    def _begin(self):
        # Transaction pooler: session settings don't survive, so set the schema at the start of every transaction.
        if self.raw.info.transaction_status == psycopg.pq.TransactionStatus.IDLE:
            self.raw.execute(f"SET LOCAL search_path TO {self.search_path}")

    def execute(self, sql, args=None):
        self._begin()
        q = translate(sql)
        want_id = False
        m = re.match(r"\s*INSERT\s+INTO\s+(\w+)", q, re.I)
        if m and m.group(1).lower() not in _NO_ID and "RETURNING" not in q.upper():
            q += " RETURNING id"
            want_id = True
        cur = self.raw.cursor(row_factory=_row_factory)
        cur.execute(q, _params(args), prepare=False)
        last = None
        if want_id:
            r = cur.fetchone()
            last = r["id"] if r else None
        return Cursor(cur, last)

    def executemany(self, sql, seq):
        self._begin()
        cur = self.raw.cursor()
        cur.executemany(translate(sql), [_params(a) for a in seq])
        return Cursor(cur)

    def commit(self):
        self.raw.commit()

    def rollback(self):
        self.raw.rollback()

    def close(self):
        """Hand the connection back for reuse: drop anything not committed (sqlite3 did the same on close)."""
        try:
            if self.raw.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
                self.raw.rollback()
        except Exception:
            _drop()


def _drop():
    raw = getattr(_local, "raw", None)
    _local.raw = None
    try:
        if raw:
            raw.close()
    except Exception:
        pass


def connect(search_path):
    """One reused connection per thread (serverless instances stay warm between requests)."""
    raw = getattr(_local, "raw", None)
    if raw is None or raw.closed or raw.broken:
        url = os.environ.get("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL is not set")
        raw = psycopg.connect(url, prepare_threshold=None, connect_timeout=10)
        _local.raw = raw
    else:
        try:
            if raw.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
                raw.rollback()
        except Exception:
            _drop()
            return connect(search_path)
    return Connection(raw, search_path)


# ── Supabase Storage (private bucket, server-side only) ─────────────────────

BUCKET = os.environ.get("WORKSPACE_BUCKET", "workspace")


def _storage(method, path, body=None, headers=None):
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise RuntimeError("File storage isn't configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
    h = {"apikey": key}
    if key.startswith("eyJ"):  # legacy JWT service_role key; new sb_secret_ keys go in apikey only
        h["Authorization"] = f"Bearer {key}"
    h.update(headers or {})
    req = urllib.request.Request(f"{base}/storage/v1/{path}", data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Storage error {e.code}: {e.read()[:200].decode(errors='replace')}") from None
    return json.loads(data) if data else {}


def _q(p):
    return urllib.parse.quote(p, safe="/")


def put_file(path, data, content_type="application/octet-stream"):
    _storage("POST", f"object/{BUCKET}/{_q(path)}", data,
             {"Content-Type": content_type or "application/octet-stream", "x-upsert": "true"})


def delete_files(paths):
    paths = [p for p in paths if p]
    if paths:
        _storage("DELETE", f"object/{BUCKET}", json.dumps({"prefixes": paths}).encode(),
                 {"Content-Type": "application/json"})


def signed_url(path, download_name=None, expires=300):
    r = _storage("POST", f"object/sign/{BUCKET}/{_q(path)}", json.dumps({"expiresIn": expires}).encode(),
                 {"Content-Type": "application/json"})
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/storage/v1" + (r.get("signedURL") or r.get("signedUrl"))
    if download_name:
        url += ("&" if "?" in url else "?") + "download=" + urllib.parse.quote(download_name)
    return url


def list_files(prefix):
    """[{name, size, at}] for the files directly inside a bucket folder, e.g. "receipts/"."""
    out, offset = [], 0
    while True:
        batch = _storage("POST", f"object/list/{BUCKET}", json.dumps({
            "prefix": prefix.rstrip("/"), "limit": 1000, "offset": offset,
            "sortBy": {"column": "name", "order": "asc"}}).encode(), {"Content-Type": "application/json"})
        for o in batch:
            if o.get("id"):  # folders have no id
                out.append({"name": o["name"], "size": int((o.get("metadata") or {}).get("size") or 0),
                            "at": o.get("updated_at") or o.get("created_at")})
        if len(batch) < 1000:
            return out
        offset += 1000
