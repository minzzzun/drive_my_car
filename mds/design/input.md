# 설계 — input.js + 1인칭 카메라 (M5)

## input.js (키 → controls 매핑, 순수 로직)
DOM 이벤트 부착은 main.js가, 매핑 로직은 순수 함수로 분리해 테스트.

- `KEYMAP`: throttle=`KeyW`, brake=`KeyS`, left=`KeyA`, right=`KeyD`, clutch=`ShiftLeft`/`ShiftRight`, shiftUp=`KeyE`, shiftDown=`KeyQ`, ignition=`Enter`.
- `createInput()` → `{ down:Set, pendingShift:0, pendingIgnition:false }`.
- `onKeyDown(input, code)` — 키 추가 + 엣지 기록(shiftUp→+1, shiftDown→−1, ignition→true). 매핑된 코드면 `true` 반환(preventDefault용).
- `onKeyUp(input, code)` — 키 제거.
- `readControls(input)` → `{throttle, brake, clutchPedal, steer, shift, ignition}` 반환하고 **엣지(one-shot) 소비**(pendingShift=0, pendingIgnition=false).
  - throttle/brake/clutchPedal: 눌림 = 1, 아니면 0 (레벨).
  - steer: left −1, right +1, 동시/없음 0.
  - shift/ignition: keydown 순간 1회만(엣지).

## 1인칭 운전석 카메라 (main.js 결선)
- PointerLockControls 자유시점 제거. 포인터 락은 커서 숨김 용도로만(수동 관리).
- 매 프레임 카메라를 차량 운전석에 고정: `pos = (veh.x, veh.y + EYE_HEIGHT, veh.z)`, 전진 `(sin h, cos h)` 바라봄. 약간의 롤 반영 가능(전복 연출).
- 청크 스트리밍/리사이즈는 카메라 위치(=차량) 기준 그대로 유지.
- 루프: `readControls` → `stepVehicle(v, controls, dt, terrainHeight)` → 카메라 갱신.

## 테스트 설계 (`src/input.test.js`)
- W→throttle 1, S→brake 1, Shift→clutchPedal 1.
- A→steer −1, D→+1, 동시→0.
- E keydown→shift +1 (다음 read 0), Q→−1.
- Enter→ignition true (다음 read false).
- 매핑 안 된 키는 무시.
