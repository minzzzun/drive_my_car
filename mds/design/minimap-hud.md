# 설계 — minimap.js + hud.js (M8)

## minimap.js — 우상단 상공뷰
2D 캔버스로 코스 전체를 위에서 내려다본 지도를 그린다(상공뷰). 투영 수학은 순수 함수로 분리해 테스트.

- `computeBounds(waypoints, pad)` — 코스 경계 `{minX,maxX,minZ,maxZ}`(여백 pad).
- `worldToMinimap(wx, wz, view)` — 월드 XZ → 캔버스 픽셀. 종횡비 보존(`scale=size/max(w,h)`), 중앙 정렬, +Z가 화면 위.
- `createMinimap(road, checkpoints, opts)` → `{ canvas, draw(dyn, score) }`. 우상단 고정 캔버스(기본 160px). `draw`: 도로(웨이포인트 폴리라인) + 체크포인트(현재 목표 강조) + 차량(heading 방향 삼각형).

## hud.js — 주행 HUD
DOM 기반. RPM 게이지(막대), 기어, 속도, 점수, 체크포인트, 타이머.
- `rpmToFraction(rpm, maxRpm)` — 게이지 채움 비율 0~1(clamp). (순수·테스트)
- `createHud()` → `{ el, update(vehicle, score) }`. 하단 중앙 패널.

## main.js 결선
- 임시 driveHud 제거 → `createHud()` + `createMinimap()` 사용. 매 프레임 `hud.update`, `minimap.draw`.

## 테스트 (`src/render/minimap.test.js`, `src/render/hud.test.js`)
- computeBounds: 경계+pad. worldToMinimap: 코너/중앙 매핑·+Z 위 반전.
- rpmToFraction: 0→0, max→1, 초과 clamp 1.
