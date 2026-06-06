// ══════════════════════════════════════════════════════════════
// render/bigmap.js — 큰 지도 보기(#9). 화면 중앙 전체 지도 오버레이.
// THREE 비의존(Canvas 2D). 투영 수학은 minimap.js 순수 헬퍼 재사용.
//   KeyG 토글로 열고 닫는다(main.js 결선). 열린 동안 주행 정지.
// ══════════════════════════════════════════════════════════════
import { computeBounds, worldToMinimap } from './minimap.js';
import { currentTarget } from '../mission.js';

// 전체 경로가 화면에 여유있게 들어오도록 한 경계 여백(m).
export const BIGMAP_PAD = 60;

// 큰 지도 오버레이 생성 — mapData={polylines,...}, deliveryPoints=[{x,z,label}].
export function createBigmap(mapData, deliveryPoints, opts = {}) {
  const size = opts.size ?? 640;          // 정사각 캔버스 픽셀
  const polylines = mapData?.polylines ?? [];
  const points = deliveryPoints ?? [];

  const canvas = document.createElement('canvas');
  canvas.id = 'bigmap';
  canvas.width = size;
  canvas.height = size;
  canvas.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
    `width:${size}px;height:${size}px;max-width:90vmin;max-height:90vmin;` +
    'border:2px solid rgba(255,255,255,0.7);border-radius:12px;' +
    'background:rgba(15,22,30,0.92);z-index:40;display:none';
  const ctx = canvas.getContext('2d');

  let open = false;

  function draw(dyn, mission) {
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);

    // 경계: 전체 배송점 + 현재 차량 위치 → 전 경로 가시
    const all = points.map((p) => ({ x: p.x, z: p.z }));
    if (dyn) all.push({ x: dyn.x, z: dyn.z });
    const bounds = computeBounds(all.length ? all : [{ x: 0, z: 0 }], BIGMAP_PAD);
    const view = { bounds, size };

    // 제목
    ctx.fillStyle = '#e8f0f8';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('🗺️  전체 지도 (G 닫기)', 14, 12);

    // 1) 도로망 폴리라인(연하게)
    ctx.strokeStyle = 'rgba(180,190,200,0.55)';
    ctx.lineWidth = 4;
    for (const line of polylines) {
      ctx.beginPath();
      line.forEach((w, i) => {
        const p = worldToMinimap(w.x, w.z, view);
        if (i === 0) ctx.moveTo(p.mx, p.my); else ctx.lineTo(p.mx, p.my);
      });
      ctx.stroke();
    }

    // 현재 목표(강조 대상) 식별 — 현재 job 의 pickup/dropoff 좌표
    const target = mission ? currentTarget(mission) : null;

    // 2) 배송 지점 점 + 번호/라벨, 현재 목표 강조
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    points.forEach((pt, i) => {
      const p = worldToMinimap(pt.x, pt.z, view);
      // 현재 목표인지(좌표 일치) — 강조
      const isTarget = !!target &&
        Math.abs(target.x - pt.x) < 1e-6 && Math.abs(target.z - pt.z) < 1e-6;
      // 진행 상태 색: 현재 목표=노랑, 그 외=청록
      const color = isTarget ? '#ffd23f' : '#33aaff';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.mx, p.my, isTarget ? 11 : 7, 0, Math.PI * 2);
      ctx.fill();
      if (isTarget) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.mx, p.my, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 번호(1..N)
      ctx.fillStyle = '#10202c';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText(String(i + 1), p.mx, p.my);
      // 라벨(점 아래)
      if (pt.label) {
        ctx.fillStyle = '#cfe0ee';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(pt.label, p.mx, p.my + 22);
      }
    });

    // 3) 현재 차량 위치/heading 삼각형(미니맵과 동일 수학)
    if (dyn) {
      const v = worldToMinimap(dyn.x, dyn.z, view);
      const a = -dyn.heading + Math.PI / 2;
      ctx.fillStyle = '#33ddff';
      ctx.beginPath();
      ctx.moveTo(v.mx + Math.cos(a) * 12, v.my - Math.sin(a) * 12);
      ctx.lineTo(v.mx + Math.cos(a + 2.5) * 9, v.my - Math.sin(a + 2.5) * 9);
      ctx.lineTo(v.mx + Math.cos(a - 2.5) * 9, v.my - Math.sin(a - 2.5) * 9);
      ctx.closePath();
      ctx.fill();
    }
  }

  function show() { canvas.style.display = 'block'; open = true; }
  function hide() { canvas.style.display = 'none'; open = false; }
  function toggle() { if (open) hide(); else show(); return open; }

  return {
    canvas,
    draw,
    show,
    hide,
    toggle,
    get open() { return open; },
  };
}
