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

// 차량 정렬 — '천장' 축(up=지형 법선) 기준으로 heading 회전 ─────────
// up(차체 위 방향)이 지형 법선을 향하고, 진행 방향(heading)을 그 면에 투영.
const _up    = new THREE.Vector3();
const _fwd   = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();

export function updateCarTransform(group, dyn, up) {
  group.position.set(dyn.x, dyn.y, dyn.z);

  _up.set(up?.x ?? 0, up?.y ?? 1, up?.z ?? 0).normalize();
  // 수평 진행 방향을 지형면에 투영
  _fwd.set(Math.sin(dyn.heading), 0, Math.cos(dyn.heading));
  _fwd.addScaledVector(_up, -_fwd.dot(_up)).normalize();
  // 오른손 좌표계: right = up × forward, forward 재직교
  _right.crossVectors(_up, _fwd).normalize();
  _fwd.crossVectors(_right, _up).normalize();
  // 차 로컬축: +X=right, +Y=up(천장), +Z=forward
  _basis.makeBasis(_right, _up, _fwd);
  group.quaternion.setFromRotationMatrix(_basis);
}
