// render/minimap.js 테스트 (M8 순수투영 + M14b 배송 마커)
//
// ── M14b 가정 시그니처 (설계 mds/design/delivery.md §5) ────────────
//   minimap.draw(dyn, missionMarker)
//     missionMarker = { pickup: {x,z}|null, dropoff: {x,z}|null, phase }
//       phase ∈ 'toPickup' | 'toDropoff' | 'done'
//   createMinimap(data) 생성은 유지(폴리라인/bounds만 소비, goals 의존 제거).
//   pickup=파란계열(#33aaff), dropoff=주황/빨강계열(#ff5533), 현재 단계 목표를
//   크게 강조. 차량 삼각형/도로 폴리라인은 그대로.
//
// node 환경(jsdom 미설치)이라 createMinimap 의 canvas/2D 컨텍스트는
// 최소 스텁으로 구동하고, fillStyle/arc 호출을 기록해 마커 렌더를 단언한다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeBounds, worldToMinimap } from './minimap.js';

// ── 순수 투영 함수 (M8, 회귀 0) ──────────────────────────────────
describe('computeBounds', () => {
  it('경계 + 여백', () => {
    const wp = [{ x: 0, z: 0 }, { x: 100, z: 50 }, { x: -20, z: 80 }];
    const b = computeBounds(wp, 10);
    expect(b.minX).toBe(-30);
    expect(b.maxX).toBe(110);
    expect(b.minZ).toBe(-10);
    expect(b.maxZ).toBe(90);
  });
});

describe('worldToMinimap', () => {
  const view = { bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, size: 200 };
  it('좌하단(minX,minZ) → 좌하단 픽셀, +Z는 화면 위', () => {
    const p = worldToMinimap(0, 0, view);
    expect(p.mx).toBeCloseTo(0, 6);
    expect(p.my).toBeCloseTo(200, 6); // z=0이 아래
  });
  it('우상단(maxX,maxZ) → 우상단 픽셀', () => {
    const p = worldToMinimap(100, 100, view);
    expect(p.mx).toBeCloseTo(200, 6);
    expect(p.my).toBeCloseTo(0, 6);
  });
  it('중앙', () => {
    const p = worldToMinimap(50, 50, view);
    expect(p.mx).toBeCloseTo(100, 6);
    expect(p.my).toBeCloseTo(100, 6);
  });
  it('종횡비 보존(세로로 긴 코스)', () => {
    const v2 = { bounds: { minX: 0, maxX: 50, minZ: 0, maxZ: 100 }, size: 200 };
    // scale = 200/100 = 2, 가로 폭 50*2=100 → 좌우 여백 (200-100)/2=50
    const p = worldToMinimap(0, 0, v2);
    expect(p.mx).toBeCloseTo(50, 6);
  });
});

// ── 최소 canvas/2D 컨텍스트 스텁 ─────────────────────────────────
// createMinimap 이 쓰는 2D API만 기록한다. fillStyle 설정과 그에 이어진
// fill()/arc() 를 묶어 "이 색으로 채워진 도형"의 기록을 남긴다.
function makeFakeContext() {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    _fills: [],   // fill() 호출 시점의 fillStyle 기록
    _arcs: [],    // arc(x,y,r,...) 기록
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    arc(x, y, r) { ctx._arcs.push({ x, y, r, fillStyle: ctx.fillStyle }); },
    fill() { ctx._fills.push(ctx.fillStyle); },
  };
  return ctx;
}

function installFakeCanvasDocument() {
  const ctx = makeFakeContext();
  globalThis.document = {
    createElement() {
      return {
        id: '', width: 0, height: 0,
        style: { cssText: '' },
        getContext() { return ctx; },
      };
    },
  };
  return ctx;
}

describe('createMinimap.draw — 배송 마커 draw(dyn, missionMarker) (M14b)', () => {
  let createMinimap, ctx;
  // 도로 폴리라인만 소비(goals 미사용). bounds 명시.
  const data = {
    polylines: [[{ x: 0, z: 0 }, { x: 100, z: 100 }]],
    bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
  };
  const dyn = { x: 50, z: 50, heading: 0 };

  beforeEach(async () => {
    ctx = installFakeCanvasDocument();
    ({ createMinimap } = await import('./minimap.js'));
  });
  afterEach(() => {
    delete globalThis.document;
  });

  it('생성 시 canvas/draw 반환', () => {
    const mm = createMinimap(data);
    expect(mm.canvas).toBeTruthy();
    expect(typeof mm.draw).toBe('function');
  });

  it('toPickup 단계: pickup 마커(파란계열)를 그린다', () => {
    const mm = createMinimap(data);
    mm.draw(dyn, { pickup: { x: 10, z: 20 }, dropoff: null, phase: 'toPickup' });
    const colors = ctx._arcs.map((a) => a.fillStyle.toLowerCase());
    expect(colors.some((c) => c.includes('33aaff'))).toBe(true);
  });

  it('toDropoff 단계: dropoff 마커(주황/빨강계열)를 그린다', () => {
    const mm = createMinimap(data);
    mm.draw(dyn, { pickup: null, dropoff: { x: 80, z: 90 }, phase: 'toDropoff' });
    const colors = ctx._arcs.map((a) => a.fillStyle.toLowerCase());
    expect(colors.some((c) => c.includes('ff5533'))).toBe(true);
  });

  it('현재 단계 목표 마커는 비활성보다 크게 강조한다', () => {
    const mm = createMinimap(data);
    // pickup/dropoff 모두 제공하되 현재 phase=toPickup → pickup 이 더 크다.
    mm.draw(dyn, { pickup: { x: 10, z: 20 }, dropoff: { x: 80, z: 90 }, phase: 'toPickup' });
    const arcs = ctx._arcs.filter((a) => {
      const c = a.fillStyle.toLowerCase();
      return c.includes('33aaff') || c.includes('ff5533');
    });
    expect(arcs.length).toBeGreaterThanOrEqual(1);
    const pickup = arcs.find((a) => a.fillStyle.toLowerCase().includes('33aaff'));
    expect(pickup).toBeTruthy();
    expect(pickup.r).toBeGreaterThanOrEqual(5); // 강조 반경 6~7px 톤
  });

  it('done 단계: 목표 마커 없이도 throw 하지 않는다', () => {
    const mm = createMinimap(data);
    expect(() => mm.draw(dyn, { pickup: null, dropoff: null, phase: 'done' })).not.toThrow();
  });

  it('차량 삼각형은 항상 그린다(도로 폴리라인 + 차량)', () => {
    const mm = createMinimap(data);
    mm.draw(dyn, { pickup: { x: 10, z: 20 }, dropoff: null, phase: 'toPickup' });
    // 차량 색(#33ddff)으로 채운 fill 이 존재
    const filled = ctx._fills.map((c) => c.toLowerCase());
    expect(filled.some((c) => c.includes('33ddff'))).toBe(true);
  });
});
