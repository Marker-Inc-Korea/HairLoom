export const PRESERVE_CURRENT_TONE_ID = 'preserve-current';

export const HAIR_COLOR_TONES = Object.freeze([
  Object.freeze({ id: 'natural-black', labelKo: '자연 흑색', hex: '#171310', level: 1, undertone: 'neutral' }),
  Object.freeze({ id: 'soft-black', labelKo: '소프트 블랙', hex: '#28201c', level: 2, undertone: 'neutral' }),
  Object.freeze({ id: 'blue-black', labelKo: '블루 블랙', hex: '#171c2b', level: 2, undertone: 'cool' }),
  Object.freeze({ id: 'dark-brown', labelKo: '다크 브라운', hex: '#3a241b', level: 3, undertone: 'neutral' }),
  Object.freeze({ id: 'chocolate-brown', labelKo: '초콜릿 브라운', hex: '#5a3528', level: 4, undertone: 'warm' }),
  Object.freeze({ id: 'mocha-brown', labelKo: '모카 브라운', hex: '#59473d', level: 4, undertone: 'neutral' }),
  Object.freeze({ id: 'cacao-brown', labelKo: '카카오 브라운', hex: '#6d4631', level: 4, undertone: 'warm' }),
  Object.freeze({ id: 'ash-brown', labelKo: '애쉬 브라운', hex: '#756b63', level: 5, undertone: 'cool' }),
  Object.freeze({ id: 'muted-ash-brown', labelKo: '뮤트 애쉬 브라운', hex: '#81766d', level: 5, undertone: 'cool' }),
  Object.freeze({ id: 'warm-brown', labelKo: '웜 브라운', hex: '#7c5134', level: 5, undertone: 'warm' }),
  Object.freeze({ id: 'rose-brown', labelKo: '로즈 브라운', hex: '#8d5558', level: 5, undertone: 'rose' }),
  Object.freeze({ id: 'burgundy-brown', labelKo: '버건디 브라운', hex: '#6f2835', level: 5, undertone: 'red' }),
  Object.freeze({ id: 'copper-brown', labelKo: '코퍼 브라운', hex: '#a4512d', level: 6, undertone: 'warm' }),
  Object.freeze({ id: 'caramel-brown', labelKo: '카라멜 브라운', hex: '#b87842', level: 6, undertone: 'warm' }),
  Object.freeze({ id: 'honey-blonde', labelKo: '허니 블론드', hex: '#c28a42', level: 7, undertone: 'warm' }),
  Object.freeze({ id: 'beige-blonde', labelKo: '베이지 블론드', hex: '#c7a982', level: 7, undertone: 'neutral' }),
  Object.freeze({ id: 'ash-blonde', labelKo: '애쉬 블론드', hex: '#b8b2a6', level: 8, undertone: 'cool' }),
  Object.freeze({ id: 'ash-gray', labelKo: '애쉬 그레이', hex: '#8f9294', level: 8, undertone: 'cool' }),
  Object.freeze({ id: 'lavender-ash', labelKo: '라벤더 애쉬', hex: '#9a8eaa', level: 8, undertone: 'cool' })
]);

const TONE_BY_ID = new Map(HAIR_COLOR_TONES.map((tone) => [tone.id, tone]));

export function hairColorToneById(value) {
  return TONE_BY_ID.get(String(value ?? '')) ?? null;
}

export function normalizeHairColorToneId(value, { preserve = true } = {}) {
  const id = String(value ?? '');
  if (preserve && id === PRESERVE_CURRENT_TONE_ID) return id;
  return TONE_BY_ID.has(id) ? id : PRESERVE_CURRENT_TONE_ID;
}
