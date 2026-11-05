import * as SQLite from 'expo-sqlite';
export type Account={id:number;name:string;kind:string;opening_paise:number;balance_paise:number};
export type Category={id:number;name:string;kind:string};
export type Tx={id:number;account_id:number;account_name:string;category_id:number;category_name:string;kind:string;amount_paise:number;note:string;occurred_on:string};
let db:SQLite.SQLiteDatabase;
export async function init(){
 db=await SQLite.openDatabaseAsync('mymoney.db');
 await db.execAsync(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('BANK','CASH')),opening_paise INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('INCOME','EXPENSE')),UNIQUE(name,kind));
 CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER NOT NULL REFERENCES accounts(id),category_id INTEGER NOT NULL REFERENCES categories(id),kind TEXT NOT NULL CHECK(kind IN ('INCOME','EXPENSE')),amount_paise INTEGER NOT NULL CHECK(amount_paise>0),note TEXT NOT NULL DEFAULT '',occurred_on TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(occurred_on);`);
 const a=await db.getFirstAsync<{n:number}>('SELECT COUNT(*) n FROM accounts');
 if(!a?.n) await db.runAsync('INSERT INTO accounts(name,kind,opening_paise) VALUES(?,?,?)','Cash','CASH',0);
 const defaults:[string,string][]=[['Salary','INCOME'],['Other Income','INCOME'],['Food Orders','EXPENSE'],['Restaurants','EXPENSE'],['Bajar / Groceries','EXPENSE'],['Bhajipala / Vegetables','EXPENSE'],['Petrol','EXPENSE'],['Rent','EXPENSE'],['Recharge','EXPENSE'],['Electricity','EXPENSE'],['Movies','EXPENSE'],['Hotels','EXPENSE'],['Shopping','EXPENSE'],['Medical','EXPENSE'],['Other Expense','EXPENSE']];
 for(const [name,kind] of defaults) await db.runAsync('INSERT OR IGNORE INTO categories(name,kind) VALUES(?,?)',name,kind);
}
export async function accounts():Promise<Account[]>{return db.getAllAsync<Account>(`SELECT a.*, a.opening_paise
 + COALESCE((SELECT SUM(CASE WHEN t.kind='INCOME' THEN t.amount_paise ELSE -t.amount_paise END) FROM transactions t WHERE t.account_id=a.id),0)
 + COALESCE((SELECT SUM(t.amount_paise) FROM transfers t WHERE t.to_account_id=a.id),0)
 - COALESCE((SELECT SUM(t.amount_paise) FROM transfers t WHERE t.from_account_id=a.id),0)
 - COALESCE((SELECT SUM(p.amount_paise) FROM card_bank_payments p WHERE p.account_id=a.id),0)
 - COALESCE((SELECT SUM(i.amount_paise) FROM investment_purchases i WHERE i.account_id=a.id),0)
 AS balance_paise FROM accounts a ORDER BY a.id`)}
export async function categories(kind:string){return db.getAllAsync<Category>('SELECT * FROM categories WHERE kind=? ORDER BY name',kind)}
export async function transactions(){return db.getAllAsync<Tx>(`SELECT t.*,a.name account_name,c.name category_name FROM transactions t JOIN accounts a ON a.id=t.account_id JOIN categories c ON c.id=t.category_id ORDER BY t.occurred_on DESC,t.id DESC LIMIT 500`)}
export async function addTransaction(x:{accountId:number;categoryId:number;kind:string;paise:number;note:string;date:string}){if(!Number.isSafeInteger(x.paise)||x.paise<=0)throw Error('Invalid amount');await db.runAsync('INSERT INTO transactions(account_id,category_id,kind,amount_paise,note,occurred_on) VALUES(?,?,?,?,?,?)',x.accountId,x.categoryId,x.kind,x.paise,x.note,x.date)}
export async function addAccount(name:string,kind:string,opening:number){await db.runAsync('INSERT INTO accounts(name,kind,opening_paise) VALUES(?,?,?)',name.trim(),kind,opening)}
export async function addCategory(name:string,kind:string){await db.runAsync('INSERT INTO categories(name,kind) VALUES(?,?)',name.trim(),kind)}
/** Remove import metadata with the transaction, so corrected statements can be re-imported. */
export async function removeTransaction(id:number){
 if(!Number.isSafeInteger(id)||id<=0)throw Error('Invalid transaction');
 await db.withExclusiveTransactionAsync(async tx=>{
  await tx.runAsync('DELETE FROM imported_transactions WHERE transaction_id=?',id);
  await tx.runAsync('DELETE FROM transactions WHERE id=?',id);
 });
}
