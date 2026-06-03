// render/carMesh.js 단위 테스트 (M6) — THREE 객체는 WebGL 없이 생성 가능
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCar, updateCarTransform } from './carMesh.js';

describe('buildCar', () => {
  it('THREE.Group 을 반환하고 섀시+캐빈+바퀴4 = 6개 이상', () => {
    const car = buildCar();
    expect(car).toBeInstanceOf(THREE.Group);
    expect(car.children.length).toBeGreaterThanOrEqual(6);
  });
});

describe('updateCarTransform', () => {
  it('위치 설정 + 평지에서 heading 방향(local +Z)이 (sin h, 0, cos h)', () => {
    const car = buildCar();
    updateCarTransform(car, { x: 5, y: 2, z: -3, heading: Math.PI / 2 }, { x: 0, y: 1, z: 0 });
    expect(car.position.x).toBeCloseTo(5, 6);
    expect(car.position.y).toBeCloseTo(2, 6);
    expect(car.position.z).toBeCloseTo(-3, 6);
    // 차 정면(local +Z) → 월드 (sin90,0,cos90)=(1,0,0)
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(car.quaternion);
    expect(f.x).toBeCloseTo(1, 5);
    expect(f.z).toBeCloseTo(0, 5);
    // 차 천장(local +Y) → up (0,1,0)
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion);
    expect(u.y).toBeCloseTo(1, 5);
  });

  it('천장축(up)이 주어진 지형 법선을 향한다', () => {
    const car = buildCar();
    const up = new THREE.Vector3(0.3, 1, 0).normalize();
    updateCarTransform(car, { x: 0, y: 0, z: 0, heading: 0 }, up);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion);
    expect(u.x).toBeCloseTo(up.x, 5);
    expect(u.y).toBeCloseTo(up.y, 5);
    expect(u.z).toBeCloseTo(up.z, 5);
  });
});
