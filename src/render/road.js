// ══════════════════════════════════════════════════════════════
// render/road.js — 도로/체크포인트를 지형 위에 그리는 THREE 메시 생성
// 순수 기하는 ../road.js, 높이는 ../terrain.js 에서 가져온다.
// ══════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { terrainHeight } from '../terrain.js';
import { pointAtDistance } from '../road.js';

// 도로 중심선을 따라 지형에 드리운 리본 메시 생성 ───────────────────
function buildRoadMesh(road, opts = {}) {
  const step  = opts.step ?? 2;     // 중심선 샘플 간격
  const yLift = opts.yLift ?? 0.18;  // 지형 위로 살짝 띄움(z-fighting 방지)
  const halfW = road.width / 2;

  const n = Math.max(2, Math.ceil(road.totalLength / step));
  const samples = [];
  for (let i = 0; i <= n; i++) {
    samples.push(pointAtDistance(road, (road.totalLength * i) / n));
  }

  const positions = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;            // 진행방향 수직(좌우)
    const lx = p.x + nx * halfW, lz = p.z + nz * halfW;
    const rx = p.x - nx * halfW, rz = p.z - nz * halfW;
    positions.push(
      lx, terrainHeight(lx, lz) + yLift, lz,
      rx, terrainHeight(rx, rz) + yLift, rz,
    );
  }

  const indices = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const l0 = i * 2, r0 = i * 2 + 1, l1 = (i + 1) * 2, r1 = (i + 1) * 2 + 1;
    indices.push(l0, r0, l1, r0, r1, l1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({ color: 0x2b2b30, shininess: 4, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

// 체크포인트 링 마커 생성 ──────────────────────────────────────────
function buildCheckpointMarker(cp, opts = {}) {
  const radius = opts.radius ?? 4;
  const color  = opts.color ?? 0xffcc00;
  const geo = new THREE.TorusGeometry(radius, 0.4, 8, 24);
  const mat = new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(cp.x, terrainHeight(cp.x, cp.z) + radius, cp.z);
  return ring;
}

// 도로 + 체크포인트를 묶은 그룹 생성 ───────────────────────────────
export function buildCourse(road, checkpoints, opts = {}) {
  const group = new THREE.Group();
  group.add(buildRoadMesh(road, opts));
  const markers = [];
  for (const cp of checkpoints) {
    const m = buildCheckpointMarker(cp, opts);
    markers.push(m);
    group.add(m);
  }
  return { group, markers };
}
