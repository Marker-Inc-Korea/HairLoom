// Hairloom PRO local image-provider fallback.
//
// Preferred: enter Base URL / API Key / Image Model / Size under API in Hairloom PRO.
// The API key stays in sessionStorage; non-secret provider settings stay in localStorage.
//
// Copy this file to imagen.web.js only when persistent local defaults are needed.
// imagen.web.js is ignored by Git.
window.HAIR_IMAGEN = {
  baseURL: 'https://YOUR-PROXY/v1',
  apiKey: 'YOUR_PROXY_API_KEY',
  model: 'gpt-image-2',
  size: '1024x1024'
};
