import * as SQLite from 'expo-sqlite';
import * as Picker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { toByteArray } from 'base64-js';
export type ImportedRow={date:string;note:string;kind:'INCOME'|'EXPENSE';paise:number;fingerprint:string;reviewReason?:string};
const dbOpen=()=>SQLite.openDatabaseAsync('mymoney.db');
export async function initImports(){const db=await dbOpen();
 await db.execAsync(`CREATE TABLE IF NOT EXISTS imported_transactions(fingerprint TEXT NOT NULL,account_id INTEGER NOT NULL REFERENCES accounts(id),transaction_id INTEGER NOT NULL REFERENCES transactions(id),PRIMARY KEY(account_id,fingerprint),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 const cols=await db.getAllAsync<{name:string}>('PRAGMA table_info(imported_transactions)');
 if(!cols.some(c=>c.name==='account_id')){
  await db.withExclusiveTransactionAsync(async tx=>{
   await tx.execAsync(`CREATE TABLE imported_transactions_v2(fingerprint TEXT NOT NULL,account_id INTEGER NOT NULL REFERENCES accounts(id),transaction_id INTEGER NOT NULL REFERENCES transactions(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(account_id,fingerprint));`);
   await tx.execAsync(`INSERT INTO imported_transactions_v2(fingerprint,account_id,transaction_id,created_at) SELECT i.fingerprint,t.account_id,i.transaction_id,i.created_at FROM imported_transactions i JOIN transactions t ON t.id=i.transaction_id;`);
   await tx.execAsync('DROP TABLE imported_transactions; ALTER TABLE imported_transactions_v2 RENAME TO imported_transactions;');
  });
 }
}
function csvRows(raw:string):string[][]{const rows:string[][]=[];let row:string[]=[],field='',quoted=false;raw=raw.replace(/^\uFEFF/,'');for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='"'){if(quoted&&raw[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(field.trim());field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field=''}else field+=c}if(quoted)throw Error('Malformed CSV quotation');row.push(field.trim());if(row.some(Boolean))rows.push(row);return rows}
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const monthNumbers:Record<string,number>={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function dateISO(s:string){
 s=s.trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(s)){validateDate(s);return s;}
 const numeric=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
 if(numeric){const iso=`${numeric[3]}-${numeric[2].padStart(2,'0')}-${numeric[1].padStart(2,'0')}`;validateDate(iso);return iso;}
 const named=s.match(/^(\d{1,2})[\s/-]([a-zA-Z]{3})[\s/-](\d{4})$/);
 if(named){const month=monthNumbers[named[2].toLowerCase()];if(!month)throw Error('Unsupported month: '+s);const iso=`${named[3]}-${String(month).padStart(2,'0')}-${named[1].padStart(2,'0')}`;validateDate(iso);return iso;}
 throw Error('Unsupported date: '+s+' (expected DD/MM/YYYY, DD-MMM-YYYY or YYYY-MM-DD)');
}
function validateDate(s:string){
 const [y,m,d]=s.split('-').map(Number);
 // Date.UTC treats years 0..99 as 1900..1999. Financial statement dates must use 1900..2100.
 if(y<1900||y>2100||m<1||m>12||d<1||d>31)throw Error('Invalid calendar date: '+s);
 const dt=new Date(Date.UTC(y,m-1,d));
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw Error('Invalid calendar date: '+s);
}
function paise(s:string){const v=s.replace(/[₹,\s]/g,'').trim();if(!v)return 0;if(!/^\d+(\.\d{1,2})?$/.test(v))throw Error('Invalid amount: '+s);const [a,b='']=v.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n))throw Error('Amount too large');return n}
/** Conservative advisory classification: uncertain bank debits are never silently posted as consumption. */
export function reviewReason(note:string,kind:'INCOME'|'EXPENSE'):string|undefined {
 const s=note.toUpperCase();
 const rules:[RegExp,string][]=[
  [/\b(?:SIP|MUTUAL\s*FUND|MF\s*PURCHASE|ZERODHA|GROWW|UPSTOX|PPF|FIXED\s*DEPOSIT|RECURRING\s*DEPOSIT)\b/, 'Possible investment or savings transfer'],
  [/\b(?:CREDIT\s*CARD|CARD\s*PAYMENT|CC\s*BILL|AUTOPAY\s*CC)\b/, 'Possible credit-card payment'],
  [/\b(?:SELF\s*TRANSFER|OWN\s*ACCOUNT|ACCOUNT\s*TRANSFER|INTERNAL\s*TRANSFER)\b/, 'Possible transfer between own accounts'],
  [/\b(?:LOAN\s*EMI|HOME\s*LOAN|PERSONAL\s*LOAN|LOAN\s*REPAYMENT)\b/, 'Possible loan repayment (principal and interest need splitting)']
 ];
 for(const [pattern,reason] of rules)if(pattern.test(s))return reason;
 return undefined;
}
export function partitionForReview(rows:ImportedRow[]){
 return {safe:rows.filter(r=>!r.reviewReason),needsReview:rows.filter(r=>!!r.reviewReason)};
}
export function parseCSV(raw:string):ImportedRow[]{return parseStatementRows(csvRows(raw));}
export function parseStatementRows(rows:string[][]):ImportedRow[]{if(rows.length<2)throw Error('Statement needs a header and at least one transaction');if(rows.length>2001)throw Error('Import at most 2000 rows at a time');const h=rows[0].map(normalize);const col=(...names:string[])=>h.findIndex(v=>names.includes(v));const date=col('date','transactiondate','valuedate','txndate','postingdate'),desc=col('description','narration','details','particulars','transactionremarks','remarks','transactiondetails'),debit=col('debit','withdrawal','withdrawalamt','withdrawalamount','withdrawalamtinr','withdrawalamountinr','debitamount','debitamt','debitinr'),credit=col('credit','deposit','depositamt','depositamount','depositamtinr','depositamountinr','creditamount','creditamt','creditinr'),reference=col('referencenumber','transactionid','transactionreference','utr','utrnumber','refno','chequeno','chqrefno');if([date,desc,debit,credit].some(v=>v<0))throw Error('Required columns: Date, Description, Debit, Credit. Rename bank CSV headers if necessary.');const result:ImportedRow[]=[];const seen=new Set<string>();const unreferencedOccurrences=new Map<string,number>();for(let i=1;i<rows.length;i++){const r=rows[i];if(!r.some(Boolean))continue;try{const d=dateISO(r[date]||''),note=(r[desc]||'').slice(0,500),dr=paise(r[debit]||''),cr=paise(r[credit]||'');if((dr>0)===(cr>0))throw Error('Exactly one of debit or credit must be positive');if(!note.trim())throw Error('Transaction description is required');const kind=dr?'EXPENSE':'INCOME',amount=dr||cr;const ref=reference>=0?(r[reference]||'').trim().toUpperCase():'';const base=[d,note.toLowerCase().replace(/\s+/g,' '),kind,amount].join('|');const count=ref?0:(unreferencedOccurrences.get(base)||0)+1;if(!ref)unreferencedOccurrences.set(base,count);const fingerprint=ref?['ref',ref,d,kind,amount].join('|'):['row',base,count].join('|');if(ref&&seen.has(fingerprint))throw Error('Duplicate transaction/reference in the same file. Verify the bank statement before importing');seen.add(fingerprint);result.push({date:d,note,kind,paise:amount,fingerprint,reviewReason:reviewReason(note,kind)})}catch(e){throw Error(`Statement row ${i+1}: ${String(e)}`)}}if(result.length>2000)throw Error('Import at most 2000 rows at a time');if(!result.length)throw Error('No transactions found');return result}
export async function pickStatement(){
 const p=await Picker.getDocumentAsync({type:['text/csv','text/comma-separated-values','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/octet-stream'],copyToCacheDirectory:true});
 if(p.canceled)return null;
 const file=p.assets[0];const name=file.name.toLowerCase();
 if(file.size&&file.size>5_000_000)throw Error('Statement must be under 5 MB');
 if(name.endsWith('.csv')){const content=await FS.readAsStringAsync(file.uri);if(content.length>5_000_000)throw Error('Statement must be under 5 MB');return parseCSV(content);}
 if(!name.endsWith('.xlsx')&&!name.endsWith('.xls'))throw Error('Select a CSV, XLSX or XLS statement');
 const encoded=await FS.readAsStringAsync(file.uri,{encoding:FS.EncodingType.Base64});
 if(encoded.length>6_700_000)throw Error('Statement must be under 5 MB');
 const workbook=XLSX.read(toByteArray(encoded),{type:'array',cellDates:false,cellFormula:false,cellHTML:false,bookVBA:false});
 if(workbook.SheetNames.length!==1)throw Error('Excel file must contain exactly one worksheet; export the transaction sheet separately');
 const sheet=workbook.Sheets[workbook.SheetNames[0]];
 const rows=XLSX.utils.sheet_to_json<(string|number|null)[]>(sheet,{header:1,raw:false,defval:'',blankrows:false}).map(row=>row.map(cell=>String(cell??'').trim()));
 if(rows.length>2001)throw Error('Import at most 2000 rows at a time');
 return parseStatementRows(rows);
}
export async function pickCSV(){const p=await Picker.getDocumentAsync({type:['text/csv','text/comma-separated-values','application/octet-stream'],copyToCacheDirectory:true});if(p.canceled)return null;const file=p.assets[0];if(!file.name.toLowerCase().endsWith('.csv'))throw Error('Choose a .csv file');if(file.size&&file.size>3_000_000)throw Error('CSV must be under 3 MB');return parseCSV(await FS.readAsStringAsync(file.uri))}
export async function commitCSV(rows:ImportedRow[],accountId:number,expenseCategoryId:number,incomeCategoryId:number){if(rows.some(r=>r.reviewReason))throw Error('Review-required rows cannot be imported as income/expenses. Import safe rows only and enter transfers, card payments, investments, or loan repayments through their dedicated screens.');if(!rows.length)throw Error('No safe rows to import');const db=await dbOpen();const account=await db.getFirstAsync('SELECT id FROM accounts WHERE id=?',accountId);if(!account)throw Error('Select a valid account');let inserted=0,skipped=0;await db.withExclusiveTransactionAsync(async tx=>{for(const r of rows){const existing=await tx.getFirstAsync('SELECT fingerprint FROM imported_transactions WHERE account_id=? AND fingerprint=?',accountId,r.fingerprint);if(existing){skipped++;continue}const category=r.kind==='EXPENSE'?expenseCategoryId:incomeCategoryId;const c=await tx.getFirstAsync<{kind:string}>('SELECT kind FROM categories WHERE id=?',category);if(c?.kind!==r.kind)throw Error('Choose valid income and expense categories');const out=await tx.runAsync('INSERT INTO transactions(account_id,category_id,kind,amount_paise,note,occurred_on) VALUES(?,?,?,?,?,?)',accountId,category,r.kind,r.paise,r.note,r.date);await tx.runAsync('INSERT INTO imported_transactions(fingerprint,account_id,transaction_id) VALUES(?,?,?)',r.fingerprint,accountId,out.lastInsertRowId);inserted++}});return {inserted,skipped}}
