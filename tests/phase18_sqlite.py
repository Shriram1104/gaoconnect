import sqlite3

def run():
 c=sqlite3.connect(':memory:'); c.execute('PRAGMA foreign_keys=ON')
 c.executescript("CREATE TABLE transactions(id INTEGER PRIMARY KEY, amount_paise INTEGER);\n CREATE TABLE imported_transactions(fingerprint TEXT,account_id INTEGER,transaction_id INTEGER REFERENCES transactions(id),PRIMARY KEY(account_id,fingerprint));\n INSERT INTO transactions VALUES(1,100); INSERT INTO imported_transactions VALUES('fingerprint',1,1);")
 with c:
  c.execute('DELETE FROM imported_transactions WHERE transaction_id=?',(1,))
  c.execute('DELETE FROM transactions WHERE id=?',(1,))
 assert c.execute('SELECT COUNT(*) FROM imported_transactions').fetchone()[0]==0
 assert c.execute('SELECT COUNT(*) FROM transactions').fetchone()[0]==0
 c.execute('INSERT INTO transactions VALUES(2,100)')
 c.execute("INSERT INTO imported_transactions VALUES('fingerprint',1,2)")
 assert c.execute('SELECT COUNT(*) FROM imported_transactions').fetchone()[0]==1
 print('PASS: imported transaction deletion and re-import fingerprint lifecycle')
if __name__=='__main__':run()
