"""Dependency-free SQLite smoke tests mirroring MyMoney account balance rules."""
import sqlite3
import unittest

SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE accounts(id INTEGER PRIMARY KEY, opening_paise INTEGER NOT NULL);
CREATE TABLE transactions(id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id), kind TEXT, amount_paise INTEGER CHECK(amount_paise>0));
CREATE TABLE transfers(id INTEGER PRIMARY KEY, from_account_id INTEGER REFERENCES accounts(id), to_account_id INTEGER REFERENCES accounts(id), amount_paise INTEGER CHECK(amount_paise>0), CHECK(from_account_id<>to_account_id));
CREATE TABLE credit_cards(id INTEGER PRIMARY KEY);
CREATE TABLE card_events(id INTEGER PRIMARY KEY,card_id INTEGER REFERENCES credit_cards(id),kind TEXT,amount_paise INTEGER CHECK(amount_paise>0));
CREATE TABLE card_bank_payments(id INTEGER PRIMARY KEY,card_event_id INTEGER UNIQUE REFERENCES card_events(id),account_id INTEGER REFERENCES accounts(id),amount_paise INTEGER CHECK(amount_paise>0));
CREATE TABLE investment_purchases(id INTEGER PRIMARY KEY,account_id INTEGER REFERENCES accounts(id),amount_paise INTEGER CHECK(amount_paise>0));
'''
BALANCE = '''SELECT a.opening_paise
+COALESCE((SELECT SUM(CASE WHEN kind='INCOME' THEN amount_paise ELSE -amount_paise END) FROM transactions WHERE account_id=a.id),0)
+COALESCE((SELECT SUM(amount_paise) FROM transfers WHERE to_account_id=a.id),0)
-COALESCE((SELECT SUM(amount_paise) FROM transfers WHERE from_account_id=a.id),0)
-COALESCE((SELECT SUM(amount_paise) FROM card_bank_payments WHERE account_id=a.id),0)
-COALESCE((SELECT SUM(amount_paise) FROM investment_purchases WHERE account_id=a.id),0)
FROM accounts a WHERE a.id=?'''
class LedgerSmoke(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.executescript(SCHEMA)
  self.db.executemany('INSERT INTO accounts VALUES(?,?)',[(1,10000000),(2,500000)])
 def balance(self,account):return self.db.execute(BALANCE,(account,)).fetchone()[0]
 def test_transfer_preserves_total(self):
  self.db.execute('INSERT INTO transfers VALUES(1,1,2,125000)')
  self.assertEqual(self.balance(1),9875000);self.assertEqual(self.balance(2),625000)
  self.assertEqual(self.balance(1)+self.balance(2),10500000)
 def test_card_payment_reduces_cash_not_spending(self):
  self.db.execute('INSERT INTO credit_cards VALUES(1)')
  self.db.execute("INSERT INTO card_events VALUES(1,1,'PURCHASE',300000)")
  self.db.execute("INSERT INTO card_events VALUES(2,1,'PAYMENT',200000)")
  self.db.execute('INSERT INTO card_bank_payments VALUES(1,2,1,200000)')
  self.assertEqual(self.balance(1),9800000)
  self.assertEqual(self.db.execute("SELECT SUM(CASE WHEN kind='PURCHASE' THEN amount_paise ELSE -amount_paise END) FROM card_events").fetchone()[0],100000)
  self.assertEqual(self.db.execute("SELECT SUM(amount_paise) FROM card_events WHERE kind='PURCHASE'").fetchone()[0],300000)
 def test_investment_reduces_cash(self):
  self.db.execute('INSERT INTO investment_purchases VALUES(1,1,500000)')
  self.assertEqual(self.balance(1),9500000)
 def test_negative_amount_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO transactions VALUES(1,1,'EXPENSE',-10)")
 def test_self_transfer_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('INSERT INTO transfers VALUES(1,1,1,100)')
if __name__=='__main__':unittest.main(verbosity=2)
