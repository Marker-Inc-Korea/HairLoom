// [선택] Hairloom 개인용 이미지 API 기본 연결값.
//
// 권장 방식: Hairloom 우측 상단의 ⚙에서 Base URL / API Key / Model / Size를 입력합니다.
// API Key는 sessionStorage에만 저장되고, 비밀이 아닌 제공자 설정은 localStorage에 저장됩니다.
//
// 이 파일은 브라우저 설정이 없을 때 쓰이는 로컬 폴백입니다.
// 매번 입력하기 싫으면 이 파일을 imagen.web.js로 복사해 값을 채우세요.
// imagen.web.js는 Git에서 제외되며 Hairloom 저장소에만 둡니다.
//
// 연결 우선순위:
//   브라우저 설정 → imagen.web.js → 마네킹 프리뷰
window.HAIR_IMAGEN = {
  baseURL: 'https://YOUR-PROXY/v1',
  apiKey: 'YOUR_PROXY_API_KEY',
  model: 'gpt-image-2',
  size: '1024x1024'
};
