# Hairloom 보안 취약점 제보

[English](#reporting-a-vulnerability)

## 지원 버전

| 버전 | 보안 업데이트 |
| --- | --- |
| 1.0.x | 지원 |
| 1.0 미만 | 지원하지 않음 |

## 비공개 제보

API 키, 고객 사진, 생성 결과, 인증 파일, 로컬 경로 또는 재현 가능한 공격 세부정보가 포함된 보안·개인정보 문제는 공개 Issue에 작성하지 마세요.

1. 저장소의 **Security → Report a vulnerability** 기능이 활성화되어 있으면 GitHub Private Security Advisory로 제보합니다.
2. 해당 기능을 사용할 수 없으면 민감한 내용을 게시하지 말고 GitHub를 통해 저장소 소유자에게 연락해 비공개 전달 경로를 요청합니다.
3. 영향 범위, 재현 단계, 예상 동작, 실제 동작과 가능한 완화책을 포함하되 실제 고객 데이터나 유효한 자격 증명은 제거합니다.

Hairloom의 Provider 자격 증명은 iOS Keychain 또는 Android Keystore에만 저장되어야 하며 WebView JavaScript, 브라우저 저장소, 서비스 워커, 로그, 내보내기 파일 또는 저장소에 나타나면 안 됩니다.

# Reporting a vulnerability

## Supported versions

| Version | Security updates |
| --- | --- |
| 1.0.x | Supported |
| Below 1.0 | Not supported |

Do not open a public issue containing API keys, customer photos, generated outputs, authentication files, local paths, or actionable exploit details.

1. Use **Security → Report a vulnerability** to submit a GitHub Private Security Advisory when available.
2. If private reporting is unavailable, contact the repository owners through GitHub to request a private channel without posting sensitive material.
3. Include impact, reproduction steps, expected and actual behavior, and possible mitigation, but remove real customer data and valid credentials.

Hairloom Provider credentials must remain only in iOS Keychain or Android Keystore. They must never appear in WebView JavaScript, browser storage, service workers, logs, exports, or repository files.
