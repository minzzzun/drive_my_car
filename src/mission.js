// ══════════════════════════════════════════════════════════════
// mission.js — 배송 미션 상태기계 (순수, Three.js 비의존)
//
// 유로트럭식: pickup(적재지) 도착 → 적재 → dropoff(목적지) 도착 → 하차.
// job 들을 순차로 처리. 시간 제한·채점·감점·게임오버 없음(도달만이 진행).
// scoring.js 와 동일 스타일: {x,z} 숫자만 다루는 불변(immutable) 갱신.
// M17: 화물 종류·운임·누적 수익(earnings)·경로 다양화(mode:'mixed') 추가.
// ══════════════════════════════════════════════════════════════
import { cargoFor } from './cargoTypes.js';

// 목표 도달 판정 반경(m). strict `<` 비교(경계 = 미도착).
export const ARRIVE_RADIUS = 6;

// 운임 공식(M17, 순수·결정론) ────────────────────────────────────
//   FARE_BASE = 기본 출장비(거리 0이라도 받는 최소 운임 성격).
export const FARE_BASE = 3000;

// pickup↔dropoff 직선거리(m).
export function jobDistance(job) {
  return Math.hypot(job.dropoff.x - job.pickup.x, job.dropoff.z - job.pickup.z);
}

// 운임 = round(기본 + 거리 × 화물계수). 거리·계수 클수록 운임↑.
export function computeFare(distanceM, baseRate) {
  return Math.round(FARE_BASE + distanceM * baseRate);
}

// job 보강(멱등) — cargo/distance/fare 부여. 이미 있으면 그대로 둔다.
//   pickup/dropoff 원본 좌표 객체는 변형하지 않고 그대로 spread(회귀 보호).
export function enrichJob(job) {
  const cargo = job.cargo ?? cargoFor(job.pickup, job.dropoff);
  const distance = job.distance ?? jobDistance(job);
  const fare = job.fare ?? computeFare(distance, cargo.baseRate);
  return { ...job, cargo, distance, fare };
}

// 결정론 순열(고정 시드 LCG) — 같은 N → 같은 순서.
function deterministicOrder(n, seed = 1) {
  const idx = [...Array(n).keys()];
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;   // LCG
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

// 적재/하차 가능 최대 속도(m/s). 이보다 빠르면 "정차 안 함"으로 보고 적재/하차 보류.
export const STOP_SPEED = 0.5;

// 미션 생성 — jobs 비면 즉시 done. ────────────────────────────────
//   job: { pickup: {x,z,label}, dropoff: {x,z,label} }
export function createMission(jobs) {
  const list = jobs ?? [];
  return {
    jobs: list,
    index: 0,
    phase: list.length === 0 ? 'done' : 'toPickup',
    hasCargo: false,
    completed: 0,
    total: list.length,
    earnings: 0,   // M17: 누적 수익(₩). delivered/allDone 시 해당 job.fare 가산.
  };
}

// 현재 목표점 — done 이면 null. ──────────────────────────────────
//   → { x, z, phase, label }   (phase: 'toPickup' | 'toDropoff')
export function currentTarget(state) {
  if (state.phase === 'done') return null;
  const job = state.jobs[state.index];
  if (!job) return null;
  const t = state.phase === 'toPickup' ? job.pickup : job.dropoff;
  return { x: t.x, z: t.z, phase: state.phase, label: t.label };
}

// 한 스텝 전진 — carPos={x,z}, opts.speed=차량 속도(m/s, 기본 0=정차). ─
//   적재/하차는 목표 반경 안 + **정차(|speed|<=STOP_SPEED)** 일 때만 일어난다.
//   반환: { state, event }   event ∈ null | 'pickedUp' | 'delivered' | 'allDone'
export function stepMission(state, carPos, opts = {}) {
  // done 이면 no-op (새 객체 반환, 입력 미변형)
  if (state.phase === 'done') {
    return { state: { ...state }, event: null };
  }

  const t = currentTarget(state);
  if (!t) return { state: { ...state }, event: null };

  // 도착 판정 — strict `<` (경계 = 미도착)
  const dist = Math.hypot(carPos.x - t.x, carPos.z - t.z);
  if (dist >= ARRIVE_RADIUS) {
    return { state: { ...state }, event: null };
  }

  // 정차해야만 적재/하차 가능 — 너무 빠르면 보류(반경 안이어도 전이 없음)
  const speed = opts.speed ?? 0;
  if (Math.abs(speed) > STOP_SPEED) {
    return { state: { ...state }, event: null };
  }

  // ── 적재지 도착 → 적재 → 배송지 단계로 ──
  if (state.phase === 'toPickup') {
    return {
      state: { ...state, phase: 'toDropoff', hasCargo: true },
      event: 'pickedUp',
    };
  }

  // ── 배송지 도착 → 하차 → 다음 job 또는 전체 완료 ──
  const completed = state.completed + 1;
  const nextIndex = state.index + 1;
  // 방금 완료한 job 의 운임 — 구 job(fare 미정의)은 0 가산(설계 §7 ?? 가드).
  const fare = state.jobs[state.index]?.fare ?? 0;
  const earnings = (state.earnings ?? 0) + fare;
  if (nextIndex < state.jobs.length) {
    return {
      state: { ...state, index: nextIndex, phase: 'toPickup', hasCargo: false, completed, earnings },
      event: 'delivered',
      fare,
    };
  }
  // 모든 job 소진 → done (allDone 우선)
  return {
    state: { ...state, index: nextIndex, phase: 'done', hasCargo: false, completed, earnings },
    event: 'allDone',
    fare,
  };
}

// 배송 지점 배열 → job 배열 (결정론). ────────────────────────────
//   기본(체이닝): points N개 → N-1 job, job[i]={pickup:points[i], dropoff:points[i+1]}
//   opts.mode:'pairs' → floor(N/2) job (비겹침 쌍 (p0→p1),(p2→p3),...)
//   opts.mode:'mixed' → floor(N/2) job (결정론 셔플 쌍 — 거리 편차↑)
//   결과는 enrichJob 으로 cargo/distance/fare 부여(결정론).
export function jobsFromPoints(points, opts = {}) {
  const pts = points ?? [];
  const jobs = [];
  if (opts.mode === 'mixed') {
    const order = deterministicOrder(pts.length);
    for (let i = 0; i + 1 < order.length; i += 2) {
      jobs.push({ pickup: pts[order[i]], dropoff: pts[order[i + 1]] });
    }
  } else if (opts.mode === 'pairs') {
    for (let i = 0; i + 1 < pts.length; i += 2) {
      jobs.push({ pickup: pts[i], dropoff: pts[i + 1] });
    }
  } else {
    for (let i = 0; i + 1 < pts.length; i++) {
      jobs.push({ pickup: pts[i], dropoff: pts[i + 1] });
    }
  }
  return jobs.map(enrichJob);   // cargo/distance/fare 부여(결정론)
}
