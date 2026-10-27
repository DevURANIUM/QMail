"""Usage: python scripts/verify-qmail-upgrade.py /private/path/backup.sql
Never prints email contents, credentials or session tokens. No network access.
"""
import hashlib
import sqlite3
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Provide the path to a complete D1 SQL export.')
backup = Path(sys.argv[1]).read_bytes()
if not backup.strip():
    raise SystemExit('Empty backup: refusing to proceed.')
conn = sqlite3.connect(':memory:')
conn.executescript(backup.decode('utf-8'))
conn.execute('PRAGMA foreign_keys=ON')
assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'Backup integrity failed'
columns = [row[1] for row in conn.execute('PRAGMA table_info(emails)')]
assert columns and 'thread_id' not in columns, 'Not the inspected legacy schema: stop and inspect migrations'
tables = ['emails', 'attachments', 'settings', 'addresses', 'sessions', 'rate_limits']
before = {}
for table in tables:
    cols = [row[1] for row in conn.execute(f'PRAGMA table_info({table})')]
    assert cols, f'Missing expected table: {table}'
    rows = list(conn.execute(f'SELECT * FROM {table}'))
    before[table] = (cols, sorted(rows, key=repr))
conn.executescript((root / 'packages/worker/src/db/migrations/002-features.sql').read_text())
conn.executescript((root / 'packages/worker/src/db/schema.sql').read_text())
conn.execute("INSERT INTO emails_fts(emails_fts) VALUES ('rebuild')")
for table, (cols, rows) in before.items():
    # schema defaults may add settings; all original rows must remain unchanged.
    actual = sorted(conn.execute(f'SELECT {",".join(cols)} FROM {table}'), key=repr)
    if table == 'settings':
        assert set(rows).issubset(set(actual)), 'Existing settings modified'
    else:
        assert actual == rows, f'Data mismatch: {table}'
assert not list(conn.execute('PRAGMA foreign_key_check')), 'Foreign key failure'
assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
conn.execute("INSERT INTO emails(id,type,from_address,to_address,subject) VALUES ('upgrade-rehearsal','draft','a@example.com','b@example.com','Draft')")
assert conn.execute("SELECT COUNT(*) FROM emails_fts WHERE emails_fts MATCH 'Draft'").fetchone()[0] >= 1
print('PASS: backup restored; migration preserves every original row, settings and attachment; drafts and FTS work.')
print('Backup SHA256:', hashlib.sha256(backup).hexdigest())
print('Original counts:', {table: len(rows) for table, (_, rows) in before.items()})
