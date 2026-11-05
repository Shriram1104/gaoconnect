{
  "name": "mymoney-mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo/AppEntry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "typecheck": "tsc --noEmit",
    "test:imports": "node tests/import_parser_test.cjs",
    "test:syntax": "node tests/source_syntax_check.cjs",
    "test:preflight": "node tests/release_preflight.cjs"
  },
  "dependencies": {
    "expo": "~54.0.0",
    "expo-status-bar": "~3.0.9",
    "expo-sqlite": "~16.0.8",
    "react": "19.1.0",
    "react-native": "0.81.4",
    "@react-native-picker/picker": "2.11.1",
    "react-native-safe-area-context": "5.6.0",
    "expo-file-system": "~19.0.0",
    "expo-sharing": "~14.0.0",
    "expo-document-picker": "~14.0.0",
    "expo-crypto": "~15.0.7",
    "expo-local-authentication": "~17.0.7",
    "expo-secure-store": "~15.0.7",
    "@noble/ciphers": "^1.3.0",
    "@noble/hashes": "^1.8.0",
    "base64-js": "^1.5.1",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "typescript": "~5.9.2",
    "@types/react": "~19.1.10",
    "@types/base64-js": "^1.5.0"
  }
}


## Phase 22 changes
- Reject oversized CSV/XLSX inputs after reading, even if file picker does not provide file size.
- Reject empty bank transaction descriptions and files over 2,000 data rows before parsing all rows.
- Enforce 20 MB encrypted backup limit even if document picker does not report a size.
- Add dependency-free static Android release preflight and two importer regression assertions.
- No APK has been built. Dependency installation still requires npm registry access.

### Phase 23 changes
- Supports `DD-MMM-YYYY` statement dates, e.g. `05-Nov-2026`.
- Recognizes more Indian bank export headings such as `Txn Date`, `Transaction Remarks`, `Withdrawal Amount (INR)` and `Deposit Amount (INR)`.
- Rejects invalid calendar dates and dates outside 1900–2100.
- All isolated importer, SQLite and static preflight checks passed; this does not mean an Android APK was built or tested.


## Phase 24 — repeated no-reference transactions
- Distinguish identical transactions without a UTR by their occurrence number within the imported statement, allowing genuine repeat purchases.
- Re-importing an unchanged statement retains deterministic fingerprints.
- Caveat: importing an overlapping or reordered subset of a statement without bank references can still cause incorrect duplicate matching. Review previews carefully; no automatic reconciliation is claimed.
- Full Expo/Android compilation and Samsung-device validation remain pending.

## Phase 25 — reproducible build diagnostics
Run `npm run diagnose:build` to write `BUILD-READINESS.json` and identify missing dependencies, Android SDK, and TypeScript typecheck status. A static preflight does **not** mean an APK has been compiled.

### Phase 26
Run `npm run verify:release` to fail closed on missing prerequisites; `npm run diagnose:build` remains informational. Encrypted backup export now enforces the 20 MB limit before writing. No APK has been built or device-tested.


## Phase 27 — APK artifact gate
The strict release gate now **cannot pass without a real compiled release APK**. `npm run verify:apk -- /path/to/app.apk` checks ZIP integrity, required Android manifest/DEX/native library entries, and prints SHA-256. These checks do not replace installation or runtime testing.


### Phase 28
- Encrypted backup restoration validates foreign-key relationships before committing replacement data.
- Backup payload size checked after decryption.
- Corrected import preview wording for repeated transactions and review-required rows.
- Android APK still not built or runtime tested.

## Phase 29 — restore payload validation
Before replacing local data, restore now rejects malformed decrypted backup objects, non-object rows, nested/non-SQLite values, invalid column names, and oversized individual tables. Existing atomic rollback and foreign-key checks remain in place. Source syntax, parser, ledger, and static preflight checks passed; encrypted restore on Android remains untested.

## Phase 30 — additional restore integrity gates
Encrypted restore now checks `PRAGMA integrity_check` and validates that every imported transaction fingerprint points to a transaction in the same account, before committing the replacement ledger. A failure rolls back the restore. This is a source-level change; runtime encrypted restore on Android is not yet tested. The standalone APK remains blocked by unavailable dependencies and Android SDK in this environment.

## Phase 31 — encrypted backup restore hygiene
- Validate salt, nonce, and ciphertext base64 encoding and lengths before decryption.
- Delete the document-picker temporary cached encrypted backup in a `finally` block after restore or failure.
- Source syntax, import parser, SQLite smoke tests, and static preflight were run; Android compilation and runtime tests remain outstanding.

## Phase 32 — oversized backup cleanup
- Moved the selected-backup size guard inside the restore `try/finally`, so oversized cached backup files are removed.
- Added `npm run test:backup-cleanup` static regression check.
- Full dependency installation, TypeScript typechecking, Android compilation and Samsung testing remain pending.

## Phase 33 — GitHub-hosted test APK build
Added `.github/workflows/android-apk.yml` and `GITHUB-APK-BUILD.md` for a reproducible cloud CI build of a **debug** APK. The workflow installs dependencies, runs tests, typechecks, prebuilds Android, compiles an APK, verifies the archive, and publishes an artifact. This workflow has not yet been executed; no APK is claimed.


### Phase 34
Corrected GitHub build to generate a standalone release-mode APK instead of a Metro-dependent debug APK. Added embedded JavaScript bundle verification. Not compiled or device tested.


## Phase 35 — installable test APK signing
GitHub Actions now explicitly configures a **test-only debug signing key** for the release-mode build and verifies the APK signature using Android SDK `apksigner`. This combines bundled JS with an installable signed APK, but it is **not production signing**. Do not store real financial data until device testing, secure signing and release review are complete.
