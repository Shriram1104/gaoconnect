// Static release checks that do not require npm dependencies.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const pkg=read('package.json'),app=read('app.json'),eas=read('eas.json');
assert.equal(pkg.main,'expo/AppEntry');
assert.match(app.expo.android.package,/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
assert.equal(eas.build.preview.android.buildType,'apk');
for(const name of ['expo','react','react-native','expo-sqlite','expo-secure-store','expo-local-authentication','expo-file-system','expo-document-picker','expo-sharing','xlsx'])assert.ok(pkg.dependencies[name],`Missing dependency ${name}`);
for(const name of ['App.tsx','src/db.ts','src/imports.ts','src/backup.ts','src/lock.ts'])assert.ok(fs.existsSync(path.join(root,name)),`Missing ${name}`);
console.log('PASS: static APK release preflight (not an Android build)');
