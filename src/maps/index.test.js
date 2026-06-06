// 맵 레지스트리 단위 테스트 (M12a)
//
// ── 가정한 export 시그니처 (설계노트 maps.md §1·§2) ───────────────────
//   src/maps/index.js 가 아래를 named export 한다고 가정한다:
//     - getMap(id)   → mapObject (인터페이스 메서드를 모두 가진 객체)
//                      id 미지정/누락/알 수 없으면 기본값 'natural' 맵 반환
//                      (설계 §6: "알 수 없는 id는 기본값(natural) 또는 에러" →
//                       회귀 안전상 '기본값 natural'로 가정. 에러 throw 구현이면
//                       이 테스트의 unknown-id 케이스만 수정하면 됨.)
//     - listMaps()   → [{ id, label }, ...] (최소 'natural' 포함)
//
//   mapObject 는 maps.md §1 인터페이스 메서드를 함수로 노출한다고 가정:
//     heightAt, normalAt, isOnRoad, getGoals, getSpawn, getMinimapData
//     (buildStatic/updateWorld 등 THREE 의존 메서드는 존재 여부만 느슨히 확인)
//
// M12a 범위: natural 맵만 등록될 수 있고 city 는 M12b 예정 → city 강제 단언 금지.

import { describe, it, expect } from 'vitest';
import { getMap, listMaps } from './index.js';

// 모든 맵이 동일 시그니처로 제공해야 하는 순수 인터페이스 메서드 (설계 §1)
const PURE_INTERFACE_METHODS = [
  'heightAt',
  'normalAt',
  'isOnRoad',
  'getGoals',
  'getSpawn',
  'getMinimapData',
];

describe('getMap', () => {
  it("getMap('natural')이 맵 객체를 반환한다", () => {
    const m = getMap('natural');
    expect(m).toBeTruthy();
    expect(typeof m).toBe('object');
  });

  it("getMap('natural')의 id는 'natural'", () => {
    const m = getMap('natural');
    expect(m.id).toBe('natural');
  });

  it('인터페이스의 순수 메서드를 모두 함수로 가진다', () => {
    const m = getMap('natural');
    for (const name of PURE_INTERFACE_METHODS) {
      expect(typeof m[name], `${name} 가 함수여야 함`).toBe('function');
    }
  });

  it('알 수 없는 id는 기본값(natural)으로 처리한다', () => {
    // 설계 §6: 기본값 natural 또는 에러. 회귀 안전상 기본값 natural 로 가정.
    const m = getMap('does-not-exist');
    expect(m.id).toBe('natural');
  });

  it('id 미지정도 기본값(natural)으로 처리한다', () => {
    const m = getMap();
    expect(m.id).toBe('natural');
  });
});

describe('isBlocked 인터페이스 (M12b 보강 — 모든 맵 필수 메서드)', () => {
  it("getMap('natural') 객체가 isBlocked 메서드를 가진다", () => {
    const m = getMap('natural');
    expect(typeof m.isBlocked).toBe('function');
  });

  it("등록되어 있다면 getMap('city') 객체도 isBlocked 메서드를 가진다", () => {
    const ids = listMaps().map((e) => e.id);
    if (!ids.includes('city')) return; // city 미등록(M12a 단계)이면 skip
    const m = getMap('city');
    expect(typeof m.isBlocked).toBe('function');
  });
});

describe('listMaps', () => {
  it('배열을 반환하고 최소 한 개 이상의 맵을 포함한다', () => {
    const list = listMaps();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('각 항목은 {id, label} 형태이다', () => {
    for (const entry of listMaps()) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("목록에 'natural' 맵이 있다", () => {
    const ids = listMaps().map((e) => e.id);
    expect(ids).toContain('natural');
  });

  it('등록된 모든 id는 getMap으로 동일 id의 맵을 얻을 수 있다', () => {
    for (const entry of listMaps()) {
      const m = getMap(entry.id);
      expect(m.id).toBe(entry.id);
    }
  });
});
