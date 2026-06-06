# M14 완료 — 유로트럭식 배송 모드 (순수 운송)

> 적재지(pickup)에서 짐을 싣고 → 배송지(dropoff)로 운반, 여러 배송 체이닝. 시간 제한·감점 없음.

## 구현

### M14a — 미션 코어(순수)
- `src/mission.js` (신규) — `ARRIVE_RADIUS=6`, `createMission(jobs)`, `currentTarget(state)`, `stepMission(state,{x,z})`→{state,event}(불변), `jobsFromPoints(points)`(기본 체이닝: 이전 dropoff=다음 pickup). phase: toPickup→toDropoff→done. event: pickedUp/delivered/allDone.
- 맵 `getDeliveryPoints()` 추가 — natural=placeCheckpoints 도로 위 6점, city=격자 교차점 8점(스폰 제외). 결정론. getGoals 보존.

### M14b — HUD·미니맵·결선 + scoring 제거
- `src/render/hud.js` — `update(vehicle, missionView)`: line1 운전(RPM/기어/속도) 유지, line2 배송(단계 📦/🏁/✅·라벨·거리·적재·완료 n/total). 점수/타이머 제거. `showToast(text,ms)` 추가.
- `src/render/minimap.js` — `draw(dyn, missionMarker)`: pickup(파랑)/dropoff(주황) 마커, 현재 목표 강조. 차량 삼각형 유지.
- `src/main.js` — scoring 전면 제거(SCORING_ENABLED/createScore/checkpoints/채점 잔재). startGame에서 `createMission(jobsFromPoints(map.getDeliveryPoints()))`, updateVehicle에서 stepMission+토스트, updateHUD에서 missionView/marker, done시 '🎉 모든 배송 완료' 1회(이후 자유주행). animate/pause 게이트 mission 기반.
- `index.html` — 안내문 배송 안내로 갱신.
- scoring.js/scoring.test.js는 **보존**(호출만 끊음).

## 테스트

- `src/mission.test.js`(28) — 상태기계 전이·순서·전체완료·ARRIVE_RADIUS 경계·불변성, jobsFromPoints 결정론, getDeliveryPoints 도로 위·결정론. hud/minimap 테스트 배송 시그니처로 갱신.
- 전체: **272 passed**. `npm run build` 성공. scoring.test.js 보존 통과.

## 비고

- 순수 운송: 게임오버/탈락/감점 없음. 완료 후 자유주행. 도착 반경 6m.
- 후속 여지: 목표 방향 화살표(화면), 배송 보상/통계, 무한 배송.

## 설계

- [design/delivery.md](../design/delivery.md)
