// ══════════════════════════════════════════════════════════════
// mission.test.js — 배송 미션 코어 단위 테스트 (M14a, TDD RED)
//
// 구현(src/mission.js, 그리고 두 맵의 getDeliveryPoints())은 아직 없다.
// 본 테스트는 설계노트 mds/design/delivery.md §1·§2·§7 의 스펙을 근거로
// 아래 export 시그니처를 **가정**한다. 구현 에이전트는 이 시그니처에 맞춘다.
//
// ── 가정한 export 시그니처 (delivery.md §1.2·§1.3·§2.4) ──────────
//   src/mission.js:
//     상수:
//       ARRIVE_RADIUS = 6            // 목표 도달 판정 반경(m). strict `<` 비교.
//     함수:
//       createMission(jobs)         // → state
//         · 초기: { jobs, index:0, phase:'toPickup', hasCargo:false,
//                   completed:0, total:jobs.length }
//         · jobs 비면 즉시 phase:'done'
//       currentTarget(state)        // → { x, z, phase, label } | null
//         · toPickup → 현재 job.pickup, phase:'toPickup'
//         · toDropoff → 현재 job.dropoff, phase:'toDropoff'
//         · done → null
//       stepMission(state, carPos)  // carPos={x,z} → { state, event }
//         · event ∈ null | 'pickedUp' | 'delivered' | 'allDone'
//         · 불변 갱신(입력 state 변형 금지, 새 객체 반환)
//         · 도착 판정: Math.hypot(dx,dz) < ARRIVE_RADIUS (경계 = 미도착)
//         · phase==='done' → no-op { state, event:null }
//       jobsFromPoints(points, opts={})  // → job[]
//         · 기본(체이닝): points N개 → N-1 job, job[i]={pickup:points[i], dropoff:points[i+1]}
//         · opts.mode:'pairs' → floor(N/2) job (비겹침 쌍)
//         · 결정론(같은 입력 → 같은 출력)
//
//   맵 getDeliveryPoints() (delivery.md §2.1):
//     getMap('natural').getDeliveryPoints() / getMap('city').getDeliveryPoints()
//       → [{ x, z, label }] (도로 위, 결정론, ≥4점)
//
// 모두 구현 전이므로 RED 가 정상이다.
// ══════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  ARRIVE_RADIUS,
  createMission,
  currentTarget,
  stepMission,
  jobsFromPoints,
} from './mission.js';
import { getMap } from './maps/index.js';

// 테스트용 job 빌더 — 픽업/드롭오프가 서로/스폰과 충분히 떨어지게 좌표 분리.
function mkJob(px, pz, dx, dz, plabel = 'P', dlabel = 'D') {
  return {
    pickup: { x: px, z: pz, label: plabel },
    dropoff: { x: dx, z: dz, label: dlabel },
  };
}

// 좌표에서 거리 R 만큼 떨어진 점(같은 x, z만 +R) → 도착/미도착 케이스 제어.
function at(p) { return { x: p.x, z: p.z }; }
function offset(p, d) { return { x: p.x + d, z: p.z }; }

describe('ARRIVE_RADIUS 상수', () => {
  it('설계값 6', () => {
    expect(ARRIVE_RADIUS).toBe(6);
  });
});

describe('createMission — 초기 상태', () => {
  it('job 1개: phase=toPickup, hasCargo=false, index=0, completed=0, total=1', () => {
    const jobs = [mkJob(0, 100, 0, 200)];
    const s = createMission(jobs);
    expect(s.phase).toBe('toPickup');
    expect(s.hasCargo).toBe(false);
    expect(s.index).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.total).toBe(1);
  });

  it('여러 job: total = jobs.length', () => {
    const jobs = [mkJob(0, 100, 0, 200), mkJob(0, 200, 0, 300), mkJob(0, 300, 0, 400)];
    const s = createMission(jobs);
    expect(s.total).toBe(3);
    expect(s.phase).toBe('toPickup');
  });

  it('빈 jobs → 즉시 phase=done', () => {
    const s = createMission([]);
    expect(s.phase).toBe('done');
  });
});

describe('currentTarget — phase 별 목표', () => {
  it('toPickup 단계에서 현재 job.pickup 반환(좌표/label/phase 포함)', () => {
    const jobs = [mkJob(10, 100, 20, 200, '북부창고', '남부역')];
    const s = createMission(jobs);
    const t = currentTarget(s);
    expect(t.x).toBe(10);
    expect(t.z).toBe(100);
    expect(t.label).toBe('북부창고');
    expect(t.phase).toBe('toPickup');
  });

  it('toDropoff 단계(적재 후)에서 현재 job.dropoff 반환', () => {
    const jobs = [mkJob(10, 100, 20, 200, '북부창고', '남부역')];
    let s = createMission(jobs);
    // 픽업 지점 도착 → toDropoff 로 전이
    s = stepMission(s, at(jobs[0].pickup)).state;
    const t = currentTarget(s);
    expect(t.x).toBe(20);
    expect(t.z).toBe(200);
    expect(t.label).toBe('남부역');
    expect(t.phase).toBe('toDropoff');
  });

  it('done 단계 → null', () => {
    const s = createMission([]);
    expect(currentTarget(s)).toBeNull();
  });
});

describe('stepMission — 픽업 전이', () => {
  it('픽업 지점 도착(거리<R) → event=pickedUp, hasCargo=true, phase=toDropoff', () => {
    const jobs = [mkJob(0, 100, 0, 200)];
    const s0 = createMission(jobs);
    const { state, event } = stepMission(s0, at(jobs[0].pickup));
    expect(event).toBe('pickedUp');
    expect(state.hasCargo).toBe(true);
    expect(state.phase).toBe('toDropoff');
    expect(state.index).toBe(0);       // 아직 같은 job
    expect(state.completed).toBe(0);
  });

  it('픽업 지점에서 멀면 event=null, 상태 불변(동등)', () => {
    const jobs = [mkJob(0, 100, 0, 200)];
    const s0 = createMission(jobs);
    const { state, event } = stepMission(s0, { x: 500, z: 500 });
    expect(event).toBeNull();
    expect(state).toEqual(s0);
  });
});

describe('stepMission — 드롭오프 전이 / 다음 job', () => {
  it('적재 후 드롭오프 도착 → event=delivered, completed+1, 다음 job phase=toPickup, hasCargo=false', () => {
    const jobs = [mkJob(0, 100, 0, 200), mkJob(0, 200, 0, 300)];
    let s = createMission(jobs);
    s = stepMission(s, at(jobs[0].pickup)).state;          // 적재
    const { state, event } = stepMission(s, at(jobs[0].dropoff)); // 하차
    expect(event).toBe('delivered');
    expect(state.completed).toBe(1);
    expect(state.index).toBe(1);          // 다음 job 으로
    expect(state.phase).toBe('toPickup');
    expect(state.hasCargo).toBe(false);
  });

  it('드롭오프 도착 후 currentTarget 은 다음 job 의 pickup', () => {
    const jobs = [mkJob(0, 100, 0, 200), mkJob(0, 200, 0, 300, '환승역', '종점')];
    let s = createMission(jobs);
    s = stepMission(s, at(jobs[0].pickup)).state;
    s = stepMission(s, at(jobs[0].dropoff)).state;
    const t = currentTarget(s);
    expect(t.label).toBe('환승역');
    expect(t.x).toBe(0);
    expect(t.z).toBe(200);
    expect(t.phase).toBe('toPickup');
  });
});

describe('stepMission — 전체 완료(allDone)', () => {
  it('마지막 job 배송 완료 → event=allDone, phase=done, completed=jobs.length', () => {
    const jobs = [mkJob(0, 100, 0, 200), mkJob(0, 200, 0, 300)];
    let s = createMission(jobs);
    // job0
    s = stepMission(s, at(jobs[0].pickup)).state;
    s = stepMission(s, at(jobs[0].dropoff)).state;
    // job1
    s = stepMission(s, at(jobs[1].pickup)).state;
    const { state, event } = stepMission(s, at(jobs[1].dropoff));
    expect(event).toBe('allDone');
    expect(state.phase).toBe('done');
    expect(state.completed).toBe(2);
    expect(state.completed).toBe(jobs.length);
  });

  it('done 상태에서 stepMission → no-op(event=null, 상태 동등)', () => {
    const jobs = [mkJob(0, 100, 0, 200)];
    let s = createMission(jobs);
    s = stepMission(s, at(jobs[0].pickup)).state;
    const done = stepMission(s, at(jobs[0].dropoff)).state;
    expect(done.phase).toBe('done');
    const after = stepMission(done, { x: 0, z: 0 });
    expect(after.event).toBeNull();
    expect(after.state).toEqual(done);
  });
});

describe('stepMission — pickup→dropoff 순서 강제', () => {
  it('toPickup 단계에서 dropoff 좌표에 먼저 가도 전이 없음(target=pickup)', () => {
    const jobs = [mkJob(0, 100, 0, 200)];
    const s0 = createMission(jobs);
    // dropoff 좌표로 이동했지만 현재 목표는 pickup → 미도착
    const { state, event } = stepMission(s0, at(jobs[0].dropoff));
    expect(event).toBeNull();
    expect(state).toEqual(s0);
    expect(state.phase).toBe('toPickup');
  });
});

describe('stepMission — ARRIVE_RADIUS 경계 (strict <)', () => {
  const jobs = [mkJob(0, 100, 0, 200)];

  it('거리 == ARRIVE_RADIUS → 미도착(event=null)', () => {
    const s0 = createMission(jobs);
    // pickup 에서 정확히 R 만큼 떨어진 점
    const { event } = stepMission(s0, offset(jobs[0].pickup, ARRIVE_RADIUS));
    expect(event).toBeNull();
  });

  it('거리 = R - ε → 도착(event=pickedUp)', () => {
    const s0 = createMission(jobs);
    const { event } = stepMission(s0, offset(jobs[0].pickup, ARRIVE_RADIUS - 1e-6));
    expect(event).toBe('pickedUp');
  });

  it('거리 = R + ε → 미도착', () => {
    const s0 = createMission(jobs);
    const { event } = stepMission(s0, offset(jobs[0].pickup, ARRIVE_RADIUS + 1e-6));
    expect(event).toBeNull();
  });
});

describe('stepMission — 불변성', () => {
  it('호출 후 입력 state 객체가 변형되지 않음(원본 phase/index/hasCargo 유지)', () => {
    const jobs = [mkJob(0, 100, 0, 200), mkJob(0, 200, 0, 300)];
    const s0 = createMission(jobs);
    const snapshot = { phase: s0.phase, index: s0.index, hasCargo: s0.hasCargo, completed: s0.completed };
    const { state } = stepMission(s0, at(jobs[0].pickup)); // 전이가 일어나는 호출
    // 원본은 그대로
    expect(s0.phase).toBe(snapshot.phase);
    expect(s0.index).toBe(snapshot.index);
    expect(s0.hasCargo).toBe(snapshot.hasCargo);
    expect(s0.completed).toBe(snapshot.completed);
    // 새 객체를 반환(참조 동일 아님)
    expect(state).not.toBe(s0);
  });
});

describe('jobsFromPoints — 체이닝(기본)', () => {
  const points = [
    { x: 0, z: 0, label: 'A' },
    { x: 10, z: 0, label: 'B' },
    { x: 20, z: 0, label: 'C' },
    { x: 30, z: 0, label: 'D' },
  ];

  it('N개 점 → N-1 job', () => {
    const jobs = jobsFromPoints(points);
    expect(jobs.length).toBe(points.length - 1);
  });

  it('job[i].pickup = points[i], job[i].dropoff = points[i+1]', () => {
    const jobs = jobsFromPoints(points);
    for (let i = 0; i < jobs.length; i++) {
      expect(jobs[i].pickup.x).toBe(points[i].x);
      expect(jobs[i].pickup.z).toBe(points[i].z);
      expect(jobs[i].pickup.label).toBe(points[i].label);
      expect(jobs[i].dropoff.x).toBe(points[i + 1].x);
      expect(jobs[i].dropoff.z).toBe(points[i + 1].z);
      expect(jobs[i].dropoff.label).toBe(points[i + 1].label);
    }
  });

  it('이전 dropoff = 다음 pickup (체이닝 규칙)', () => {
    const jobs = jobsFromPoints(points);
    for (let i = 0; i < jobs.length - 1; i++) {
      expect(jobs[i].dropoff).toEqual(jobs[i + 1].pickup);
    }
  });

  it('결정론: 같은 입력 → 깊은 동등 출력', () => {
    expect(jobsFromPoints(points)).toEqual(jobsFromPoints(points));
  });
});

describe('jobsFromPoints — pairs 옵션(비겹침 쌍)', () => {
  it('mode:pairs → floor(N/2) job', () => {
    const points = [
      { x: 0, z: 0, label: 'A' },
      { x: 10, z: 0, label: 'B' },
      { x: 20, z: 0, label: 'C' },
      { x: 30, z: 0, label: 'D' },
    ];
    const jobs = jobsFromPoints(points, { mode: 'pairs' });
    expect(jobs.length).toBe(Math.floor(points.length / 2));
    // 첫 쌍 (p0→p1)
    expect(jobs[0].pickup.label).toBe('A');
    expect(jobs[0].dropoff.label).toBe('B');
    // 둘째 쌍 (p2→p3)
    expect(jobs[1].pickup.label).toBe('C');
    expect(jobs[1].dropoff.label).toBe('D');
  });
});

// ── 맵 getDeliveryPoints() — 도로 위 / 결정론 (delivery.md §2.1) ──
describe('getDeliveryPoints — 자연 맵', () => {
  it('도로 위(isOnRoad=true) 점들의 배열을 반환(≥4)', () => {
    const m = getMap('natural');
    expect(typeof m.getDeliveryPoints).toBe('function');
    const pts = m.getDeliveryPoints();
    expect(Array.isArray(pts)).toBe(true);
    expect(pts.length).toBeGreaterThanOrEqual(4);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(m.isOnRoad(p.x, p.z)).toBe(true);
    }
  });

  it('결정론: 같은 맵에서 2회 호출 결과 동등', () => {
    const m = getMap('natural');
    expect(m.getDeliveryPoints()).toEqual(m.getDeliveryPoints());
    // 새 맵 인스턴스도 동일 좌표(난수 없음)
    expect(getMap('natural').getDeliveryPoints())
      .toEqual(getMap('natural').getDeliveryPoints());
  });
});

describe('getDeliveryPoints — 도시 맵', () => {
  it('도로 위(isOnRoad=true) 점들의 배열을 반환(≥4)', () => {
    const m = getMap('city');
    expect(typeof m.getDeliveryPoints).toBe('function');
    const pts = m.getDeliveryPoints();
    expect(Array.isArray(pts)).toBe(true);
    expect(pts.length).toBeGreaterThanOrEqual(4);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(m.isOnRoad(p.x, p.z)).toBe(true);
    }
  });

  it('첫 점은 스폰(0,0)과 다름(스폰에서 떨어진 교차점)', () => {
    const m = getMap('city');
    const first = m.getDeliveryPoints()[0];
    expect(first.x === 0 && first.z === 0).toBe(false);
  });

  it('결정론: 2회 호출 결과 동등', () => {
    const m = getMap('city');
    expect(m.getDeliveryPoints()).toEqual(m.getDeliveryPoints());
    expect(getMap('city').getDeliveryPoints())
      .toEqual(getMap('city').getDeliveryPoints());
  });
});
