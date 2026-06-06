# M17 완료 — 배송 미션 다양화 (화물 종류·운임·수익·경로)

## 구현

### M17a 코어(순수)
- `src/cargoTypes.js` (신규) — `CARGO_TYPES` 5종(가구/식료품/건축자재/자동차부품/냉장, 각 {id,label,icon,color,baseRate}). `cargoIndexFor`/`cargoFor`(좌표 해시 결정론)/`cargoById`.
- `src/mission.js` — `FARE_BASE=3000`, `jobDistance`, `computeFare(=round(FARE_BASE+거리×baseRate))`, `enrichJob`(멱등: cargo/distance/fare 부여, pickup/dropoff 원본 보존). `jobsFromPoints`에 `mode:'mixed'`(결정론 LCG 셔플 쌍) + `.map(enrichJob)`. `createMission().earnings=0`. `stepMission` delivered/allDone에 `earnings += job.fare`(가드 `?? 0`) + 반환 `fare`(event 문자열 유지·불변).

### M17b 표시 결선
- `src/render/carMesh.js` — `setCargo(car, visible, color?)` 화물 박스 색 지정.
- `src/render/hud.js` — line2에 화물 아이콘/라벨·이번 운임·누적 수익(₩ 천단위) 추가, needStop 유지.
- `src/main.js` — pickedUp 시 화물색 setCargo+라벨/운임 토스트, delivered/allDone 시 `+₩fare (누적 ₩)`, missionView 확장, 결과 오버레이 총수익, startGame `mode:'mixed'` 채택.

## 테스트

- `src/cargoTypes.test.js`(데이터/결정론/분산), `src/mission.test.js` 확장(운임·거리·mixed·earnings 누적·불변).
- 전체: **323 passed**. build 성공.
- 비고: mixed 거리편차 테스트는 "체이닝보다 큼"이 수학적으로 불가(가장 먼 쌍이 배열 인접→체이닝이 최대 흡수)라 **순차 pairs 모드와 비교**로 정정.

## 검증

- 단위 테스트 그린. 수동: 화물 종류색 박스, 운임/누적수익 HUD/토스트, mixed 경로 다양화, 총수익 오버레이 확인.

## 설계

- [design/m17-mission-variety.md](../design/m17-mission-variety.md)
