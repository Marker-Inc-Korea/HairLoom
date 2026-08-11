# Hairloom

[한국어 README](README.md)

[![Mobile iOS Build](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml)
[![Mobile Android Preview](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
![Capacitor 7.6.8](https://img.shields.io/badge/Capacitor-7.6.8-119EFF?logo=capacitor&logoColor=white)

Hairloom is a **standalone iOS and Android consultation app** that generates hairstyle design results from customer-supplied originals and a freeform request.

It does not require an online desktop, LAN server, Tailscale, or a separate Companion. Personal image API credentials stay in iOS Keychain or Android Keystore, while Provider authentication and image traffic run only in native code.

<p align="center">
  <img src="docs/assets/readme/hairloom-ios-source.png" width="360" alt="Hairloom iOS SOURCE screen">
</p>

## Product flow

```text
SOURCE → RESULTS → LOCK
```

1. Capture an original with the camera or select one from the gallery.
2. Enter the desired hairstyle, color, and known treatment history in `REQUEST`.
3. Native analysis starts a fixed 100-slot result batch.
4. Open results uncropped at their original aspect ratio and select 1–6.
5. Pass the selected current design IDs and original-source lineage to `LOCK`.

`Image 1` is required. `Images 2–6` are optional. Camera and gallery inputs use the same prepared-original pipeline.

## Product guarantees

- Only user-prepared originals may enter Provider requests.
- Generated images and catalog images are never reused for analysis or later generation.
- Each of the 100 slots keeps its index, design ID, original hash, and retry ownership regardless of completion order.
- Completed outputs survive restart; interrupted work returns to `retryable` under the same slot ownership.
- RESULTS enlargement contains only the uncropped image and a close control.
- Hair analysis never infers identity, age, ethnicity, face shape, body, health, or gender identity.
- Unobservable bleach, perm, or extension history remains unknown and conservative unless supplied by the user.

## Release status

The current source is a release candidate pending store signing and final operational acceptance.

| Area | Status |
| --- | --- |
| Node verification | 104 tests passing |
| Android | Java compilation, debug APK assembly, and API 35 emulator QA passing |
| GitHub preview | Installable Android APK and SHA-256 checksum published as a GitHub prerelease |
| iOS | Simulator build, install, launch, and screenshot passing on macOS GitHub Actions |
| Native targets | iOS 14.0+ · Android 6.0/API 23+, target SDK 35 |
| App ID and initial version | `com.markerinc.hairloom` · version `1.0` · build/versionCode `1` |
| Responsive web shell | Zero horizontal overflow at 1440×1000, 834×1112, and 390×844 |
| Browser Provider | Disabled; no credential form or Bearer transport |
| Native Provider | Personal OpenAI Image API connection supported |
| Credentialed Provider acceptance | Final E2E required on physical devices with the release owner's separately billed API key |

Store submission still requires each organization's signing certificates, provisioning profiles, Android signing configuration, store metadata, and physical-device QA. The unsigned iOS Simulator build and Android debug build do not replace signed store artifacts. Signing material and local SDK paths never belong in the repository.

## Download the Android APK from GitHub

Android users can install Hairloom without building the source. Open [GitHub Releases](https://github.com/Marker-Inc-Korea/HairLoom/releases) and download the latest **Android Preview**.

The repository is currently private, so downloads require a signed-in GitHub account with access to `Marker-Inc-Korea/HairLoom`. Public distribution requires a separate decision to make this repository public or publish the APK from a dedicated public download repository.

Each preview contains exactly two release assets:

```text
Hairloom-android-preview.apk
Hairloom-android-preview.apk.sha256
```

Installation:

1. Download both files into the same folder.
2. Confirm that the APK's SHA-256 digest matches the checksum file.

   macOS or Linux:

   ```bash
   shasum -a 256 Hairloom-android-preview.apk
   cat Hairloom-android-preview.apk.sha256
   ```

   Windows PowerShell:

   ```powershell
   (Get-FileHash .\Hairloom-android-preview.apk -Algorithm SHA256).Hash.ToLower()
   Get-Content .\Hairloom-android-preview.apk.sha256
   ```

3. Open the downloaded APK on Android and, when prompted, allow **Install unknown apps** for the browser or file manager used to open it.
4. On the SOURCE screen, select `이미지 생성 연결` and enter a separately billed OpenAI API key through the native secure dialog.

Developers with ADB can also install it with:

```bash
adb install Hairloom-android-preview.apk
```

This APK is a **debug-signed sideload preview** for direct GitHub installation and internal testing. It is not a Play Store artifact. The GitHub runner's debug signing certificate may change between preview builds; if an update fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, uninstall the previous preview before installing the new APK. Uninstalling resets app-private originals, outputs, and settings.

iOS binaries cannot be installed on ordinary devices from GitHub without Apple signing and provisioning. Use the Xcode build instructions below for iOS; TestFlight and App Store distribution remain deferred.

## Quick start: local web shell

Hairloom requires Node.js 20 or newer.

```bash
git clone https://github.com/Marker-Inc-Korea/HairLoom.git
cd HairLoom
npm ci
npm run verify
HOST=127.0.0.1 PORT=4180 npm run start
```

Open:

```text
Hairloom:  http://127.0.0.1:4180/
Health:    http://127.0.0.1:4180/healthz
```

The web shell is a local preview for the product flow and catalog. Browsers cannot enter credentials or execute Provider generation.

## Native builds

Common preparation:

```bash
npm ci
npm run mobile:prepare
npm run mobile:test
npm run mobile:doctor
```

`mobile:prepare` copies exactly 17 allowlisted public assets into `mobile-dist/`. It excludes credentials, customer photos, outputs, `.env`, `.gjc`, `imagen.web.js`, and private test assets.

### iOS

Requirements:

- Xcode
- CocoaPods
- Node.js 20+

```bash
npm run mobile:prepare
npx cap sync ios
cd ios/App
pod install
open App.xcworkspace
```

Select the `App` scheme and a development team in Xcode, then run on a Simulator or connected device. CI verifies this pipeline:

```text
npm ci → mobile:prepare → cap copy ios → pod install
→ unsigned Simulator build → simctl install/launch → screenshot
```

Open the project from the repository root:

```bash
npm run mobile:open:ios
```

Create the release archive in Xcode:

1. Confirm the `App` target's bundle identifier, version, build number, and deployment target.
2. Select the organization's Team and provisioning under `Signing & Capabilities`.
3. Choose `Any iOS Device (arm64)` and run **Product → Archive**.
4. In Organizer, choose **Distribute App** to upload to TestFlight or App Store Connect.

Repository CI verifies an unsigned Simulator build, install, and launch. A signed archive and physical-device behavior require separate release-owner acceptance.

### Android

Requirements:

- Java 21
- Android SDK 35
- Android Studio or Gradle

```bash
npm run mobile:prepare
npx cap sync android
JAVA_HOME=/path/to/jdk-21 \
ANDROID_HOME=/path/to/android-sdk \
./android/gradlew -p android assembleDebug
```

Debug APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Open Android Studio:

```bash
npm run mobile:open:android
```

Release AAB/APK builds must inject the organization's signing configuration through local files or CI secrets. Never commit keystores or passwords.

Create the store Android App Bundle as follows:

1. Confirm the release `applicationId`, `versionCode`, `versionName`, and min/target SDK values.
2. In Android Studio, select **Build → Generate Signed Bundle / APK**, then **Android App Bundle**.
3. Inject the organization's upload key and passwords only from local secure storage or CI secrets.
4. After release signing is configured, reproduce the build with `./android/gradlew -p android clean bundleRelease`.

The configured release build writes `android/app/build/outputs/bundle/release/app-release.aab`. This repository intentionally contains no organization-specific upload key or signing secret, so an unsigned `release` artifact is not ready for Play Console submission.

## Image Provider connection

On the mobile SOURCE screen, select `이미지 생성 연결` and enter a personal OpenAI Image API key with separate billing enabled.

| Purpose | Fixed native configuration |
| --- | --- |
| Hair analysis | `https://api.openai.com/v1/responses` · `gpt-4.1-mini` |
| Image edit | `https://api.openai.com/v1/images/edits` · `gpt-image-2` |

Credential boundary:

- iOS: non-synchronizing, device-only Keychain item
- Android: Android Keystore AES-GCM
- No key reaches WebView JavaScript, `localStorage`, `sessionStorage`, service workers, logs, or exports
- The bridge accepts no arbitrary URL, header, Provider method, filesystem path, or unrestricted native command

ChatGPT Plus/Pro billing and OpenAI API billing are separate. Never import ChatGPT/Codex cookies, passwords, browser tokens, `~/.codex/auth.json`, or private God Tibo authentication into the mobile app.

- [ChatGPT subscriptions and API billing are separate](https://help.openai.com/en/articles/8156019)
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540)

Until an officially supported mobile subscription Provider exists, this release supports only a separately billed personal Image API.

A batch owns 100 fixed result slots, and retries can add billable requests. Confirm the OpenAI API project's billing state, usage limits, and QA budget before credentialed Provider testing.

## Data retention and deletion

Private app layout:

```text
sources/
outputs/
jobs/<batchId>/<slotIndex>.json
jobs/<batchId>/context.json
hairloom-private.sqlite
```

- Prepared originals, outputs, batches, slots, events, and retry state remain in private app storage.
- Raw prompts stay in protected job files, not SQLite event rows or logs.
- iOS applies data protection and backup exclusion.
- Android uses `allowBackup=false`, cleartext blocking, and private app storage.
- Startup cleanup removes completed/cancelled customer data and opaque output handles after seven days.
- `모든 고객 데이터 삭제` immediately deletes originals, outputs, jobs, and batch/slot/event journals.
- The Provider key is separate and remains until `연결 삭제` is selected.

## Verification

Full verification:

```bash
npm run verify
```

Native-boundary verification:

```bash
npm run mobile:prepare
npm run mobile:test
npm run mobile:doctor
```

Current baseline:

```text
104 tests passing
1,080-design taxonomy check passing
6,500-design master catalog check passing
500 structure groups
12 finish records per structure
288 deterministic variations per structure
catalogVersion: HLM-MASTER-2026-07-EXPLORE-2
promptVersion: HLM-EXPLORE-PROMPT-2026-07-4
trendRegistryVersion: HLM-TRENDS-2026-07-1
```

Primary CI workflows:

- [`Mobile iOS Build`](.github/workflows/mobile-ios-build.yml): iOS Simulator build, install, and launch
- [`Mobile Android Preview`](.github/workflows/mobile-android-preview.yml): debug APK/SHA-256 artifact validation and version-tag prerelease publication
- [`Hair Trend Refresh`](.github/workflows/hair-trend-refresh.yml): validated metadata-only biweekly pull requests

## Deployment checklist

```text
[ ] npm ci && npm run verify
[ ] npm run mobile:prepare && npm run mobile:test
[ ] Confirm iOS App scheme, bundle identifier, signing team, and provisioning
[ ] Confirm Android applicationId, versionCode/versionName, and signing config
[ ] Test camera and gallery on physical iOS and Android devices
[ ] Test Keychain/Keystore connect and delete on physical devices
[ ] Run analysis, 100 results, completed-output restoration, shortlist, and LOCK E2E with a billed API key
[ ] Test foreground generation, interruption, termination, and restart recovery
[ ] Verify 100 fixed slots, restored completed outputs, 1–6 shortlist, and LOCK
[ ] Delete all customer data and confirm no source/output/journal residue
[ ] Scan repository and artifacts for credentials, photos, signing material, and local paths
[ ] Confirm App Store Connect and Play Console privacy-policy URL, support URL, and review notes
```

## Advanced operations: trend registry

<details>
<summary>Metadata-only trend collection and biweekly automation</summary>

Hairloom never stores external social images or uses them as generation inputs. The trend collector retains style names, publication timestamps, public permalinks, sample counts, and momentum signals, then maps them to existing `HLM-C-*` design IDs.

```bash
npm run trend:check
npm run trend
```

Run live collection only with Meta Hashtag Search or Naver DataLab credentials:

```bash
cp .env.example .env
npm run trend:live
```

Preview or install the macOS launchd schedule:

```bash
npm run trend:schedule -- --dry-run --interval-hours=336
npm run trend:schedule
npm run trend:schedule:status
npm run trend:update
npm run trend:schedule:remove
```

GitHub Actions live refresh requires one complete Meta or Naver credential pair:

```text
HAIRLOOM_META_ACCESS_TOKEN
HAIRLOOM_META_IG_USER_ID
HAIRLOOM_NAVER_CLIENT_ID
HAIRLOOM_NAVER_CLIENT_SECRET
```

Automated pull requests may change only:

```text
data/hair-trend-signals.json
src/hairTrendData.mjs
```

Image URLs, thumbnails, Base64, external image data, and secret-shaped fields are rejected during import.

</details>

## Repository map

```text
consultation/                           Public Hairloom UI
src/mobileProviderBridge.mjs            Allowlisted WebView↔native bridge
src/hairAnalysis.mjs                    Conservative hair-profile normalization
src/consultationCore.mjs                Recommendation, feasibility, and fixed-slot domain
src/exploreCore.mjs                     Catalog and deterministic selection domain
android/app/src/main/java/...            Android Provider, Keystore, and SQLite implementation
ios/App/App/HairloomProviderPlugin.swift iOS Provider, Keychain, and SQLite implementation
scripts/prepareMobileAssets.mjs          Allowlisted native asset packaging
scripts/doctorMobile.mjs                 Mobile toolchain and security-boundary diagnostics
docs/hair-design-master/                6,500-record runtime catalog
server.mjs                               Local-only static server and public routes
```

## Never commit

```text
.env
imagen.web.js
API keys
customer photos
generated customer images
native signing material
local SDK paths
crash artifacts
.gjc/
mobile-dist/
```

Hairloom and BeautyTape are separate repositories. Hairloom changes belong only in `Marker-Inc-Korea/HairLoom`.
