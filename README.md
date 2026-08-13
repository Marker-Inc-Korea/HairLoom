# Hairloom 1.0.0

[English README](README.en.md)

[![Mobile iOS Build](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml)
[![Mobile Android Preview](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-B26A7A)

Hairloom은 고객이 제공한 원본 사진과 요청을 바탕으로 헤어 디자인 상담 결과를 만드는 source-available 애플리케이션입니다.

```text
SOURCE → RESULTS → LOCK
```

이번 1.0.0 배포는 다음 두 가지 사용 방법을 우선 지원합니다.

- **컴퓨터:** 저장소를 내려받아 로컬 웹 셸 실행
- **Android:** GitHub Releases에서 APK를 내려받아 직접 설치

Play Store와 App Store 배포는 추후 진행합니다.

<p align="center">
  <img src="docs/assets/readme/hairloom-ios-source.png" width="350" alt="Hairloom SOURCE 화면">
</p>

## 바로 시작하기

| 사용 환경 | 제공 범위 | 실제 이미지 생성 |
| --- | --- | --- |
| 컴퓨터 웹 셸 | SOURCE·카탈로그·상담 UI 확인 | 지원하지 않음 |
| Android APK | 카메라·갤러리·분석·100개 결과·LOCK | 별도 과금 OpenAI API 키 필요 |
| iOS 소스 빌드 | Xcode Simulator·개발 기기 | 별도 과금 OpenAI API 키 필요 |

브라우저에는 API 키 입력이나 Provider 요청 경로가 없습니다. 실제 분석과 이미지 생성은 네이티브 Android/iOS 앱에서만 실행됩니다.

## 컴퓨터에서 설치하고 실행하기

### 요구 사항

- Node.js 20 이상
- Git
- Windows, macOS 또는 Linux

### 설치

```bash
git clone https://github.com/Marker-Inc-Korea/HairLoom.git
cd HairLoom
npm ci
npm run verify
npm run start
```

브라우저에서 다음 주소를 엽니다.

```text
http://127.0.0.1:4180/
```

상태 확인:

```text
http://127.0.0.1:4180/healthz
```

서버는 보안을 위해 `127.0.0.1`에만 바인딩됩니다. 컴퓨터 웹 셸은 제품 UI와 카탈로그를 로컬에서 확인하는 용도이며 OpenAI API 키를 받거나 이미지 생성을 실행하지 않습니다.

## Android APK 설치

[GitHub Releases](https://github.com/Marker-Inc-Korea/HairLoom/releases)에서 최신 `Hairloom Android Preview`를 엽니다.

다운로드 파일:

```text
Hairloom-1.0.0-android.apk
Hairloom-1.0.0-android.apk.sha256
```

### 체크섬 확인

macOS 또는 Linux:

```bash
shasum -a 256 Hairloom-1.0.0-android.apk
cat Hairloom-1.0.0-android.apk.sha256
```

Windows PowerShell:

```powershell
(Get-FileHash .\Hairloom-1.0.0-android.apk -Algorithm SHA256).Hash.ToLower()
Get-Content .\Hairloom-1.0.0-android.apk.sha256
```

두 값이 같은지 확인한 뒤 Android에서 APK를 엽니다. 요청될 때 브라우저 또는 파일 앱의 **알 수 없는 앱 설치** 권한을 허용합니다.

ADB를 사용하는 경우:

```bash
adb install Hairloom-1.0.0-android.apk
```

APK는 Android 6.0/API 23 이상을 지원하고 target SDK 35로 빌드됩니다.

> GitHub APK는 debug-signed sideload 배포입니다. 새 빌드의 서명이 기존 APK와 다르면 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`가 발생할 수 있습니다. 기존 Hairloom Preview를 제거한 뒤 다시 설치하면 앱 전용 사진·출력·설정도 초기화됩니다.

## OpenAI API 사용법

Hairloom의 실제 분석과 이미지 생성에는 사용자가 직접 준비한 **별도 과금 OpenAI API 키**가 필요합니다. ChatGPT Plus·Pro 구독과 OpenAI API 결제는 별개입니다.

1. [OpenAI Platform](https://platform.openai.com/)에서 API 프로젝트와 결제를 설정합니다.
2. 개인 API 키를 발급합니다.
3. Hairloom Android 또는 iOS 앱의 SOURCE 화면에서 상단 `설정` 또는 `API 설정하기`를 누릅니다.
4. `API 키 입력`을 선택하고 네이티브 보안 입력창에 키를 저장합니다. 연결 후 같은 화면에서 키 변경, 연결 삭제, 고객 데이터 전체 삭제를 각각 실행할 수 있습니다.
5. `이미지 1`을 추가하고 REQUEST를 입력한 뒤 결과 생성을 시작합니다.

고정 Provider 설정:

| 용도 | 엔드포인트 | 모델 |
| --- | --- | --- |
| 헤어 분석 | `https://api.openai.com/v1/responses` | `gpt-4.1-mini` |
| 이미지 편집 | `https://api.openai.com/v1/images/edits` | `gpt-image-2` |

API 키는 Android Keystore 또는 iOS Keychain에만 저장됩니다. WebView JavaScript, `localStorage`, `sessionStorage`, 서비스 워커, 로그, 내보내기 파일과 저장소에는 전달하지 않습니다.

한 번의 생성 배치는 고정 100개 결과 슬롯을 사용하며 재시도도 과금 요청이 될 수 있습니다. 사용 전에 API 프로젝트의 결제 상태, 사용 한도와 예산을 확인하세요.

금지되는 인증 방식:

```text
ChatGPT 비밀번호·쿠키·브라우저 토큰
Codex 인증 파일 (~/.codex/auth.json)
비공개 God Tibo 인증
브라우저의 Bearer 요청이나 imagen.web.js
```

## 사용 흐름

1. 카메라로 촬영하거나 갤러리에서 원본을 선택합니다.
2. `REQUEST`에 원하는 스타일, 색상과 알고 있는 시술 이력을 입력합니다.
3. 네이티브 분석 후 고정 100개 슬롯이 시작됩니다.
4. 완료된 결과를 자르지 않은 원본 비율로 확인합니다.
5. 1–6개를 선택해 LOCK으로 전달합니다.

`이미지 1`은 필수이고 `이미지 2–6`은 선택 사항입니다. 카메라와 갤러리는 동일한 준비 원본 파이프라인을 사용합니다.

## 제품·개인정보 원칙

- 사용자가 준비한 원본 사진만 Provider 입력으로 사용합니다.
- 생성 이미지와 카탈로그 이미지는 다음 분석·생성 입력으로 재사용하지 않습니다.
- 100개 슬롯의 인덱스, 디자인 ID, 원본 해시와 재시도 소유권을 완료 순서와 무관하게 유지합니다.
- 재시작 시 완료 결과는 복원하고 중단된 작업은 같은 슬롯의 `retryable` 상태로 되돌립니다.
- 헤어 분석은 신원, 나이, 민족, 얼굴형, 신체, 건강 또는 성 정체성을 추론하지 않습니다.
- 확인할 수 없는 탈색·펌·붙임머리 이력은 사용자 입력이 없으면 미상으로 처리합니다.
- `모든 고객 데이터 삭제`는 원본, 출력, 작업 파일과 배치 저널을 삭제합니다.
- Provider 키는 별도의 `연결 삭제` 동작에서 제거합니다.
- 완료·취소된 고객 데이터는 앱 시작 시 7일 기준으로 정리합니다.

## 버전 1.0.0

버전은 Semantic Versioning 형식 `MAJOR.MINOR.PATCH`를 사용합니다.

```text
현재 버전: 1.0.0
Android: versionName 1.0.0 / versionCode 1
iOS: MARKETING_VERSION 1.0.0 / build 1
```

변경 내용은 [1.0.0 릴리스 노트](docs/releases/v1.0.0.md), 공유용 문안은 [1.0.0 공개 안내](docs/releases/v1.0.0-launch.md)를 확인하세요.

## 버그 제보와 기여

일반 버그는 GitHub Issues에 등록합니다.

좋은 버그 제보에는 다음 내용을 포함해 주세요.

- Hairloom 버전과 사용 환경
- 재현 순서
- 예상 동작과 실제 동작
- 오류 메시지 또는 민감정보를 제거한 화면

API 키, 고객 사진, 생성 결과, 인증 파일, 로컬 경로는 Issue에 올리지 마세요. 보안·개인정보 문제는 [SECURITY.md](SECURITY.md)의 비공개 제보 절차를 사용합니다.

코드 기여:

1. Issue에서 문제와 범위를 먼저 확인합니다.
2. 별도 브랜치에서 작고 명확한 변경을 작성합니다.
3. `npm run verify`를 실행합니다.
4. 변경 이유, 검증 결과와 사용자 영향이 포함된 Pull Request를 엽니다.

원본 계보, 네이티브 자격 증명, 고정 100슬롯, 개인정보 경계를 약화하는 변경은 받지 않습니다.

## 개발과 검증

```bash
npm ci
npm run verify
npm run mobile:prepare
npm run mobile:test
npm run mobile:doctor
```

현재 기준:

```text
107 tests passing
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

- [`Mobile Android Preview`](.github/workflows/mobile-android-preview.yml): Android APK와 SHA-256 artifact·Prerelease
- [`Mobile iOS Build`](.github/workflows/mobile-ios-build.yml): iOS Simulator 빌드·설치·실행
- [`Hair Trend Refresh`](.github/workflows/hair-trend-refresh.yml): 메타데이터 전용 격주 PR

## 라이선스

Hairloom은 [PolyForm Noncommercial License 1.0.0](LICENSE)에 따라 공개되는 **비상업적 source-available 소프트웨어**입니다.

- 개인 학습, 연구, 실험과 비상업적 프로젝트에 사용할 수 있습니다.
- 상업적 운영, 유료 서비스, 영리 조직 배치, 상용 제품 임베딩은 허용되지 않습니다.
- 상업적 이용에는 NomaDamas와 별도의 서면 라이선스가 필요합니다. 자세한 내용은 [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md)를 확인하세요.

PolyForm Noncommercial은 OSI 승인 오픈소스 라이선스가 아닙니다. 따라서 Hairloom을 OSI 의미의 오픈소스로 설명하지 않고 `source-available`, `public source`, `noncommercial source license`라는 표현을 사용합니다.

## 저장소에 포함하면 안 되는 항목

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

Hairloom과 BeautyTape는 서로 다른 저장소입니다. Hairloom 변경은 `Marker-Inc-Korea/HairLoom`에서만 수행합니다.
