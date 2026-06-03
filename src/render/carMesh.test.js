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
  it('위치와 회전을 dyn에 맞춰 설정', () => {
    const car = buildCar();
    updateCarTransform(car, { x: 5, y: 2, z: -3, heading: 1.0, roll: 0.2, pitch: 0.1 });
    expect(car.position.x).toBeCloseTo(5, 6);
    expect(car.position.y).toBeCloseTo(2, 6);
    expect(car.position.z).toBeCloseTo(-3, 6);
    expect(car.rotation.y).toBeCloseTo(1.0, 6);
    expect(car.rotation.x).toBeCloseTo(-0.1, 6);
    expect(car.rotation.z).toBeCloseTo(-0.2, 6);
  });
});
