# 📚 문서 목차 (INDEX)

> 작업 진입 규약: **CLAUDE.md → 이 INDEX → 관련 문서 → 진행**. 새 문서를 추가하면 여기에 한 줄로 등록한다.

## 명세 (spec) — SSoT
- [seed.md](spec/seed.md) — Ouroboros Seed 명세. GOAL·제약·ACCEPTANCE_CRITERIA·온톨로지·확정된 게임 디자인 결정.

## 설계 (design)
- [terrain.md](design/terrain.md) — terrain.js 순수 모듈 설계(노이즈·높이·LOD·색상).
- [road.md](design/road.md) — road.js 순수 기하 설계(중심선·체크포인트·isOnRoad).
- [drivetrain.md](design/drivetrain.md) — engine.js + gearbox.js 설계(RPM·클러치·stall·기어비).
- [dynamics.md](design/dynamics.md) — dynamics.js + vehicle.js 설계(운동학·전복·통합 상태기계).
- [input.md](design/input.md) — input.js 키 매핑 + 1인칭 운전석 카메라 결선 설계.
- [reverse-controls.md](design/reverse-controls.md) — 후진(R) 기어에서 W/S(throttle/brake) 반전 설계.
- [audio.md](design/audio.md) — 사운드 시스템(엔진 샘플 루프+RPM playbackRate, 변속음 샘플/클릭 폴백) 설계.
- [maps.md](design/maps.md) — 맵 추상화 인터페이스 + 도시 맵(격자 도로·박스 건물) 설계. M12a/b/c 분할.
- [cartypes.md](design/cartypes.md) — 차종 선택(승용차/트럭) 성능·외형 파라미터 주입 설계.
- [delivery.md](design/delivery.md) — 유로트럭식 배송 모드(미션 상태기계·순수 운송) 설계.
- [m15-improvements.md](design/m15-improvements.md) — 빠른개선(ESC정지·안개제거+비콘·거리확대·기어속도) 설계.
- [m16-cargo-bigmap.md](design/m16-cargo-bigmap.md) — 화물 시각화 + 큰 지도 보기 설계.
- [m17-mission-variety.md](design/m17-mission-variety.md) — 미션 다양화(화물 종류·운임·수익·경로) 설계.
- [m18-pohang-map.md](design/m18-pohang-map.md) — 포항 실지형 맵(DEM 표고 + OSM 도로망) 설계.
- [m19-arrow-lights.md](design/m19-arrow-lights.md) — 목표 방향 나침반 + 차량 등화 설계.
- [carmesh.md](design/carmesh.md) — render/carMesh.js 차량 메시 + 변환 설계.
- [scoring.md](design/scoring.md) — scoring.js 감점/게임오버/승리·체크포인트 타이머 설계.
- [minimap-hud.md](design/minimap-hud.md) — minimap.js(상공뷰) + hud.js(RPM 게이지) 설계.

## 완료 노트 (done)
- [m0-scaffold.md](done/m0-scaffold.md) — M0 스캐폴드: Vitest 추가, 앱 빌드/테스트 검증.
- [m1-terrain.md](done/m1-terrain.md) — M1 terrain.js 추출 + 단위 테스트 13건, main.js 중복 제거.
- [m2-road.md](done/m2-road.md) — M2 road.js + 도로/체크포인트 렌더, 단위 테스트 22건.
- [m3-drivetrain.md](done/m3-drivetrain.md) — M3 engine.js+gearbox.js, 단위 테스트 23건(stall 시나리오 포함).
- [m4-dynamics.md](done/m4-dynamics.md) — M4 dynamics.js+vehicle.js, 단위 테스트 21건(전복·통합 출발/stall).
- [m5-input.md](done/m5-input.md) — M5 input.js(8건) + main.js 1인칭 차량 주행 결선.
- [m6-carmesh.md](done/m6-carmesh.md) — M6 carMesh.js(2건) + 주행 통합, dev 서버 서빙 확인.
- [m7-scoring.md](done/m7-scoring.md) — M7 scoring.js(12건) + 감점/게임오버 통합, 결과 오버레이.
- [m8-minimap-hud.md](done/m8-minimap-hud.md) — M8 minimap.js(5건)+hud.js(3건), index.html 정리.
- [m9-acceptance.md](done/m9-acceptance.md) — M9 마감: README + ACCEPTANCE_CRITERIA 대조 검증(전 항목 충족).
- [m10-reverse-controls.md](done/m10-reverse-controls.md) — M10 후진(R) 기어 W/S 반전, 단위 테스트 6건(전체 128 그린).
- [m11-audio.md](done/m11-audio.md) — M11 사운드(엔진 샘플 루프+변속음), audio 테스트 23건(전체 151 그린).
- [m12a-map-abstraction.md](done/m12a-map-abstraction.md) — M12a 맵 추상화+naturalMap 래퍼(회귀 0), maps 테스트 16건(전체 167 그린).
- [m12bc-city-map.md](done/m12bc-city-map.md) — M12b/c 도시 맵(격자·다색 건물·충돌)+맵 선택 UI, city 테스트(전체 202 그린).
- [m13-cartypes.md](done/m13-cartypes.md) — M13 차종 선택(승용차/트럭) 성능·외형·UI, carTypes/carMesh 테스트(전체 231 그린).
- [m14-delivery.md](done/m14-delivery.md) — M14 배송 모드(미션 상태기계·HUD·미니맵, scoring 제거), mission 테스트(전체 272 그린).
- [m15-improvements.md](done/m15-improvements.md) — M15 빠른개선(ESC정지·안개제거+비콘·거리확대·기어속도), 전체 277 그린.
- [m16-cargo-bigmap.md](done/m16-cargo-bigmap.md) — M16 화물 시각화+큰지도+정차 적재/하차, 전체 290 그린.
- [m17-mission-variety.md](done/m17-mission-variety.md) — M17 미션 다양화(화물종류·운임·수익·mixed 경로), 전체 323 그린.
- [m18-pohang-map.md](done/m18-pohang-map.md) — M18 포항 실지형 맵(SRTM 표고+OSM 도로, fetch 스크립트), 전체 356 그린. (도시 사실화 다리/신호/터널은 부자연스러워 롤백)
- [m19-arrow-lights.md](done/m19-arrow-lights.md) — M19 목표 방향 나침반 + 차량 등화(브레이크/후진/방향지시), 전체 385 그린.

## 진행 현황 (마일스톤)
| # | 마일스톤 | 상태 | 문서 |
|---|---|---|---|
| M-S | Ouroboros 인터뷰 → Seed 명세 | ✅ 완료 | [spec/seed.md](spec/seed.md) |
| M0 | 프로젝트 스캐폴드 (Vite+Three+Vitest, 1인칭 자유시점) | ✅ 완료 | [done/m0-scaffold.md](done/m0-scaffold.md) |
| M1 | terrain.js 추출 + 테스트 | ✅ 완료 | [done/m1-terrain.md](done/m1-terrain.md) |
| M2 | road.js 도로/체크포인트 + 테스트 | ✅ 완료 | [done/m2-road.md](done/m2-road.md) |
| M3 | engine.js + gearbox.js 구동계 + 테스트 | ✅ 완료 | [done/m3-drivetrain.md](done/m3-drivetrain.md) |
| M4 | dynamics.js + vehicle.js 동역학 + 테스트 | ✅ 완료 | [done/m4-dynamics.md](done/m4-dynamics.md) |
| M5 | input.js + 1인칭 운전석 카메라 | ✅ 완료 | [done/m5-input.md](done/m5-input.md) |
| M6 | carMesh.js + 주행 통합 | ✅ 완료 | [done/m6-carmesh.md](done/m6-carmesh.md) |
| M7 | scoring.js 감점/게임오버 + 테스트 | ✅ 완료 | [done/m7-scoring.md](done/m7-scoring.md) |
| M8 | minimap.js + hud.js | ✅ 완료 | [done/m8-minimap-hud.md](done/m8-minimap-hud.md) |
| M9 | 마감 + 검증 | ✅ 완료 | [done/m9-acceptance.md](done/m9-acceptance.md) |
| M10 | 후진(R) 기어 W/S 입력 반전 | ✅ 완료 | [done/m10-reverse-controls.md](done/m10-reverse-controls.md) |
| M11 | 사운드(엔진음+변속음+음소거) | ✅ 완료 | [done/m11-audio.md](done/m11-audio.md) |
| M12a | 맵 추상화 + naturalMap 래퍼 | ✅ 완료 | [done/m12a-map-abstraction.md](done/m12a-map-abstraction.md) |
| M12b/c | 도시 맵(격자·건물·충돌) + 맵 선택 UI | ✅ 완료 | [done/m12bc-city-map.md](done/m12bc-city-map.md) |
| M13 | 차종 선택(승용차/트럭) | ✅ 완료 | [done/m13-cartypes.md](done/m13-cartypes.md) |
| M14 | 유로트럭식 배송 모드(순수 운송) | ✅ 완료 | [done/m14-delivery.md](done/m14-delivery.md) |
| M15 | 빠른개선(ESC정지·안개·비콘·거리·기어) | ✅ 완료 | [done/m15-improvements.md](done/m15-improvements.md) |
| M16 | 화물 시각화 + 큰지도 + 정차 적재 | ✅ 완료 | [done/m16-cargo-bigmap.md](done/m16-cargo-bigmap.md) |
| M17 | 미션 다양화(화물·운임·수익·경로) | ✅ 완료 | [done/m17-mission-variety.md](done/m17-mission-variety.md) |
| M18 | 포항 실지형 맵(DEM+OSM) | ✅ 완료 | [done/m18-pohang-map.md](done/m18-pohang-map.md) |
| M19 | 목표 방향 나침반 + 차량 등화 | ✅ 완료 | [done/m19-arrow-lights.md](done/m19-arrow-lights.md) |
