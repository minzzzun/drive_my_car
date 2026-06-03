// ══════════════════════════════════════════════════════════════
// render/carMesh.js — 차량 메시 (test1 섀시+캐빈+바퀴 구성 참조)
// 그룹 원점 = 차량 중심. dyn(위치/heading/roll/pitch)으로 매 프레임 변환.
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';

export function buildCar(opts = {}) {
  const bodyColor  = opts.bodyColor ?? 0xcc2222;
  const cabinColor = opts.cabinColor ?? 0x2255cc;
  const wheelColor = opts.wheelColor ?? 0x222222;
  const car = new THREE.Group();

  // 섀시 (차 밑바닥) — 전진 +Z, 길이 4
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.5, 4),
    new THREE.MeshPhongMaterial({ color: bodyColor }),
  );
  chassis.position.y = 0.2;
  car.add(chassis);

  // 캐빈 (운전석) — 뒤쪽에 얹음
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.8, 1.2),
    new THREE.MeshPhongMaterial({ color: cabinColor }),
  );
  cabin.position.set(0, 0.85, -0.3);
  car.add(cabin);

  // 바퀴 4개 (실린더, x축 정렬)
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16);
  const wheelMat = new THREE.MeshPhongMaterial({ color: wheelColor });
  const wheelPos = [
    [-1, -0.05,  1.3], // 앞 좌
    [ 1, -0.05,  1.3], // 앞 우
    [-1, -0.05, -1.3], // 뒤 좌
    [ 1, -0.05, -1.3], // 뒤 우
  ];
  for (const [x, y, z] of wheelPos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2; // 바퀴 축을 좌우(x)로
    wheel.position.set(x, y, z);
    car.add(wheel);
  }

  return car;
}

// dyn(위치/heading/roll/pitch) → 그룹 변환 ─────────────────────────
export function updateCarTransform(group, dyn) {
  group.position.set(dyn.x, dyn.y, dyn.z);
  group.rotation.order = 'YXZ';
  group.rotation.y = dyn.heading;
  group.rotation.x = -(dyn.pitch ?? 0);
  group.rotation.z = -(dyn.roll ?? 0);
}
