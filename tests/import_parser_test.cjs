// Run with: node tests/import_parser_test.cjs
// Isolated parser tests: no Expo native runtime required.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(require('path').join(__dirname, '../src/imports.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleExports = {};
const fakeRequire = name => (name === 'base64-js' ? {toByteArray:()=>{}} : {});
vm.runInNewContext(js, {exports:moduleExports, require:fakeRequire, Date, Set, Error, Number, String, RegExp, console});
const {parseCSV, partitionForReview} = moduleExports;
const base = 'Date,Description,Debit,Credit,UTR\n';
const a = parseCSV(base + '05/11/2026,Petrol,500,,UTR1\n05/11/2026,Petrol,500,,UTR2');
assert.equal(a.length,2);
assert.notEqual(a[0].fingerprint,a[1].fingerprint);
const b = parseCSV('Date,Description,Debit,Credit\n05/11/2026,Petrol,500,\n05/11/2026,Salary,,70000');
assert.equal(b.length,2);
assert.equal(b[0].kind,'EXPENSE');
assert.equal(b[1].kind,'INCOME');
assert.throws(()=>parseCSV(base+'05/11/2026,Petrol,500,,UTR1\n05/11/2026,Petrol,500,,UTR1'),/Duplicate/);
assert.throws(()=>parseCSV('Date,Description,Debit,Credit\n31/02/2026,Petrol,500,'),/Invalid calendar date/);
assert.throws(()=>parseCSV('Date,Description,Debit,Credit\n05/11/2026,Petrol,500,500'),/Exactly one/);
const classified=parseCSV('Date,Description,Debit,Credit\n05/11/2026,SIP MUTUAL FUND,5000,\n05/11/2026,Petrol,500,');
assert.equal(partitionForReview(classified).needsReview.length,1);
assert.equal(partitionForReview(classified).safe.length,1);
assert.throws(()=>parseCSV('Date,Description,Debit,Credit\n05/11/2026,,500,'),/description is required/);
assert.throws(()=>parseCSV('Date,Description,Debit,Credit\n'+Array.from({length:2001},(_,i)=>`05/11/2026,Item ${i},1,`).join('\n')),/at most 2000/);
// Common Indian bank export headers and DD-MMM-YYYY dates.
const bank=parseCSV('Txn Date,Transaction Remarks,Withdrawal Amount (INR),Deposit Amount (INR),Ref No\n05-Nov-2026,UPI STORE,350,,TX001');
assert.equal(bank[0].date,'2026-11-05');
assert.equal(bank[0].paise,35000);
assert.throws(()=>parseCSV('Date,Description,Debit,Credit\n29-Feb-2025,Petrol,100,'),/Invalid calendar date/);
assert.equal(parseCSV('Date,Description,Debit,Credit\n29-Feb-2024,Petrol,100,')[0].date,'2024-02-29');
assert.throws(()=>parseCSV('Date,Description,Debit,Credit\n01/01/0099,Petrol,100,'),/Invalid calendar date/);
// Two genuine same-day identical purchases without UTR must remain separate.
const repeated='Date,Description,Debit,Credit\n05/11/2026,Tea,20,\n05/11/2026,Tea,20,';
const repeats=parseCSV(repeated);
assert.equal(repeats.length,2);
assert.notEqual(repeats[0].fingerprint,repeats[1].fingerprint);
assert.equal(repeats[0].fingerprint,parseCSV(repeated)[0].fingerprint);
assert.equal(repeats[1].fingerprint,parseCSV(repeated)[1].fingerprint);
console.log('PASS: 18 bank statement parser assertions');
