// ══════════════════════════════════════════════════════════════
// render/carMesh.js — 차량 메시 (test1 섀시+캐빈+바퀴 구성 참조)
// 그룹 원점 = 차량 중심. dyn(위치/heading/roll/pitch)으로 매 프레임 변환.
// M13b: 차종 mesh 치수/색으로 외형 파라미터화. 인자 없으면 DEFAULT_MESH(=현행).
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';

// 현재 하드코딩 치수와 동일 — 인자 없이 buildCar() 호출 시 기존 외형 그대로(회귀 0).
export const DEFAULT_MESH = {
  bodyLen: 4.0, bodyWidth: 2.0, bodyHeight: 0.5,
  cabinLen: 1.2, cabinWidth: 1.5, cabinHeight: 0.8, cabinOffsetZ: -0.3,
  wheelRadius: 0.3, wheelWidth: 0.3, wheelBaseHalf: 1.3, trackHalf: 1.0,
  eyeHeight: 1.2,
  bodyColor: 0xcc2222, cabinColor: 0x2255cc, wheelColor: 0x222222,
};

// carType 은 mesh 객체(예: CAR_TYPES.truck.mesh) 또는 mesh 를 품은 차종 객체.
export function buildCar(carType = {}) {
  const m = { ...DEFAULT_MESH, ...(carType.mesh ?? carType) };
  const car = new THREE.Group();

  // 섀시 (차 밑바닥) — 전진 +Z = 길이(bodyLen)
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(m.bodyWidth, m.bodyHeight, m.bodyLen),
    new THREE.MeshPhongMaterial({ color: m.bodyColor }),
  );
  chassis.name = 'chassis';
  chassis.position.y = m.bodyHeight / 2 - 0.05;  // 바닥 살짝 띄움
  car.add(chassis);

  // 캐빈 (운전석) — 섀시 위에 얹음
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(m.cabinWidth, m.cabinHeight, m.cabinLen),
    new THREE.MeshPhongMaterial({ color: m.cabinColor }),
  );
  cabin.name = 'cabin';
  cabin.position.set(0, m.bodyHeight + m.cabinHeight / 2 - 0.05, m.cabinOffsetZ);
  car.add(cabin);

  // 바퀴 4개 (실린더, x축 정렬) — Y 를 반경에 연동해 땅에 안 묻히게
  const wheelGeo = new THREE.CylinderGeometry(m.wheelRadius, m.wheelRadius, m.wheelWidth, 16);
  const wheelMat = new THREE.MeshPhongMaterial({ color: m.wheelColor });
  const wy = m.wheelRadius - 0.35;  // 반경 0.3 → -0.05(현행), 클수록 위로
  const wb = m.wheelBaseHalf;
  const tr = m.trackHalf;
  const wheelPos = [
    [-tr, wy,  wb], // 앞 좌
    [ tr, wy,  wb], // 앞 우
    [-tr, wy, -wb], // 뒤 좌
    [ tr, wy, -wb], // 뒤 우
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
