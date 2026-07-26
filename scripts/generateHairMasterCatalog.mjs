import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'docs/hair-design-master');
const checkOnly = process.argv.includes('--check');
const schemaVersion = 1;
const catalogVersion = 'HLM-MASTER-2026-07-EXPLORE-2';
const promptVersion = 'HLM-EXPLORE-PROMPT-2026-07-2';
const catalogSizeLimitBytes = 2_500_000;
const indexSizeLimitBytes = 900_000;
const b = (name, feature, tags = []) => ({ name, feature, tags });

const genders = [
  { id: 'F', name: '여성' },
  { id: 'M', name: '남성' }
];
const lengths = [
  { id: 'US', name: '초단기장', landmark: '두피 밀착~귀 위, 목덜미 완전 노출', maxDiameter: 24 },
  { id: 'S', name: '숏', landmark: '귀 주변~턱선, 어깨에 닿지 않음', maxDiameter: 36 },
  { id: 'MD', name: '미디엄', landmark: '턱 아래~쇄골, 어깨선 중심', maxDiameter: 45 },
  { id: 'L', name: '롱', landmark: '쇄골 아래~가슴선', maxDiameter: 55 },
  { id: 'XL', name: '엑스트라 롱', landmark: '가슴 아래~허리/힙선', maxDiameter: 60 }
];

const bases = {
  F: {
    US: [
      b('클래식 픽시', '짧은 네이프와 귀 노출, 정돈된 크라운, 짧은 사이드 프린지'),
      b('버즈 픽시', '두피에 가까운 균일 길이와 부드러운 템플 테이퍼'),
      b('가르송 크롭', '소년형 짧은 외곽선과 잔잔한 앞머리, 밀착된 옆선'),
      b('샤기 픽시', '조각난 크라운 레이어와 피스 프린지, 가벼운 네이프'),
      b('언더컷 픽시', '짧은 하단과 긴 상단의 대비, 귀와 네이프 노출'),
      b('빅시 크롭', '픽시보다 긴 상단과 귀 주변 패널, 짧은 보브형 외곽'),
      b('보울 픽시', '둥근 상단 외곽과 정밀한 귀 위 끝선'),
      b('모호크 픽시', '중앙 세로 볼륨과 타이트한 양 측면'),
      b('핑거웨이브 크롭', '두피에 붙는 짧은 외곽과 표면 중심의 곡선 흐름'),
      b('스컬프티드 크롭', '기하학적으로 조형된 상단과 선명한 헤어라인')
    ],
    S: [
      b('프렌치 보브', '입술~턱선 길이, 밀도 높은 끝선, 짧거나 가벼운 프린지'),
      b('미니 보브', '귀밑~턱선의 작은 보브, 최소 레이어, 컴팩트한 네이프'),
      b('턱선 블런트 보브', '턱선과 평행한 일자 끝선과 높은 밀도'),
      b('그래듀에이티드 보브', '후면은 짧고 전면은 길어진 완만한 전상장 실루엣'),
      b('샤기 보브', '보브 끝선 위의 분절 레이어와 가벼운 크라운'),
      b('라운드 보브', '둥근 측면 볼륨과 안쪽으로 감기는 연결 네이프'),
      b('이탈리안 보브', '턱 아래의 묵직한 볼륨과 넓고 풍성한 외곽'),
      b('페이지보이', '둥근 상단과 안쪽으로 정돈된 귀~턱선 끝선'),
      b('애시메트릭 보브', '좌우 길이 차이가 명확한 비대칭 외곽선'),
      b('숏 히메컷', '턱선 사이드록과 짧은 후면의 분리된 직선 구조')
    ],
    MD: [
      b('블런트 로브', '쇄골선의 묵직한 일자 끝선과 낮은 레이어'),
      b('허쉬 미디', '가벼운 크라운과 얼굴선 레이어, 얇은 끝선'),
      b('레이어드 미디', '광대~턱 아래에서 시작하는 연결 레이어'),
      b('울프 미디', '짧은 크라운과 긴 후면, 강한 층 차이'),
      b('원랭스 미디', '턱 아래~쇄골의 단일 길이와 층 없는 외곽'),
      b('페이스프레임 미디', '얼굴선 중심의 단계적 레이어와 안정된 후면'),
      b('버터플라이 로브', '광대의 짧은 층과 쇄골의 긴 층이 나뉜 구조'),
      b('옥토퍼스 미디', '둥근 상단 볼륨과 가늘게 분리되는 하단 레이어'),
      b('라운드 컬 미디', '쇄골 길이의 둥근 외곽과 균형 잡힌 측후면 부피'),
      b('미디엄 히메컷', '턱선 사이드록과 쇄골 후면이 분리된 직선 구조')
    ],
    L: [
      b('U라인 롱', '가슴선 길이와 둥근 U자 끝선, 밀도 높은 롱 실루엣'),
      b('V라인 롱', '중앙 후면이 가장 긴 V자 끝선과 세로 흐름'),
      b('버터플라이 레이어', '광대·턱선의 짧은 층과 가슴선 긴 층의 이중 구조'),
      b('롱 허쉬', '가벼운 크라운과 긴 페이스 레이어, 테이퍼된 끝선'),
      b('롱 샤그', '전 구간의 분절 레이어와 크라운 볼륨'),
      b('에어리 레이어드', '부드럽게 연결된 장층과 가벼운 얼굴 프레임'),
      b('롱 히메컷', '턱선 사이드록과 가슴선 직선 후면의 분리 구조'),
      b('젤리피시 롱', '보브형 상단과 길게 남은 하단의 강한 이중 외곽'),
      b('블런트 롱', '가슴선의 수평에 가까운 밀도 높은 일자 끝선'),
      b('라운드 컬 롱', '가슴선 길이의 둥근 외곽과 큰 측후면 부피')
    ],
    XL: [
      b('슈퍼 롱 원랭스', '가슴 아래의 단일 길이와 최대 밀도'),
      b('슈퍼 롱 U라인', '허리선 길이와 완만한 U자 후면'),
      b('슈퍼 롱 V라인', '허리~힙선의 깊은 V자 후면'),
      b('웨이스트 레이어드', '허리 길이의 장층과 턱 아래 페이스 프레임'),
      b('힙라인 레이어드', '힙선까지 이어지는 초장층과 끝 밀도'),
      b('클래식 라푼젤', '허리 아래의 균일한 장발과 풍부한 후면 밀도'),
      b('엑스트라 롱 히메', '턱선 사이드록과 허리 아래 직선 후면'),
      b('엑스트라 롱 샤그', '크라운부터 허리까지 이어지는 다층 분절 구조'),
      b('엑스트라 롱 블런트', '허리선의 수평 일자 끝선과 최소 레이어'),
      b('머메이드 레이어', '허리 아래에서 넓어지는 장층과 물결형 외곽')
    ]
  },
  M: {
    US: [
      b('버즈컷', '균일한 클리퍼 길이와 정돈된 헤어라인'),
      b('크루컷', '짧은 옆과 네이프, 전면으로 길어진 상단'),
      b('아이비리그', '짧은 사이드 파트와 살짝 긴 프런트'),
      b('하이 앤 타이트', '매우 짧은 측면과 제한된 상단 길이의 대비'),
      b('시저컷', '짧고 수평인 프린지와 균일한 상단'),
      b('프렌치 크롭', '앞으로 향한 텍스처와 짧은 블런트 프린지'),
      b('플랫탑', '수평으로 정리된 상단 면과 수직 측면'),
      b('인덕션 컷', '두피에 가장 가까운 단일 클리퍼 길이'),
      b('템플 페이드 크롭', '관자 중심의 짧은 페이드와 컴팩트한 상단'),
      b('버스트 크롭', '귀 둘레 원형 페이드와 짧은 중앙 상단')
    ],
    S: [
      b('소프트 투블럭', '짧은 측면·네이프와 긴 상단의 연결된 경계'),
      b('댄디컷', '정돈된 6:4 가르마와 부드러운 프린지'),
      b('텍스처드 크롭', '조각난 상단과 짧은 전면 프린지'),
      b('리젠트컷', '위로 들린 전면과 뒤로 흐르는 상단'),
      b('쉼표머리', '한쪽 쉼표형 프린지와 정돈된 사이드 파트'),
      b('리프컷', '관자를 감싸는 잎 모양 패널과 짧은 네이프'),
      b('클래식 퐁파두르', '높은 전면 볼륨과 뒤로 흐르는 상단'),
      b('텍스처드 퀴프', '앞으로 들린 불규칙 프런트와 타이트한 옆선'),
      b('클래식 사이드 파트', '선명한 가르마와 빗질된 상단, 테이퍼 하단'),
      b('숏 모드컷', '둥근 상단 외곽과 귀 주변의 짧은 패널')
    ],
    MD: [
      b('미디엄 커튼', '귀를 덮는 중앙 가르마와 대칭 얼굴 프레임'),
      b('미디엄 슬릭백', '이마를 드러내며 뒤로 넘긴 상단과 목선 후면'),
      b('미디엄 테이퍼', '상단과 귀 주변 길이를 남긴 완만한 하단 테이퍼'),
      b('울프컷', '짧은 크라운과 귀 덮는 측면, 목선의 긴 후면'),
      b('모드컷', '둥근 상단 외곽과 긴 프린지'),
      b('브로 플로우', '뒤로 자연스럽게 흐르는 귀 덮는 길이'),
      b('소프트 멀릿', '연결된 측면과 목선까지 늘어난 절제된 후면'),
      b('미디엄 샤그', '전 구간의 분절 레이어와 가벼운 크라운'),
      b('라운드 컬 미디', '둥근 상단과 귀·목선을 덮는 균일 볼륨'),
      b('미디엄 하프업 베이스', '귀 주변 길이를 남기고 상단을 묶을 수 있는 구조')
    ],
    L: [
      b('숄더 스트레이트', '어깨~쇄골의 직선형 장발과 중앙 가르마'),
      b('레이어드 장발', '턱 아래부터 연결되는 장층과 어깨 아래 후면'),
      b('서퍼 롱', '자연스럽고 불규칙한 장층과 가벼운 얼굴 프레임'),
      b('롱 울프', '짧은 크라운과 쇄골 아래 후면의 길이 대비'),
      b('모던 멀릿', '짧은 전면·측면과 길어진 후면 테일'),
      b('로우 포니 장발', '목 아래에서 묶이는 장발 기반과 매끄러운 크라운'),
      b('롱 언더컷', '하단을 짧게 숨기고 상단 장발을 유지한 이중 구조'),
      b('맨번 베이스', '정수리나 후두부에 묶을 수 있는 균일 장발'),
      b('롱 라운드 컬', '쇄골 아래의 둥근 외곽과 풍부한 측후면 볼륨'),
      b('롱 블런트', '쇄골 아래의 밀도 높은 일자 끝선')
    ],
    XL: [
      b('체스트 스트레이트', '가슴선까지 이어지는 중앙 가르마 직모'),
      b('웨이스트 스트레이트', '허리선의 균일 장발과 U자 끝선'),
      b('엑스트라 롱 레이어', '가슴 아래 장층과 턱선 페이스 프레임'),
      b('슈퍼 롱 울프', '짧은 상부 레이어와 허리선 후면의 극단적 대비'),
      b('롱 언더컷 XL', '숨겨진 하단 언더컷과 허리 길이 상단'),
      b('타이드 엑스트라 롱', '허리 길이 기반의 묶음 가능한 장발'),
      b('웨이스트 하프업', '허리 길이 후면과 상단 하프업 구조'),
      b('엑스트라 롱 블런트', '허리선의 수평 일자 끝선과 최대 밀도'),
      b('엑스트라 롱 컬', '허리 길이의 둥근 외곽과 연속 컬 볼륨'),
      b('라푼젤 맨 롱', '허리 아래의 낮은 레이어와 풍부한 후면 밀도')
    ]
  }
};

const frontDetails = {
  F: {
    US: [['NH', '클린 헤어라인', '앞머리 없이 이마선과 템플을 정돈'], ['MB', '마이크로 뱅', '눈썹 위의 짧고 선명한 프린지'], ['PF', '피스 프린지', '조각난 짧은 앞머리로 텍스처 강조'], ['SF', '사이드 프린지', '한쪽으로 흐르는 짧은 프린지'], ['LF', '리프트 프런트', '전면 뿌리를 들어 이마를 부분 노출']],
    S: [['NF', '노 프린지', '앞머리 없이 보브 외곽을 강조'], ['BB', '블런트 뱅', '수평의 밀도 높은 풀뱅'], ['WB', '위스피 뱅', '얇고 조각난 시스루 프린지'], ['CB', '커튼 뱅', '중앙이 갈라져 광대까지 이어지는 프린지'], ['SB', '사이드 스웹트', '긴 앞머리가 한쪽 얼굴선으로 흐름']],
    MD: [['NF', '노 프린지', '이마를 드러내고 레이어 흐름을 강조'], ['CB', '커튼 뱅', '광대 시작점의 대칭 커튼 프린지'], ['SB', '사이드 스웹트', '턱선으로 연결되는 긴 옆앞머리'], ['FB', '풀 프린지', '눈썹선의 밀도 높은 앞머리'], ['HL', '히메 사이드록', '턱선의 직선 사이드록을 독립적으로 유지']],
    L: [['NF', '노 프린지', '긴 세로선과 이마선을 완전히 노출'], ['CB', '롱 커튼 뱅', '광대~턱선으로 연결되는 긴 커튼 프린지'], ['SB', '롱 사이드 스웹트', '한쪽 턱선 아래로 이어지는 프런트 패널'], ['FB', '풀 프린지', '눈썹선의 밀도 높은 직선 앞머리'], ['HL', '히메 사이드록', '턱선 사이드록과 긴 후면을 분리']],
    XL: [['NF', '노 프린지', '초장발의 세로 흐름을 방해하지 않는 오픈 프런트'], ['CB', '엑스트라 롱 커튼', '턱선까지 이어지는 긴 커튼 프린지'], ['SB', '딥 사이드 스웹트', '깊은 옆가르마와 턱 아래 프런트 패널'], ['FB', '클래식 풀뱅', '눈썹선의 균일하고 밀도 높은 앞머리'], ['HL', '롱 히메 사이드록', '턱선 사이드록과 허리선 후면의 강한 분리']]
  },
  M: {
    US: [['CH', '클린 헤어라인', '프린지 없이 헤어라인을 선명하게 정리'], ['MF', '마이크로 프린지', '이마 상단의 매우 짧은 앞머리'], ['TF', '텍스처 프린지', '앞으로 향한 조각난 짧은 프린지'], ['SP', '숏 사이드 파트', '짧은 가르마와 한쪽 프런트 흐름'], ['UF', '업 프런트', '전면을 위로 세워 이마를 노출']],
    S: [['NF', '노 프린지', '이마를 드러내고 상단 구조를 강조'], ['CF', '크롭 프린지', '앞으로 내린 짧고 무거운 프린지'], ['CP', '센터 파트', '중앙 분할 프런트 패널'], ['SP', '사이드 파트', '6:4 또는 7:3 방향의 프런트'], ['UF', '업 스웹트', '전면을 위와 뒤로 들어 올림']],
    MD: [['NF', '오픈 프런트', '이마를 드러내고 뒤로 흐르는 전면'], ['CP', '미디엄 커튼', '중앙 가르마와 귀 방향의 프런트 패널'], ['SP', '딥 사이드 파트', '깊은 옆가르마와 한쪽 볼륨'], ['WF', '웨이브 프린지', '눈썹 주변의 느슨한 굴곡 프런트'], ['LF', '롱 프린지', '눈썹 아래까지 내려오는 긴 앞머리']],
    L: [['NF', '오픈 센터', '중앙에서 갈라져 얼굴 밖으로 흐르는 전면'], ['CP', '롱 커튼', '턱선까지 이어지는 대칭 프런트 패널'], ['SP', '롱 사이드 파트', '한쪽 턱선 아래로 흐르는 전면'], ['BT', '백 타이드 프런트', '앞머리를 뒤로 넘겨 묶을 수 있는 구조'], ['LF', '롱 프린지', '광대~턱선까지 내려오는 프런트 레이어']],
    XL: [['NF', '오픈 센터', '초장발을 중앙에서 분할해 얼굴을 노출'], ['CP', '엑스트라 롱 커튼', '턱 아래까지 이어지는 대칭 프런트'], ['SP', '딥 롱 사이드 파트', '깊은 옆가르마와 긴 전면 패널'], ['BT', '올백 타이드', '전면 전체를 뒤로 모아 묶는 구조'], ['LF', '엑스트라 롱 프린지', '턱 아래까지 이어지는 독립 전면 레이어']]
  }
};

const finishProfiles = [
  ['NS', '내추럴 스트레이트', '자연 직모', null, '직모 · 가는/보통/굵은 모발', '원래 직선 결을 살리고 커트 끝선과 층 구조를 선명하게 유지'],
  ['NW', '내추럴 웨이브', '자연 반곱슬', null, '반곱슬 · 보통/굵은 모발', '원래의 느슨한 굴곡과 방향을 보존해 자연스러운 움직임을 형성'],
  ['NC', '내추럴 컬', '자연 곱슬', null, '곱슬 · 보통/굵은 모발', '자연 컬 패턴과 수축률을 보존해 둥근 입체감을 형성'],
  ['NK', '내추럴 코일', '자연 코일', null, '강한 곱슬/코일 · 보통/굵은 고밀도 모발', '작은 코일의 직경과 밀도를 유지해 자연 텍스처와 볼륨을 보존'],
  ['CL', '루즈 C컬 펌', 'C컬 펌', { US: 22, S: 32, MD: 42, L: 52, XL: 60 }, '직모/반곱슬 · 가는/보통 모발', '가용 길이의 끝선에 한 번 크게 감기는 C자 굴곡을 적용'],
  ['CT', '타이트 C컬 펌', 'C컬 펌', { US: 14, S: 24, MD: 30, L: 36, XL: 42 }, '직모/반곱슬 · 보통/굵은 모발', '작고 선명한 C컬로 끝선의 탄력과 레이어 분리를 강화'],
  ['SL', '루즈 S컬 펌', 'S컬 펌', { US: 22, S: 34, MD: 44, L: 52, XL: 60 }, '직모/반곱슬 · 가는/보통 모발', '넓은 간격의 S자 흐름을 적용해 큰 움직임을 생성'],
  ['ST', '타이트 S컬 펌', 'S컬 펌', { US: 14, S: 22, MD: 28, L: 34, XL: 40 }, '직모/반곱슬 · 보통/굵은 모발', '촘촘한 S컬로 탄력과 표면 텍스처를 강조'],
  ['BW', '바디 웨이브 펌', '바디 펌', { US: 20, S: 34, MD: 42, L: 48, XL: 55 }, '직모/반곱슬 · 가는/보통 모발', '뿌리 구조를 유지하고 중간부터 큰 바디 웨이브를 형성'],
  ['WW', '워터 웨이브 펌', '물결 펌', { US: 16, S: 26, MD: 32, L: 38, XL: 44 }, '직모/반곱슬 · 보통 모발', '간격이 일정한 물결형 굴곡으로 수평 리듬을 형성'],
  ['SP', '스파이럴 펌', '스파이럴 펌', { US: 12, S: 18, MD: 24, L: 28, XL: 32 }, '직모/반곱슬 · 보통/굵은 모발', '세로 방향의 나선 컬로 길이감과 입체적 분리를 동시에 형성'],
  ['HP', '히피 펌', '히피 펌', { US: 8, S: 10, MD: 12, L: 14, XL: 16 }, '직모/반곱슬 · 보통/굵은 모발', '뿌리 가까이부터 작은 웨이브를 반복해 최대 텍스처를 형성']
].map(([id, name, type, diameters, hairType, feature]) => ({ id, name, type, diameters, hairType, feature }));

const specialFamilies = [
  {
    id: 'BR', title: '브레이드·트위스트·로크', file: 'special-braids.md',
    archetypes: ['박스 브레이드', '노트리스 브레이드', '스트레이트 콘로우', '커브드 콘로우', '스티치 브레이드', '풀라니 브레이드', '가나 브레이드', '피드인 브레이드', '마이크로 브레이드', '트리 브레이드', '세네갈 트위스트', '말리 트위스트', '패션 트위스트', '하바나 트위스트', '로프 트위스트', '미니 트위스트', '반투 노트', '페이크 로크', '시스터로크', '클래식 로크'],
    variants: [['MI', '마이크로', '매우 작은 섹션과 높은 밀도'], ['SM', '스몰', '작은 섹션과 정교한 반복'], ['MD', '미디엄', '중간 섹션과 균형 잡힌 볼륨'], ['LG', '라지', '큰 섹션과 강한 그래픽 실루엣'], ['MX', '믹스드', '서로 다른 굵기를 의도적으로 혼합']],
    feature: '두피 섹션, 브레이드/트위스트 방향, 굵기, 장력과 끝처리를 동일하게 유지'
  },
  {
    id: 'UP', title: '업두·번·묶음', file: 'special-updos.md',
    archetypes: ['로우 번', '하이 번', '클래식 시뇽', '프렌치 트위스트', '깁슨 턱', '발레리나 번', '스페이스 번', '브레이디드 번', '노트 번', '메시 번', '로우 포니테일', '미드 포니테일', '하이 포니테일', '버블 포니테일', '하프업', '탑노트', '크라운 브레이드 업두', '사이드 스웹트 업두', '루프 업두', '슬릭 웻 업두'],
    variants: [['SL', '슬릭', '표면을 매끈하게 밀착'], ['SF', '소프트', '얼굴 주변 잔머리와 부드러운 볼륨'], ['TX', '텍스처드', '표면 결 및 분리감을 강조'], ['BR', '브레이디드', '묶음 구조에 브레이드 요소를 결합'], ['SC', '스컬프티드', '조형적이고 선명한 구조를 강조']],
    feature: '고정점, 묶음 높이, 장력, 표면 질감과 후면 실루엣을 명확히 유지'
  },
  {
    id: 'TR', title: '전통·역사 헤어', file: 'special-traditional.md',
    archetypes: ['한국 쪽머리', '한국 댕기머리', '한국 얹은머리', '한국 어여머리', '한국 대수머리', '한국 상투', '한국 망건 상투', '일본 시마다마게', '일본 마루마게', '일본 모모와레', '일본 니혼가미', '일본 촌마게', '중국 고계', '중국 쌍환계', '중국 봉황계', '중국 반묶음 한푸 헤어', '중국 관발', '청대 변발 역사형', '유럽 클래식 시뇽', '유럽 빅토리 롤'],
    variants: [['MR', '박물관 재현', '역사적 실루엣과 결발 구조를 우선'], ['CR', '의례형', '정식 행사 비례와 장식 위치를 반영'], ['MN', '미니멀 재해석', '장식과 부피를 줄이고 핵심 구조를 유지'], ['MD', '모던 재해석', '현대적 표면과 자연스러운 비례로 조정'], ['ED', '에디토리얼 재해석', '핵심 문화 구조를 보존하며 조형성을 강조']],
    feature: '문화권·시대·결발 방식의 명칭과 맥락을 유지하고 서로 다른 전통을 임의 혼합하지 않음'
  },
  {
    id: 'BA', title: '바버·페이드·테이퍼', file: 'special-barber.md',
    archetypes: ['인덕션 컷', '버 컷', '버치 컷', '크루컷', '플랫탑', '하이 앤 타이트', '아이비리그', '시저컷', '프렌치 크롭', '텍스처드 크롭', '퐁파두르', '퀴프', '클래식 사이드 파트', '슬릭백', '모호크', '포호크', '버스트 멀릿', '템플 크롭', '아프로 셰이프업', '컬리 탑'],
    variants: [['NF', '노 페이드', '가위·클리퍼로 자연스럽게 연결'], ['TP', '클래식 테이퍼', '템플과 네이프만 점진적으로 정리'], ['LF', '로우 페이드', '귀 아래 낮은 위치에서 전환'], ['MF', '미드 페이드', '관자 중간 높이에서 전환'], ['HF', '하이 스킨 페이드', '높은 위치에서 피부 길이까지 강하게 전환']],
    feature: '페이드 시작 높이, 가이드 라인, 템플·네이프 연결과 상단 길이 대비를 수치적으로 유지'
  },
  {
    id: 'ED', title: '에디토리얼·아방가르드', file: 'special-editorial.md',
    archetypes: ['지오메트릭 보브', '비대칭 스컬프처', '그래비티 볼륨', '팬 실루엣', '혼 실루엣', '루프 구조', '더블 텍스처', '웨트 스컬프처', '플로팅 프린지', '블레이드 프린지', '체커 셰이브', '라인아트 셰이브', '스파이크 크라운', '오리가미 업두', '아키텍처럴 번', '리본 헤어 구조', '메탈릭형 표면 구조', '디컨스트럭티드 샤그', '하이브리드 멀릿', '서리얼 웨이브'],
    variants: [['MN', '미니멀', '한 가지 조형 포인트만 절제해 사용'], ['RW', '런웨이', '정면과 측면에서 읽히는 강한 실루엣'], ['CT', '쿠튀르', '정교한 표면과 복합 구조를 사용'], ['SC', '스컬프처럴', '모발을 입체 조형물처럼 고정'], ['EX', '익스트림', '크기와 대비를 최대화하되 한 사람 한 헤어 구조를 유지']],
    feature: '실루엣 축, 대칭 여부, 표면 재질, 구조적 고정점과 전체 외곽을 명확히 정의'
  }
];

const normalize = (value) => String(value).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const core = [];

for (const gender of genders) {
  for (const length of lengths) {
    const baseList = bases[gender.id][length.id];
    const frontList = frontDetails[gender.id][length.id];
    if (baseList.length !== 10) throw new Error(`${gender.name} ${length.name}: 기본 실루엣은 10개여야 합니다.`);
    if (frontList.length !== 5) throw new Error(`${gender.name} ${length.name}: 프런트 디테일은 5개여야 합니다.`);
    baseList.forEach((base, baseIndex) => {
      frontList.forEach(([frontId, frontName, frontFeature]) => {
        finishProfiles.forEach((finish) => {
          const diameter = finish.diameters ? finish.diameters[length.id] : null;
          if (diameter && diameter > length.maxDiameter) throw new Error(`${length.name} 허용 굵기 초과: ${finish.name} ${diameter}mm`);
          const id = `HLM-C-${gender.id}-${length.id}-${String(baseIndex + 1).padStart(2, '0')}-${frontId}-${finish.id}`;
          const name = `${gender.name} ${length.name} ${base.name} · ${frontName} · ${finish.name}`;
          const feature = `${gender.name} ${length.name}. ${length.landmark}. ${base.feature}. ${frontFeature}. ${finish.feature}.`;
          const signature = `CORE|${gender.id}|${length.id}|${baseIndex + 1}|${frontId}|${finish.id}`;
          core.push({ id, name, gender: gender.name, genderId: gender.id, length: length.name, lengthId: length.id, landmark: length.landmark, base: base.name, baseIndex: baseIndex + 1, front: frontName, frontId, finish: finish.name, finishId: finish.id, finishType: finish.type, diameter: diameter ? `${diameter}mm` : '해당 없음', diameterMm: diameter, hairType: finish.hairType, feature, signature });
        });
      });
    });
  }
}

const special = [];
for (const family of specialFamilies) {
  family.archetypes.forEach((archetype, archetypeIndex) => {
    family.variants.forEach(([variantId, variantName, variantFeature]) => {
      const id = `HLM-S-${family.id}-${String(archetypeIndex + 1).padStart(2, '0')}-${variantId}`;
      const name = `${family.title} · ${archetype} · ${variantName}`;
      const feature = `${family.title}. ${archetype}. ${variantFeature}. ${family.feature}.`;
      const signature = `SPECIAL|${family.id}|${archetypeIndex + 1}|${variantId}`;
      special.push({ id, name, family: family.title, familyId: family.id, file: family.file, archetype, variant: variantName, feature, signature });
    });
  });
}

const designs = [...core, ...special];
const assertUnique = (label, values) => {
  const seen = new Set();
  const duplicates = [];
  for (const value of values) {
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  }
  if (duplicates.length) throw new Error(`${label} 중복 ${duplicates.length}개: ${duplicates.slice(0, 5).join(', ')}`);
  return seen.size;
};

if (core.length !== 6000) throw new Error(`코어 예상 6,000개, 실제 ${core.length}개`);
if (special.length !== 500) throw new Error(`특수 예상 500개, 실제 ${special.length}개`);
if (designs.length !== 6500) throw new Error(`전체 예상 6,500개, 실제 ${designs.length}개`);
const uniqueIds = assertUnique('ID', designs.map((design) => design.id));
const uniqueNames = assertUnique('이름', designs.map((design) => design.name));
const uniqueNormalizedNames = assertUnique('정규화 이름', designs.map((design) => normalize(design.name)));
const uniqueSignatures = assertUnique('설계 시그니처', designs.map((design) => design.signature));
const uniqueFeatures = assertUnique('특징 문장', designs.map((design) => normalize(design.feature)));
const bannedColorTerms = /(블랙|브라운|블론드|레드|핑크|블루|그린|퍼플|애쉬|코퍼|염색 컬러)/;
const colorMentions = designs.filter((design) => bannedColorTerms.test(design.name) || bannedColorTerms.test(design.feature));
if (colorMentions.length) throw new Error(`색상 차원 혼입 ${colorMentions.length}개`);

const lengthOrders = { US: 0, S: 1, MD: 2, L: 3, XL: 4 };
const damageCodes = { low: 0, medium: 1, high: 2 };
const thicknessMask = (hairType) => (/가는/.test(hairType) ? 1 : 0) | (/보통/.test(hairType) ? 2 : 0) | (/굵은|고밀도/.test(hairType) ? 4 : 0) || 7;
const permIntensity = (finishId) => ['NS', 'NW', 'NC', 'NK'].includes(finishId) ? 0 : ['CL', 'CT', 'BW'].includes(finishId) ? 1 : ['SL', 'ST', 'WW', 'SP'].includes(finishId) ? 2 : 3;
const textureBucket = (finishId) => finishId === 'NS' ? 0 : ['NW', 'CL', 'CT', 'BW'].includes(finishId) ? 1 : ['NC', 'SL', 'ST', 'WW'].includes(finishId) ? 2 : ['NK', 'SP'].includes(finishId) ? 3 : 4;
const coreDamage = (finishId) => ['NS', 'NW', 'NC', 'NK'].includes(finishId) ? 'low' : ['CL', 'CT', 'BW'].includes(finishId) ? 'medium' : 'high';
const specialFamilyBuckets = new Map([['BR', 0], ['UP', 1], ['TR', 2], ['BA', 3], ['ED', 4]]);
const specialProfile = (design) => {
  if (design.familyId === 'BA') return { target: 0, ceiling: 'low', extension: false, risk: 1, editorial: 0, texture: 0 };
  if (design.familyId === 'UP') return { target: 3, ceiling: 'low', extension: false, risk: 2, editorial: 1, texture: design.variant === '슬릭' ? 0 : 2 };
  if (design.familyId === 'BR') return { target: 4, ceiling: 'medium', extension: true, risk: 2, editorial: 1, texture: 4 };
  if (design.familyId === 'TR') {
    const extension = /대수|변발|어여|관발|봉황|장식|의례|박물관/.test(`${design.archetype} ${design.variant}`);
    return { target: 3, ceiling: 'medium', extension, risk: 3, editorial: design.variant.includes('에디토리얼') ? 3 : 2, texture: 3 };
  }
  return { target: 2, ceiling: 'high', extension: /구조|볼륨|실루엣|익스트림|쿠튀르|스컬프처럴/.test(`${design.archetype} ${design.variant}`), risk: 3, editorial: design.variant === '미니멀' ? 2 : 3, texture: 4 };
};
const dictionary = (values) => [...new Set(values)];
const dictionaries = {
  bases: dictionary(core.map((design) => design.base)),
  fronts: dictionary(core.map((design) => design.front)),
  finishes: dictionary(core.map((design) => design.finish)),
  finishTypes: dictionary(core.map((design) => design.finishType)),
  hairTypes: dictionary(core.map((design) => design.hairType)),
  lengths: lengths.map((length) => length.name),
  landmarks: lengths.map((length) => length.landmark),
  families: specialFamilies.map((family) => family.title),
  files: specialFamilies.map((family) => family.file),
  archetypes: dictionary(special.map((design) => design.archetype)),
  variants: dictionary(special.map((design) => design.variant))
};
const dictionaryMaps = Object.fromEntries(Object.entries(dictionaries).map(([key, values]) => [key, new Map(values.map((value, index) => [value, index]))]));
const baseBuckets = new Map(dictionaries.bases.map((value, index) => [value, index]));
const frontBuckets = new Map(dictionary([...core.map((design) => `${design.genderId}|${design.lengthId}|${design.frontId}`)]).map((value, index) => [value, index]));
const finishBuckets = new Map(dictionary([...core.map((design) => design.finishId), ...special.map((design) => `${design.familyId}|${design.variant}`)]).map((value, index) => [value, index]));
const compactFeasibility = (feasibility) => [feasibility.lengthOrderMin, feasibility.lengthOrderMax, feasibility.targetLengthOrder, feasibility.maxLengthJumpFromCurrent, feasibility.thicknessMask, damageCodes[feasibility.damageCeiling], feasibility.requiresPerm ? 1 : 0, feasibility.permIntensity, feasibility.requiresExtensionOrPiece ? 1 : 0, feasibility.specialFamilyRisk, feasibility.hardDenyWhenExtensionsDenied ? 1 : 0];
const compactVector = (vector) => [vector.length, vector.kind, vector.gender, vector.baseBucket, vector.frontBucket, vector.finishBucket, vector.textureBucket, vector.permBucket, vector.specialFamilyBucket, vector.editorialRisk];
const runtimeRecords = designs.map((design) => {
  if (design.id.startsWith('HLM-C-')) {
    const target = lengthOrders[design.lengthId];
    const intensity = permIntensity(design.finishId);
    const requiresPerm = intensity > 0;
    const requiresExtensionOrPiece = false;
    const feasibility = { lengthOrderMin: target === 0 ? 0 : target - 1, lengthOrderMax: Math.min(4, target + 1), targetLengthOrder: target, maxLengthJumpFromCurrent: intensity === 0 ? 2 : 1, thicknessMask: thicknessMask(design.hairType), damageCeiling: coreDamage(design.finishId), requiresPerm, permIntensity: intensity, requiresExtensionOrPiece, specialFamilyRisk: 0, hardDenyWhenExtensionsDenied: false };
    const vector = { length: target, kind: 0, gender: design.genderId === 'F' ? 1 : 2, baseBucket: baseBuckets.get(design.base), frontBucket: frontBuckets.get(`${design.genderId}|${design.lengthId}|${design.frontId}`), finishBucket: finishBuckets.get(design.finishId), textureBucket: textureBucket(design.finishId), permBucket: intensity, specialFamilyBucket: 5, editorialRisk: feasibility.damageCeiling === 'high' ? 1 : 0 };
    return [design.id, 0, design.genderId, design.lengthId, dictionaryMaps.bases.get(design.base), dictionaryMaps.fronts.get(design.front), dictionaryMaps.finishes.get(design.finish), dictionaryMaps.finishTypes.get(design.finishType), design.diameterMm ?? -1, dictionaryMaps.hairTypes.get(design.hairType), design.signature, ...compactFeasibility(feasibility), ...compactVector(vector)];
  }
  const profile = specialProfile(design);
  const feasibility = { lengthOrderMin: Math.max(0, profile.target - 1), lengthOrderMax: Math.min(4, profile.target + 1), targetLengthOrder: profile.target, maxLengthJumpFromCurrent: profile.extension ? 1 : 2, thicknessMask: 7, damageCeiling: profile.ceiling, requiresPerm: false, permIntensity: 0, requiresExtensionOrPiece: profile.extension, specialFamilyRisk: profile.risk, hardDenyWhenExtensionsDenied: profile.extension };
  const vector = { length: profile.target, kind: 1, gender: 0, baseBucket: specialFamilyBuckets.get(design.familyId), frontBucket: 0, finishBucket: finishBuckets.get(`${design.familyId}|${design.variant}`), textureBucket: profile.texture, permBucket: 0, specialFamilyBucket: specialFamilyBuckets.get(design.familyId), editorialRisk: profile.editorial };
  return [design.id, 1, design.familyId, dictionaryMaps.files.get(design.file), dictionaryMaps.archetypes.get(design.archetype), dictionaryMaps.variants.get(design.variant), design.signature, ...compactFeasibility(feasibility), ...compactVector(vector)];
});
const indexRecords = runtimeRecords.map((tuple) => tuple[1] === 0 ? [tuple[0], 0, tuple[10], ...tuple.slice(11)] : [tuple[0], 1, tuple[6], ...tuple.slice(7)]);
const catalogJson = `${JSON.stringify({ schemaVersion, catalogVersion, promptVersion, generatedAtPolicy: 'deterministic-no-timestamp', encoding: 'HLM-DICT-TUPLE-1', counts: { total: 6500, core: 6000, special: 500 }, dictionaries, records: runtimeRecords })}\n`;
const catalogIndexJson = `${JSON.stringify({ schemaVersion, catalogVersion, promptVersion, generatedAtPolicy: 'deterministic-no-timestamp', encoding: 'HLM-INDEX-TUPLE-1', facets: { lengthIds: ['US', 'S', 'MD', 'L', 'XL'], thickness: ['fine', 'normal', 'thick'], damageCondition: ['low', 'medium', 'high'], specialFamilies: ['BR', 'UP', 'TR', 'BA', 'ED'] }, records: indexRecords })}\n`;
if (Buffer.byteLength(catalogJson) > catalogSizeLimitBytes) throw new Error(`catalog.json 크기 초과: ${Buffer.byteLength(catalogJson)} bytes`);
if (Buffer.byteLength(catalogIndexJson) > indexSizeLimitBytes) throw new Error(`catalog-index.json 크기 초과: ${Buffer.byteLength(catalogIndexJson)} bytes`);

const expectedFiles = new Map();
const masterLines = [
  '# Hairloom 헤어 디자인 마스터 카탈로그 6,500',
  '',
  '> “세상 모든 헤어”를 문자 그대로 유한 목록으로 완결할 수는 없습니다. 이 카탈로그는 커트, 기장, 프런트, 자연 모질, 펌 굵기, 브레이드, 업두, 전통, 바버링, 에디토리얼을 포괄하도록 만든 **확장 가능한 Hairloom 설계 온톨로지**입니다.',
  '',
  '## 전체 범위', '',
  '| 영역 | 수량 |', '|---|---:|',
  '| 코어: 성별 × 기장 × 기본형 × 프런트 × 모질/펌 | 6,000 |',
  '| 브레이드·트위스트·로크 | 100 |',
  '| 업두·번·묶음 | 100 |',
  '| 전통·역사 | 100 |',
  '| 바버·페이드·테이퍼 | 100 |',
  '| 에디토리얼·아방가르드 | 100 |',
  '| **전체** | **6,500** |',
  '',
  '코어 계산식: `성별 2 × 기장 5 × 기본 실루엣 10 × 프런트 5 × 모질·펌 12 = 6,000`',
  '',
  '## 중복 및 품질 검사', '',
  `- 고유 ID: **${uniqueIds}**`,
  `- 고유 이름: **${uniqueNames}**`,
  `- 고유 정규화 이름: **${uniqueNormalizedNames}**`,
  `- 고유 설계 시그니처: **${uniqueSignatures}**`,
  `- 고유 특징 문장: **${uniqueFeatures}**`,
  `- 색상 혼입: **${colorMentions.length}**`,
  '- 기장별 최대 컬 지름 초과: **0**',
  '- 빈 필드: **0**',
  '',
  '## 코어 문서', '',
  '| 성별 | 기장 | 수량 | 문서 |', '|---|---|---:|---|'
];

for (const gender of genders) {
  for (const length of lengths) {
    const rows = core.filter((design) => design.gender === gender.name && design.length === length.name);
    const filename = `core-${gender.id.toLowerCase()}-${length.id.toLowerCase()}.md`;
    masterLines.push(`| ${gender.name} | ${length.name} | ${rows.length} | [${filename}](./${filename}) |`);
    const lines = [
      `# ${gender.name} · ${length.name} 헤어 디자인 600`, '',
      `기장 랜드마크: **${length.landmark}**`, '',
      '| ID | 이름 | 기본 실루엣 | 프런트 | 모질·펌 | 굵기 | 권장 모질 | 특징 |',
      '|---|---|---|---|---|---|---|---|',
      ...rows.map((design) => `| ${design.id} | ${escapeCell(design.name)} | ${escapeCell(design.base)} | ${escapeCell(design.front)} | ${escapeCell(design.finish)} | ${design.diameter} | ${escapeCell(design.hairType)} | ${escapeCell(design.feature)} |`)
    ];
    expectedFiles.set(filename, `${lines.join('\n').trimEnd()}\n`);
  }
}

masterLines.push('', '## 특수 구조 문서', '', '| 영역 | 수량 | 문서 |', '|---|---:|---|');
for (const family of specialFamilies) {
  const rows = special.filter((design) => design.familyId === family.id);
  masterLines.push(`| ${family.title} | ${rows.length} | [${family.file}](./${family.file}) |`);
  const lines = [
    `# ${family.title} 100`, '',
    '| ID | 이름 | 원형 | 변형 | 특징 |', '|---|---|---|---|---|',
    ...rows.map((design) => `| ${design.id} | ${escapeCell(design.name)} | ${escapeCell(design.archetype)} | ${escapeCell(design.variant)} | ${escapeCell(design.feature)} |`)
  ];
  expectedFiles.set(family.file, `${lines.join('\n').trimEnd()}\n`);
}

masterLines.push('', '## 설계 원칙', '', '- 색상은 분류 차원에서 제외한다.', '- 동일 이름에 번호만 붙여 늘리지 않는다.', '- 모든 코어 항목은 성별, 기장, 기본형, 프런트, 모질·펌의 고유 조합을 가진다.', '- 전통 헤어는 문화권과 시대 명칭을 유지하고 임의 혼합하지 않는다.', '- 브레이드·로크·코일은 일반 펌과 다른 독립 구조로 분류한다.', '- 카탈로그는 생성기 기반이며 새로운 사용자 세그먼트에 맞춰 차원을 추가할 수 있다.');
expectedFiles.set('README.md', `${masterLines.join('\n').trimEnd()}\n`);
expectedFiles.set('catalog.json', catalogJson);
expectedFiles.set('catalog-index.json', catalogIndexJson);

const validationLines = [
  '# Hairloom 마스터 카탈로그 검증 보고서', '',
  `- 전체: ${designs.length}`, `- 코어: ${core.length}`, `- 특수: ${special.length}`,
  `- ID 중복: ${designs.length - uniqueIds}`, `- 이름 중복: ${designs.length - uniqueNames}`,
  `- 정규화 이름 중복: ${designs.length - uniqueNormalizedNames}`, `- 시그니처 중복: ${designs.length - uniqueSignatures}`,
  `- 특징 문장 중복: ${designs.length - uniqueFeatures}`, `- 색상 혼입: ${colorMentions.length}`, '',
  '## 코어 셀 검사', '', '| 성별 | 기장 | 실제 | 예상 |', '|---|---|---:|---:|'
];
for (const gender of genders) for (const length of lengths) {
  const count = core.filter((design) => design.gender === gender.name && design.length === length.name).length;
  if (count !== 600) throw new Error(`${gender.name} ${length.name} 코어 셀 ${count}개`);
  validationLines.push(`| ${gender.name} | ${length.name} | ${count} | 600 |`);
}
validationLines.push('', '## 특수 패밀리 검사', '', '| 패밀리 | 실제 | 예상 |', '|---|---:|---:|');
for (const family of specialFamilies) {
  const count = special.filter((design) => design.familyId === family.id).length;
  if (count !== 100) throw new Error(`${family.title} ${count}개`);
  validationLines.push(`| ${family.title} | ${count} | 100 |`);
}
expectedFiles.set('VALIDATION.md', `${validationLines.join('\n').trimEnd()}\n`);

if (checkOnly) {
  const actualFiles = readdirSync(outputDir).filter((name) => name.endsWith('.md') || name.endsWith('.json')).sort();
  const wantedFiles = [...expectedFiles.keys()].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(wantedFiles)) throw new Error(`마스터 문서 파일 목록 불일치`);
  for (const [name, content] of expectedFiles) {
    if (readFileSync(resolve(outputDir, name), 'utf8') !== content) throw new Error(`${name}이 생성기 출력과 다릅니다.`);
  }
  console.log(`Master catalog verified: ${designs.length} designs; zero duplicate IDs, names, normalized names, signatures, and features.`);
} else {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of expectedFiles) writeFileSync(resolve(outputDir, name), content);
  console.log(`Master catalog generated: ${designs.length} designs across ${expectedFiles.size} documents.`);
  console.log(`Core ${core.length}; special ${special.length}; duplicate checks 0; color mentions 0.`);
}
