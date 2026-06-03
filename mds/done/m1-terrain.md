# M1 — terrain.js 추출 (완료)

## 한 일
- LOD_demo `main.js`에 인라인돼 있던 지형 로직을 순수 모듈 `src/terrain.js`로 추출.
  - 공개: 상수(`CHUNK_SIZE`/`RENDER_DIST`/`SEG_L0~L3`), `rand2D`/`lerp`/`smoothNoise`/`ridgedNoise`, `terrainHeight`, `quantizeHeight`, `getSeg`, `heightToColorHex`.
  - THREE 의존 제거: 기존 `heightToRGB`(THREE.Color 사용)를 `heightToColorHex`(hex 반환)로 대체 → 순수 유지. 색 변환은 렌더 레이어(`createChunk`)가 `THREE.Color.setHex`로 수행해 원본과 동일한 색 보장.
- `main.js` 리팩터: 중복 정의(노이즈/terrainHeight/getSeg/heightToRGB) 제거하고 `terrain.js`를 import해 사용. `quantizeHeight(raw, seg)`로 계단 양자화 일원화.

## 검증
- `src/terrain.test.js` 단위 테스트 12건 통과(스모크 포함 전체 13건):
  - 결정론·범위, 정수 격자점에서 smoothNoise=rand2D, terrainHeight 범위 회귀, quantizeHeight step 반올림, getSeg Chebyshev LOD, heightToColorHex 8단계 경계.
- `npm run build` 성공(리팩터한 앱 정상), `npm test` 그린.

## 다음
- M2: `road.js` — 지형 위 도로 중심선 생성, 체크포인트 배치, `isOnRoad`/중심선 거리.
