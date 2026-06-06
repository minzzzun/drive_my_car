// render/carMesh.js 단위 테스트 (M6, M13b) — THREE 객체는 WebGL 없이 생성 가능
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCar, updateCarTransform, setCargo } from './carMesh.js';
import { CAR_TYPES } from '../vehicle/carTypes.js';

// ── M13b 테스트 헬퍼 ───────────────────────────────────────────
// buildCar 가 Group(섀시 Box + 캐빈 Box + 바퀴 Cylinder 4)을 반환한다는
// 현재 구성을 전제로 부품을 geometry 타입으로 식별한다. (설계 §3은 메시에
// name 부여를 제안하나, 회귀 안전을 위해 name 무관하게 동작하도록 작성.)
//   - 섀시 = 첫 번째 BoxGeometry 메시
//   - 캐빈 = 두 번째 BoxGeometry 메시
//   - 바퀴 = 모든 CylinderGeometry 메시
// name 기반 구현으로 바뀌면(car.getObjectByName('chassis') 등) 이 헬퍼를
// name 우선으로 교체하면 된다.
function carParts(car) {
  const boxes = car.children.filter(
    (c) => c.geometry instanceof THREE.BoxGeometry,
  );
  const wheels = car.children.filter(
    (c) => c.geometry instanceof THREE.CylinderGeometry,
  );
  // name 이 부여돼 있으면 우선 사용, 없으면 순서/타입으로 폴백.
  const chassis = car.getObjectByName?.('chassis') ?? boxes[0];
  const cabin = car.getObjectByName?.('cabin') ?? boxes[1];
  return { chassis, cabin, wheels };
}

// 기대 시그니처(가정): buildCar(carType?)
//   - carType 은 carTypes 의 mesh 객체(예: CAR_TYPES.truck.mesh) 또는
//     설계 §3의 머지 규칙(`carType.mesh ?? carType`)상 mesh 를 품은 차종 객체.
//   - 본 테스트는 mesh 객체를 직접 넘긴다(현재 buildCar(opts) 시그니처와도 호환).
//   - 인자 미지정 시 DEFAULT_MESH(=현재 하드코딩 치수)로 기존 외형 유지.

describe('buildCar', () => {
  it('THREE.Group 을 반환하고 섀시+캐빈+바퀴4 = 6개 이상', () => {
    const car = buildCar();
    expect(car).toBeInstanceOf(THREE.Group);
    expect(car.children.length).toBeGreaterThanOrEqual(6);
  });

  // ── M13b: 차종 메시 파라미터화 ───────────────────────────────
  it('인자 없이 호출 시 기존 기본 외형(현재 하드코딩 치수) 유지 — 회귀 0', () => {
    const car = buildCar();
    const { chassis, cabin, wheels } = carParts(car);
    // 섀시: BoxGeometry(2, 0.5, 4) (width, height, depth)
    expect(chassis.geometry.parameters.width).toBeCloseTo(2, 6);
    expect(chassis.geometry.parameters.height).toBeCloseTo(0.5, 6);
    expect(chassis.geometry.parameters.depth).toBeCloseTo(4, 6);
    // 캐빈: BoxGeometry(1.5, 0.8, 1.2)
    expect(cabin.geometry.parameters.width).toBeCloseTo(1.5, 6);
    expect(cabin.geometry.parameters.height).toBeCloseTo(0.8, 6);
    expect(cabin.geometry.parameters.depth).toBeCloseTo(1.2, 6);
    // 바퀴 반경 0.3, 4개
    expect(wheels).toHaveLength(4);
    for (const w of wheels) {
      expect(w.geometry.parameters.radiusTop).toBeCloseTo(0.3, 6);
    }
  });

  it('트럭 차체 치수(길이/폭/높이)가 승용차보다 크다', () => {
    const sedan = carParts(buildCar(CAR_TYPES.sedan.mesh));
    const truck = carParts(buildCar(CAR_TYPES.truck.mesh));
    // bodyLen → BoxGeometry depth (전진 +Z), bodyWidth → width, bodyHeight → height
    expect(truck.chassis.geometry.parameters.depth).toBeGreaterThan(
      sedan.chassis.geometry.parameters.depth,
    );
    expect(truck.chassis.geometry.parameters.width).toBeGreaterThan(
      sedan.chassis.geometry.parameters.width,
    );
    expect(truck.chassis.geometry.parameters.height).toBeGreaterThan(
      sedan.chassis.geometry.parameters.height,
    );
  });

  it('차체 치수가 carTypes.mesh 값을 그대로 반영한다', () => {
    const m = CAR_TYPES.truck.mesh;
    const { chassis } = carParts(buildCar(m));
    expect(chassis.geometry.parameters.width).toBeCloseTo(m.bodyWidth, 6);
    expect(chassis.geometry.parameters.height).toBeCloseTo(m.bodyHeight, 6);
    expect(chassis.geometry.parameters.depth).toBeCloseTo(m.bodyLen, 6);
  });

  it('트럭 바퀴 반경이 승용차보다 크고 carTypes.mesh.wheelRadius 를 반영한다', () => {
    const sedan = carParts(buildCar(CAR_TYPES.sedan.mesh));
    const truck = carParts(buildCar(CAR_TYPES.truck.mesh));
    const sedanR = sedan.wheels[0].geometry.parameters.radiusTop;
    const truckR = truck.wheels[0].geometry.parameters.radiusTop;
    expect(truckR).toBeGreaterThan(sedanR);
    expect(sedanR).toBeCloseTo(CAR_TYPES.sedan.mesh.wheelRadius, 6);
    expect(truckR).toBeCloseTo(CAR_TYPES.truck.mesh.wheelRadius, 6);
  });

  it('바퀴 Y 위치가 바퀴 반경에 연동된다 (큰 바퀴일수록 더 위로 → 땅에 안 묻힘)', () => {
    const sedan = carParts(buildCar(CAR_TYPES.sedan.mesh));
    const truck = carParts(buildCar(CAR_TYPES.truck.mesh));
    // 반경이 큰 트럭 바퀴의 중심 Y 가 승용차보다 높아야 바닥에 묻히지 않는다.
    const sedanY = sedan.wheels[0].position.y;
    const truckY = truck.wheels[0].position.y;
    expect(truckY).toBeGreaterThan(sedanY);
  });
});

// ── M16a: 화물 시각화 ───────────────────────────────────────────
// 기대 시그니처(설계 m16-cargo-bigmap.md §"화물 시각화" 기준 가정):
//   - buildCar(carType) 가 name='cargo' 인 child(BoxGeometry MeshPhong)를
//     추가하고, 기본 visible=false(픽업 전이라 안 보임)로 둔다.
//   - setCargo(car, visible) — carMesh.js 의 named export.
//       car.getObjectByName('cargo').visible = !!visible 로 토글.
//   - 화물 크기/위치(설계 산출식, 차종 mesh 치수 기준):
//       cargoW = bodyWidth * 0.7
//       cargoD = bodyLen   * 0.38   (BoxGeometry depth)
//       cargoH = max(0.5, bodyHeight * 1.1)
//       cargoZ = -sign(cabinOffsetZ) * bodyLen * 0.18  (sign(0)=+1)
//                → 캐빈 반대편 섀시 위에 얹힘.
function cargoOf(car) {
  return car.getObjectByName('cargo');
}

describe('buildCar 화물(cargo) child', () => {
  it("name='cargo' child 를 가지며 기본 visible=false (픽업 전)", () => {
    const car = buildCar(CAR_TYPES.truck.mesh);
    const cargo = cargoOf(car);
    expect(cargo).toBeDefined();
    expect(cargo.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(cargo.visible).toBe(false);
  });

  it('cargo child 가 늘어도 children.length >= 6 유지 — 회귀 0', () => {
    const car = buildCar();
    // 섀시1 + 캐빈1 + 바퀴4 + 화물1 = 7 (>=6)
    expect(car.children.length).toBeGreaterThanOrEqual(6);
    expect(cargoOf(car)).toBeDefined();
  });

  it('트럭 화물 박스가 승용차보다 크다 (width/depth/height 모두)', () => {
    const sedanCargo = cargoOf(buildCar(CAR_TYPES.sedan.mesh));
    const truckCargo = cargoOf(buildCar(CAR_TYPES.truck.mesh));
    expect(truckCargo.geometry.parameters.width).toBeGreaterThan(
      sedanCargo.geometry.parameters.width,
    );
    expect(truckCargo.geometry.parameters.depth).toBeGreaterThan(
      sedanCargo.geometry.parameters.depth,
    );
    expect(truckCargo.geometry.parameters.height).toBeGreaterThan(
      sedanCargo.geometry.parameters.height,
    );
  });

  it('화물 크기가 차종 mesh 비례(설계 산출식)를 따른다', () => {
    const m = CAR_TYPES.truck.mesh;
    const cargo = cargoOf(buildCar(m));
    expect(cargo.geometry.parameters.width).toBeCloseTo(m.bodyWidth * 0.7, 6);
    expect(cargo.geometry.parameters.depth).toBeCloseTo(m.bodyLen * 0.38, 6);
    expect(cargo.geometry.parameters.height).toBeCloseTo(
      Math.max(0.5, m.bodyHeight * 1.1),
      6,
    );
  });

  it('화물 z 위치가 캐빈 반대편(cabinOffsetZ 부호 반대)에 있다', () => {
    // sedan: cabinOffsetZ<0 → cargoZ>0
    const sedanCargo = cargoOf(buildCar(CAR_TYPES.sedan.mesh));
    expect(CAR_TYPES.sedan.mesh.cabinOffsetZ).toBeLessThan(0);
    expect(sedanCargo.position.z).toBeGreaterThan(0);
    // truck: cabinOffsetZ>0 → cargoZ<0
    const truckCargo = cargoOf(buildCar(CAR_TYPES.truck.mesh));
    expect(CAR_TYPES.truck.mesh.cabinOffsetZ).toBeGreaterThan(0);
    expect(truckCargo.position.z).toBeLessThan(0);
  });

  it('화물 y 중심이 섀시 윗면 위(= bodyHeight-0.05 + cargoH/2)', () => {
    const m = CAR_TYPES.truck.mesh;
    const cargo = cargoOf(buildCar(m));
    const cargoH = Math.max(0.5, m.bodyHeight * 1.1);
    expect(cargo.position.y).toBeCloseTo(m.bodyHeight - 0.05 + cargoH / 2, 6);
  });
});

describe('setCargo', () => {
  it('setCargo(car, true) → cargo.visible=true, false → false (idempotent)', () => {
    const car = buildCar(CAR_TYPES.truck.mesh);
    expect(cargoOf(car).visible).toBe(false);
    setCargo(car, true);
    expect(cargoOf(car).visible).toBe(true);
    setCargo(car, true); // 반복 호출도 안전
    expect(cargoOf(car).visible).toBe(true);
    setCargo(car, false);
    expect(cargoOf(car).visible).toBe(false);
    setCargo(car, false);
    expect(cargoOf(car).visible).toBe(false);
  });

  it('truthy/falsy 인자를 boolean 으로 정규화', () => {
    const car = buildCar();
    setCargo(car, 1);
    expect(cargoOf(car).visible).toBe(true);
    setCargo(car, 0);
    expect(cargoOf(car).visible).toBe(false);
  });
});

describe('updateCarTransform', () => {
  it('위치 설정 + 평지에서 heading 방향(local +Z)이 (sin h, 0, cos h)', () => {
    const car = buildCar();
    updateCarTransform(car, { x: 5, y: 2, z: -3, heading: Math.PI / 2 }, { x: 0, y: 1, z: 0 });
    expect(car.position.x).toBeCloseTo(5, 6);
    expect(car.position.y).toBeCloseTo(2, 6);
    expect(car.position.z).toBeCloseTo(-3, 6);
    // 차 정면(local +Z) → 월드 (sin90,0,cos90)=(1,0,0)
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(car.quaternion);
    expect(f.x).toBeCloseTo(1, 5);
    expect(f.z).toBeCloseTo(0, 5);
    // 차 천장(local +Y) → up (0,1,0)
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion);
    expect(u.y).toBeCloseTo(1, 5);
  });

  it('천장축(up)이 주어진 지형 법선을 향한다', () => {
    const car = buildCar();
    const up = new THREE.Vector3(0.3, 1, 0).normalize();
    updateCarTransform(car, { x: 0, y: 0, z: 0, heading: 0 }, up);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion);
    expect(u.x).toBeCloseTo(up.x, 5);
    expect(u.y).toBeCloseTo(up.y, 5);
    expect(u.z).toBeCloseTo(up.z, 5);
  });
});
