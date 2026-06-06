# M10 완료 — 후진(R) 기어 W/S 입력 반전

> 후진 기어(R, `gear === -1`)에서 **S = 후진 악셀**, **W = 브레이크**. 전진(1~5)·중립(N)은 현행 유지.

## 변경

- `src/vehicle/vehicle.js` — `stepVehicle`에서 변속 반영 후 `gear` 기준으로 후진 판별:
  ```js
  const reverse = gear === -1;
  const effThrottle = reverse ? brake : throttle;
  const effBrake    = reverse ? throttle : brake;
  ```
  throttle/brake 사용처 3곳(`stepEngine`, `engineAccel`, `stepDynamics`)을 `effThrottle`/`effBrake`로 치환.
- `src/input.js` — 변경 없음(순수 매핑, 기어 비의존 유지).
- `README.md` — 조작표에 후진 W/S 반전 안내 추가.

## 테스트

- `src/vehicle/vehicle.test.js`에 describe "후진 W/S 반전 (M10)" 6케이스 추가.
  - R+S=후진가속, R+W=감속/정지, R+W단독(전진 안 함), R+S단독(후진 출발), 전진기어 불변(회귀), 중립 불변(회귀).
- 전체: **128 passed** (vehicle 14 = 기존 8 + 신규 6).

## 검증

- 단위 테스트 전체 그린. 브라우저 수동 확인 완료(R에서 S=후진/W=감속, 전진 복귀 정상).

## 설계

- [design/reverse-controls.md](../design/reverse-controls.md)
