// Parse and transpile every TypeScript/TSX source file without requiring Expo packages.
const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='node_modules')walk(p);}else if(/\.tsx?$/.test(entry.name))files.push(p);}}
walk(root);
let failed=0;
for(const file of files){
 const src=fs.readFileSync(file,'utf8');
 const output=ts.transpileModule(src,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 for(const e of errors){console.error(path.relative(root,file)+': '+ts.flattenDiagnosticMessageText(e.messageText,' '));failed++;}
}
if(failed)process.exit(1);
console.log(`PASS: ${files.length} TypeScript/TSX files parsed and transpiled (syntax only; not a typecheck)`);
