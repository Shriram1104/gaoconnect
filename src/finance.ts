import * as SQLite from 'expo-sqlite';
const open=()=>SQLite.openDatabaseAsync('mymoney.db');
export type Transfer={id:number;from_name:string;to_name:string;amount_paise:number;occurred_on:string;note:string};
export async function initFinance(){const db=await open();await db.execAsync(`
 CREATE TABLE IF NOT EXISTS transfers(id INTEGER PRIMARY KEY AUTOINCREMENT,from_account_id INTEGER NOT NULL REFERENCES accounts(id),to_account_id INTEGER NOT NULL REFERENCES accounts(id),amount_paise INTEGER NOT NULL CHECK(amount_paise>0),occurred_on TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',CHECK(from_account_id<>to_account_id));
 CREATE INDEX IF NOT EXISTS idx_transfer_from ON transfers(from_account_id);
 CREATE INDEX IF NOT EXISTS idx_transfer_to ON transfers(to_account_id);
 CREATE TABLE IF NOT EXISTS card_bank_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,card_event_id INTEGER NOT NULL UNIQUE REFERENCES card_events(id),account_id INTEGER NOT NULL REFERENCES accounts(id),amount_paise INTEGER NOT NULL CHECK(amount_paise>0));
 `)}
export async function addTransfer(from:number,to:number,amount:number,date:string,note:string){if(!Number.isSafeInteger(from)||from<=0||!Number.isSafeInteger(to)||to<=0||!Number.isSafeInteger(amount)||amount<=0||from===to)throw Error('Choose different accounts and a valid amount');const db=await open();await db.runAsync('INSERT INTO transfers(from_account_id,to_account_id,amount_paise,occurred_on,note) VALUES(?,?,?,?,?)',from,to,amount,date,note.trim())}
export async function transfers():Promise<Transfer[]>{const db=await open();return db.getAllAsync<Transfer>(`SELECT t.id,t.amount_paise,t.occurred_on,t.note,a.name from_name,b.name to_name FROM transfers t JOIN accounts a ON a.id=t.from_account_id JOIN accounts b ON b.id=t.to_account_id ORDER BY t.occurred_on DESC,t.id DESC LIMIT 100`)}
export async function payCardFromAccount(cardId:number,accountId:number,amount:number,date:string,note:string){if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Invalid payment amount');const db=await open();await db.withExclusiveTransactionAsync(async tx=>{const card=await tx.getFirstAsync('SELECT id FROM credit_cards WHERE id=?',cardId);const acc=await tx.getFirstAsync('SELECT id FROM accounts WHERE id=?',accountId);if(!card||!acc)throw Error('Card or bank account not found');const event=await tx.runAsync("INSERT INTO card_events(card_id,kind,amount_paise,occurred_on,note) VALUES(?,'PAYMENT',?,?,?)",cardId,amount,date,note);await tx.runAsync('INSERT INTO card_bank_payments(card_event_id,account_id,amount_paise) VALUES(?,?,?)',event.lastInsertRowId,accountId,amount)})}
export type CategorySpend={name:string;amount_paise:number};
export async function spendingByCategory(month:string):Promise<CategorySpend[]>{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
 const db=await open();
 return db.getAllAsync<CategorySpend>(`SELECT name,SUM(amount_paise) amount_paise FROM (
 SELECT c.name,t.amount_paise FROM transactions t JOIN categories c ON c.id=t.category_id
 WHERE t.kind='EXPENSE' AND substr(t.occurred_on,1,7)=?
 UNION ALL
 SELECT COALESCE(c.name,'Credit card · Uncategorized') name,e.amount_paise
 FROM card_events e LEFT JOIN categories c ON c.id=e.category_id
 WHERE e.kind='PURCHASE' AND substr(e.occurred_on,1,7)=?
 ) GROUP BY name ORDER BY amount_paise DESC`,month,month);
}
export async function cardPurchaseTotal(month:string):Promise<number>{
 const db=await open();const row=await db.getFirstAsync<{total:number}>("SELECT COALESCE(SUM(amount_paise),0) total FROM card_events WHERE kind='PURCHASE' AND substr(occurred_on,1,7)=?",month);
 return row?.total||0;
}
