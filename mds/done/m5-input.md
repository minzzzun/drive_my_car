# M5 — input.js + 1인칭 운전석 카메라 (완료)

## 한 일
- `src/input.js` (순수): `KEYMAP`, `createInput`/`onKeyDown`/`onKeyUp`/`readControls`. 레벨 입력(throttle/brake/clutchPedal/steer) + 엣지(one-shot) 변속·시동.
- `main.js` 대수술: PointerLockControls 자유시점·fly·jump 제거 → 차량 주행으로 전환.
  - 코스 시작점에 차량 스폰(도로 방향으로 heading), 매 프레임 `readControls`→`stepVehicle(v, controls, dt, terrainHeight)`.
  - 1인칭 운전석 카메라(눈높이 EYE_HEIGHT, heading 전방 주시, pitch 약간 반영).
  - 시작 오버레이 클릭 → 포인터 락(커서 숨김)·주행 시작.
  - 임시 주행 HUD(기어/RPM/속도/엔진/전복) 하단 표시. 와이어프레임(F) 유지.
- `index.html`: 제목·오버레이 안내를 수동 운전 조작으로 갱신.

## 검증
- `input.test.js` 8건 통과 (전체 87건).
- `npm run bulid` 성공 → main→input→vehicle→dynamics/engine/gearbox, render/road 전체 모듈 그래프 정상 컴파일.
- ⚠️ 브라우저 주행 화면(카메라 추종·실제 stall 체감)은 차량 메시 추가되는 M6에서 `npm run dev`로 함께 확인.

## 다음
- M6: `render/carMesh.js`(test1 섀시+캐빈+바퀴 참조) + 차량을 지형/도로 위에 표시하고 주행 통합 시각 확인.
