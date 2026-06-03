# M6 — carMesh.js + 주행 통합 (완료)

## 한 일
- `src/render/carMesh.js`: `buildCar`(섀시+캐빈+바퀴4, test1 비율 참조), `updateCarTransform`(위치 + YXZ 회전: heading/−pitch/−roll).
- `main.js`: 차량 메시 씬 추가, 매 프레임 `updateCarTransform(car, vehicle.dyn)`. 1인칭 카메라를 운전석(중심 약간 앞·눈높이)에 두어 보닛이 시야 하단에 보이도록.

## 검증
- `carMesh.test.js` 2건 통과 (전체 89건): Group 반환·자식 6+, 변환 정확.
- `npm run build` 성공.
- `npm run dev` 서버 기동 확인: index HTTP 200, `/src/main.js` 변환 오류 없음, Vite ready (전체 모듈 그래프 정상).
- 브라우저 실주행 플레이(시동→1단→반클러치 출발→도로/체크포인트→전복 체감)는 사용자가 `npm run dev`로 확인 가능.

## 다음
- M7: `scoring.js` — 시동꺼짐/도로이탈/충돌/시간초과 감점 + 전복·대형사고 즉시 실패 + 70점 미만 탈락 + 체크포인트 타이머·승리.
