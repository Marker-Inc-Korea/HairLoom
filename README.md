# Hairloom

[English README](README.en.md)

[![Mobile iOS Build](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml)
[![Mobile Android Preview](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
![Capacitor 7.6.8](https://img.shields.io/badge/Capacitor-7.6.8-119EFF?logo=capacitor&logoColor=white)

Hairloom은 고객이 제공한 원본 사진과 자유 입력 요청을 바탕으로 헤어 디자인 상담 결과를 생성하는 **독립 실행형 iOS·Android 앱**입니다.

데스크톱 서버나 LAN, Tailscale, 별도 Companion 없이 동작합니다. 개인 이미지 API 키는 WebView가 아니라 iOS Keychain 또는 Android Keystore에만 저장되고, Provider 인증과 이미지 트래픽은 네이티브 코드에서 처리됩니다.

<p align="center">
  <img src="docs/assets/readme/hairloom-ios-source.png" width="360" alt="Hairloom iOS SOURCE 화면">
</p>

## 핵심 흐름

```text
SOURCE → RESULTS → LOCK
```

1. 카메라로 촬영하거나 갤러리에서 원본 이미지를 선택합니다.
2. `REQUEST`에 원하는 헤어스타일, 색상, 알고 있는 시술 이력을 입력합니다.
3. 네이티브 분석을 거쳐 고정된 100개 결과 슬롯을 생성합니다.
4. 결과를 원본 비율로 확대해 확인하고 1–6개를 선택합니다.
5. 선택한 현재 디자인 ID와 원본 계보를 `LOCK`으로 전달합니다.

`이미지 1`은 필수이며 `이미지 2–6`은 선택 사항입니다. 카메라와 갤러리는 동일한 준비 원본 파이프라인을 사용합니다.

## 제품 원칙

- Provider 입력은 사용자가 준비한 원본 사진만 허용합니다.
- 생성 이미지와 카탈로그 이미지는 분석 또는 다음 생성의 입력으로 재사용하지 않습니다.
- 100개 슬롯의 인덱스, 디자인 ID, 원본 해시와 재시도 소유권은 완료 순서와 무관하게 유지됩니다.
- 앱 재시작 시 완료 결과는 유지되고 중단된 작업은 같은 슬롯의 `retryable` 상태로 복원됩니다.
- RESULTS 확대 화면은 이미지와 닫기 버튼만 제공하며 자르거나 별도 변형을 생성하지 않습니다.
- 헤어 분석은 신원, 나이, 민족, 얼굴형, 신체, 건강, 성 정체성을 추론하지 않습니다.
- 사진에서 확인할 수 없는 탈색 횟수, 최근 펌, 붙임머리 이력은 사용자 입력이 없으면 보수적으로 미상 처리합니다.

## 현재 배포 상태

현재 소스는 스토어 서명과 최종 운영 승인만 남은 릴리스 후보입니다.

| 항목 | 상태 |
| --- | --- |
| Node 검증 | 104 tests passing |
| Android | Java 컴파일, debug APK assembly, API 35 에뮬레이터 QA 통과 |
| GitHub Preview | Android 설치용 APK와 SHA-256 체크섬을 GitHub Prerelease로 제공 |
| iOS | macOS GitHub Actions에서 Simulator 빌드·설치·실행·스크린샷 통과 |
| 네이티브 타깃 | iOS 14.0 이상 · Android 6.0/API 23 이상, target SDK 35 |
| 앱 식별자·초기 버전 | `com.markerinc.hairloom` · version `1.0` · build/versionCode `1` |
| 반응형 웹 셸 | 1440×1000, 834×1112, 390×844에서 horizontal overflow 0 |
| 브라우저 Provider | 비활성화; API 키 입력과 Bearer 요청 없음 |
| 네이티브 Provider | 개인 OpenAI Image API 연결 지원 |
| 실제 Provider 승인 | 릴리스 담당자의 실제 기기와 별도 과금 API 키로 최종 E2E 필요 |

스토어 제출 전에는 각 조직의 서명 인증서, provisioning profile, Android signing config, 스토어 메타데이터와 실제 기기 QA가 필요합니다. CI의 unsigned iOS Simulator 빌드와 Android debug 빌드는 서명된 스토어 산출물을 대신하지 않습니다. 서명 자료와 로컬 SDK 경로는 저장소에 포함하지 않습니다.

## GitHub에서 Android APK 받기

Android 사용자는 소스를 직접 빌드하지 않고 [GitHub Releases](https://github.com/Marker-Inc-Korea/HairLoom/releases)에서 최신 **Android Preview**를 받을 수 있습니다.

현재 저장소는 Private이므로 GitHub에 로그인한 뒤 `Marker-Inc-Korea/HairLoom` 접근 권한이 있는 계정으로만 다운로드할 수 있습니다. 공개 배포로 전환할 때는 저장소 공개 범위 또는 별도 공개 다운로드 저장소를 먼저 결정해야 합니다.

릴리스 자산은 정확히 두 파일입니다.

```text
Hairloom-android-preview.apk
Hairloom-android-preview.apk.sha256
```

설치 순서:

1. 두 파일을 같은 폴더에 다운로드합니다.
2. APK의 SHA-256 값이 체크섬 파일과 일치하는지 확인합니다.

   macOS 또는 Linux:

   ```bash
   shasum -a 256 Hairloom-android-preview.apk
   cat Hairloom-android-preview.apk.sha256
   ```

   Windows PowerShell:

   ```powershell
   (Get-FileHash .\Hairloom-android-preview.apk -Algorithm SHA256).Hash.ToLower()
   Get-Content .\Hairloom-android-preview.apk.sha256
   ```

3. Android에서 다운로드한 APK를 열고, 요청될 때 해당 브라우저 또는 파일 앱의 **알 수 없는 앱 설치** 권한을 허용합니다.
4. SOURCE 화면의 `이미지 생성 연결`에서 별도 과금 OpenAI API 키를 네이티브 보안 입력창에 등록합니다.

ADB가 설치된 개발 환경에서는 다음 명령도 사용할 수 있습니다.

```bash
adb install Hairloom-android-preview.apk
```

이 APK는 GitHub 직접 설치와 내부 테스트를 위한 **debug-signed sideload preview**이며 Play Store 제출용 산출물이 아닙니다. GitHub 빌드마다 debug 서명 인증서가 달라질 수 있으므로 업데이트가 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`로 실패하면 이전 Preview를 제거한 뒤 새 APK를 설치해야 합니다. 제거하면 앱 전용 원본·출력·설정도 초기화됩니다.

iOS는 Apple 서명과 provisioning 없이는 GitHub에서 받은 바이너리를 일반 기기에 설치할 수 없습니다. 현재 iOS 배포는 아래 Xcode 빌드 절차를 사용하며 TestFlight/App Store 배포는 추후 진행합니다.

## 빠른 시작: 로컬 웹 셸

Node.js 20 이상이 필요합니다.

```bash
git clone https://github.com/Marker-Inc-Korea/HairLoom.git
cd HairLoom
npm ci
npm run verify
HOST=127.0.0.1 PORT=4180 npm run start
```

브라우저에서 다음 주소를 엽니다.

```text
Hairloom:  http://127.0.0.1:4180/
Health:    http://127.0.0.1:4180/healthz
```

웹 셸은 제품 흐름과 카탈로그를 확인하기 위한 로컬 화면입니다. 브라우저에서는 API 키를 입력하거나 실제 Provider 생성을 실행하지 않습니다.

## 네이티브 앱 빌드

공통 준비:

```bash
npm ci
npm run mobile:prepare
npm run mobile:test
npm run mobile:doctor
```

`mobile:prepare`는 명시적으로 허용된 17개 공개 자산만 `mobile-dist/`에 구성합니다. API 키, 고객 사진, 생성 결과, `.env`, `.gjc`, `imagen.web.js`와 내부 테스트 자산은 네이티브 번들에 복사하지 않습니다.

### iOS

필수 도구:

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

Xcode에서 `App` scheme과 개발 팀을 선택해 Simulator 또는 연결된 기기에서 실행합니다. CI는 다음 과정을 자동 검증합니다.

```text
npm ci → mobile:prepare → cap copy ios → pod install
→ unsigned Simulator build → simctl install/launch → screenshot
```

로컬에서 전체 앱을 열려면 저장소 루트에서 다음 명령을 사용할 수 있습니다.

```bash
npm run mobile:open:ios
```

릴리스 아카이브는 Xcode에서 다음 순서로 만듭니다.

1. `App` target의 bundle identifier, version, build number와 배포 대상이 릴리스 값인지 확인합니다.
2. `Signing & Capabilities`에서 조직의 Team과 provisioning을 선택합니다.
3. 실행 대상을 `Any iOS Device (arm64)`로 바꾸고 **Product → Archive**를 실행합니다.
4. Organizer에서 **Distribute App**을 선택해 TestFlight 또는 App Store Connect로 업로드합니다.

이 저장소의 CI는 unsigned Simulator 빌드·설치·실행을 검증합니다. 서명된 archive와 실제 기기 동작은 릴리스 담당자가 별도로 승인합니다.

### Android

필수 도구:

- Java 21
- Android SDK 35
- Android Studio 또는 Gradle

```bash
npm run mobile:prepare
npx cap sync android
JAVA_HOME=/path/to/jdk-21 \
ANDROID_HOME=/path/to/android-sdk \
./android/gradlew -p android assembleDebug
```

생성된 debug APK:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Android Studio에서 열기:

```bash
npm run mobile:open:android
```

릴리스 AAB/APK는 조직의 signing config를 로컬 또는 CI secret으로 주입해 빌드해야 합니다. keystore 파일과 비밀번호를 커밋하지 않습니다.

스토어용 Android App Bundle은 다음 순서로 만듭니다.

1. `applicationId`, `versionCode`, `versionName`, min/target SDK를 릴리스 값으로 확인합니다.
2. Android Studio의 **Build → Generate Signed Bundle / APK**에서 **Android App Bundle**을 선택합니다.
3. 조직의 upload key와 비밀번호는 로컬 보안 저장소 또는 CI secret에서만 주입합니다.
4. 서명 설정을 완료한 뒤 Gradle로 재현할 때는 `./android/gradlew -p android clean bundleRelease`를 실행합니다.

릴리스 설정이 완료되면 AAB는 `android/app/build/outputs/bundle/release/app-release.aab`에 생성됩니다. 현재 저장소는 의도적으로 조직별 upload key와 signing secret을 제공하지 않으므로, 서명 설정이 없는 `release` 산출물은 Play Console 제출용으로 간주하지 않습니다.

## 이미지 Provider 연결

Hairloom 모바일 앱의 SOURCE 화면에서 `이미지 생성 연결`을 누르고 별도 과금이 활성화된 개인 OpenAI Image API 키를 입력합니다.

| 용도 | 고정 네이티브 설정 |
| --- | --- |
| 헤어 분석 | `https://api.openai.com/v1/responses` · `gpt-4.1-mini` |
| 이미지 편집 | `https://api.openai.com/v1/images/edits` · `gpt-image-2` |

자격 증명 경계:

- iOS: 동기화되지 않는 device-only Keychain 항목
- Android: Android Keystore AES-GCM
- WebView JavaScript, `localStorage`, `sessionStorage`, 서비스 워커, 로그와 내보내기 파일에는 키를 전달하지 않음
- 브라우저 URL, 임의 헤더, 임의 Provider 메서드 또는 파일 경로를 네이티브 브리지에 전달할 수 없음

ChatGPT Plus·Pro 구독과 OpenAI API 결제는 별개입니다. ChatGPT/Codex 쿠키, 비밀번호, 브라우저 토큰, `~/.codex/auth.json` 또는 비공개 God Tibo 인증을 모바일 앱으로 가져오지 않습니다.

- [ChatGPT 구독과 API 결제는 별도](https://help.openai.com/en/articles/8156019)
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540)

공식적으로 지원되는 모바일 구독 Provider가 제공되기 전까지 현재 릴리스는 별도 과금 개인 Image API만 지원합니다.

한 배치는 고정 100개 결과 슬롯을 실행하며 재시도는 추가 과금을 발생시킬 수 있습니다. 실제 Provider QA 전에 OpenAI API 프로젝트의 결제 상태, 사용 한도와 테스트 예산을 확인합니다.

## 데이터 보관과 삭제

앱 전용 비공개 저장소:

```text
sources/
outputs/
jobs/<batchId>/<slotIndex>.json
jobs/<batchId>/context.json
hairloom-private.sqlite
```

- 준비 원본, 출력, 배치, 슬롯, 이벤트와 재시도 상태를 앱 전용 저장소에 보관합니다.
- raw prompt는 보호된 job 파일에 저장하며 SQLite 이벤트 행이나 로그에는 기록하지 않습니다.
- iOS 파일은 데이터 보호와 백업 제외 속성을 적용합니다.
- Android는 `allowBackup=false`, cleartext 차단과 private app storage를 사용합니다.
- 완료·취소된 고객 데이터와 불투명 출력 핸들은 7일 뒤 앱 시작 시 정리됩니다.
- `모든 고객 데이터 삭제`는 원본, 출력, job, 배치·슬롯·이벤트 저널을 즉시 삭제합니다.
- Provider 키는 고객 데이터 삭제와 별개이며 `연결 삭제`에서 제거합니다.

## 검증

전체 검증:

```bash
npm run verify
```

네이티브 경계 검증:

```bash
npm run mobile:prepare
npm run mobile:test
npm run mobile:doctor
```

현재 기준:

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

주요 CI:

- [`Mobile iOS Build`](.github/workflows/mobile-ios-build.yml): iOS Simulator 빌드·설치·실행
- [`Mobile Android Preview`](.github/workflows/mobile-android-preview.yml): debug APK·SHA-256 artifact 검증과 version tag Prerelease 게시
- [`Hair Trend Refresh`](.github/workflows/hair-trend-refresh.yml): 검증된 메타데이터 전용 격주 PR

## 배포 체크리스트

```text
[ ] npm ci && npm run verify
[ ] npm run mobile:prepare && npm run mobile:test
[ ] iOS App scheme, bundle identifier, signing team 확인
[ ] Android applicationId, versionCode/versionName, signing config 확인
[ ] 실제 iOS·Android 기기에서 카메라와 갤러리 확인
[ ] 실제 기기에서 Keychain/Keystore 연결·삭제 확인
[ ] 실제 과금 API 키로 분석, 100개 결과, 완료 출력 복원, shortlist, LOCK E2E 확인
[ ] foreground 생성, 중단, 종료, 재시작 복구 확인
[ ] 100개 고정 슬롯, 완료 결과 복원, 1–6 shortlist와 LOCK 확인
[ ] 모든 고객 데이터 삭제 후 원본·출력·저널 잔여물 없음 확인
[ ] 저장소와 빌드 산출물에 키·사진·서명 자료·로컬 경로가 없는지 확인
[ ] App Store Connect·Play Console의 개인정보 처리방침, 지원 URL, 심사 메모 확인
```

## 고급 운영: 트렌드 레지스트리

<details>
<summary>메타데이터 전용 트렌드 수집과 격주 자동화</summary>

Hairloom은 외부 소셜 이미지를 저장하거나 생성 입력으로 사용하지 않습니다. 트렌드 수집기는 스타일명, 게시 시점, 공개 permalink, 표본 수와 상승 신호만 보관하며 이를 기존 `HLM-C-*` 디자인 ID에 연결합니다.

```bash
npm run trend:check
npm run trend
```

Meta Hashtag Search 또는 Naver DataLab 자격 증명이 있을 때만 라이브 수집을 실행합니다.

```bash
cp .env.example .env
npm run trend:live
```

macOS launchd 격주 스케줄 미리보기와 설치:

```bash
npm run trend:schedule -- --dry-run --interval-hours=336
npm run trend:schedule
npm run trend:schedule:status
npm run trend:update
npm run trend:schedule:remove
```

GitHub Actions live refresh에는 Meta 또는 Naver 중 한 개의 완전한 자격 증명 쌍이 필요합니다.

```text
HAIRLOOM_META_ACCESS_TOKEN
HAIRLOOM_META_IG_USER_ID
HAIRLOOM_NAVER_CLIENT_ID
HAIRLOOM_NAVER_CLIENT_SECRET
```

자동 PR은 다음 두 파일의 변경만 허용합니다.

```text
data/hair-trend-signals.json
src/hairTrendData.mjs
```

이미지 URL, 썸네일, Base64, 외부 이미지 데이터와 secret-shaped 필드는 가져오기 단계에서 거부됩니다.

</details>

## 저장소 구조

```text
consultation/                         공개 Hairloom UI
src/mobileProviderBridge.mjs          allowlist 기반 WebView↔native 브리지
src/hairAnalysis.mjs                  보수적 헤어 프로필 정규화
src/consultationCore.mjs              추천·시술 가능성·고정 슬롯 도메인
src/exploreCore.mjs                   카탈로그·결정적 선택 도메인
android/app/src/main/java/...          Android Provider·Keystore·SQLite 구현
ios/App/App/HairloomProviderPlugin.swift iOS Provider·Keychain·SQLite 구현
scripts/prepareMobileAssets.mjs        네이티브 공개 자산 allowlist 패키징
scripts/doctorMobile.mjs               모바일 도구·보안 경계 진단
docs/hair-design-master/              6,500개 런타임 카탈로그
server.mjs                             로컬 전용 정적 서버와 공개 라우트
```

## 보안상 커밋 금지

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

Hairloom과 BeautyTape는 서로 다른 저장소입니다. Hairloom 변경은 반드시 `Marker-Inc-Korea/HairLoom` 저장소에서 수행합니다.
