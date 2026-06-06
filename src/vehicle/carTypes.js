// ══════════════════════════════════════════════════════════════
// carTypes.js — 차종 2종(승용차/트럭) 데이터 레지스트리 (순수 모듈)
//
// THREE 비의존: perf(성능치) / mesh(외형 치수·색)를 모두 평범한 숫자로만 둔다.
//   perf 7키 = vehicle/dynamics 모듈 상수와 1:1 (+ 신규 gearTopFactor)
//   mesh 키  = 차체/캐빈/바퀴 치수 + 운전석 눈높이 + 색(0xRRGGBB)
//
// 상대 단조성(설계 §1.3): 트럭=느림/둔함/큼/높음, 승용차=빠름/민첩/작음.
// ══════════════════════════════════════════════════════════════

export const CAR_TYPES = {
  sedan: {
    id: 'sedan',
    label: '승용차',
    perf: {
      accelBase: 10,
      gearTopFactor: 1.05,
      rollingResist: 0.07,
      brakeDecel: 13,
      maxSteerRate: 1.35,
      turnFullSpeed: 7,
      cornerRollK: 0.05,
    },
    mesh: {
      bodyLen: 4.0, bodyWidth: 1.9, bodyHeight: 0.5,
      cabinLen: 1.4, cabinWidth: 1.5, cabinHeight: 0.7, cabinOffsetZ: -0.3,
      wheelRadius: 0.30, wheelWidth: 0.3, wheelBaseHalf: 1.3, trackHalf: 1.0,
      eyeHeight: 1.2,
      bodyColor: 0xcc2222, cabinColor: 0x2255cc, wheelColor: 0x222222,
    },
  },

  truck: {
    id: 'truck',
    label: '트럭',
    perf: {
      accelBase: 6,
      gearTopFactor: 0.85,
      rollingResist: 0.13,
      brakeDecel: 9,
      maxSteerRate: 0.85,
      turnFullSpeed: 11,
      cornerRollK: 0.09,
    },
    mesh: {
      bodyLen: 6.5, bodyWidth: 2.4, bodyHeight: 0.9,
      cabinLen: 1.8, cabinWidth: 2.2, cabinHeight: 1.3, cabinOffsetZ: 1.6,
      wheelRadius: 0.45, wheelWidth: 0.4, wheelBaseHalf: 2.2, trackHalf: 1.15,
      eyeHeight: 2.4,
      bodyColor: 0xf0a500, cabinColor: 0x2255cc, wheelColor: 0x222222,
    },
  },
};

export const DEFAULT_CAR_ID = 'sedan';

// 미지의 id 는 기본 차종(sedan)으로 폴백.
export function getCarType(id) {
  return CAR_TYPES[id] ?? CAR_TYPES[DEFAULT_CAR_ID];
}

// 선택 UI용 [{id, label}, ...].
export function listCarTypes() {
  return Object.values(CAR_TYPES).map(({ id, label }) => ({ id, label }));
}
