// Explicitly separates static checks from a real TypeScript / Android build.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
const required=[...Object.keys(pkg.dependencies),...Object.keys(pkg.devDependencies)];
const missing=required.filter(name=>!fs.existsSync(path.join(root,'node_modules',name,'package.json')));
const run=(cmd,args)=>{const r=cp.spawnSync(cmd,args,{cwd:root,encoding:'utf8',timeout:30000});return {ok:r.status===0,output:(r.stdout||'')+(r.stderr||'')};};
const node=run('node',['--version']);const java=run('java',['-version']);
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||'';
const sdkPresent=!!sdk&&fs.existsSync(sdk);
const gradle=fs.existsSync(path.join(root,'android','gradlew'));
const report={phase:25,node:node.output.trim(),javaAvailable:java.ok,androidSdkConfigured:sdkPresent,androidNativeProjectPresent:gradle,dependenciesInstalled:missing.length===0,missingDependencies:missing,typescriptTypecheck:'NOT_RUN',androidBuild:'NOT_RUN'};
if(!missing.length){const check=run(process.platform==='win32'?'npm.cmd':'npm',['run','typecheck']);report.typescriptTypecheck=check.ok?'PASS':'FAIL';if(!check.ok)report.typecheckOutput=check.output.slice(-4000);}
fs.writeFileSync(path.join(root,'BUILD-READINESS.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
// A diagnostic is not a failure; use CI script for strict gate.
