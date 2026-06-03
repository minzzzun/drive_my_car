# 설계 — terrain.js (M1)

## 목적
LOD_demo `main.js`에 인라인돼 있던 **절차적 지형 로직**을 Three.js 비의존 순수 모듈로 분리한다. 차량 물리(지면 높이 질의)·도로(지형 위 도로 부설)·렌더(청크 메시 생성)가 모두 이 모듈을 공유한다.

## 공개 API (`src/terrain.js`)
- 상수: `CHUNK_SIZE=64`, `RENDER_DIST=4`, `SEG_L0=64`, `SEG_L1=32`, `SEG_L2=8`, `SEG_L3=4`
- `rand2D(x,y)` — 결정론적 의사난수 [0,1)
- `lerp(a,b,t)`
- `smoothNoise(x,y)` — smoothstep 보간 value noise
- `ridgedNoise(x,y)` — 능선 노이즈
- `terrainHeight(wx,wz)` — 월드 좌표 → 지형 높이(원본 공식 그대로, 약 -20~+75)
- `quantizeHeight(raw, seg)` — 높이를 `CHUNK_SIZE/seg` 단위로 반올림(계단형 양자화)
- `getSeg(cx,cz,pcx,pcz)` — 플레이어 청크 기준 거리(Chebyshev)로 LOD 세그먼트 수 결정
- `heightToColorHex(h)` — 높이 → 8단계 색상 hex (렌더 레이어가 THREE.Color로 래핑)

## 설계 원칙
- **THREE 비의존**: 숫자 입출력만. `heightToRGB`처럼 THREE.Color에 의존하던 부분은 `heightToColorHex`(hex 반환)로 바꿔 순수 유지. 렌더 레이어(`createChunk`)에서 `new THREE.Color().setHex(...)`로 변환해 원본과 동일한 색을 유지.
- **원본 보존**: `terrainHeight` 공식·계수는 LOD_demo와 한 글자도 다르지 않게 이식(지형 모양 동일 보장).

## 테스트 설계 (`src/terrain.test.js`)
- `rand2D`/`smoothNoise`: 같은 입력 → 같은 출력(결정론), 범위 [0,1].
- `smoothNoise`: 정수 격자점에서 `rand2D`와 일치(보간 fract=0).
- `terrainHeight`: 결정론적(동일 좌표 동일 값), 합리적 범위(-30~80), 원점 기준값 회귀 스냅샷.
- `quantizeHeight`: seg에 따른 step 단위 반올림 (예: seg=8 → step=8, 13 → 16, 3 → 0).
- `getSeg`: d=0→64, d=1→32, d=2→8, d≥3→4 (대각 거리 Chebyshev 확인).
- `heightToColorHex`: 경계값별 올바른 색 단계.
