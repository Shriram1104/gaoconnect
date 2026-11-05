# MyMoney Android build and release checklist

## Status
Source only. No compiled APK has been produced or tested on a Samsung device. Do not use with real financial data yet.

## Build on a computer with internet access
1. Install Node.js 22 LTS and Android Studio (or use Expo EAS cloud build).
2. In this folder: `npm install`.
3. Run `npx expo install --check` and resolve SDK compatibility issues before building.
4. Run `npm run typecheck` and fix all errors.
5. Run `python3 tests/ledger_smoke.py` for isolated ledger tests.
6. Run `npx expo-doctor` and resolve warnings.
7. For an APK using EAS: `npx eas-cli login`, then `npx eas-cli build --platform android --profile preview` (requires Expo account and network). This is an external build service, not a financial-data server.
8. Alternatively generate Android native project with `npx expo prebuild --platform android`, then build with Gradle/Android SDK locally.
9. Install resulting APK on Samsung device; verify migrations, account balances, imports, backup encryption, restore, app lock, and upgrade paths before storing actual data.

## Release blockers
- Full financial reconciliation and statement matching remain incomplete.
- PDF imports are not implemented.
- Test encryption/restore on real Android device, including interrupted restore and backup round-trip.
- Review `xlsx` dependency security and update/replace if needed.
- Check local database protection; biometric lock is not SQLite encryption.
- Add automated Android integration tests and validate upgrading an installed app.
- Check bank statement privacy, temporary files and backup retention.

## Phase 17 changes
- Align backup file-size error with the actual 20 MB limit.
- Delete temporary encrypted backup file after sharing finishes or fails.
- Document reproducible APK build and release checks.

## Phase 19 import verification cases (must test on device)
- Two same-day transactions with same narration and amount but distinct UTRs: both should preview and import.
- Re-import the same statement into the same account: no new entries.
- Duplicate UTR/date/direction/amount within one file: reject entire import.
- Statement without reference column: preserve conservative duplicate detection.
- Same statement imported into a different account: account-scoped fingerprint behavior must be reviewed for user error.

## Phase 21 verification (2026-11-05)
- `npm run test:syntax`: PASS, 8 TypeScript/TSX source files parsed and transpiled. This is **not** a typecheck.
- `npm run test:imports`: PASS, 7 assertions.
- `python3 tests/ledger_smoke.py`: PASS, 5 isolated ledger tests.
- `python3 tests/phase18_sqlite.py`: PASS, imported transaction fingerprint lifecycle.
- Fixed temporary backup cleanup when Android sharing is unavailable.
- Dependency installation cannot proceed in this environment because npm registry DNS resolution fails (`EAI_AGAIN`). Full typecheck and APK compilation remain blocked.


Phase 22: run `npm run test:preflight` before dependency installation; this checks release metadata only and is not a substitute for a native build.

## Phase 23 (2026-11-05)
- Added DD-MMM-YYYY date support (e.g. 05-Nov-2026) and more common Indian bank CSV/Excel column aliases.
- Explicitly rejected invalid calendar dates, including 29-Feb-2025 and year 0099.
- `node tests/import_parser_test.cjs`: 14 assertions passed.
- `node tests/source_syntax_check.cjs`: 8 TypeScript/TSX files parsed; **not** full typechecking.
- `node tests/release_preflight.cjs`: passed (static metadata only).
- `python tests/ledger_smoke.py`: 5 tests passed.
- `python tests/phase18_sqlite.py`: passed.
- **No APK produced**; Expo dependencies and native Android build remain unavailable/unvalidated in this environment.


## Phase 24 — repeated no-reference transactions
- Distinguish identical transactions without a UTR by their occurrence number within the imported statement, allowing genuine repeat purchases.
- Re-importing an unchanged statement retains deterministic fingerprints.
- Caveat: importing an overlapping or reordered subset of a statement without bank references can still cause incorrect duplicate matching. Review previews carefully; no automatic reconciliation is claimed.
- Full Expo/Android compilation and Samsung-device validation remain pending.

## Phase 25 verified environment diagnosis
- Node 22.16.0 and Java available.
- Expo/React dependencies not installed.
- Android SDK not configured in this environment.
- Android native project has not been generated.
- Full TypeScript check and APK compilation **not run**.

On a build machine with network and Android SDK, run `npm install`, `npm run typecheck`, `npx expo prebuild --platform android`, and `cd android && ./gradlew assembleRelease` (release signing configuration required), or configure EAS and run `eas build -p android --profile preview`. Never treat an unsigned/unverified output as production-ready.

## Phase 26 — strict release gate
- `npm run verify:release` now **exits nonzero** when source tests fail, dependencies are absent, TypeScript checking fails, or Android SDK/native project are missing.
- This is intentionally stricter than `npm run diagnose:build`, which only reports conditions.
- The gate does **not** claim an APK was compiled or that Android runtime tests passed.
- Encrypted backup export now rejects payloads over 20 MB before writing a temporary file.
- APK generation still requires working npm/Expo dependencies and an Android build environment.


### Phase 27 artifact verification
After producing a release APK, run `npm run verify:apk -- android/app/build/outputs/apk/release/app-release.apk`. The strict `npm run verify:release` now requires the actual release APK; source checks alone cannot report `releaseReady: true`. If EAS cloud build outputs an APK at another location, copy it to the expected release path before running the gate. APK archive verification is not Samsung-device testing.


## Phase 28 backup restore integrity
Restore now performs SQLite `PRAGMA foreign_key_check` inside the replacement transaction and rolls back if any orphaned references are detected. This does not replace on-device testing.

## Build environment checked 2026-11-05
`npm ping` failed with `EAI_AGAIN` (registry DNS); Android SDK was not detected. Therefore a TypeScript dependency check and APK build remain blocked. No APK has been generated.

### Phase 29 status
Added pre-transaction validation of decrypted backup structure and row values. No dependency installation, full TypeScript typecheck, Android SDK build, or device testing was completed in this phase. APK not available.

## Phase 30 release note
Backup restoration adds SQLite `integrity_check` and imported-transaction/account consistency checks inside the restore transaction. Verify rollback on malformed backups on a real Android build before trusting backup restore for production data.


### Phase 31 validation note
Backup restore now removes the temporary cached selected backup after processing. This is not a verified Android release; Expo dependencies, TypeScript typecheck, and native compilation are still required.

## Phase 32 — oversized backup cleanup
- Moved the selected-backup size guard inside the restore `try/finally`, so oversized cached backup files are removed.
- Added `npm run test:backup-cleanup` static regression check.
- Full dependency installation, TypeScript typechecking, Android compilation and Samsung testing remain pending.

## Phase 33: alternative Android build via GitHub Actions
See `GITHUB-APK-BUILD.md`. GitHub-hosted runners can provide the Android SDK missing from this environment. The workflow produces an **installable debug APK** only if all source tests, TypeScript checks and native build steps succeed. It has not yet been executed or validated on a Samsung phone.


### Phase 34 standalone build
GitHub Actions now invokes `assembleRelease` and validates the embedded JS/Hermes bundle. Release signing configuration is required; verify that the generated APK is signed before installation. Do not treat ZIP/archive verification as device validation.


Phase 35: release-mode test builds use debug signing and verify the signature via `apksigner`. A proper release keystore and Samsung-device verification remain mandatory before production use.
