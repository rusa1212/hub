# 상황(페르소나) 분류 고도화 계획 (SituationEnhancementPlan)

## 1. 배경 및 목표

상황 선택 화면의 6가지 분류(운동 중 / 자기 전 / 아침 기상 / 이동 중 / 집중 모드 / 그냥 대화)는
상황을 골라도 **인사말 한 줄과 시스템 프롬프트 한 줄만** 바뀌었다. 사용자가 "상황을 골랐더니 뭔가 달라졌다"를
체감할 수 있도록 아래 6단계로 보완한다. 이 문서는 완료된 1·2단계를 요약하고, **남은 3~6단계의 설계**를 정리한다.

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 상황 정의를 `personas` 테이블 단일 출처로 통합 | ✅ 완료 (`e048af3`) |
| 2 | 상황별 TTS 말투 · 최대 문장 수 · 무음 감지(VAD) 기준 | ✅ 완료 (`0527010`), 실사용 튜닝 필요 |
| 3 | 상황별 고유 기능 (타이머 · 브리핑 등) | 🟨 수면 타이머·뽀모도로 완료 (`013`), 나머지 보류 |
| 4 | 선택 UX 개선 (시간대 추천 · 대화 중 전환 · 설명 문구) | ✅ 완료 (`014`), 실호출 검증 필요 |
| 5 | 신규 상황 추가 (요리·집안일 / 산책·휴식 / 기분 전환) | ✅ 완료 (`015`), 기분 전환은 비공개 |
| 6 | 상황별 사용 데이터로 검증 (관리자 통계) | ⬜ 예정 |

**원칙**: 이 앱은 "화면을 보지 않고 귀로 듣는" 앱이다. 모든 추가 기능은 음성만으로 쓸 수 있어야 하고,
화면 조작이나 텍스트 위주의 기능은 핵심 전제와 어긋나므로 피한다.

---

## 2. 완료된 작업 요약 (1·2단계)

### 2-1. 단일 출처 (`011_persona_config.sql`)

- `personas` 테이블에 `greeting`, `prompt`, `sort_order`, `is_active` 추가
- `GET /api/situations` (공개, `prompt`는 응답에서 제외) → 프런트 `SituationsContext.jsx`가 소비
- 백엔드 `personaStore.js`가 5분 메모리 캐시 (DB 수정 후 최대 5분 뒤 반영)
- '그냥 대화'는 `persona_id = null` 관례 유지 — 화면 메타는 `SituationsContext.GENERAL_CHAT`,
  프롬프트는 `geminiService.GENERAL_CHAT_INSTRUCTION`
- 상황 숨기기는 행 삭제 대신 `is_active = false` (삭제 시 과거 세션 `persona_id`가 null로 바뀜)

### 2-2. 상황별 "소리" (`012_persona_audio.sql`)

- `tts_style`: TTS 요청을 `Say <style>: <본문>`으로 보냄. 스타일 지시로 SAFETY 차단되면 말투 없이 1회 재시도
- `max_sentences`: 시스템 프롬프트에 "N문장 이내" 규칙 추가
- `silence_threshold` / `silence_duration_ms`: 프런트 VAD 기준값을 세션 시작 시 상황별로 적용 (null이면 기본값 10 / 1500ms)

### 2-3. 남은 확인 사항 (2단계)

- [ ] Supabase에 `011`, `012` 마이그레이션 실행
- [ ] 자기 전 / 아침 기상 / 이동 중 / 집중 모드 말투가 SAFETY에 걸리지 않는지 실제 확인
      (운동 중만 검증 완료 — 나머지는 API 쿼터 소진으로 미확인)
- [ ] VAD 기준값 실기기 튜닝 (현재 값은 추정치: 운동 중·이동 중 14, 자기 전 7 등)
- [ ] (선택) `BARGE_IN_THRESHOLD`(15)도 상황별로 둘지 검토 — 운동 중/이동 중 기준(14)과 거의 같아서
      소음 환경에서 끼어들기 오탐이 생길 수 있음

---

## 3. 상황별 고유 기능 (3단계)

### 3-1. 목표

상황마다 "이 상황이라서 가능한" 기능을 하나씩 둔다. 한 번에 모두 만들지 않고,
**자기 전 수면 타이머 → 집중 모드 뽀모도로** 순으로 하나씩 진행한다 (구현이 단순하고 체감이 큰 순서).

| 상황 | 기능 | 동작 요약 | 우선순위 |
|---|---|---|---|
| 자기 전 | 수면 타이머 | N분 동안 사용자 발화가 없으면 작별 인사 후 대화를 자동 종료 | 1 |
| 집중 모드 | 뽀모도로 | 25분 집중 / 5분 휴식 시점에 짧은 음성 알림, 그 외엔 먼저 말 걸지 않음 | 2 |
| 운동 중 | 인터벌 신호 | "30초 남았어" 같은 시간 신호, 음성으로 "1분 타이머" 설정 | 3 |
| 아침 기상 | 오늘 브리핑 | 날씨·오늘 할 일을 1~3문장으로 브리핑 | 4 (외부 API 필요) |
| 이동 중 | 도착 알림 | "20분 뒤에 알려줘" → 시간 되면 음성 알림 | 5 |

### 3-2. 공통 설계: 상황별 기능 플래그

기능을 켜고 끄는 것도 1단계처럼 `personas`에서 관리한다.

```sql
-- 013_persona_features.sql (예정)
alter table personas add column if not exists features jsonb not null default '{}'::jsonb;

update personas set features = '{"sleepTimer": {"idleMinutes": 10}}' where id = 'sleeping';
update personas set features = '{"pomodoro": {"focusMinutes": 25, "breakMinutes": 5}}' where id = 'studying';
```

- `GET /api/situations` 응답에 `features` 포함 → 프런트는 `situationRef.current.features`로 분기
- 기능 코드는 `AirPodsLog.jsx`(이미 1300줄 이상)에 넣지 말고 `front/src/features/sleepTimer.js`처럼
  **순수 로직 + 훅**으로 분리해 `bargeIn.js`처럼 단위 테스트가 가능하게 한다

### 3-3. 수면 타이머 (자기 전) 상세

- 사용자가 말하지 않은 채로 `idleMinutes`가 지나면:
  1. 에이전트가 "푹 자, 내일 또 얘기하자." 같은 짧은 작별 인사를 TTS로 재생
  2. 기존 "대화 종료" 흐름(`AirPodsLog.jsx`의 `handleEndConversation` → 리캡 화면)을 그대로 호출
- 사용자가 "10분 뒤에 꺼줘"라고 말하면 타이머 시간을 바꾼다
  - 방법 A: Gemini 응답에서 구조화된 신호를 받는다 (function calling) — 정확하지만 구현량 큼
  - 방법 B: 우선 정해진 시간(10분)만 쓰고, 음성 설정은 나중에 한다 — **1차는 B로 시작**
- 현재 LISTENING 상태에서 발화 대기(`waiting`)는 무한정이다. 타이머는 이 대기 시간을 재는 방식으로 붙인다

### 3-4. 뽀모도로 (집중 모드) 상세

- 세션 시작 시각 기준으로 25분/5분 경계마다 알림 멘트를 TTS로 재생 (LISTENING 중일 때만, 재생 중이면 끝난 뒤)
- 알림 멘트는 LLM 호출 없이 고정 문구로 해서 쿼터를 아낀다 (TTS 1회만 소모)
- 탭이 백그라운드로 가면 `setTimeout`이 늦게 실행될 수 있으므로, 경과 시간은 `Date.now()` 차이로 계산

### 3-5. 구현 결과 (1차)

- `013_persona_features.sql`: `personas.features jsonb` 추가, `sleeping`에 `sleepTimer`, `studying`에 `pomodoro` 설정
- `GET /api/situations` 응답에 `features` 포함 (`personaStore` → `situationController`)
- 프런트 `front/src/features/sleepTimer.js`, `pomodoro.js`: 설정 검증·시간 계산은 순수 함수, 타이머는 훅
  (`useSleepTimer`, `usePomodoro`). `AirPodsLog.jsx`는 훅 호출과 알림/종료 콜백만 추가
- 공통 규칙: 두 기능 모두 **발화 대기(listening + waiting) 중에만** 동작. 음성이 꺼진(텍스트 전용) 상태에선 동작하지 않음
- 수면 타이머
  - "활동" = 대화가 한 번 오간 뒤 다시 듣기 상태로 들어온 시점. 잡음으로 발화 감지만 됐다 끝난 경우는 활동으로 치지 않음
  - 작별 인사(고정 문구) 재생 중 사용자가 끼어들면 종료하지 않고 대화를 이어감
  - 음성으로 시간 바꾸기("10분 뒤에 꺼줘")는 미구현 (방법 B로 시작)
- 뽀모도로
  - 경계 시점에 말하는 중이었으면 대기로 돌아온 직후 알림. 여러 경계를 한꺼번에 지났으면 현재 구간만 한 번 알림
  - 세션을 이어하기로 다시 열면 그 시점부터 새로 잰다
- 알림·작별 문구는 화면에 에이전트 메시지로 보이지만 서버 대화 기록(`messages`)에는 저장하지 않음 (인사말과 동일)
- 남은 확인: Supabase에 `013` 실행, 실기기에서 10분 대기 후 자동 종료·25분 알림 확인
- 보류: 운동 중 인터벌·이동 중 도착 알림(음성으로 시간 설정 → function calling 필요, 4-2와 함께 설계),
  아침 브리핑(외부 API, 별도 문서)

### 3-6. 주의사항

- **API 쿼터**: 무료 티어 쿼터는 프로젝트 전체 기준이다 (`010_project_quota.sql`). 자동 알림도 TTS를
  소모하므로 알림 빈도를 제한하고, 음성이 꺼진 상태(`voiceDisabled`)면 알림도 건너뛴다
- 아침 브리핑의 날씨·일정은 외부 API와 연동해야 하고 위치·캘린더 권한이 필요하다 → 별도 설계 문서로 분리

---

## 4. 선택 UX 개선 (4단계)

### 4-1. 시간대 기반 추천

- 현재 시각으로 추천 상황 하나를 골라 선택 화면 맨 위에 강조한다 (순서 자체는 `sort_order` 유지)

| 시간대 | 추천 |
|---|---|
| 05:00–10:00 | 아침 기상 |
| 22:30–03:00 | 자기 전 |
| 그 외 | 추천 없음 (또는 로그인 사용자의 최근 7일 최다 사용 상황) |

- 구현: `personas`에 `recommend_hours int4range[]`를 추가하거나, 1차는 프런트 순수 함수
  `recommendSituation(now, situations)`로 시작 (단위 테스트 용이)
- 추천은 버튼에 "지금 추천" 배지를 다는 정도로만 표시하고, 자동 선택은 하지 않는다

### 4-2. 대화 중 상황 전환

- 현재는 세션 내내 상황이 고정이다 (`geminiService.buildSystemInstruction`의 "세션 내내 고정 적용")
- 사용자가 "이제 잘 거야"처럼 말하면 상황을 바꾼다:
  1. Gemini function calling으로 `switch_situation({ id })` 도구를 노출 (허용값은 활성 personas id)
  2. 백엔드 `postChat`이 도구 호출을 받으면 `sessions.persona_id`를 갱신하고, 응답에 `situation`을 담아 반환
  3. 프런트는 `situationRef.current`를 교체 → 다음 TTS·VAD부터 새 설정 적용
- 고려사항
  - `messages.persona_id`는 insert 트리거로 세션 값을 복사하므로(`005`) 전환 이후 메시지부터 새 상황으로 기록된다 — 통계상 의도대로 동작
  - 기록 화면은 세션의 **현재** `persona_id`로 분류되므로, "시작 상황"을 따로 남길지 결정 필요 (`sessions.initial_persona_id` 추가 여부)
  - 오탐 방지를 위해 "정말 바꿀까?" 확인 없이 바로 바꾸되, 바꿨다는 사실을 한 문장으로 말해준다

### 4-3. '그냥 대화'의 차이 표시

- '그냥 대화'만 음악 추천 성격이 빠지는데(`GENERAL_CHAT_INSTRUCTION`) 화면에는 드러나지 않는다
- 각 선택지 아래에 짧은 설명을 표시: `personas.description` 컬럼 추가 + `GENERAL_CHAT.description`
  - 예) 자기 전: "차분한 목소리, 잔잔한 음악 추천" / 그냥 대화: "추천 없이 이야기만 나눠요"

### 4-4. 구현 결과

- **4-3 설명 문구**: `014_persona_description.sql`로 `personas.description` 추가, `GET /api/situations`에 포함.
  '그냥 대화'는 `GENERAL_CHAT.description`. 선택지 라벨 아래에 한 줄로 표시
- **4-1 시간대 추천**: 프런트 순수 함수 `front/src/situationRecommend.js`의 `recommendSituation(now, situations)`.
  추천 상황에 "지금 추천" 배지와 강조 테두리만 붙이고 순서·자동 선택은 그대로. 대상이 숨김 처리돼 있으면 추천 안 함.
  "최근 7일 최다 사용" 대체 추천은 보류 (6단계 데이터가 쌓인 뒤 판단)
- **4-2 대화 중 전환**
  - `geminiService.generateReply(history, persona, { switchTargets })`가 `switch_situation({ id })` 도구를 노출.
    허용값은 활성 상황 중 현재 상황을 뺀 것 ('그냥 대화'로는 전환하지 않음, '그냥 대화'에서 다른 상황으로는 가능)
  - 도구 호출이 오면 도구 결과 + 새 상황 프롬프트로 한 번 더 호출해 최종 답변을 받는다 (전환 턴만 LLM 2회).
    두 번째 호출은 `functionCallingConfig.mode = NONE`으로 재호출을 막고, "바꿨다는 사실을 한 문장으로" 알리게 함
  - 허용 목록 밖 id면 전환하지 않고 원래 상황으로 답함
  - 프롬프트 규칙: 상황이 바뀌었다고 **분명히** 말할 때만 전환 ("어제 운동했어" 같은 언급은 제외, 애매하면 안 바꿈)
  - `postChat`: 사용자 발화 저장 → `sessions.persona_id` 갱신 → 답변 저장 순서. 전환 요청 발화는 이전 상황, 답변부터 새 상황으로 기록.
    응답에 전환 시에만 `situation` 포함
  - 프런트: `situation`이 오면 `situationRef`를 교체 → 그 답변의 TTS 말투부터, VAD는 다음 듣기부터 적용.
    수면 타이머·뽀모도로는 상황이 바뀌면 그 시점부터 다시 잰다 (`sessionKey` = 세션 id + 상황 id)
  - `sessions.initial_persona_id`는 추가하지 않음: 메시지별 `persona_id`로 전환 전후를 구분할 수 있어서 당장 필요 없음.
    6단계 지표에서 "처음 고른 상황"이 필요해지면 그때 추가
- 테스트: `front/src/situationRecommend.test.js`, `backend/src/services/geminiService.test.js`
  (백엔드는 테스트 스크립트가 없어 리포 루트에서 `npx vitest run backend`로 실행)
- 남은 확인
  - [ ] Supabase에 `014` 실행
  - [ ] 실제 Gemini로 전환 확인 — 작업 당시 503(high demand)으로 미검증. 도구 스키마 수락 여부, 오탐("어제 운동했어")이 없는지 확인 필요

---

## 5. 신규 상황 추가 (5단계)

1단계 덕분에 **코드 수정 없이 SQL insert만으로** 추가할 수 있다. 추가 시 2단계 값(말투·문장 수·VAD)도 함께 정한다.

| id | 라벨 | 이모지 | 성격 | 음성 설정 초안 |
|---|---|---|---|---|
| `cooking` | 요리·집안일 | 🍳 | 손이 바쁘고 물소리·조리 소음이 있음. 순서 안내·타이머 요청이 많을 것 | 기준 14, 문장 2 |
| `walking` | 산책·휴식 | 🚶 | 여유 있는 대화, 주변 얘기로 자연스럽게 이어가기 | 기본값, 문장 3 |
| `venting` | 기분 전환 | 😮‍💨 | 털어놓기. 조언보다 공감·경청 위주, 음악 추천 자제 | 대기 2000ms, 문장 2 |

```sql
-- 예시 (015_new_situations.sql)
insert into personas (id, label, emoji, greeting, prompt, sort_order, tts_style, max_sentences, silence_threshold)
values ('cooking', '요리·집안일', '🍳',
        '요리하는구나! 손 바쁘니까 필요한 거 있으면 말로 해.',
        '손이 바쁜 상황이야. 단계별 안내는 한 번에 한 단계씩, 짧고 분명하게 말해줘.',
        60, 'in a clear, friendly and steady voice', 2, 14);
```

### 5-1. '기분 전환'(venting) 추가 전 필수 검토

- 감정적으로 취약한 상태의 사용자가 들어올 수 있는 상황이라 **안전 가이드를 강화한 뒤에만** 연다
  - 자해·자살 언급 시 짧게 거절만 하는 현재 규칙(`BASE_INSTRUCTION` 안전 가이드)은 이 상황에 부적절 →
    공감 + 전문 상담 창구 안내(예: 자살예방상담전화 109) 로 바꾼 전용 규칙 필요
  - 진단·치료처럼 들리는 표현 금지
- 먼저 `is_active = false`로 넣어 내부 테스트 후 공개

### 5-2. 추가하지 않는 상황

- **운전 중**: 주의 분산 우려로 안전 책임 문제가 있어 제외

### 5-3. 구현 결과

- `015_new_situations.sql`: `cooking`(60), `walking`(70), `venting`(80, `is_active = false`) 추가.
  다시 실행해도 `is_active`는 덮어쓰지 않아 공개한 상황이 다시 숨겨지지 않음
- 음성 설정: 요리·집안일 기준 14 / 2문장, 산책·휴식 기본값 / 3문장, 기분 전환 대기 2000ms / 2문장 (초안 그대로)
- 요리·집안일 프롬프트에 "타이머 기능은 아직 없다고 솔직하게 말하기"를 넣음 — 없는 기능을 해준다고 답하는 것 방지
- **안전 가이드 분리**: `personas.safety_profile`(`standard` | `supportive`) 추가.
  문구는 `geminiService.js`의 `STANDARD_SAFETY_INSTRUCTION` / `SUPPORTIVE_SAFETY_INSTRUCTION`에만 두어서
  DB 값을 고쳐도 안전 규칙 내용은 바꿀 수 없음 (6-4 관리자 편집 기능이 생겨도 우회 불가)
  - supportive: 자해·자살 언급 시 거절하지 않고 공감 → 109(24시간) 안내 → 당장 위험하면 119. 이때는 문장 수 제한보다 안내가 우선.
    방법·수단 이야기 금지, 진단·약·치료 권유 금지. 프롬프트 주입 방어 규칙은 두 프로필 공통
- **관리자 내부 테스트 경로**: 비공개 상황은 원래 세션을 만들 수 없어서, 관리자에 한해 허용
  (`postSession`에서 `isAdmin` 확인). 관리자 선택 화면에는 숨긴 상황이 "비공개" 배지와 함께 보임.
  비공개 상황은 대화 중 전환 대상(4-2)에는 포함되지 않음
- 남은 확인
  - [ ] Supabase에 `015` 실행
  - [ ] 관리자 계정으로 기분 전환 내부 테스트 — 특히 위기 발화에 109 안내가 나오는지, TTS가 그 답변을 SAFETY로 막지 않는지
        (작업 당시 Gemini 503으로 실제 응답 미확인)
  - [ ] 테스트 후 `update personas set is_active = true where id = 'venting';`로 공개
  - [ ] (검토) 기본 상황의 "자해·자살은 짧게 거절" 규칙도 위기 안내로 바꿀지 — 어떤 상황에서든 위기 발화가 나올 수 있음

---

## 6. 사용 데이터로 검증 (6단계)

### 6-1. 목표

상황별로 얼마나 쓰이는지, 어디서 이탈하는지를 보고 **상황을 추가·통합·제거하는 근거**로 쓴다.

### 6-2. 지표

| 지표 | 계산 | 출처 |
|---|---|---|
| 세션 수 | 상황별 `count(distinct session_id)` | 기존 `persona_stats` 뷰 (`005`) |
| 평균 사용자 발화 수 | `user_message_count / session_count` | `persona_stats` |
| 빈 세션 비율 | 사용자 발화 0회 세션 / 전체 세션 — 상황만 고르고 바로 나간 비율 | `sessions` + `messages` (새 뷰) |
| 평균 대화 시간 | `last_active_at - created_at` 평균 | `sessions` |
| 끼어들기 비율 | 상황별 `barge_in` 이벤트 / assistant 메시지 수 — 말이 길거나 VAD 오탐 신호 | `conversation_events` (`006`) |

- 끼어들기 비율은 2단계의 `max_sentences`·VAD 기준을 튜닝하는 데 직접 쓸 수 있다

### 6-3. 구현

- `016_persona_insights.sql`: 위 지표를 한 번에 주는 뷰 `persona_insights` (기간 파라미터가 필요하면 함수로)
- 백엔드 `GET /api/admin/situations/stats` (기존 `adminController`의 관리자 검사 재사용)
- 프런트 `AdminScreen.jsx`에 상황별 표 추가 (관리자 화면은 예외적으로 시각 정보 위주여도 무방)
- 개인정보: 집계 수치만 노출하고 대화 내용·사용자 식별 정보는 포함하지 않는다

### 6-4. 관리자 화면에서 상황 편집 (선택)

- 1단계로 DB가 단일 출처가 되었으므로, 관리자 화면에서 라벨·인사말·프롬프트·말투·노출 여부를 수정하는 기능을 붙일 수 있다
- 수정 즉시 반영하려면 `personaStore`의 캐시를 비우는 함수(`invalidatePersonaCache`)를 수정 API에서 호출
- 프롬프트는 안전 가이드를 우회하는 내용이 들어가지 않게 관리자만 수정 가능하도록 제한

---

## 7. 진행 순서 제안

1. 2단계 남은 확인 사항(2-3) 처리 — 마이그레이션 실행, 말투·VAD 실사용 튜닝
2. **6단계 지표 먼저** — 데이터가 쌓이는 동안 3~5단계를 진행하면 효과를 전후 비교할 수 있다
3. 3단계: 수면 타이머 → 뽀모도로
4. 4단계: 설명 문구(4-3) → 시간대 추천(4-1) → 대화 중 전환(4-2, 가장 복잡)
5. 5단계: 요리·집안일, 산책·휴식 먼저 → 기분 전환은 안전 가이드 보강 후
