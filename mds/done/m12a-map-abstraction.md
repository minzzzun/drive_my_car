# M12a 완료 — 맵 추상화 인터페이스 + naturalMap 래퍼

> 자연 맵을 인터페이스 위에 올림(회귀 0). 도시 맵(M12b)을 끼울 수 있는 틀 마련.

## 구현

- `src/maps/index.js` (신규) — 레지스트리. `getMap(id)`(미지/누락 id→기본 natural), `listMaps()`→[{id,label}].
- `src/maps/naturalMap.js` (신규) — `createNaturalMap()`. 기존 terrain/road/render·road/createChunk를 **호출만**(로직 불변). 인터페이스: heightAt/normalAt/isOnRoad/distanceToRoad/getGoals/getSpawn/getMinimapData/buildStatic/updateWorld. 청크 스트리밍(loadedChunks)을 main.js에서 이주.
- `src/main.js` — R1~R9 리팩터: 초기화를 `startGame(mapId='natural')`로 감싸 오버레이 click에서 호출. terrain/road 직접 의존 제거, map 인터페이스 경유. stepVehicle(map.heightAt)/normalAt/isOnRoad/getMinimapData. audio(M11) 결선 유지.
- `src/render/minimap.js` — `createMinimap(data)`로 시그니처 변경(통일 포맷 {polylines,goals,bounds} 소비, 다중 폴리라인 지원).
- `src/terrain.js`/`road.js`/`render/road.js`/`dynamics.js` — **불변**.

## 테스트

- `src/maps/index.test.js`(9) + `src/maps/naturalMap.test.js`(7) — 레지스트리, 래퍼 동치성(heightAt/normalAt/isOnRoad/getSpawn/getGoals === 기존 함수).
- 전체: **167 passed**. `npm run build` 성공.

## 검증

- 단위 테스트 전체 그린. 브라우저 수동 확인: 시작 화면·자연 맵 주행·미니맵 이전과 동일(회귀 0 확인).

## 비고

- 도시 맵(M12b), 시작 화면 맵 선택 UI(M12c)는 후속.

## 설계

- [design/maps.md](../design/maps.md) §1·§2·§5·§7(M12a)
