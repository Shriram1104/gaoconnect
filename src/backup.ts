import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, bytesToUtf8 } from '@noble/hashes/utils';
import { fromByteArray, toByteArray } from 'base64-js';

const TABLES=['accounts','categories','transactions','credit_cards','card_events','bills','assets','transfers','card_bank_payments','imported_transactions','investment_purchases'] as const;
type Backup={app:string;version:number;createdAt:string;tables:Record<string,Record<string,unknown>[]>};
const ITERATIONS=210_000;
const MAX_FILE_SIZE=20_000_000;
type Envelope={format:'mymoney-encrypted';version:1;kdf:'PBKDF2-SHA256';iterations:number;salt:string;nonce:string;ciphertext:string};
function checkPassword(password:string){if(password.length<12)throw Error('Use a backup password with at least 12 characters.');}
async function deriveKey(password:string,salt:Uint8Array,iterations:number){return pbkdf2Async(sha256,utf8ToBytes(password),salt,{c:iterations,dkLen:32});}
export async function exportBackup(password:string){
 checkPassword(password);
 const db=await SQLite.openDatabaseAsync('mymoney.db');
 const tables:Backup['tables']={};
 for(const table of TABLES)tables[table]=await db.getAllAsync<Record<string,unknown>>(`SELECT * FROM ${table}`);
 const payload:Backup={app:'MyMoney',version:4,createdAt:new Date().toISOString(),tables};
 const salt=Crypto.getRandomBytes(16),nonce=Crypto.getRandomBytes(12);
 const key=await deriveKey(password,salt,ITERATIONS);
 const ciphertext=gcm(key,nonce).encrypt(utf8ToBytes(JSON.stringify(payload)));
 const envelope:Envelope={format:'mymoney-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:fromByteArray(salt),nonce:fromByteArray(nonce),ciphertext:fromByteArray(ciphertext)};
 const serialized=JSON.stringify(envelope);
 if(serialized.length>MAX_FILE_SIZE)throw Error('Encrypted backup exceeds 20 MB. Reduce the data before exporting.');
 const path=FileSystem.cacheDirectory+`mymoney-backup-${Date.now()}.mymoney`;
 await FileSystem.writeAsStringAsync(path,serialized);
 try {
  if(!await Sharing.isAvailableAsync())throw Error('File sharing is not available on this device');
  await Sharing.shareAsync(path,{mimeType:'application/octet-stream',dialogTitle:'Save MyMoney backup to a safe location'});
 } finally {
  await FileSystem.deleteAsync(path,{idempotent:true});
 }
}
export async function restoreBackup(password:string){
 checkPassword(password);
 const picked=await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true});
 if(picked.canceled)return false;
 const pickedUri=picked.assets[0].uri;
 try {
 if(picked.assets[0].size && picked.assets[0].size>MAX_FILE_SIZE)throw Error('Backup exceeds 20 MB');
 const content=await FileSystem.readAsStringAsync(pickedUri);
 if(content.length>MAX_FILE_SIZE)throw Error('Backup exceeds 20 MB');
 let envelope:Envelope;
 try{envelope=JSON.parse(content) as Envelope;}catch{throw Error('Invalid encrypted backup file');}
 if(envelope.format!=='mymoney-encrypted'||envelope.version!==1||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==ITERATIONS||typeof envelope.ciphertext!=='string'||typeof envelope.salt!=='string'||typeof envelope.nonce!=='string')throw Error('Unsupported backup format. Unencrypted backups cannot be restored in this version.');
 // Validate encoded fields before allocating decoded buffers or deriving a key.
 const validB64=(value:string)=>/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
 if(!validB64(envelope.salt)||envelope.salt.length!==24||!validB64(envelope.nonce)||envelope.nonce.length!==16||!validB64(envelope.ciphertext)||envelope.ciphertext.length>MAX_FILE_SIZE)throw Error('Invalid encrypted backup encoding');
 let data:Backup;
 try{
  const salt=toByteArray(envelope.salt),nonce=toByteArray(envelope.nonce),ciphertext=toByteArray(envelope.ciphertext);
  if(salt.length!==16||nonce.length!==12||ciphertext.length<16)throw Error('Invalid encryption parameters');
  const key=await deriveKey(password,salt,envelope.iterations);
  data=JSON.parse(bytesToUtf8(gcm(key,nonce).decrypt(ciphertext))) as Backup;
 }catch{throw Error('Incorrect password or damaged backup file');}
 if(JSON.stringify(data).length>MAX_FILE_SIZE)throw Error('Decrypted backup exceeds 20 MB');
 // Reject malformed decrypted payloads before touching the existing database.
 if(!data || typeof data!=='object' || data.app!=='MyMoney' || (data.version!==4 && data.version!==3) || !data.tables || typeof data.tables!=='object' || Array.isArray(data.tables) || TABLES.some(t=>!Array.isArray(data.tables[t]) && !(data.version===3 && t==='investment_purchases')))throw Error('Invalid or unsupported MyMoney backup');
 for(const table of TABLES){
  const rows=data.tables[table] || [];
  if(rows.length>100_000)throw Error('Backup table contains too many records');
  for(const row of rows){
   if(!row || typeof row!=='object' || Array.isArray(row))throw Error('Invalid backup row');
   const cols=Object.keys(row);
   if(!cols.length || cols.some(c=>!/^[a-z_]+$/.test(c)))throw Error('Invalid backup column');
   if(cols.some(c=>{const v=row[c];return v!==null && typeof v!=='string' && typeof v!=='number' && typeof v!=='boolean';}))throw Error('Invalid backup value');
  }
 }
 const db=await SQLite.openDatabaseAsync('mymoney.db');
 await db.withExclusiveTransactionAsync(async tx=>{
  // Children first when deleting; parents first when restoring.
  for(const table of [...TABLES].reverse())await tx.runAsync(`DELETE FROM ${table}`);
  for(const table of TABLES){
   for(const row of data.tables[table]||[]){
    const cols=Object.keys(row);
    if(!cols.length||cols.some(c=>!/^[a-z_]+$/.test(c)))throw Error('Invalid backup column');
    const allowed=await tx.getAllAsync<{name:string}>(`PRAGMA table_info(${table})`);
    const names=new Set(allowed.map(x=>x.name));
    if(cols.some(c=>!names.has(c)))throw Error('Backup schema mismatch');
    await tx.runAsync(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`,...cols.map(c=>row[c] as SQLite.SQLiteBindValue));
   }
  }
  // Verify restored foreign-key relationships before the transaction commits.
  // A corrupt but decryptable backup must not replace a valid local ledger.
  const fkErrors=await tx.getAllAsync<{table:string;rowid:number;parent:string;fkid:number}>('PRAGMA foreign_key_check');
  if(fkErrors.length)throw Error(`Backup contains ${fkErrors.length} broken account or transaction references; restore cancelled`);
  // Foreign-key checks alone do not detect damaged SQLite indexes or pages.
  const integrity=await tx.getAllAsync<{integrity_check:string}>('PRAGMA integrity_check');
  if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw Error('Database integrity check failed; restore cancelled');
  // Every import marker must point to a transaction in the same account.
  const mismatches=await tx.getFirstAsync<{n:number}>(`SELECT COUNT(*) AS n FROM imported_transactions i LEFT JOIN transactions t ON t.id=i.transaction_id WHERE t.id IS NULL OR t.account_id<>i.account_id`);
  if((mismatches?.n||0)>0)throw Error('Backup contains mismatched imported transactions; restore cancelled');
 });
 return true;
 } finally {
  // The picker copied this file to app cache; don't leave sensitive encrypted backups there.
  await FileSystem.deleteAsync(pickedUri,{idempotent:true}).catch(()=>{});
 }
}
