# Build a Samsung-installable MyMoney test APK with GitHub Actions

This is an **optional external build runner**, not an application backend. The MyMoney app itself remains offline and stores data in SQLite on the phone. Uploading source to GitHub does not upload financial data from the phone. Keep this repository private.

1. Create a **private** GitHub repository and upload the **contents** of this source folder (including `.github/workflows/android-apk.yml`).
2. In GitHub open **Actions → Build MyMoney Android test APK → Run workflow** on `main`.
3. Wait for the workflow to finish. If it fails, read the first failed step's logs; do not assume an APK was produced.
4. After a successful run, open its **Artifacts** section and download `MyMoney-Android-debug-APK`.
5. Extract the ZIP and copy `android/app/build/outputs/apk/debug/app-debug.apk` to the Samsung phone. Install only after reviewing Android's unknown-app installation warning and verifying the artifact came from your repository.
6. Test with **dummy data first**: app launch, transactions, balances, imports, backup/restore, device lock and reinstallation. A debug APK is **not** a production release; do not rely on it for irreplaceable financial data.

The workflow intentionally runs tests and `npm run typecheck` before compiling. It uses GitHub-hosted Android SDK and Gradle to generate a **debug APK**, avoiding local Android Studio setup. No signing keys or Expo account are needed for a debug build. The workflow is untested in this environment because npm dependencies and Android SDK are unavailable. Expo SDK and dependency mismatches may need correction in workflow logs.

For a production-ready signed release, complete device tests, dependency security review, and configure Android release signing separately. Debug builds can be removed by Android on uninstall, along with local app data; export an encrypted backup before uninstalling.


## Phase 34: standalone APK correction
The workflow builds `assembleRelease`, not `assembleDebug`. A debug APK typically depends on Metro. The release build should embed the JavaScript/Hermes bundle so the app can run offline. This is a **test release**, not a production-signed Play Store release; signing must be checked in the generated Gradle configuration. The verification script checks for the embedded bundle but cannot prove runtime functionality.

The workflow artifact is `MyMoney-Android-standalone-APK`, with `app-release.apk` and its SHA-256 file. If Gradle does not configure signing for the release variant, compilation may fail; configure a secure signing key before distributing the app. Never commit signing passwords or keystores.


### Phase 35 signing note
The release-mode APK is signed with the Android **debug key** for testing. It should be installable without Metro, but has not been compiled or installed yet. This signing key is unsuitable for production updates or distribution. The workflow now runs `apksigner verify` before uploading artifacts.
