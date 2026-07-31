# 에어팟 로그 — 작업 로그 (수요일)

`fixPlan.md`에 정리해둔 수정 사항을 하나씩 구현하고, `web_audio.md` 계획도 함께 반영함.

## 1. 페르소나가 대화 끝마다 음악을 추천하던 문제 (fixPlan 이슈 1)

- 원인: `backend/src/services/geminiService.js`의 `SYSTEM_INSTRUCTION`에서 페르소나를
  "음악을 깊이 아는 친구"로 정의하면서 고정 예시 멘트("이건 집중해야 할 때 딱이야" 등)를
  박아둔 것이 모델이 매번 반복하는 대화 종료 패턴으로 굳어진 것으로 특정.
  `maxOutputTokens`나 히스토리 슬라이딩 윈도우는 코드에 없어서 원인에서 제외.
- 수정: 고정 예시 멘트를 제거하고, "대화를 인위적으로 마무리하지 말 것 / 맥락 유지하며
  자연스럽게 이어갈 것 / 음악으로 대화를 억지로 유도하지 말 것"을 시스템 프롬프트에
  명시적으로 추가.

## 2. 음성 입력 무음 자동 종료 — VAD (fixPlan 이슈 2)

- `front/src/AirPodsLog.jsx`에 마이크 스트림용 AnalyserNode를 붙여 볼륨을 측정하고,
  무음이 일정 시간(`SILENCE_DURATION_MS`) 지속되면 자동으로 녹음을 종료하도록 구현.
- 이후 이슈 3 작업에서 "발화 대기(waiting) / 발화 중(active)" 두 서브 단계로 고도화
  (녹음 시작 직후 "아직 말 안 함 = 무음"으로 오인해 바로 끊기던 문제 해결).
- 수동 마이크 버튼은 "말 다 했어요" 즉시 종료용 폴백으로 유지.

## 3. AI 응답 후 자동으로 다시 듣기 — 핸즈프리 대화 루프 (fixPlan 이슈 3)

- 대화 전체를 상태 머신으로 재구성: `idle → listening → processing → speaking → listening ...`
  (`conversationState`).
- 상황 선택 클릭(최초이자 유일한 사용자 제스처) 시점에 마이크 권한을 미리 확보해두고,
  이후 SPEAKING → LISTENING 전환은 버튼 클릭 없이 자동으로 진행.
- TTS 재생 종료(`onended`) 시 `speakThenContinue`가 자동으로 `startListening()`을 호출해
  루프를 이어감.
- 상태와 무관하게 항상 눌러 대화를 끝낼 수 있는 "종료" 버튼 추가 (`handleEndConversation`).
- STT/LLM/TTS 각 호출에 20초 타임아웃(`withTimeout`)을 걸고, `sessionAliveRef` /
  `conversationActiveRef`로 "처리 중에 종료를 눌렀을 때" 뒤늦은 응답이 화면/오디오에
  반영되지 않도록 가드.

### 버그: 음성 입력 시 "세션이 연결되지 않았어요" 오류

- 증상: 텍스트 전송은 되는데 음성 입력만 하면 매번 "아직 세션이 연결되지 않았어요"가 뜸.
  새로고침해도 동일.
- 원인: 상황 선택 → 세션 생성 → 인사말 재생 → 자동 듣기로 이어지는 음성 루프
  (`handleSelectSituation → speakThenContinue → startListening → processVoiceMessage`)가
  전부 **최초 클릭 시점의 클로저**를 그대로 재사용하는 구조라, `sessionId`를 state로만
  읽으면 이후 `setSessionId`로 갱신된 값을 못 보고 초기값(`null`)에 갇히는 stale closure
  버그였음. (텍스트 전송 버튼은 클릭할 때마다 새로 렌더된 핸들러를 쓰기 때문에 이 버그를
  안 탔음.)
- 수정: `sessionIdRef`를 추가해 `setSessionId`와 항상 함께 갱신하고, 음성 루프 내부에서는
  `sessionId` state 대신 `sessionIdRef.current`를 읽도록 변경.

## 4. Web Audio API 파형 시각화 (web_audio.md)

- 마이크 입력 파형: VAD용으로 이미 만들어둔 `micAnalyserRef`를 파형 그리기에도 그대로
  공유 (별도 AudioContext 없이 하나의 파이프라인으로 처리). `source`는 `analyser`에만
  연결하고 `destination`엔 연결하지 않아 하울링 방지.
- AI 응답 파형: `ensureTtsAnalyser`로 앱 전체가 재사용하는 단일 `<audio>` 엘리먼트에
  `createMediaElementSource`를 최초 1회만 호출하고, 이후 응답부터는 재사용
  (`createMediaElementSource`는 엘리먼트당 한 번만 호출 가능하다는 문서의 주의사항 반영).
- Canvas 2D + `requestAnimationFrame` 루프로 그리기: LISTENING엔 마이크 파형(teal),
  SPEAKING엔 TTS 파형(gold), 그 외엔 중앙 직선.
- `<canvas>`가 `/chat` 라우트에서만 mount되므로, 라우트 전환마다(`location.pathname`
  변경마다) 그리기 루프를 다시 붙이도록 처리.
- 언마운트 시 `ttsAudioContextRef`/`waveformRafRef` 정리, LISTENING 종료마다
  `stopSilenceWatcher`에서 마이크 쪽 AudioContext 정리.

## 남은 일

- `SILENCE_THRESHOLD` / `SILENCE_DURATION_MS`는 실사용 환경(마이크, 배경 소음)에서
  실측 후 튜닝 필요.
- 브라우저에서 핸즈프리 루프(듣기 → 처리 → 말하기 → 다시 듣기) 전체와 파형이 실제로
  잘 동작하는지 눈으로 확인 필요.
