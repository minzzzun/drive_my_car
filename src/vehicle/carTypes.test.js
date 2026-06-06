// ══════════════════════════════════════════════════════════════
// carTypes.js 단위 테스트 (M13a — 차종 코어: 데이터 + 파라미터 주입)
//
// ⚠️ TDD RED 단계: 아래 모듈/시그니처는 아직 구현되지 않았다.
//    설계노트(mds/design/cartypes.md §1·§2·§6)를 근거로 한 가정 시그니처:
//
//    [carTypes.js — 순수 모듈, THREE 비의존]
//      export const CAR_TYPES = { sedan:{...}, truck:{...} };
//      export const DEFAULT_CAR_ID = 'sedan';
//      export function getCarType(id)   // CAR_TYPES[id] ?? CAR_TYPES[DEFAULT_CAR_ID]
//      export function listCarTypes()   // [{id,label}, ...] 2개
//      각 차종 = { id, label,
//        perf: { accelBase, gearTopFactor, rollingResist, brakeDecel,
//                maxSteerRate, turnFullSpeed, cornerRollK },          // 7키
//        mesh: { bodyLen, bodyWidth, bodyHeight, cabinLen, cabinWidth, cabinHeight,
//                cabinOffsetZ, wheelRadius, wheelWidth, wheelBaseHalf, trackHalf,
//                eyeHeight, bodyColor, cabinColor, wheelColor } }
//
//    [vehicle.js — 방안 A 주입]
//      createVehicle(spawn, carParams)  // 2번째 인자 = 차종 perf (미지정 시 LEGACY=현 상수)
//      stepVehicle 은 v.car(=carParams)를 읽어 가속/조향에 반영
//
//    회귀 0: createVehicle(spawn) (carParams 없이) 호출은 기존 ACCEL_BASE 등
//    현행 모듈 상수와 동일하게 동작해야 한다(설계 §2.2 LEGACY_CAR).
// ══════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { CAR_TYPES, DEFAULT_CAR_ID, getCarType, listCarTypes } from './carTypes.js';
import { createVehicle, stepVehicle } from './vehicle.js';

const flat = () => 0; // 평지 mock
const NEUTRAL = { throttle: 0, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false };

const PERF_KEYS = [
  'accelBase', 'gearTopFactor', 'rollingResist', 'brakeDecel',
  'maxSteerRate', 'turnFullSpeed', 'cornerRollK',
];
const MESH_KEYS = [
  'bodyLen', 'bodyWidth', 'bodyHeight',
  'cabinLen', 'cabinWidth', 'cabinHeight', 'cabinOffsetZ',
  'wheelRadius', 'wheelWidth', 'wheelBaseHalf', 'trackHalf',
  'eyeHeight', 'bodyColor', 'cabinColor', 'wheelColor',
];

// ──────────────────────────────────────────────────────────────
// 1. 데이터 유효성 (설계 §6 데이터 유효성)
// ──────────────────────────────────────────────────────────────
describe('CAR_TYPES 레지스트리', () => {
  it('2종(sedan/truck)이 존재한다', () => {
    expect(CAR_TYPES.sedan).toBeDefined();
    expect(CAR_TYPES.truck).toBeDefined();
    expect(Object.keys(CAR_TYPES).sort()).toEqual(['sedan', 'truck']);
  });

  it('기본 차종 id 는 sedan', () => {
    expect(DEFAULT_CAR_ID).toBe('sedan');
  });

  for (const id of ['sedan', 'truck']) {
    describe(`차종 ${id}`, () => {
      it('id/label/perf/mesh 필수 필드 보유', () => {
        const c = CAR_TYPES[id];
        expect(c.id).toBe(id);
        expect(typeof c.label).toBe('string');
        expect(c.label.length).toBeGreaterThan(0);
        expect(typeof c.perf).toBe('object');
        expect(typeof c.mesh).toBe('object');
      });

      it('perf 필수 7키가 유한 숫자', () => {
        const p = CAR_TYPES[id].perf;
        for (const k of PERF_KEYS) {
          expect(typeof p[k], `perf.${k}`).toBe('number');
          expect(Number.isFinite(p[k]), `perf.${k} 유한`).toBe(true);
        }
      });

      it('mesh 필수 치수/eyeHeight/color 키가 유한 숫자', () => {
        const m = CAR_TYPES[id].mesh;
        for (const k of MESH_KEYS) {
          expect(typeof m[k], `mesh.${k}`).toBe('number');
          expect(Number.isFinite(m[k]), `mesh.${k} 유한`).toBe(true);
        }
        // 핵심 치수는 양수
        expect(m.bodyLen).toBeGreaterThan(0);
        expect(m.bodyWidth).toBeGreaterThan(0);
        expect(m.wheelRadius).toBeGreaterThan(0);
        expect(m.eyeHeight).toBeGreaterThan(0);
      });
    });
  }
});

describe('getCarType', () => {
  it('알려진 id 를 그대로 반환', () => {
    expect(getCarType('truck').id).toBe('truck');
    expect(getCarType('sedan').id).toBe('sedan');
  });
  it('미지의 id 는 기본값(sedan)으로 폴백', () => {
    expect(getCarType('spaceship').id).toBe(DEFAULT_CAR_ID);
    expect(getCarType(undefined).id).toBe(DEFAULT_CAR_ID);
  });
});

describe('listCarTypes', () => {
  it('{id,label} 2개를 반환', () => {
    const list = listCarTypes();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
    const ids = list.map((e) => e.id).sort();
    expect(ids).toEqual(['sedan', 'truck']);
    for (const e of list) {
      expect(typeof e.id).toBe('string');
      expect(typeof e.label).toBe('string');
    }
  });
});

// ──────────────────────────────────────────────────────────────
// 2. 상대 단조성 (설계 §1.3 잠정 수치 의도: 트럭=느림/둔함/큼)
// ──────────────────────────────────────────────────────────────
describe('상대 성능 단조성 (데이터)', () => {
  const sedan = CAR_TYPES.sedan;
  const truck = CAR_TYPES.truck;

  it('가속: truck < sedan (트럭이 더 굼뜸)', () => {
    expect(truck.perf.accelBase).toBeLessThan(sedan.perf.accelBase);
  });

  it('무게감: truck 의 구름저항 > sedan (가속 후 잘 안 빠짐)', () => {
    expect(truck.perf.rollingResist).toBeGreaterThan(sedan.perf.rollingResist);
  });

  it('제동: truck 의 brakeDecel < sedan (무거워 잘 안 섬)', () => {
    expect(truck.perf.brakeDecel).toBeLessThan(sedan.perf.brakeDecel);
  });

  it('최고속 배율: truck.gearTopFactor < sedan', () => {
    expect(truck.perf.gearTopFactor).toBeLessThan(sedan.perf.gearTopFactor);
  });

  it('조향 둔함: truck.maxSteerRate < sedan (회전반경 큼)', () => {
    expect(truck.perf.maxSteerRate).toBeLessThan(sedan.perf.maxSteerRate);
  });

  it('저속 조향 둔함: truck.turnFullSpeed > sedan (저속서 둔함)', () => {
    expect(truck.perf.turnFullSpeed).toBeGreaterThan(sedan.perf.turnFullSpeed);
  });

  it('코너 롤: truck.cornerRollK > sedan (차고 높아 기우뚱)', () => {
    expect(truck.perf.cornerRollK).toBeGreaterThan(sedan.perf.cornerRollK);
  });

  it('차체 크기: truck.mesh 가 sedan 보다 큼', () => {
    expect(truck.mesh.bodyLen).toBeGreaterThan(sedan.mesh.bodyLen);
    expect(truck.mesh.bodyWidth).toBeGreaterThan(sedan.mesh.bodyWidth);
    expect(truck.mesh.wheelRadius).toBeGreaterThan(sedan.mesh.wheelRadius);
  });

  it('운전석 시야: truck.eyeHeight > sedan', () => {
    expect(truck.mesh.eyeHeight).toBeGreaterThan(sedan.mesh.eyeHeight);
  });
});

// ──────────────────────────────────────────────────────────────
// 3. 차종 파라미터 주입 동작 (설계 §2 방안 A, §6 stepVehicle 차이)
// ──────────────────────────────────────────────────────────────

// 주어진 perf 로 차량을 만들어 시동→1단까지 진행한 상태 반환
function engagedWith(perf) {
  let v = createVehicle({ x: 0, z: 0 }, perf);
  v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat);          // 시동
  v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: 1 }, 0.05, flat); // N→1
  return v;
}

describe('차종별 가속 차이 (주입)', () => {
  it('동일 입력/스텝수에서 sedan.speed > truck.speed', () => {
    let sedan = engagedWith(CAR_TYPES.sedan.perf);
    let truck = engagedWith(CAR_TYPES.truck.perf);

    const drive = { throttle: 1, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false };
    for (let i = 0; i < 50; i++) {
      sedan = stepVehicle(sedan, drive, 0.05, flat);
      truck = stepVehicle(truck, drive, 0.05, flat);
    }
    expect(sedan.on).toBe(true);
    expect(truck.on).toBe(true);
    expect(sedan.speed).toBeGreaterThan(0);
    expect(truck.speed).toBeGreaterThan(0);
    expect(sedan.speed).toBeGreaterThan(truck.speed); // 승용차 가속 우위
  });
});

describe('차종별 조향 차이 (주입, 선택)', () => {
  it('동일 속도에서 truck 의 heading 변화량 ≤ sedan', () => {
    let sedan = engagedWith(CAR_TYPES.sedan.perf);
    let truck = engagedWith(CAR_TYPES.truck.perf);

    // 먼저 직진 가속으로 어느 정도 속도 확보
    const drive = { throttle: 1, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false };
    for (let i = 0; i < 40; i++) {
      sedan = stepVehicle(sedan, drive, 0.05, flat);
      truck = stepVehicle(truck, drive, 0.05, flat);
    }
    const sedanH0 = sedan.dyn.heading;
    const truckH0 = truck.dyn.heading;

    // 동일 steer 입력으로 조향
    const turn = { throttle: 1, brake: 0, clutchPedal: 0, steer: 1, shift: 0, ignition: false };
    for (let i = 0; i < 20; i++) {
      sedan = stepVehicle(sedan, turn, 0.05, flat);
      truck = stepVehicle(truck, turn, 0.05, flat);
    }
    const sedanTurn = Math.abs(sedan.dyn.heading - sedanH0);
    const truckTurn = Math.abs(truck.dyn.heading - truckH0);
    expect(truckTurn).toBeLessThanOrEqual(sedanTurn); // 트럭이 덜 꺾임
  });
});

// ──────────────────────────────────────────────────────────────
// 4. 회귀 0 (설계 §2.2 — carParams 미지정 = LEGACY 현 상수)
// ──────────────────────────────────────────────────────────────
describe('회귀 — carParams 없이 createVehicle (LEGACY 기본값)', () => {
  it('기존 출발 시나리오가 그대로 동작(전진 가속·엔진 유지)', () => {
    let v = createVehicle(); // ← carParams 미지정
    v = stepVehicle(v, { ...NEUTRAL, ignition: true }, 0.05, flat);
    v = stepVehicle(v, { ...NEUTRAL, clutchPedal: 1, shift: 1 }, 0.05, flat);
    for (let i = 0; i < 40; i++) {
      v = stepVehicle(v, { throttle: 0.8, brake: 0, clutchPedal: 0.6, steer: 0, shift: 0, ignition: false }, 0.05, flat);
    }
    expect(v.on).toBe(true);
    expect(v.stalled).toBe(false);
    expect(v.speed).toBeGreaterThan(0);
    expect(v.dyn.z).toBeGreaterThan(0);
  });

  it('LEGACY 기본값 차량과 sedan perf 주입 차량은 가속이 동일하지 않다(주입 효과 확인)', () => {
    // LEGACY(ACCEL_BASE=9)와 sedan(accelBase=10 등)은 수치가 달라 결과가 갈려야 한다.
    let legacy = createVehicle({ x: 0, z: 0 });
    legacy = stepVehicle(legacy, { ...NEUTRAL, ignition: true }, 0.05, flat);
    legacy = stepVehicle(legacy, { ...NEUTRAL, clutchPedal: 1, shift: 1 }, 0.05, flat);
    let sedan = engagedWith(CAR_TYPES.sedan.perf);

    const drive = { throttle: 1, brake: 0, clutchPedal: 0, steer: 0, shift: 0, ignition: false };
    for (let i = 0; i < 50; i++) {
      legacy = stepVehicle(legacy, drive, 0.05, flat);
      sedan = stepVehicle(sedan, drive, 0.05, flat);
    }
    expect(legacy.speed).toBeGreaterThan(0);
    expect(sedan.speed).toBeGreaterThan(0);
    expect(sedan.speed).not.toBeCloseTo(legacy.speed, 5); // 주입이 실제로 반영됨
  });
});
