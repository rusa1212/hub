# 대화 종료 리캡 구현

## 개요

대화 종료 후 홈으로 바로 이동하던 흐름을 리캡 화면으로 변경했다. 사용자는 방금 나눈 대화를 짧게 확인하고, 같은 세션을 이어가거나 홈으로 이동할 수 있다.

```text
대화 종료 → 리캡 생성 → 요약 확인 → 대화 이어하기 또는 홈 이동
```

## 핵심 구현

- `/recap/:sessionId` 리캡 화면 추가
- 선택한 상황과 대화 한 줄 요약 표시
- 대략적인 대화 시간과 사용자 발화 횟수 표시
- 기존 세션을 복원하는 `이어서 대화하기` 제공
- 로그인 및 익명 세션 모두 지원
- 저장된 요약이 있으면 Gemini를 다시 호출하지 않고 재사용
- 객관적인 요약을 위해 진단·평가·민감정보 반복을 제한하는 프롬프트 적용

요약 API `POST /api/session/:id/summary`는 다음 리캡 정보를 반환하도록 확장했다.

```json
{
  "sessionId": "session-id",
  "situation": "commuting",
  "summary": "발표를 앞두고 느끼는 긴장과 준비 과정에 관해 이야기했어요.",
  "messageCount": 6,
  "userMessageCount": 3,
  "createdAt": "2026-08-15T10:00:00.000Z",
  "endedAt": "2026-08-15T10:07:00.000Z"
}
```

## 예외 처리

- 사용자 발화가 없으면 Gemini 호출 없이 빈 대화 안내 표시
- 요약 생성 실패 시 세션 상세 정보로 상황과 발화 횟수 복구
- 실패 화면에서 `다시 시도`, `이어서 대화하기`, `홈으로` 제공
- React Strict Mode에서 동일 리캡이 중복 요청되지 않도록 방지

## 변경 파일

- `front/src/RecapScreen.jsx`
- `front/src/RecapScreen.css`
- `front/src/RecapScreen.test.jsx`
- `front/src/AirPodsLog.jsx`
- `backend/src/controllers/sessionController.js`
- `backend/src/routes/session.js`
- `backend/src/services/sessionStore.js`
- `backend/src/services/geminiService.js`

## 검증

- 테스트 41개 통과
- 프로덕션 빌드 성공
- 백엔드 문법 검사 통과
- 린트 오류 없음
