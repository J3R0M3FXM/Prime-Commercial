from pathlib import Path
import sqlite3,re
source=(Path(__file__).resolve().parents[1]/'src/ph/primenetwork/smsbridge/BridgeStore.java').read_text()
create=re.search(r'db.execSQL\("(CREATE TABLE queue[^"\n]+)"\)',source)[1]
upgrade=re.search(r'db.execSQL\("(ALTER TABLE queue[^"\n]+)"\)',source)[1]
retry=re.search(r'(?:execSQL|compileStatement)\("(UPDATE queue SET state=[^"\n]+)"\)',source)[1]
db=sqlite3.connect(':memory:')
db.execute("CREATE TABLE queue(id TEXT PRIMARY KEY,payload TEXT,received_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending')")
db.executemany('INSERT INTO queue VALUES (?,?,?,?)',[('blocked','encrypted-original-payload',100,'blocked'),('pending','encrypted-pending',200,'pending'),('sent',None,300,'sent')])
db.execute(upgrade)
assert db.execute('SELECT id,payload,received_at,state,rejection_reason FROM queue WHERE id=?',('blocked',)).fetchone()==('blocked','encrypted-original-payload',100,'blocked',None)
db.execute("UPDATE queue SET rejection_reason='HTTP 422 test reason' WHERE id='blocked'")
db.execute(retry)
assert db.execute('SELECT id,payload,received_at,state,rejection_reason FROM queue WHERE id=?',('blocked',)).fetchone()==('blocked','encrypted-original-payload',100,'pending',None)
assert db.execute("SELECT state,payload FROM queue WHERE id='sent'").fetchone()==('sent',None)
assert db.execute("SELECT state,payload FROM queue WHERE id='pending'").fetchone()==('pending','encrypted-pending')
assert db.execute(retry).rowcount==0
fresh=sqlite3.connect(':memory:');fresh.execute(create)
assert 'rejection_reason' in [row[1] for row in fresh.execute('PRAGMA table_info(queue)')]
print('PASS: in-place queue upgrade and explicit blocked retry preserve original encrypted content, IDs and timestamps; sent messages remain untouched.')
