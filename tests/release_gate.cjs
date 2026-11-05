// Strict release gate. Fails closed unless the actual toolchain is present and checks pass.
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const pkg=require('../package.json');
const failures=[];
const run=(cmd,args)=>{
 const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:120000});
 if(r.error||r.status!==0){failures.push(`${cmd} ${args.join(' ')}: ${(r.stderr||r.stdout||r.error?.message||'failed').slice(-900)}`);return false;}
 return true;
};
for(const [cmd,args] of [['node',['tests/source_syntax_check.cjs']],['node',['tests/import_parser_test.cjs']],['node',['tests/release_preflight.cjs']],['python3',['tests/ledger_smoke.py']],['python3',['tests/phase18_sqlite.py']]])run(cmd,args);
const deps=[...Object.keys(pkg.dependencies),...Object.keys(pkg.devDependencies)];
const missing=deps.filter(n=>!fs.existsSync(path.join(root,'node_modules',n,'package.json')));
if(missing.length)failures.push(`Dependencies missing: ${missing.join(', ')}`);
else run(process.platform==='win32'?'npm.cmd':'npm',['run','typecheck']);
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk||!fs.existsSync(sdk))failures.push('Android SDK not configured');
if(!fs.existsSync(path.join(root,'android','gradlew')))failures.push('Native Android project not generated');
const apk=path.join(root,'android','app','build','outputs','apk','release','app-release.apk');
if(!fs.existsSync(apk))failures.push('Release APK not built');
else run('python3',['tests/verify_apk.py',apk]);
const result={releaseReady:failures.length===0,checks:'Source tests + dependencies + TypeScript + SDK + native project + APK artifact verification',failures};
console.log(JSON.stringify(result,null,2));
process.exitCode=failures.length?1:0;
