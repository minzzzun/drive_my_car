# M15 완료 — 주행/네비 빠른 개선 4종

## 구현

### #10 ESC 일시정지 → 엔진음 off + 차량 정지
- `src/render/audio.js` — `suspend()` 추가(`ctx.state==='running'`일 때 `ctx.suspend()`). 재개는 기존 resume()이 ctx.resume()까지 수행.
- `src/main.js` pauseGame() — `audio.suspend()` + `vehicle.dyn.speed=0; vehicle.speed=0`(null 가드).

### #3 안개 제거 + 목적지 3D 비콘
- naturalMap/cityMap buildStatic의 `scene.fog` 제거.
- `src/render/beacon.js` (신규) — 반투명 수직 빔(Cylinder h=120, fog:false, depthWrite:false) + 상단 핀 + 바닥 링. `createBeacon()`→{group,update(target,phase),dispose}. phase별 색(pickup 0x33aaff/dropoff 0xff5533), target 없으면 숨김.
- main: startGame에서 생성, updateHUD에서 currentTarget+map.heightAt로 update.

### #4 목적지 간 거리 확대
- naturalMap.getDeliveryPoints: placeCheckpoints(road, 6→4) (인접 ≈172m).
- cityMap.getDeliveryPoints: 격자 stride 확대(±2~±4, 첫 점 (0,216)≠스폰, 인접 ≈204m). ARRIVE_RADIUS 6 유지.

### #7 기어 최고속(5단)
- gearbox.js GEAR_RATIOS['5'] 0.8→0.95(단조성 유지). vehicle.js torque 바닥 혼합 `accelBase*(0.55+0.45*ratioK)`로 고단 토크 회복 → 5단 최고속 도달 가능.

## 테스트

- mission.test.js 인접 배송점 최소거리(자연 ≥150/도시 ≥180), gearbox 최고속 단조성(1<2<3<4<5), vehicle 5단>3단 정착 가드 추가.
- 전체: **277 passed**. build 성공.

## 검증

- 단위 테스트 그린. 수동: ESC 정지+엔진음off, 안개 제거+비콘 원경 가시, 거리 확대, 5단 속도 회복 확인.

## 설계

- [design/m15-improvements.md](../design/m15-improvements.md)
