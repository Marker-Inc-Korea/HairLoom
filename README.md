# Hairloom 1.0.0

[English README](README.en.md)

[![Mobile iOS Build](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-ios-build.yml)
[![Mobile Android Release](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml/badge.svg)](https://github.com/Marker-Inc-Korea/HairLoom/actions/workflows/mobile-android-preview.yml)
![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-B26A7A)

<p align="center">
  <img src="docs/assets/promo/hairloom-feature-16x9.jpg" width="100%" alt="한 장의 원본 사진에서 같은 가상 인물의 여러 헤어 결과를 비교하는 Hairloom 기능 예시">
</p>

<p align="center"><sub>AI로 생성한 동일한 가상 인물의 기능 예시입니다. 실제 고객 사진이나 Hairloom의 실사용 생성 결과가 아닙니다.</sub></p>

Hairloom은 내 사진과 원하는 스타일을 바탕으로 여러 헤어 결과를 빠르게 비교하는 **비상업적 source-available 애플리케이션**입니다.

정면 사진 한 장으로 시작할 수 있고, 필요하면 측면·후면 등 다른 각도의 사진을 추가할 수 있습니다.

## 주요 기능

- 카메라 촬영 또는 갤러리 사진 사용
- 정면 필수, 다른 각도 사진 선택 추가
- 원하는 스타일·색상·알고 있는 시술 이력 입력
- 한 번에 100개의 헤어 결과 생성 및 비교
- 결과를 자르지 않은 원본 비율로 확대 확인
- 앱 안에서 API 연결 상태와 고객 데이터 관리

## 이용 방법

| 환경 | 이용 범위 |
| --- | --- |
| 컴퓨터 | 제품 화면과 헤어 카탈로그를 로컬에서 확인 |
| Android | 카메라·갤러리, 분석과 헤어 결과 생성 |
| iOS 소스 빌드 | Xcode Simulator 또는 개발 기기에서 실행 |

실제 분석과 이미지 생성은 Android·iOS 앱에서만 실행되며 **별도 과금 OpenAI API 키**가 필요합니다. ChatGPT Plus·Pro 구독과 OpenAI API 결제는 별개입니다.

### Android APK

1. [Hairloom 1.0.0 Release](https://github.com/Marker-Inc-Korea/HairLoom/releases/tag/v1.0.0)에서 아래 파일을 받습니다.

```text
Hairloom-1.0.0-android.apk
Hairloom-1.0.0-android.apk.sha256
```

2. 체크섬을 확인합니다.

```bash
shasum -a 256 Hairloom-1.0.0-android.apk
cat Hairloom-1.0.0-android.apk.sha256
```

3. Android에서 APK를 열고 요청 시 **알 수 없는 앱 설치** 권한을 허용합니다.

> GitHub APK는 debug-signed sideload 빌드입니다. 새 빌드의 서명이 다르면 기존 앱을 제거한 후 설치해야 하며 앱 전용 사진·결과·설정이 초기화될 수 있습니다.

### 앱에서 API 키 연결

1. [OpenAI Platform](https://platform.openai.com/)에서 API 프로젝트와 결제·사용 한도를 설정합니다.
2. Hairloom 앱의 `설정` 또는 `API 설정하기`를 엽니다.
3. 네이티브 보안 입력창에서 API 키를 저장합니다.
4. 사진과 원하는 스타일을 입력하고 결과 생성을 시작합니다.

API 키는 Android Keystore 또는 iOS Keychain에만 저장됩니다. 브라우저 입력창, WebView 저장소, 로그 또는 저장소 파일에는 전달하지 않습니다.

## 컴퓨터에서 실행

요구 사항: Node.js 20 이상, Git

```bash
git clone https://github.com/Marker-Inc-Korea/HairLoom.git
cd HairLoom
npm ci
npm run verify
npm run start
```

브라우저에서 `http://127.0.0.1:4180/`을 엽니다.

컴퓨터 웹 셸은 UI와 카탈로그 확인용이며 API 키 입력이나 실제 이미지 생성을 지원하지 않습니다.

## 문서

- [1.0.0 릴리스 노트](docs/releases/v1.0.0.md)
- [AI·네이티브 기술 변경 내역](docs/releases/v1.0.0-technical.md)
- [공개 안내와 홍보 문안](docs/releases/v1.0.0-launch.md)
- [보안 제보](SECURITY.md)
- [상업적 이용 안내](COMMERCIAL-LICENSE.md)

## 버그 제보와 기여

일반 버그는 [GitHub Issues](https://github.com/Marker-Inc-Korea/HairLoom/issues)에 등록해 주세요. 버전과 사용 환경, 재현 순서, 예상 동작과 실제 동작을 포함하면 좋습니다.

API 키, 고객 사진, 생성 결과, 인증 파일 또는 로컬 경로는 Issue에 올리지 마세요. 보안·개인정보 문제는 [SECURITY.md](SECURITY.md)의 비공개 제보 절차를 사용합니다.

코드 변경 전후에는 다음 명령을 실행합니다.

```bash
npm ci
npm run verify
```

## 라이선스

Hairloom은 [PolyForm Noncommercial License 1.0.0](LICENSE)에 따라 공개되는 **비상업적 source-available 소프트웨어**입니다.

개인 학습·연구·실험과 비상업적 프로젝트에 사용할 수 있습니다. 상업적 운영, 유료 서비스, 영리 조직 배치 또는 상용 제품 포함에는 NomaDamas와 별도의 서면 라이선스가 필요합니다.

PolyForm Noncommercial은 OSI 승인 오픈소스 라이선스가 아닙니다.
