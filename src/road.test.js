// road.js 단위 테스트 (M2)
import { describe, it, expect } from 'vitest';
import {
  ROAD_WIDTH, DEFAULT_CHECKPOINTS,
  generateCourseWaypoints, createRoad,
  distPointToSegment, distanceToCenterline, isOnRoad,
  pointAtDistance, placeCheckpoints,
} from './road.js';

describe('distPointToSegment', () => {
  it('선분 위의 점은 거리 0', () => {
    expect(distPointToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0, 9);
  });
  it('수직으로 떨어진 점', () => {
    expect(distPointToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 9);
  });
  it('끝점 너머는 끝점까지 거리(클램프)', () => {
    expect(distPointToSegment(13, 0, 0, 0, 10, 0)).toBeCloseTo(3, 9);
    expect(distPointToSegment(-4, 0, 0, 0, 10, 0)).toBeCloseTo(4, 9);
  });
});

// 직선 도로: (0,0)→(0,10)→(0,30), 총 길이 30
const straight = createRoad([{ x: 0, z: 0 }, { x: 0, z: 10 }, { x: 0, z: 30 }], { width: 8 });

describe('createRoad', () => {
  it('세그먼트 수 = 웨이포인트-1', () => {
    expect(straight.segments.length).toBe(2);
  });
  it('총 길이는 세그먼트 합', () => {
    expect(straight.totalLength).toBeCloseTo(30, 9);
  });
  it('세그먼트 누적 호길이 s0', () => {
    expect(straight.segments[0].s0).toBeCloseTo(0, 9);
    expect(straight.segments[1].s0).toBeCloseTo(10, 9);
  });
  it('기본 width 적용', () => {
    const r = createRoad([{ x: 0, z: 0 }, { x: 0, z: 1 }]);
    expect(r.width).toBe(ROAD_WIDTH);
  });
});

describe('distanceToCenterline', () => {
  it('중심선 위는 0', () => {
    expect(distanceToCenterline(straight, 0, 5)).toBeCloseTo(0, 9);
  });
  it('옆으로 d만큼', () => {
    expect(distanceToCenterline(straight, 3, 5)).toBeCloseTo(3, 9);
  });
});

describe('isOnRoad', () => {
  it('폭 안쪽은 true', () => {
    expect(isOnRoad(straight, 3.9, 5)).toBe(true); // width/2 = 4
  });
  it('폭 바깥은 false', () => {
    expect(isOnRoad(straight, 5, 5)).toBe(false);
  });
});

describe('pointAtDistance', () => {
  it('s=0 → 시작점', () => {
    const p = pointAtDistance(straight, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });
  it('s=total → 끝점', () => {
    const p = pointAtDistance(straight, 30);
    expect(p.z).toBeCloseTo(30, 9);
  });
  it('중간 보간 (s=20 → z=20)', () => {
    const p = pointAtDistance(straight, 20);
    expect(p.z).toBeCloseTo(20, 9);
  });
  it('범위 밖 s는 clamp', () => {
    expect(pointAtDistance(straight, -5).z).toBeCloseTo(0, 9);
    expect(pointAtDistance(straight, 999).z).toBeCloseTo(30, 9);
  });
});

describe('placeCheckpoints', () => {
  const cps = placeCheckpoints(straight, 5);
  it('개수 일치', () => {
    expect(cps.length).toBe(5);
  });
  it('호길이 증가 순서, index 0..n-1', () => {
    for (let i = 1; i < cps.length; i++) {
      expect(cps[i].s).toBeGreaterThan(cps[i - 1].s);
      expect(cps[i].index).toBe(i);
    }
  });
  it('각 체크포인트는 도로 위', () => {
    for (const cp of cps) {
      expect(distanceToCenterline(straight, cp.x, cp.z)).toBeLessThan(0.001);
    }
  });
  it('마지막 체크포인트는 도로 끝(골인)', () => {
    expect(cps[cps.length - 1].s).toBeCloseTo(straight.totalLength, 6);
  });
});

describe('generateCourseWaypoints', () => {
  it('결정론(동일 opts 동일 결과)', () => {
    const a = generateCourseWaypoints({ count: 12 });
    const b = generateCourseWaypoints({ count: 12 });
    expect(a).toEqual(b);
  });
  it('시작점과 개수', () => {
    const wp = generateCourseWaypoints({ count: 10, start: { x: 0, z: 0 } });
    expect(wp.length).toBe(10);
    expect(wp[0].x).toBeCloseTo(0, 9);
    expect(wp[0].z).toBeCloseTo(0, 9);
  });
  it('기본 체크포인트 상수', () => {
    expect(DEFAULT_CHECKPOINTS).toBe(5);
  });
});
