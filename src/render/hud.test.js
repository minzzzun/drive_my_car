// render/hud.js 테스트 (M8 순수함수 + M14b 배송 HUD)
//
// ── M14b 가정 시그니처 (설계 mds/design/delivery.md §4) ────────────
//   hud.update(vehicle, missionView)
//     missionView = { phase, label, distance, hasCargo, completed, total }
//       phase ∈ 'toPickup' | 'toDropoff' | 'done'
//   createHud(...) 반환 객체에 showToast(text, ms?) 추가.
//   line1(기어/RPM/속도/엔진)·RPM 게이지는 유지, line2 는 배송정보로 교체.
//   점수(score)/타이머(timeLeft)/체크포인트 카운트 표기는 제거.
//
// 이 저장소는 vitest `node` 환경(jsdom 미설치)이라, DOM 의존 함수
// (createHud)는 최소 document 스텁으로 구동한다. innerHTML 문자열을
// 직접 검사해 렌더 내용을 단언한다(시각 스타일은 검사하지 않음).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rpmToFraction } from './hud.js';

// ── 순수 함수 (M8, 회귀 0) ───────────────────────────────────────
describe('rpmToFraction', () => {
  it('0 → 0, max → 1', () => {
    expect(rpmToFraction(0, 7000)).toBe(0);
    expect(rpmToFraction(7000, 7000)).toBe(1);
  });
  it('절반', () => {
    expect(rpmToFraction(3500, 7000)).toBeCloseTo(0.5, 6);
  });
  it('초과는 1로 clamp, 음수는 0', () => {
    expect(rpmToFraction(9000, 7000)).toBe(1);
    expect(rpmToFraction(-100, 7000)).toBe(0);
  });
});

// ── 최소 DOM 스텁 ───────────────────────────────────────────────
// createHud 가 쓰는 API만 흉내: createElement / appendChild / id /
// style.cssText / innerHTML / querySelector('#id'). innerHTML 을 쓰면
// "#id" 패턴을 스캔해 자식 노드를 등록하고, querySelector 로 돌려준다.
function makeFakeElement() {
  const node = {
    id: '',
    style: { cssText: '', width: '' },
    _children: new Map(),
    _html: '',
    appendChild() {},
    querySelector(sel) {
      const id = sel.startsWith('#') ? sel.slice(1) : sel;
      if (!node._children.has(id)) node._children.set(id, makeFakeElement());
      return node._children.get(id);
    },
  };
  Object.defineProperty(node, 'innerHTML', {
    get() { return node._html; },
    set(v) {
      node._html = String(v);
      // innerHTML 로 선언된 자식 id 를 등록(querySelector 대응)
      const re = /id="([^"]+)"/g;
      let m;
      while ((m = re.exec(node._html))) {
        if (!node._children.has(m[1])) node._children.set(m[1], makeFakeElement());
      }
    },
  });
  return node;
}

function installFakeDocument() {
  const created = [];
  globalThis.document = {
    createElement() {
      const el = makeFakeElement();
      created.push(el);
      return el;
    },
    body: { appendChild() {} },
  };
  return created;
}

// HUD 루트(el)에서 line1/line2 의 누적 innerHTML 텍스트를 모아 반환.
function hudText(hud) {
  const l1 = hud.el.querySelector('#hud-line1');
  const l2 = hud.el.querySelector('#hud-line2');
  return { line1: l1._html, line2: l2._html, all: l1._html + '\n' + l2._html };
}

describe('createHud — 배송 HUD update(vehicle, missionView) (M14b)', () => {
  let createHud;
  const vehicle = {
    speed: 10, on: true, stalled: false, rollover: false,
    gearName: '2', rpm: 3000,
  };

  beforeEach(async () => {
    installFakeDocument();
    // document 설치 후 import 해야 모듈 평가 시점에 안전(현재 모듈은 createHud
    // 내부에서만 document 를 쓰지만, 캐시 회피를 위해 동적 import).
    ({ createHud } = await import('./hud.js'));
  });
  afterEach(() => {
    delete globalThis.document;
  });

  it('line1: 기어/RPM/속도/엔진 표시 유지', () => {
    const hud = createHud();
    hud.update(vehicle, { phase: 'toPickup', label: '북부 창고', distance: 42, hasCargo: false, completed: 0, total: 3 });
    const { line1 } = hudText(hud);
    expect(line1).toContain('2');        // 기어
    expect(line1).toContain('3000');     // RPM
    expect(line1).toContain('36');       // 10 m/s ≈ 36 km/h
    expect(line1).toContain('ON');       // 엔진 상태
  });

  it('toPickup: 📦 단계 + 목표 라벨 + 거리(반올림) + 빈차 + 완료건수', () => {
    const hud = createHud();
    hud.update(vehicle, { phase: 'toPickup', label: '북부 창고', distance: 41.7, hasCargo: false, completed: 0, total: 3 });
    const { line2 } = hudText(hud);
    expect(line2).toContain('📦');       // 적재지로 단계 아이콘
    expect(line2).toContain('북부 창고'); // 목표 라벨
    expect(line2).toContain('42');       // round(41.7)
    expect(line2).toContain('0/3');      // completed/total
  });

  it('toDropoff: 🏁 단계 + 적재됨 표시', () => {
    const hud = createHud();
    hud.update(vehicle, { phase: 'toDropoff', label: '중앙 교차로', distance: 12.3, hasCargo: true, completed: 1, total: 3 });
    const { line2 } = hudText(hud);
    expect(line2).toContain('🏁');       // 배송지로 단계 아이콘
    expect(line2).toContain('중앙 교차로');
    expect(line2).toContain('12');       // round(12.3)
    expect(line2).toContain('1/3');
  });

  it('done: ✅ 모든 배송 완료 표시', () => {
    const hud = createHud();
    hud.update(vehicle, { phase: 'done', label: '', distance: 0, hasCargo: false, completed: 3, total: 3 });
    const { line2 } = hudText(hud);
    expect(line2).toContain('✅');
    expect(line2).toContain('3/3');
  });

  it('점수/타이머/체크포인트 표기가 사라짐', () => {
    const hud = createHud();
    hud.update(vehicle, { phase: 'toPickup', label: '북부 창고', distance: 42, hasCargo: false, completed: 0, total: 3 });
    const { all } = hudText(hud);
    expect(all).not.toContain('점수');
    expect(all).not.toContain('체크포인트');
    expect(all).not.toContain('⏱');
    expect(all).not.toContain('s');  // 타이머 'Ns' 잔재 없음 (라벨에 's' 미포함 가정)
  });

  it('RPM 게이지 채움 비율이 갱신된다', () => {
    const hud = createHud();
    hud.update(vehicle, { phase: 'toPickup', label: 'X', distance: 0, hasCargo: false, completed: 0, total: 1 });
    const bar = hud.el.querySelector('#hud-rpm');
    // 3000/7000 ≈ 42.857% → '42.857...%' 문자열 포함
    expect(bar.style.width).toMatch(/^42\./);
  });

  it('showToast 호출이 throw 하지 않는다', () => {
    const hud = createHud();
    expect(typeof hud.showToast).toBe('function');
    expect(() => hud.showToast('📦 짐을 실었습니다')).not.toThrow();
  });
});
