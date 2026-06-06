// ══════════════════════════════════════════════════════════════
// render/minimap.js — 우상단 상공뷰 미니맵 (2D 캔버스)
// 투영 수학은 순수 함수, 그리기는 캔버스 2D.
// ══════════════════════════════════════════════════════════════

// 코스 경계(여백 포함) ────────────────────────────────────────────
export function computeBounds(waypoints, pad = 20) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of waypoints) {
    if (w.x < minX) minX = w.x;
    if (w.x > maxX) maxX = w.x;
    if (w.z < minZ) minZ = w.z;
    if (w.z > maxZ) maxZ = w.z;
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

// 월드 XZ → 미니맵 픽셀 (종횡비 보존, +Z 화면 위) ─────────────────
export function worldToMinimap(wx, wz, view) {
  const { bounds, size } = view;
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxZ - bounds.minZ;
  const scale = size / Math.max(w, h);
  const offX = (size - w * scale) / 2;
  const offZ = (size - h * scale) / 2;
  return {
    mx: (wx - bounds.minX) * scale + offX,
    my: size - ((wz - bounds.minZ) * scale + offZ),
  };
}

// 캔버스 미니맵 생성 (통일 데이터 포맷 소비) ──────────────────────
//   data = { polylines:[[{x,z}...]], goals:[{x,z}], bounds }
//   bounds 가 null 이면 polylines 의 모든 점으로부터 계산.
export function createMinimap(data, opts = {}) {
  const size = opts.size ?? 160;
  const polylines = data.polylines ?? [];
  const goals = data.goals ?? [];

  const canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  canvas.width = size;
  canvas.height = size;
  canvas.style.cssText =
    `position:fixed;top:14px;right:14px;left:auto;bottom:auto;width:${size}px;height:${size}px;` +
    'border:2px solid rgba(255,255,255,0.6);border-radius:8px;' +
    'background:rgba(20,30,40,0.65);z-index:30';
  const ctx = canvas.getContext('2d');

  // 경계: data.bounds 우선, 없으면 폴리라인 점들로 계산
  const allPts = polylines.flat();
  const bounds = data.bounds ?? computeBounds(allPts, 20);
  const view = { bounds, size };

  function draw(dyn, score) {
    ctx.clearRect(0, 0, size, size);

    // 도로/격자 폴리라인
    ctx.strokeStyle = '#cfcfcf';
    ctx.lineWidth = 3;
    for (const line of polylines) {
      ctx.beginPath();
      line.forEach((w, i) => {
        const p = worldToMinimap(w.x, w.z, view);
        if (i === 0) ctx.moveTo(p.mx, p.my); else ctx.lineTo(p.mx, p.my);
      });
      ctx.stroke();
    }

    // 목표 지점 (현재 목표 강조)
    goals.forEach((cp, i) => {
      const p = worldToMinimap(cp.x, cp.z, view);
      const current = score && i === score.nextCheckpoint;
      ctx.fillStyle = current ? '#ffcc00' : (score && i < score.nextCheckpoint ? '#55aa55' : '#ff8800');
      ctx.beginPath();
      ctx.arc(p.mx, p.my, current ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // 차량 (heading 방향 삼각형)
    const v = worldToMinimap(dyn.x, dyn.z, view);
    const a = -dyn.heading + Math.PI / 2; // 화면 좌표계 보정
    ctx.fillStyle = '#33ddff';
    ctx.beginPath();
    ctx.moveTo(v.mx + Math.cos(a) * 6, v.my - Math.sin(a) * 6);
    ctx.lineTo(v.mx + Math.cos(a + 2.5) * 5, v.my - Math.sin(a + 2.5) * 5);
    ctx.lineTo(v.mx + Math.cos(a - 2.5) * 5, v.my - Math.sin(a - 2.5) * 5);
    ctx.closePath();
    ctx.fill();
  }

  return { canvas, draw };
}
