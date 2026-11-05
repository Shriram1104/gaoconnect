import * as SQLite from 'expo-sqlite';
const open=()=>SQLite.openDatabaseAsync('mymoney.db');
export type AuditIssue={code:string;message:string;count:number};
export type AuditSummary={issues:AuditIssue[];accounts:number;cards:number;transactions:number;imports:number;unlinkedCardPayments:number};
/** Read-only integrity review. No financial records are changed. */
export async function auditFinances():Promise<AuditSummary>{
 const db=await open();
 const count=async(sql:string,...args:(string|number)[])=>Number((await db.getFirstAsync<{n:number}>(sql,...args))?.n||0);
 const [accounts,cards,transactions,imports,unlinkedCardPayments]=await Promise.all([
  count('SELECT COUNT(*) n FROM accounts'),count('SELECT COUNT(*) n FROM credit_cards'),
  count('SELECT COUNT(*) n FROM transactions'),count('SELECT COUNT(*) n FROM imported_transactions'),
  count("SELECT COUNT(*) n FROM card_events e LEFT JOIN card_bank_payments p ON p.card_event_id=e.id WHERE e.kind='PAYMENT' AND p.id IS NULL")
 ]);
 const issues:AuditIssue[]=[];
 const checks:[string,string,string][]=[
  ['NEGATIVE_BANK','Accounts with negative calculated balance',`SELECT COUNT(*) n FROM (SELECT a.id,a.opening_paise + COALESCE((SELECT SUM(CASE WHEN t.kind='INCOME' THEN t.amount_paise ELSE -t.amount_paise END) FROM transactions t WHERE t.account_id=a.id),0) + COALESCE((SELECT SUM(amount_paise) FROM transfers WHERE to_account_id=a.id),0) - COALESCE((SELECT SUM(amount_paise) FROM transfers WHERE from_account_id=a.id),0) - COALESCE((SELECT SUM(amount_paise) FROM card_bank_payments WHERE account_id=a.id),0) - COALESCE((SELECT SUM(amount_paise) FROM investment_purchases WHERE account_id=a.id),0) balance FROM accounts a) WHERE balance<0`],
  ['NEGATIVE_CARD','Cards with negative outstanding balance',`SELECT COUNT(*) n FROM (SELECT c.id,COALESCE(SUM(CASE WHEN e.kind='PURCHASE' THEN e.amount_paise ELSE -e.amount_paise END),0) balance FROM credit_cards c LEFT JOIN card_events e ON e.card_id=c.id GROUP BY c.id) WHERE balance<0`],
  ['INVALID_CATEGORY','Transactions with mismatched category type',`SELECT COUNT(*) n FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.kind<>c.kind`],
  ['UNLINKED_IMPORT','Imported rows whose transaction no longer exists',`SELECT COUNT(*) n FROM imported_transactions i LEFT JOIN transactions t ON t.id=i.transaction_id WHERE t.id IS NULL`],
  ['PAYMENT_MISMATCH','Card payments with mismatched bank deduction',`SELECT COUNT(*) n FROM card_bank_payments p JOIN card_events e ON e.id=p.card_event_id WHERE e.kind<>'PAYMENT' OR e.amount_paise<>p.amount_paise`],
  ['UNCATEGORIZED_CARD','Uncategorized credit card purchases',`SELECT COUNT(*) n FROM card_events WHERE kind='PURCHASE' AND category_id IS NULL`],
  ['ORPHAN_CARD_PAYMENT','Bank deductions referencing missing card events',`SELECT COUNT(*) n FROM card_bank_payments p LEFT JOIN card_events e ON e.id=p.card_event_id WHERE e.id IS NULL`],
  ['ORPHAN_CARD_ACCOUNT','Card payments referencing missing bank accounts',`SELECT COUNT(*) n FROM card_bank_payments p LEFT JOIN accounts a ON a.id=p.account_id WHERE a.id IS NULL`],
  ['ORPHAN_INVESTMENT','Investment purchases referencing missing assets or accounts',`SELECT COUNT(*) n FROM investment_purchases p LEFT JOIN assets s ON s.id=p.asset_id LEFT JOIN accounts a ON a.id=p.account_id WHERE s.id IS NULL OR a.id IS NULL`],
  ['ORPHAN_TRANSFER','Transfers referencing missing bank accounts',`SELECT COUNT(*) n FROM transfers t LEFT JOIN accounts a ON a.id=t.from_account_id LEFT JOIN accounts b ON b.id=t.to_account_id WHERE a.id IS NULL OR b.id IS NULL`],
  ['INVALID_AMOUNTS','Nonpositive transaction, transfer, card, or investment amounts',`SELECT (SELECT COUNT(*) FROM transactions WHERE amount_paise<=0) + (SELECT COUNT(*) FROM transfers WHERE amount_paise<=0) + (SELECT COUNT(*) FROM card_events WHERE amount_paise<=0) + (SELECT COUNT(*) FROM investment_purchases WHERE amount_paise<=0) n`],
  ['DUPLICATE_IMPORT_LINK','Multiple imported fingerprints referencing one transaction',`SELECT COUNT(*) n FROM (SELECT transaction_id FROM imported_transactions GROUP BY transaction_id HAVING COUNT(*)>1)`],
 ];
 for(const [code,message,sql] of checks){const n=await count(sql);if(n)issues.push({code,message,count:n})}
 if(unlinkedCardPayments)issues.push({code:'UNLINKED_PAYMENT',message:'Card payments without a linked bank/cash deduction (may be intentional for historical payments)',count:unlinkedCardPayments});
 return {issues,accounts,cards,transactions,imports,unlinkedCardPayments};
}


/** Compare a user-entered current cleared bank balance with the app's ledger.
 * Read-only; no silent balancing adjustments are made.
 * Amounts are integer paise. Caller must compare balances at the same cutoff.
 */
export type BalanceComparison={accountId:number;accountName:string;expectedPaise:number;calculatedPaise:number;differencePaise:number;matches:boolean};
export async function compareAccountBalance(accountId:number,expectedPaise:number):Promise<BalanceComparison>{
 if(!Number.isSafeInteger(accountId)||accountId<=0||!Number.isSafeInteger(expectedPaise)||expectedPaise<0)throw Error('Choose an account and enter a valid nonnegative balance');
 const db=await open();
 const row=await db.getFirstAsync<{id:number;name:string;balance_paise:number}>(`SELECT a.id,a.name,a.opening_paise
 + COALESCE((SELECT SUM(CASE WHEN t.kind='INCOME' THEN t.amount_paise ELSE -t.amount_paise END) FROM transactions t WHERE t.account_id=a.id),0)
 + COALESCE((SELECT SUM(t.amount_paise) FROM transfers t WHERE t.to_account_id=a.id),0)
 - COALESCE((SELECT SUM(t.amount_paise) FROM transfers t WHERE t.from_account_id=a.id),0)
 - COALESCE((SELECT SUM(p.amount_paise) FROM card_bank_payments p WHERE p.account_id=a.id),0)
 - COALESCE((SELECT SUM(i.amount_paise) FROM investment_purchases i WHERE i.account_id=a.id),0)
 AS balance_paise FROM accounts a WHERE a.id=?`,accountId);
 if(!row)throw Error('Account not found');
 const differencePaise=expectedPaise-row.balance_paise;
 return {accountId:row.id,accountName:row.name,expectedPaise,calculatedPaise:row.balance_paise,differencePaise,matches:differencePaise===0};
}
