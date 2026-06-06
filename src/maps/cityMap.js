// ══════════════════════════════════════════════════════════════
// maps/cityMap.js — 도시 맵을 맵 추상화 인터페이스로 구현 (THREE)
//
// 평평한 아스팔트 + 격자 도로망 + 사각 박스 건물.
// 순수 로직(좌표/도로/건물 배치)은 city.js, 메시/씬 구성만 본 모듈.
// naturalMap.js 와 동일한 시그니처(factory createCityMap).
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { CHUNK_SIZE, RENDER_DIST } from '../terrain.js';
import { terrainNormal } from '../vehicle/dynamics.js';
import {
  CELL, ROAD_WIDTH_CITY,
  distToGrid, cityIsOnRoad, buildingAt, cityIsBlocked,
  GROUND_COLOR, ROAD_COLOR,
} from './city.js';

const HALF = ROAD_WIDTH_CITY / 2;  // 도로 폭 절반

// 도시 맵은 평지(아스팔트). 높이 항상 0.
function cityHeight() { return 0; }

// 청크(타일) 생성 — 아스팔트 바닥 + 그 영역에 든 블록들의 건물 ──────
function createTile(cx, cz) {
  const group = new THREE.Group();
  const disposables = [];  // dispose 대상(geo/mat) 추적

  const x0 = cx * CHUNK_SIZE, x1 = x0 + CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE, z1 = z0 + CHUNK_SIZE;
  // 타일 범위와 겹칠 수 있는 블록/격자선 인덱스 범위
  const bxMin = Math.floor(x0 / CELL) - 1, bxMax = Math.floor(x1 / CELL) + 1;
  const bzMin = Math.floor(z0 / CELL) - 1, bzMax = Math.floor(z1 / CELL) + 1;

  // (a) 비도로(블록 바닥/인도) 바닥 — 밝은 콘크리트 Plane (y=0)
  const floorGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshPhongMaterial({ color: GROUND_COLOR, shininess: 4 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  group.add(floor);
  disposables.push(floorGeo, floorMat);

  // (b) 도로 스트립 — 격자선 x=k*CELL, z=k*CELL 을 따라 짙은 아스팔트로 덮음 (y=0.01)
  const roadMat = new THREE.MeshPhongMaterial({ color: ROAD_COLOR, shininess: 4 });
  disposables.push(roadMat);
  // 세로 도로(x 고정) — 타일에 걸치는 격자선만 순회
  for (let k = bxMin; k <= bxMax; k++) {
    const gx = k * CELL;
    if (gx < x0 - ROAD_WIDTH_CITY || gx > x1 + ROAD_WIDTH_CITY) continue;
    const sg = new THREE.PlaneGeometry(ROAD_WIDTH_CITY, CHUNK_SIZE);
    sg.rotateX(-Math.PI / 2);
    const strip = new THREE.Mesh(sg, roadMat);
    strip.position.set(gx, 0.01, cz * CHUNK_SIZE);
    group.add(strip);
    disposables.push(sg);
  }
  // 가로 도로(z 고정)
  for (let k = bzMin; k <= bzMax; k++) {
    const gz = k * CELL;
    if (gz < z0 - ROAD_WIDTH_CITY || gz > z1 + ROAD_WIDTH_CITY) continue;
    const sg = new THREE.PlaneGeometry(CHUNK_SIZE, ROAD_WIDTH_CITY);
    sg.rotateX(-Math.PI / 2);
    const strip = new THREE.Mesh(sg, roadMat);
    strip.position.set(cx * CHUNK_SIZE, 0.01, gz);
    group.add(strip);
    disposables.push(sg);
  }

  // (c) 이 타일 영역에 '블록 중심'이 든 건물들의 박스 (팔레트 색)
  for (let bx = bxMin; bx <= bxMax; bx++) {
    for (let bz = bzMin; bz <= bzMax; bz++) {
      const b = buildingAt(bx, bz);
      if (!b.exists) continue;
      // 블록 중심이 이 타일에 속할 때만 이 타일이 소유(중복 방지)
      if (b.cx < x0 || b.cx >= x1 || b.cz < z0 || b.cz >= z1) continue;

      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mat = new THREE.MeshPhongMaterial({ color: b.colorHex, shininess: 12 });
      const box = new THREE.Mesh(geo, mat);
      box.position.set(b.cx, b.h / 2, b.cz);
      group.add(box);
      disposables.push(geo, mat);
    }
  }

  return { group, disposables };
}

function disposeTile(tile) {
  for (const d of tile.disposables) d.dispose();
}

// 도시 맵 객체 생성 (factory) ──────────────────────────────────────
export function createCityMap() {
  // 청크(타일) 스트리밍 상태(맵 내부 보유)
  const loadedTiles = new Map();

  // 목표 지점 — z축 도로(x=0 격자선)를 따라 교차점에 5개 배치
  const goals = [];
  for (let k = 1; k <= 5; k++) {
    goals.push({ index: k - 1, x: 0, z: k * CELL });
  }

  return {
    id: 'city',
    label: '도시',

    // ── 높이/법선 (순수) ─────────────────────────────────
    heightAt(x, z) { return cityHeight(x, z); },
    normalAt(x, z) { return terrainNormal(x, z, cityHeight); },  // 평지 → {0,1,0}

    // ── 주행 가능 영역 (순수) ────────────────────────────
    isOnRoad(x, z) { return cityIsOnRoad(x, z); },
    distanceToRoad(x, z) {
      return Math.max(0, Math.min(distToGrid(x), distToGrid(z)) - HALF);
    },

    // ── 통과 불가(고체) 판정 (순수) — 건물 AABB 내부면 true ──────
    isBlocked(x, z) { return cityIsBlocked(x, z); },

    // ── 목표 지점 (순수) ─────────────────────────────────
    getGoals() { return goals; },

    getSpawn() {
      // 교차로(0,0) — heading 0 (+Z, z축 도로를 따라)
      return { x: 0, z: 0, y: 0, heading: 0 };
    },

    // ── 미니맵 (순수 데이터, 통일 포맷) ──────────────────
    getMinimapData() {
      const RANGE = 6;  // 원점 주변 -6..6 칸의 격자 도로 중심선
      const lo = -RANGE * CELL, hi = RANGE * CELL;
      const polylines = [];
      for (let k = -RANGE; k <= RANGE; k++) {
        const c = k * CELL;
        polylines.push([{ x: c, z: lo }, { x: c, z: hi }]);  // 세로 도로(x 고정)
        polylines.push([{ x: lo, z: c }, { x: hi, z: c }]);  // 가로 도로(z 고정)
      }
      return {
        polylines,
        goals: goals.map((g) => ({ x: g.x, z: g.z })),
        bounds: { minX: lo, maxX: hi, minZ: lo, maxZ: hi },
      };
    },

    // ── 세계 구성 (THREE) ────────────────────────────────
    buildStatic(scene) {
      // 도시 분위기: 옅은 회색 하늘 + 약한 포그 + 도시톤 조명
      scene.background = new THREE.Color(0xb8bcc2);
      scene.fog = new THREE.FogExp2(0xb8bcc2, 0.006);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.1);
      sunLight.position.set(200, 400, 150);
      scene.add(sunLight);
      scene.add(new THREE.HemisphereLight(0xc8ccd2, 0x40444a, 0.5));
    },

    // ── 청크(타일) 스트리밍 (THREE) ──────────────────────
    updateWorld(px, pz, scene) {
      const pcx = Math.floor(px / CHUNK_SIZE);
      const pcz = Math.floor(pz / CHUNK_SIZE);

      for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
        for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
          const cx  = pcx + dx, cz = pcz + dz;
          const key = `${cx},${cz}`;
          if (!loadedTiles.has(key)) {
            const tile = createTile(cx, cz);
            scene.add(tile.group);
            loadedTiles.set(key, tile);
          }
        }
      }

      const toDelete = [];
      for (const [key, tile] of loadedTiles) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > RENDER_DIST + 1 || Math.abs(cz - pcz) > RENDER_DIST + 1) {
          scene.remove(tile.group);
          disposeTile(tile);
          toDelete.push(key);
        }
      }
      toDelete.forEach(function(k) { loadedTiles.delete(k); });
    },
  };
}
