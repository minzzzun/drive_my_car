// ══════════════════════════════════════════════════════════════
// mission.js — 배송 미션 상태기계 (순수, Three.js 비의존)
//
// 유로트럭식: pickup(적재지) 도착 → 적재 → dropoff(목적지) 도착 → 하차.
// job 들을 순차로 처리. 시간 제한·채점·감점·게임오버 없음(도달만이 진행).
// scoring.js 와 동일 스타일: {x,z} 숫자만 다루는 불변(immutable) 갱신.
// ══════════════════════════════════════════════════════════════

// 목표 도달 판정 반경(m). strict `<` 비교(경계 = 미도착).
export const ARRIVE_RADIUS = 6;

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

// 한 스텝 전진 — carPos={x,z}. 도착이면 phase 전이(불변 갱신). ─────
//   반환: { state, event }   event ∈ null | 'pickedUp' | 'delivered' | 'allDone'
export function stepMission(state, carPos) {
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
  if (nextIndex < state.jobs.length) {
    return {
      state: { ...state, index: nextIndex, phase: 'toPickup', hasCargo: false, completed },
      event: 'delivered',
    };
  }
  // 모든 job 소진 → done (allDone 우선)
  return {
    state: { ...state, index: nextIndex, phase: 'done', hasCargo: false, completed },
    event: 'allDone',
  };
}

// 배송 지점 배열 → job 배열 (결정론). ────────────────────────────
//   기본(체이닝): points N개 → N-1 job, job[i]={pickup:points[i], dropoff:points[i+1]}
//   opts.mode:'pairs' → floor(N/2) job (비겹침 쌍 (p0→p1),(p2→p3),...)
export function jobsFromPoints(points, opts = {}) {
  const pts = points ?? [];
  const jobs = [];
  if (opts.mode === 'pairs') {
    for (let i = 0; i + 1 < pts.length; i += 2) {
      jobs.push({ pickup: pts[i], dropoff: pts[i + 1] });
    }
  } else {
    for (let i = 0; i + 1 < pts.length; i++) {
      jobs.push({ pickup: pts[i], dropoff: pts[i + 1] });
    }
  }
  return jobs;
}
