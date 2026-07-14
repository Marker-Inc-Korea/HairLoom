import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'docs/HAIR-DESIGN-CATALOG-1080.md');
const checkOnly = process.argv.includes('--check');

const genders = [
  { id: 'F', name: '여성' },
  { id: 'M', name: '남성' }
];

const lengths = [
  { id: 'US', name: '초단기장', landmark: '두피 밀착~귀 위, 목덜미 완전 노출' },
  { id: 'S', name: '숏', landmark: '귀 주변~턱선, 어깨에 닿지 않음' },
  { id: 'MD', name: '미디엄', landmark: '턱 아래~쇄골, 어깨선 중심' },
  { id: 'L', name: '롱', landmark: '쇄골 아래~가슴선' },
  { id: 'XL', name: '엑스트라 롱', landmark: '가슴 아래~허리/힙선' }
];

const silhouettes = {
  F: {
    US: [
      ['클래식 픽시', '짧은 네이프와 귀 노출, 정돈된 크라운, 짧은 사이드 프린지'],
      ['버즈 픽시', '두피에 가까운 균일 길이, 부드러운 템플 테이퍼, 최소 볼륨'],
      ['가르송 크롭', '소년형 짧은 외곽선, 잔잔한 앞머리, 밀착된 옆선'],
      ['샤기 픽시', '조각난 크라운 레이어, 피스 프린지, 가벼운 네이프'],
      ['언더컷 픽시', '짧게 정리한 하단과 긴 상단의 대비, 귀와 네이프 노출'],
      ['빅시 크롭', '픽시보다 긴 상단과 귀 주변 패널, 짧은 보브로 이어지는 외곽선']
    ],
    S: [
      ['프렌치 보브', '입술~턱선 길이, 밀도 높은 끝선, 짧거나 가벼운 프린지'],
      ['미니 보브', '귀밑~턱선의 작은 보브, 최소 레이어, 컴팩트한 네이프'],
      ['턱선 블런트 보브', '턱선과 평행한 일자 끝선, 높은 밀도, 선명한 외곽'],
      ['그래듀에이티드 보브', '후면은 짧고 전면은 길어진 완만한 전상장 실루엣'],
      ['샤기 보브', '보브 끝선 위에 분절된 레이어와 가벼운 크라운 볼륨'],
      ['라운드 보브', '둥근 측면 볼륨, 안쪽으로 감기는 끝선, 연결된 네이프']
    ],
    MD: [
      ['블런트 로브', '쇄골선의 묵직한 일자 끝선, 낮은 레이어, 풍부한 밀도'],
      ['허쉬 미디', '가벼운 크라운과 얼굴선 레이어, 얇고 길게 빠지는 끝선'],
      ['레이어드 미디', '광대~턱 아래에서 시작하는 연결 레이어, 균형 잡힌 볼륨'],
      ['울프 미디', '짧은 크라운과 긴 후면, 얼굴 주변의 강한 층 차이'],
      ['원랭스 미디', '턱 아래~쇄골의 단일 길이, 층 없는 외곽선'],
      ['페이스프레임 미디', '얼굴선 중심의 단계적 레이어와 안정된 후면 길이']
    ],
    L: [
      ['U라인 롱', '가슴선 길이와 둥근 U자 끝선, 밀도를 유지한 롱 실루엣'],
      ['V라인 롱', '중앙 후면이 가장 긴 V자 끝선, 길고 선명한 세로 흐름'],
      ['버터플라이 레이어', '광대와 턱선의 짧은 층, 가슴선의 긴 층이 분리된 이중 구조'],
      ['롱 허쉬', '가벼운 크라운, 긴 페이스 레이어, 얇게 테이퍼된 끝선'],
      ['롱 샤그', '전 구간의 분절 레이어, 크라운 볼륨과 긴 후면'],
      ['에어리 레이어드', '부드럽게 연결된 장층, 가벼운 끝선, 자연스러운 얼굴 프레임']
    ],
    XL: [
      ['슈퍼 롱 원랭스', '가슴 아래의 단일 길이, 최대 밀도, 수평에 가까운 끝선'],
      ['슈퍼 롱 U라인', '허리선 길이와 완만한 U자 후면, 최소 레이어'],
      ['슈퍼 롱 V라인', '허리~힙선의 깊은 V자 후면, 강한 세로 실루엣'],
      ['웨이스트 레이어드', '허리 길이의 장층과 턱 아래 페이스 프레임'],
      ['힙라인 레이어드', '힙선까지 이어지는 초장층, 끝 밀도를 남긴 테이퍼'],
      ['클래식 라푼젤', '허리 아래의 균일한 장발, 낮은 층과 풍부한 후면 밀도']
    ]
  },
  M: {
    US: [
      ['버즈컷', '균일한 클리퍼 길이, 낮은 두피 볼륨, 정돈된 헤어라인'],
      ['크루컷', '짧은 옆과 네이프, 전면으로 점차 길어진 상단'],
      ['아이비리그', '짧은 사이드 파트, 살짝 긴 프런트, 클래식 테이퍼'],
      ['하이 앤 타이트', '매우 짧은 측면과 제한된 상단 길이의 강한 대비'],
      ['시저컷', '짧고 수평인 프린지, 균일한 상단 길이, 컴팩트한 실루엣'],
      ['프렌치 크롭', '앞으로 향한 텍스처와 짧은 블런트 프린지, 타이트한 측면']
    ],
    S: [
      ['소프트 투블럭', '짧은 측면·네이프와 긴 상단, 자연스럽게 연결된 경계'],
      ['댄디컷', '정돈된 6:4 가르마, 부드러운 프린지, 깔끔한 옆선'],
      ['텍스처드 크롭', '조각난 상단과 짧은 전면 프린지, 테이퍼된 하단'],
      ['리젠트컷', '위로 들린 전면과 뒤로 흐르는 상단, 압축된 측면'],
      ['쉼표머리', '한쪽의 쉼표형 프린지, 반대쪽은 정돈된 사이드 파트'],
      ['리프컷', '관자 주변을 감싸는 잎 모양 패널, 중심 가르마, 짧은 네이프']
    ],
    MD: [
      ['미디엄 커튼', '귀를 덮는 중앙 가르마 패널, 좌우 대칭의 얼굴 프레임'],
      ['미디엄 슬릭백', '이마를 드러내며 뒤로 넘긴 상단, 목선까지 이어지는 후면'],
      ['미디엄 테이퍼', '상단과 귀 주변의 길이를 남긴 완만한 하단 테이퍼'],
      ['울프컷', '짧은 크라운과 귀 덮는 측면, 목선의 긴 후면 테일'],
      ['모드컷', '둥근 상단 외곽과 긴 프린지, 귀 주변을 감싸는 패널'],
      ['브로 플로우', '뒤로 자연스럽게 흐르는 귀 덮는 길이, 낮은 레이어']
    ],
    L: [
      ['숄더 스트레이트', '어깨~쇄골의 직선형 장발, 중앙 가르마, 안정된 끝선'],
      ['레이어드 장발', '턱 아래부터 연결되는 장층과 어깨 아래 후면'],
      ['서퍼 롱', '자연스럽고 불규칙한 장층, 가벼운 얼굴 프레임'],
      ['롱 울프', '짧은 크라운과 쇄골 아래 후면, 강한 층 차이'],
      ['모던 멀릿', '짧은 전면·측면과 길어진 후면, 연결된 테일'],
      ['로우 포니 장발', '목 아래에서 묶이는 장발 기반, 매끄러운 크라운과 긴 후면']
    ],
    XL: [
      ['체스트 스트레이트', '가슴선까지 이어지는 중앙 가르마 직모, 낮은 레이어'],
      ['웨이스트 스트레이트', '허리선의 균일 장발, 밀도 높은 U자 끝선'],
      ['엑스트라 롱 레이어', '가슴 아래의 긴 연결 레이어와 턱선 페이스 프레임'],
      ['슈퍼 롱 울프', '짧은 상부 레이어와 허리선 후면의 극단적 길이 대비'],
      ['롱 언더컷', '하단을 짧게 숨기고 상단 장발을 유지하는 이중 구조'],
      ['타이드 엑스트라 롱', '허리 길이 기반의 묶음 가능한 장발, 안정된 네이프와 끝 밀도']
    ]
  }
};

const finishes = [
  ['NS', '내추럴 스트레이트', '자연 직모', '해당 없음', '직모 · 가는/보통/굵은 모발', '열처리 없이 원래 직선 결을 살리고 끝선과 레이어 구조를 선명하게 보임', '낮음'],
  ['NW', '내추럴 웨이브', '자연 반곱슬', '해당 없음', '반곱슬 · 보통/굵은 모발', '본래의 느슨한 굴곡을 유지해 실루엣에 자연스러운 부피와 움직임을 부여', '낮음'],
  ['NC', '내추럴 컬', '자연 곱슬', '해당 없음', '곱슬 · 보통/굵은 모발', '자연 컬 패턴과 수축률을 보존하며 커트 외곽선을 둥글고 입체적으로 표현', '보통'],
  ['CL', '루즈 C컬 펌', 'C컬 펌', '52mm 대형', '직모/반곱슬 · 가는/보통 모발', '끝선에 한 번만 크게 감기는 C자 굴곡으로 길이와 밀도를 부드럽게 강조', '낮음'],
  ['CM', '미디엄 C컬 펌', 'C컬 펌', '38mm 중대형', '직모/반곱슬 · 보통 모발', '중간 굵기의 안쪽 C컬로 외곽선을 정돈하고 얼굴 주변에 안정된 볼륨을 형성', '보통'],
  ['CT', '타이트 C컬 펌', 'C컬 펌', '26mm 중소형', '직모/반곱슬 · 보통/굵은 모발', '짧고 선명한 C컬을 반복해 끝선의 탄력과 입체감을 강화', '보통'],
  ['SL', '루즈 S컬 펌', 'S컬 펌', '48mm 대형', '직모/반곱슬 · 가는/보통 모발', '넓은 간격의 S자 흐름으로 길이를 유지하면서 큰 움직임을 생성', '보통'],
  ['SM', '미디엄 S컬 펌', 'S컬 펌', '34mm 중형', '직모/반곱슬 · 보통 모발', '균일한 중간 굵기 S컬이 측면과 후면에 반복되어 균형 잡힌 볼륨을 제공', '보통'],
  ['ST', '타이트 S컬 펌', 'S컬 펌', '24mm 소형', '직모/반곱슬 · 보통/굵은 모발', '촘촘한 S컬로 텍스처와 탄력을 강하게 만들고 레이어 간 분리를 강조', '높음'],
  ['BW', '바디 웨이브 펌', '바디 펌', '45mm 대형', '직모/반곱슬 · 가는/보통 모발', '뿌리는 비교적 매끈하게 두고 중간부터 큰 바디 웨이브로 풍성함을 부여', '보통'],
  ['GW', '글램 웨이브 펌', '글램 펌', '55mm 특대형', '직모/반곱슬 · 가는/보통 모발', '매우 큰 웨이브와 광택 중심의 표면으로 드라마틱하지만 느슨한 볼륨을 생성', '높음'],
  ['WW', '워터 웨이브 펌', '물결 펌', '30mm 중형', '직모/반곱슬 · 보통 모발', '간격이 일정한 물결형 굴곡이 연속되어 수평 리듬과 촉촉한 질감을 표현', '높음'],
  ['CP', '클라우드 펌', '클라우드 펌', '42mm 대형', '직모/반곱슬 · 가는/보통 모발', '구름처럼 부드럽게 겹치는 큰 굴곡으로 크라운과 측면에 공기감 있는 볼륨을 형성', '보통'],
  ['JP', '젤리 펌', '젤리 펌', '22mm 소형', '직모/반곱슬 · 보통/굵은 모발', '탱글하고 선명한 작은 컬이 일정하게 반복되어 젖은 듯한 탄성 텍스처를 생성', '높음'],
  ['SP', '라지 스파이럴 펌', '스파이럴 펌', '28mm 중형', '직모/반곱슬 · 보통/굵은 모발', '세로 방향의 중형 나선 컬로 길이감을 남기면서 입체적 분리를 만듦', '높음'],
  ['SS', '스몰 스파이럴 펌', '스파이럴 펌', '16mm 소형', '직모/반곱슬 · 굵은/고밀도 모발', '촘촘한 소형 나선 컬이 전 구간에 반복되어 높은 수축률과 강한 볼륨을 생성', '높음'],
  ['HP', '히피 펌', '히피 펌', '12mm 초소형', '직모/반곱슬 · 보통/굵은 모발', '뿌리 가까이부터 매우 작은 웨이브를 반복해 최대 텍스처와 확장된 실루엣을 형성', '높음'],
  ['RV', '루트 볼륨 펌', '뿌리 볼륨 펌', '36mm 중대형', '직모/가는 모발 · 낮은 뿌리 볼륨', '컬 형태보다 뿌리 각도와 크라운 리프트를 높여 기본 커트 실루엣을 유지', '낮음']
].map(([id, name, type, diameter, hairType, feature, maintenance]) => ({ id, name, type, diameter, hairType, feature, maintenance }));

const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const designs = [];

for (const gender of genders) {
  for (const length of lengths) {
    const bases = silhouettes[gender.id][length.id];
    if (bases.length !== 6) throw new Error(`${gender.name} ${length.name}: 기본 실루엣은 정확히 6개여야 합니다.`);
    bases.forEach(([baseName, baseFeature], baseIndex) => {
      finishes.forEach((finish) => {
        const id = `HL-${gender.id}-${length.id}-${String(baseIndex + 1).padStart(2, '0')}-${finish.id}`;
        const name = `${gender.name} ${length.name} ${baseName} · ${finish.name}`;
        const feature = `${length.landmark}. ${baseFeature}. ${finish.feature}.`;
        designs.push({ id, name, gender: gender.name, length: length.name, landmark: length.landmark, baseName, finish, feature });
      });
    });
  }
}

const ids = new Set(designs.map((design) => design.id));
const names = new Set(designs.map((design) => design.name));
if (designs.length !== 1080) throw new Error(`예상 1,080개, 실제 ${designs.length}개`);
if (ids.size !== designs.length) throw new Error(`ID 중복 ${designs.length - ids.size}개`);
if (names.size !== designs.length) throw new Error(`이름 중복 ${designs.length - names.size}개`);

const lines = [
  '# Hairloom 헤어 디자인 카탈로그 1,080',
  '',
  '> 이 문서는 실제 살롱에서 통용되는 기본 커트·펌 용어를 조합한 **Hairloom 고유 디자인 분류 체계**입니다. 1,080개 모두 표준화된 기존 고유명사라는 뜻은 아니며, AI 생성·상담·필터링에 사용할 수 있도록 이름과 특징을 중복 없이 구성했습니다.',
  '',
  '## 구성',
  '',
  '| 구분 | 수량 |',
  '|---|---:|',
  '| 성별 | 2 |',
  '| 기장 | 5 |',
  '| 성별·기장별 기본 실루엣 | 6 |',
  '| 자연 모질·펌 마감 | 18 |',
  '| 전체 디자인 | **1,080** |',
  '| 중복 ID | **0** |',
  '| 중복 이름 | **0** |',
  '',
  '계산식: `2 × 5 × 6 × 18 = 1,080`',
  '',
  '## 기장 기준',
  '',
  '| 코드 | 기장 | 랜드마크 |',
  '|---|---|---|',
  ...lengths.map((length) => `| ${length.id} | ${length.name} | ${length.landmark} |`),
  '',
  '## 모질·펌 및 컬 굵기 기준',
  '',
  '| 코드 | 마감 이름 | 분류 | 컬 굵기 | 권장 모질 | 관리 | 특징 |',
  '|---|---|---|---|---|---|---|',
  ...finishes.map((finish) => `| ${finish.id} | ${finish.name} | ${finish.type} | ${finish.diameter} | ${finish.hairType} | ${finish.maintenance} | ${finish.feature} |`),
  '',
  '## 전체 디자인 목록',
  ''
];

for (const gender of genders) {
  lines.push(`# ${gender.name}`, '');
  for (const length of lengths) {
    const section = designs.filter((design) => design.gender === gender.name && design.length === length.name);
    lines.push(`## ${gender.name} · ${length.name} (${section.length}개)`, '', `기장 기준: **${length.landmark}**`, '', '| ID | 이름 | 기본 실루엣 | 모질·펌 | 굵기 | 권장 모질 | 관리 | 특징 |', '|---|---|---|---|---|---|---|---|');
    for (const design of section) {
      lines.push(`| ${design.id} | ${escapeCell(design.name)} | ${escapeCell(design.baseName)} | ${escapeCell(design.finish.name)} | ${escapeCell(design.finish.diameter)} | ${escapeCell(design.finish.hairType)} | ${design.finish.maintenance} | ${escapeCell(design.feature)} |`);
    }
    lines.push('');
  }
}

lines.push('## 검증 요약', '', `- 전체 행: **${designs.length}**`, `- 고유 ID: **${ids.size}**`, `- 고유 이름: **${names.size}**`, `- 여성: **${designs.filter((design) => design.gender === '여성').length}**`, `- 남성: **${designs.filter((design) => design.gender === '남성').length}**`, '- 색상 차원: 포함하지 않음', '- 생성 순서: 성별 → 기장 → 기본 실루엣 → 모질·펌 마감', '');

const content = `${lines.join('\n').trimEnd()}\n`;
if (checkOnly) {
  const existing = readFileSync(outputPath, 'utf8');
  if (existing !== content) throw new Error('카탈로그 문서가 생성기 출력과 다릅니다. npm run catalog를 실행하세요.');
  console.log(`Catalog verified: ${designs.length} designs, ${ids.size} unique IDs, ${names.size} unique names.`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  console.log(`Catalog generated: ${outputPath}`);
  console.log(`Designs: ${designs.length}; unique IDs: ${ids.size}; unique names: ${names.size}.`);
}
