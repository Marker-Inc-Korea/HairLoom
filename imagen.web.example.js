// [선택] hair-design-book.html 개인용 기본 연결값.
//
// 권장 방식: hair-design-book.html 우측 상단의 ⚙ (이미지 API 연결)에서
//   Base URL / API Key / Model / Size 를 입력하면 됩니다.
//   값은 서버로 전송되지 않고 브라우저(localStorage)에만 저장됩니다.
//
// 이 파일은 ⚙ 설정이 없을 때 쓰이는 폴백입니다.
// 매번 입력하기 싫으면 이 파일을 imagen.web.js 로 복사해 값을 채우세요. (imagen.web.js 는 gitignore)
//
// 연결 우선순위:
//   ⚙ 사용자 설정(localStorage) → imagen.web.js → 로컬 서버(/api/image-edit) → 마네킹 프리뷰
window.HAIR_IMAGEN = {
  baseURL: 'https://YOUR-PROXY/v1',
  apiKey: 'YOUR_PROXY_API_KEY',
  model: 'gpt-image-2',
  size: '1024x1024'
};
