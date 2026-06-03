# M8 — minimap.js + hud.js (완료)

## 한 일
- `src/render/minimap.js`: `computeBounds`/`worldToMinimap`(순수 투영) + `createMinimap`(우상단 160px 캔버스). 도로 폴리라인·체크포인트(현재 목표 강조)·차량(heading 삼각형) 상공뷰.
- `src/render/hud.js`: `rpmToFraction`(순수) + `createHud`(하단 패널: RPM 게이지 막대, 기어/속도/엔진, 점수/체크포인트/타이머).
- `main.js`: 임시 driveHud 제거 → `createHud`+`createMinimap` 사용, 매 프레임 `hud.update`/`minimap.draw`.
- `index.html`: 사용 안 하는 LOD 정보패널·비행배지·조준점 제거.

## 검증
- `minimap.test.js` 4건 + `hud.test.js` 4건 = 8건 통과 (전체 109건).
- `npm run build` 성공, dev 서버 index/minimap.js/hud.js 모두 HTTP 200.

## 다음
- M9: 통합 점검, README 정리, Seed ACCEPTANCE_CRITERIA 대조 검증.
