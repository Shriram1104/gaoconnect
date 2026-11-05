#!/usr/bin/env python3
"""Configure a disposable TEST APK to use the Android debug signing key.
Not for publishing or distributing sensitive production data.
"""
from pathlib import Path
import sys
p = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('android/app/build.gradle')
s = p.read_text()
needle = 'buildTypes {'
if s.count(needle) != 1:
    raise SystemExit('Expected exactly one buildTypes block')
start = s.index(needle)
release = s.find('release {', start)
if release < 0:
    raise SystemExit('No release buildType found')
next_block = s.find('}', release)
block = s[release:next_block]
if 'signingConfig signingConfigs.debug' not in block:
    # Expo-generated Gradle normally includes a debug signingConfig for release;
    # if not, insert one explicitly for this disposable test build.
    s = s[:release + len('release {')] + '\n            signingConfig signingConfigs.debug' + s[release + len('release {'):]
    p.write_text(s)
print('Release test APK uses debug signing key (NOT production signing).')
