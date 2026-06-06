// ══════════════════════════════════════════════════════════════
// heading.js — 목표 방향 상대각(순수, THREE 비의존) (M19a)
//
// 좌표계 규약(dynamics.js 와 동일): +Z=전진, +X=우.
//   차량 전방 벡터 = (sin heading, 0, cos heading).
// 설계: mds/design/m19-arrow-lights.md §"순수 함수 — 화면 상대 방향각".
// ══════════════════════════════════════════════════════════════

// (-π, π] 로 정규화한 각.
export function normalizeAngle(a) {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

// 목표를 가리키는 "차량 heading 기준 상대각"(rad).
//   월드 목표 방향각 = atan2(dx, dz)  (heading 과 동일 규약: 0=+Z, +=+X(우))
//   상대각 = normalizeAngle(worldAngle - car.heading).
//   0=정면, +π/2=우측, -π/2=좌측, ±π=후방.
export function bearingToTarget(car, target) {
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const worldAngle = Math.atan2(dx, dz);
  return normalizeAngle(worldAngle - car.heading);
}
