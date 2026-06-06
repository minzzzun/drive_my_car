// ══════════════════════════════════════════════════════════════
// maps/naturalMap.js — 자연(절차적 지형) 맵을 맵 추상화 인터페이스로 래핑
//
// 회귀 0 목표: 새 로직을 만들지 않고 기존 모듈(terrain/road/render/road)을
// 그대로 호출만 한다. createChunk/updateWorld/loadedChunks/disposeChunk를
// main.js 에서 이주해 맵 내부 상태로 보유한다(좌표·seg·색 공식 불변).
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';
import {
  CHUNK_SIZE, RENDER_DIST,
  terrainHeight, quantizeHeight, getSeg, heightToColorHex,
} from '../terrain.js';
import {
  DEFAULT_CHECKPOINTS, generateCourseWaypoints, createRoad, placeCheckpoints, isOnRoad,
  distanceToCenterline,
} from '../road.js';
import { terrainNormal } from '../vehicle/dynamics.js';
import { buildCourse } from '../render/road.js';

// 청크 생성 — main.js 에서 그대로 이주 (좌표/양자화/색 공식 불변) ──
const _chunkColor = new THREE.Color();   // 색상 변환용 임시 객체

function createChunk(cx, cz, seg) {
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos    = geo.attributes.position.array;
  const colors = new Float32Array(pos.length);

  for (let i = 0; i < pos.length; i += 3) {
    const wx  = cx * CHUNK_SIZE + pos[i];
    const wz  = cz * CHUNK_SIZE + pos[i + 2];
    const raw = terrainHeight(wx, wz);
    // ★ 핵심: 높이를 step 단위로 반올림 → 계단형 사각 지형
    const h   = quantizeHeight(raw, seg);
    pos[i + 1] = h;
    _chunkColor.setHex(heightToColorHex(h));
    colors[i] = _chunkColor.r; colors[i + 1] = _chunkColor.g; colors[i + 2] = _chunkColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();

  const mat  = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  return { mesh, mat, seg };
}

function disposeChunk(chunk) {
  chunk.mesh.geometry.dispose();
  chunk.mat.dispose();
}

// 자연 맵 객체 생성 (factory) ──────────────────────────────────────
export function createNaturalMap() {
  // 코스(도로 + 체크포인트) — main.js 와 동일 파라미터
  const waypoints   = generateCourseWaypoints({ count: 24, start: { x: 0, z: 0 } });
  const road        = createRoad(waypoints);
  const checkpoints = placeCheckpoints(road, DEFAULT_CHECKPOINTS);

  // 청크 스트리밍 상태(맵 내부 보유)
  const loadedChunks = new Map();

  return {
    id: 'natural',
    label: '자연 지형',

    // ── 높이/법선 (순수) ─────────────────────────────────
    heightAt(x, z) { return terrainHeight(x, z); },
    normalAt(x, z) { return terrainNormal(x, z, terrainHeight); },

    // ── 주행 가능 영역 (순수) ────────────────────────────
    isOnRoad(x, z) { return isOnRoad(road, x, z); },
    distanceToRoad(x, z) { return distanceToCenterline(road, x, z); },

    // ── 통과 불가(고체) 판정 (순수) — 자연 맵엔 고체 없음(회귀 0) ──
    isBlocked() { return false; },

    // ── 목표 지점 (순수) ─────────────────────────────────
    getGoals() { return checkpoints; },

    getSpawn() {
      const pos  = road.waypoints[0];
      const next = road.waypoints[1] ?? { x: pos.x, z: pos.z + 1 };
      const heading = Math.atan2(next.x - pos.x, next.z - pos.z);
      return { x: pos.x, z: pos.z, y: terrainHeight(pos.x, pos.z), heading };
    },

    // ── 미니맵 (순수 데이터, 통일 포맷) ──────────────────
    getMinimapData() {
      return {
        polylines: [road.waypoints.map((w) => ({ x: w.x, z: w.z }))],
        goals: checkpoints.map((cp) => ({ x: cp.x, z: cp.z })),
        bounds: null,  // 경계는 minimap 이 polylines 로부터 계산
      };
    },

    // ── 세계 구성 (THREE) ────────────────────────────────
    buildStatic(scene) {
      // 배경/포그/조명 (main.js 65~77행 분위기 그대로)
      scene.background = new THREE.Color(0x87ceeb);
      scene.fog = new THREE.FogExp2(0x87ceeb, 0.010);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sunLight = new THREE.DirectionalLight(0xfffde7, 1.3);
      sunLight.position.set(300, 500, 200);
      scene.add(sunLight);
      scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d6b3d, 0.45));

      // 코스(도로 + 체크포인트)
      const { group: courseGroup } = buildCourse(road, checkpoints);
      scene.add(courseGroup);
    },

    // ── 청크 스트리밍 (THREE) — main.js 에서 그대로 이주 ──
    updateWorld(px, pz, scene) {
      const pcx = Math.floor(px / CHUNK_SIZE);
      const pcz = Math.floor(pz / CHUNK_SIZE);

      for (let dx = -RENDER_DIST; dx <= RENDER_DIST; dx++) {
        for (let dz = -RENDER_DIST; dz <= RENDER_DIST; dz++) {
          const cx  = pcx + dx, cz = pcz + dz;
          const key = `${cx},${cz}`;
          const seg = getSeg(cx, cz, pcx, pcz);
          const ex  = loadedChunks.get(key);

          if (!ex) {
            const chunk = createChunk(cx, cz, seg);
            chunk.polyCount = Math.floor(chunk.mesh.geometry.index.count / 3);
            scene.add(chunk.mesh);
            loadedChunks.set(key, chunk);
          } else if (ex.seg !== seg) {
            scene.remove(ex.mesh);
            disposeChunk(ex);
            const chunk = createChunk(cx, cz, seg);
            chunk.polyCount = Math.floor(chunk.mesh.geometry.index.count / 3);
            scene.add(chunk.mesh);
            loadedChunks.set(key, chunk);
          }
        }
      }

      const toDelete = [];
      for (const [key, chunk] of loadedChunks) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > RENDER_DIST + 1 || Math.abs(cz - pcz) > RENDER_DIST + 1) {
          scene.remove(chunk.mesh);
          disposeChunk(chunk);
          toDelete.push(key);
        }
      }
      toDelete.forEach(function(k) { loadedChunks.delete(k); });
    },
  };
}
