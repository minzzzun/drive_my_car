// ══════════════════════════════════════════════════════════════
// road.js — 도로 중심선·체크포인트 (순수 기하, Three.js 비의존)
// 높이(Y)는 terrain.terrainHeight 로 별도 질의. 여기선 평면 {x,z}만.
// ══════════════════════════════════════════════════════════════

export const ROAD_WIDTH         = 8;
export const DEFAULT_CHECKPOINTS = 5;

// 점-선분 최단거리 ────────────────────────────────────────────────
export function distPointToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + t * dx, cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

// 웨이포인트열 → 도로(세그먼트 + 누적 호 길이) ──────────────────────
export function createRoad(waypoints, opts = {}) {
  const width = opts.width ?? ROAD_WIDTH;
  const segments = [];
  let acc = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, len, s0: acc });
    acc += len;
  }
  return { waypoints, width, segments, totalLength: acc };
}

// 도로 중심선까지 최단거리 ─────────────────────────────────────────
export function distanceToCenterline(road, x, z) {
  let min = Infinity;
  for (const s of road.segments) {
    const d = distPointToSegment(x, z, s.ax, s.az, s.bx, s.bz);
    if (d < min) min = d;
  }
  return min;
}

// 도로 폭 안에 있는가 ──────────────────────────────────────────────
export function isOnRoad(road, x, z) {
  return distanceToCenterline(road, x, z) <= road.width / 2;
}

// 호 길이 s 위치의 점 (clamp) ─────────────────────────────────────
export function pointAtDistance(road, s) {
  if (road.segments.length === 0) return { ...road.waypoints[0] };
  if (s <= 0) {
    const f = road.segments[0];
    return { x: f.ax, z: f.az };
  }
  if (s >= road.totalLength) {
    const l = road.segments[road.segments.length - 1];
    return { x: l.bx, z: l.bz };
  }
  for (const seg of road.segments) {
    if (s <= seg.s0 + seg.len) {
      const t = seg.len === 0 ? 0 : (s - seg.s0) / seg.len;
      return { x: seg.ax + (seg.bx - seg.ax) * t, z: seg.az + (seg.bz - seg.az) * t };
    }
  }
  const l = road.segments[road.segments.length - 1];
  return { x: l.bx, z: l.bz };
}

// 체크포인트 균등 배치 (마지막이 도로 끝 = 골인) ───────────────────
export function placeCheckpoints(road, count = DEFAULT_CHECKPOINTS) {
  const cps = [];
  for (let k = 1; k <= count; k++) {
    const s = (road.totalLength * k) / count;
    const p = pointAtDistance(road, s);
    cps.push({ index: k - 1, x: p.x, z: p.z, s });
  }
  return cps;
}

// 결정론적 사행(meander) 코스 생성 (난수 없음) ────────────────────
export function generateCourseWaypoints(opts = {}) {
  const count     = opts.count ?? 24;       // 웨이포인트 수
  const start     = opts.start ?? { x: 0, z: 0 };
  const spacing   = opts.spacing ?? 28;     // 웨이포인트 간 전진 거리
  const amplitude = opts.amplitude ?? 40;   // 좌우 굽이 진폭
  const points = [];
  for (let i = 0; i < count; i++) {
    // 두 개의 sine 합으로 자연스러운 굽이 (i=0에서 x오프셋 0이 되도록 보정)
    const wobble = Math.sin(i * 0.45) + 0.5 * Math.sin(i * 0.17);
    points.push({
      x: start.x + amplitude * wobble,
      z: start.z + i * spacing,
    });
  }
  return points;
}
