// ══════════════════════════════════════════════════════════════
// maps/index.js — 맵 레지스트리
// getMap(id): 알 수 없는/누락 id → 기본값 'natural'.
// listMaps(): [{id, label}] (현재 natural 만 등록, city 는 M12b).
// ══════════════════════════════════════════════════════════════
import { createNaturalMap } from './naturalMap.js';

const DEFAULT_MAP_ID = 'natural';

// 맵 팩토리 레지스트리 (id → factory)
const MAP_FACTORIES = {
  natural: createNaturalMap,
};

// 라벨(시작 화면 표시용) — 맵 인스턴스를 만들지 않고도 목록을 보이기 위함
const MAP_LABELS = {
  natural: '자연 지형',
};

// id 로 맵 객체 생성. 알 수 없거나 누락이면 기본값(natural).
export function getMap(id) {
  const factory = MAP_FACTORIES[id] ?? MAP_FACTORIES[DEFAULT_MAP_ID];
  return factory();
}

// 등록된 맵 목록 [{id, label}].
export function listMaps() {
  return Object.keys(MAP_FACTORIES).map((id) => ({
    id,
    label: MAP_LABELS[id] ?? id,
  }));
}
