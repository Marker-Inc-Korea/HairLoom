# 작업 2 — 최소 검증 실험

설계 문서가 "존재하지 않는 자산"을 전제하지 않도록, 아래 **읽기 전용** 확인만 실행한다.
코드 작성·수정, 신규 저장소 생성, 에셋 생성은 금지.

## V1. 재사용 후보 자산 실재 확인 (필수, 1회)

```sh
# 헤어 스타일 매핑과 염색 팔레트 로직의 실제 형태 확인
grep -n "hairFemale\|hairMale" src/modules.mjs | head -30
grep -n "브라운\|블론드\|애쉬\|dye\|palette" src/modules.mjs | head -30
ls docs/assets/samples/ | grep hair | wc -l     # 헤어 샘플 에셋 개수

# 색 이론/팔레트 모듈의 export 표면 확인 (색상환 시각화 재사용 판단용)
grep -n "^export" src/colorTheory.mjs src/paletteVariants.mjs

# 저장/비교 흐름의 데이터 형태 확인
grep -n "^export" src/editHistory.mjs src/imageComparison.mjs
ls saved-edits/ | head -5                        # 저장 포맷 샘플 (내용 열람은 파일 1개까지)
```

- 결과는 `D-MODULES.md`의 "판단 근거" 열에 인용한다.

## V2. 원본 헤어 모듈 육안 확인 (필수, 1회)

```sh
HOST=127.0.0.1 PORT=4173 node server.mjs
```

- `http://127.0.0.1:4173` → 헤어스타일 모듈만 진입. **읽기만, 사진 업로드·저장 금지.**
- 기록할 것 3가지 (B-SCREENS.md의 "현재 한계" 근거로 사용):
  1. 스타일 선택 UI가 "갤러리/무드보드"와 얼마나 먼가
  2. 염색 색상이 어떤 형태로 나열되는가 (색상환/톤 구조가 있는가)
  3. 4모듈 셸(탭/네비) 안에 있어서 생기는 몰입 저해 요소
- 확인 후 서버 종료.

## V3. 라이선스 경계 확인 (필수, 1회)

```sh
head -5 LICENSE && cat OSS_REUSE.md
```

- MIT 조건과 기존 OSS 재사용 기록을 확인하고, `D-MODULES.md`의 출처 표기 방법에 반영.

## 종료 조건

- V1~V3 완료 + A~E 문서 5개 작성이 끝나면 즉시 종료.
- 문서 작성 중 "실제로 만들어보고 싶다"는 판단이 들어도 이 단계에서는 프로토타입을 만들지 않는다 —
  대신 `E-BREAKDOWN.md`의 첫 커밋 후보로 기록한다.
