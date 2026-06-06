// naturalMap 래퍼 동치성 단위 테스트 (M12a)
//
// 핵심 보증: naturalMap 래퍼의 "순수" 메서드가 기존 terrain/road 함수와
// 완전히 동일한 결과를 낸다(회귀 0). 래퍼는 새 로직을 만들지 않고
// 기존 모듈을 그대로 호출해야 한다(설계 §2 "회귀 0 목표").
//
// ── 가정한 export 시그니처 (설계노트 maps.md §1·§2) ───────────────────
//   src/maps/naturalMap.js 가 아래 중 하나를 제공한다고 가정:
//     (A) named export `naturalMap` — 인터페이스 메서드를 가진 객체, 또는
//     (B) factory `createMap(opts)` / `createNaturalMap(opts)` → mapObject
//   이 테스트는 둘 다 수용하도록 모듈을 동적으로 정규화한다(getNaturalMap()).
//   실제 구현이 한 형태만 제공해도 통과하도록 작성.
//
//   naturalMap 은 main.js 와 동일한 코스 파라미터로 내부 road 를 만든다고 가정:
//     generateCourseWaypoints({ count: 24, start: { x: 0, z: 0 } })
//     createRoad(waypoints)              // 기본 width
//     placeCheckpoints(road, DEFAULT_CHECKPOINTS)
//   스폰은 main.js 계산과 동일하다고 가정:
//     pos = waypoints[0], next = waypoints[1]
//     heading = atan2(next.x-pos.x, next.z-pos.z)
//     y = terrainHeight(pos.x, pos.z)

import { describe, it, expect } from 'vitest';
import * as naturalMapModule from './naturalMap.js';

import { terrainHeight } from '../terrain.js';
import {
  DEFAULT_CHECKPOINTS,
  generateCourseWaypoints,
  createRoad,
  placeCheckpoints,
  isOnRoad as roadIsOnRoad,
} from '../road.js';
import { terrainNormal } from '../vehicle/dynamics.js';

// 구현 export 형태(객체 직접 / factory)를 둘 다 수용해 mapObject 를 얻는다.
function getNaturalMap() {
  const mod = naturalMapModule;
  if (mod.naturalMap) return mod.naturalMap;
  if (typeof mod.createNaturalMap === 'function') return mod.createNaturalMap();
  if (typeof mod.createMap === 'function') return mod.createMap();
  if (mod.default && typeof mod.default === 'object') return mod.default;
  if (typeof mod.default === 'function') return mod.default();
  throw new Error('naturalMap.js: naturalMap 객체 또는 createMap/createNaturalMap factory export 필요');
}

// main.js 가 쓰는 것과 동일한 기준 코스(동치 비교용 기준값 재구성)
const refWaypoints   = generateCourseWaypoints({ count: 24, start: { x: 0, z: 0 } });
const refRoad        = createRoad(refWaypoints);
const refCheckpoints = placeCheckpoints(refRoad, DEFAULT_CHECKPOINTS);

// 다양한 좌표 샘플 (지형/도로 판정 동치 비교용)
const SAMPLE_COORDS = [
  [0, 0],
  [10, 5],
  [-20, 33],
  [40, -15],
  [123, -45],
  [-77, 88],
  [5, 200],
  [-3, 410],
  [0.5, 580],
  [250, -250],
];

describe('naturalMap.heightAt 동치성', () => {
  it('여러 좌표에서 terrainHeight 와 정확히 일치', () => {
    const m = getNaturalMap();
    for (const [x, z] of SAMPLE_COORDS) {
      expect(m.heightAt(x, z)).toBe(terrainHeight(x, z));
    }
  });
});

describe('naturalMap.normalAt 동치성', () => {
  it('여러 좌표에서 terrainNormal(x,z,terrainHeight) 와 일치', () => {
    const m = getNaturalMap();
    for (const [x, z] of SAMPLE_COORDS) {
      const expected = terrainNormal(x, z, terrainHeight);
      const got = m.normalAt(x, z);
      expect(got.x).toBeCloseTo(expected.x, 12);
      expect(got.y).toBeCloseTo(expected.y, 12);
      expect(got.z).toBeCloseTo(expected.z, 12);
    }
  });
});

describe('naturalMap.isOnRoad 동치성', () => {
  it('여러 좌표에서 road.isOnRoad(road,x,z) 와 일치', () => {
    const m = getNaturalMap();
    for (const [x, z] of SAMPLE_COORDS) {
      expect(m.isOnRoad(x, z)).toBe(roadIsOnRoad(refRoad, x, z));
    }
  });

  it('코스 중심선(체크포인트) 위는 도로로 판정', () => {
    const m = getNaturalMap();
    for (const cp of refCheckpoints) {
      expect(m.isOnRoad(cp.x, cp.z)).toBe(true);
    }
  });
});

describe('naturalMap.isBlocked (회귀 0 — 자연 맵엔 고체 없음)', () => {
  it('여러 좌표에서 항상 false (통행 가능)', () => {
    const m = getNaturalMap();
    expect(typeof m.isBlocked).toBe('function');
    for (const [x, z] of SAMPLE_COORDS) {
      expect(m.isBlocked(x, z)).toBe(false);
    }
    // 체크포인트(도로 중심) 위도 막히지 않아야 함
    for (const cp of refCheckpoints) {
      expect(m.isBlocked(cp.x, cp.z)).toBe(false);
    }
  });
});

describe('naturalMap.getSpawn 동치성', () => {
  it('기존 main.js 스폰 계산(위치+heading+y)과 일치', () => {
    const m = getNaturalMap();
    const spawn = m.getSpawn();

    const pos  = refWaypoints[0];
    const next = refWaypoints[1] ?? { x: pos.x, z: pos.z + 1 };
    const expectedHeading = Math.atan2(next.x - pos.x, next.z - pos.z);

    expect(spawn.x).toBeCloseTo(pos.x, 9);
    expect(spawn.z).toBeCloseTo(pos.z, 9);
    expect(spawn.y).toBeCloseTo(terrainHeight(pos.x, pos.z), 9);
    expect(spawn.heading).toBeCloseTo(expectedHeading, 9);
  });
});

describe('naturalMap.getGoals 동치성', () => {
  it('개수가 placeCheckpoints(road, DEFAULT_CHECKPOINTS) 와 일치', () => {
    const m = getNaturalMap();
    const goals = m.getGoals();
    expect(goals.length).toBe(refCheckpoints.length);
    expect(goals.length).toBe(DEFAULT_CHECKPOINTS);
  });

  it('각 목표의 좌표/index 가 기존 체크포인트와 일치', () => {
    const m = getNaturalMap();
    const goals = m.getGoals();
    for (let i = 0; i < refCheckpoints.length; i++) {
      const cp = refCheckpoints[i];
      const g = goals[i];
      expect(g.index).toBe(cp.index);
      expect(g.x).toBeCloseTo(cp.x, 9);
      expect(g.z).toBeCloseTo(cp.z, 9);
    }
  });
});
