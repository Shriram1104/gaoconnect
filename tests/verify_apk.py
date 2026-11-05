#!/usr/bin/env python3
"""Verify a produced APK's container integrity, essential entries and SHA-256."""
import hashlib, json, os, pathlib, sys, zipfile
p=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('android/app/build/outputs/apk/release/app-release.apk')
errors=[]
if not p.is_file(): errors.append('APK not found: '+str(p))
elif p.stat().st_size<100_000: errors.append('APK suspiciously small')
else:
 try:
  with zipfile.ZipFile(p) as z:
   bad=z.testzip()
   if bad: errors.append('Corrupt APK member: '+bad)
   names=set(z.namelist())
   for item in ('AndroidManifest.xml','classes.dex'):
    if item not in names: errors.append('Missing APK entry: '+item)
   if not any(n.startswith('lib/') and n.endswith('.so') for n in names): errors.append('No native libraries in APK')
   if not any(n in ('assets/index.android.bundle', 'assets/index.android.bundle.hbc') or (n.startswith('assets/') and n.endswith('.hbc')) for n in names): errors.append('Missing embedded JavaScript/Hermes bundle; APK may require Metro')
 except (OSError,zipfile.BadZipFile) as e: errors.append('Invalid APK archive: '+str(e))
result={'apk':str(p),'verified':not errors,'size_bytes':p.stat().st_size if p.is_file() else None,'sha256':hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() and not errors else None,'errors':errors,'note':'Container checks only; install and runtime testing are separate.'}
print(json.dumps(result,indent=2))
sys.exit(1 if errors else 0)
