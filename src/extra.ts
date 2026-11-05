import * as SQLite from 'expo-sqlite';
const open=()=>SQLite.openDatabaseAsync('mymoney.db');
export type Card={id:number;name:string;last4:string;credit_limit_paise:number;statement_day:number;due_day:number;outstanding_paise:number};
export type Bill={id:number;name:string;amount_paise:number;due_on:string;frequency:string;status:string};
export type Asset={id:number;name:string;kind:string;quantity:string;invested_paise:number;current_value_paise:number};
export async function initExtra(){const db=await open();await db.execAsync(`CREATE TABLE IF NOT EXISTS credit_cards(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,last4 TEXT NOT NULL DEFAULT '',credit_limit_paise INTEGER NOT NULL DEFAULT 0,statement_day INTEGER NOT NULL DEFAULT 1,due_day INTEGER NOT NULL DEFAULT 15,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS card_events(id INTEGER PRIMARY KEY AUTOINCREMENT,card_id INTEGER NOT NULL REFERENCES credit_cards(id),kind TEXT NOT NULL CHECK(kind IN ('PURCHASE','PAYMENT')),amount_paise INTEGER NOT NULL CHECK(amount_paise>0),occurred_on TEXT NOT NULL,note TEXT NOT NULL DEFAULT '');CREATE TABLE IF NOT EXISTS bills(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,amount_paise INTEGER NOT NULL CHECK(amount_paise>0),due_on TEXT NOT NULL,frequency TEXT NOT NULL CHECK(frequency IN ('ONCE','MONTHLY','YEARLY')),status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID')));CREATE TABLE IF NOT EXISTS assets(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('SIP','MUTUAL_FUND','GOLD','FD','RD','SAVINGS','OTHER')),quantity TEXT NOT NULL DEFAULT '',invested_paise INTEGER NOT NULL DEFAULT 0,current_value_paise INTEGER NOT NULL DEFAULT 0);`);
 await db.execAsync(`CREATE TABLE IF NOT EXISTS investment_purchases(id INTEGER PRIMARY KEY AUTOINCREMENT,asset_id INTEGER NOT NULL REFERENCES assets(id),account_id INTEGER NOT NULL REFERENCES accounts(id),amount_paise INTEGER NOT NULL CHECK(amount_paise>0),occurred_on TEXT NOT NULL,note TEXT NOT NULL DEFAULT '');CREATE INDEX IF NOT EXISTS idx_investment_purchases_account ON investment_purchases(account_id);`);
 const columns=await db.getAllAsync<{name:string}>('PRAGMA table_info(card_events)');
 if(!columns.some(c=>c.name==='category_id'))await db.execAsync('ALTER TABLE card_events ADD COLUMN category_id INTEGER REFERENCES categories(id)');
}
export async function cards():Promise<Card[]>{const db=await open();return db.getAllAsync<Card>(`SELECT c.*,COALESCE(SUM(CASE WHEN e.kind='PURCHASE' THEN e.amount_paise ELSE -e.amount_paise END),0) outstanding_paise FROM credit_cards c LEFT JOIN card_events e ON e.card_id=c.id GROUP BY c.id ORDER BY c.id DESC`)}
export async function addCard(name:string,last4:string,limit:number,statementDay:number,dueDay:number){const db=await open();await db.runAsync('INSERT INTO credit_cards(name,last4,credit_limit_paise,statement_day,due_day) VALUES(?,?,?,?,?)',name,last4,limit,statementDay,dueDay)}
export async function cardEvent(cardId:number,kind:'PURCHASE'|'PAYMENT',amount:number,note:string,date:string,categoryId?:number){
 if(kind!=='PURCHASE')throw Error('Use payCardFromAccount for linked credit card payments');
 if(!Number.isSafeInteger(cardId)||cardId<=0||!Number.isSafeInteger(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid card purchase');
 const db=await open();
 const card=await db.getFirstAsync('SELECT id FROM credit_cards WHERE id=?',cardId);
 if(!card)throw Error('Credit card not found');
 if(categoryId!=null){const category=await db.getFirstAsync("SELECT id FROM categories WHERE id=? AND kind='EXPENSE'",categoryId);if(!category)throw Error('Select an expense category');}
 await db.runAsync('INSERT INTO card_events(card_id,kind,amount_paise,occurred_on,note,category_id) VALUES(?,?,?,?,?,?)',cardId,kind,amount,date,note,categoryId??null);
}
export async function bills():Promise<Bill[]>{const db=await open();return db.getAllAsync<Bill>('SELECT * FROM bills ORDER BY status ASC,due_on ASC')}
export async function addBill(name:string,amount:number,due:string,frequency:string){const db=await open();await db.runAsync('INSERT INTO bills(name,amount_paise,due_on,frequency) VALUES(?,?,?,?)',name,amount,due,frequency)}
export async function markBillPaid(id:number){const db=await open();await db.runAsync("UPDATE bills SET status='PAID' WHERE id=?",id)}
export async function assets():Promise<Asset[]>{const db=await open();return db.getAllAsync<Asset>('SELECT * FROM assets ORDER BY id DESC')}
export async function addAsset(name:string,kind:string,quantity:string,invested:number,value:number){const db=await open();await db.runAsync('INSERT INTO assets(name,kind,quantity,invested_paise,current_value_paise) VALUES(?,?,?,?,?)',name,kind,quantity,invested,value)}

export async function purchaseInvestment(assetId:number,accountId:number,amount:number,date:string,note:string){
 if(!Number.isSafeInteger(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid investment purchase');
 const db=await open();
 await db.withExclusiveTransactionAsync(async tx=>{
  const asset=await tx.getFirstAsync('SELECT id FROM assets WHERE id=?',assetId);
  const account=await tx.getFirstAsync('SELECT id FROM accounts WHERE id=?',accountId);
  if(!asset||!account)throw Error('Select an existing investment and bank/cash account');
  await tx.runAsync('INSERT INTO investment_purchases(asset_id,account_id,amount_paise,occurred_on,note) VALUES(?,?,?,?,?)',assetId,accountId,amount,date,note.trim());
  await tx.runAsync('UPDATE assets SET invested_paise=invested_paise+?,current_value_paise=current_value_paise+? WHERE id=?',amount,amount,assetId);
 });
}
