# 에어팟 로그 — Supabase DB 활용 계획

## 배경
현재 백엔드는 `Map<sessionId, messages[]>` 형태의 인메모리 세션 저장 구조를 사용 중이며,
서버 재시작 시 데이터가 유실됨. Supabase를 연결하여 대화 히스토리와 사용자 설정을
영속화하는 것을 목표로 함.

**설계 원칙**
- 프라이버시 우선: 최소 데이터 보관, 익명성 유지
- 음성 원본(오디오)은 저장하지 않음 — STT 변환된 텍스트만 저장
- 백엔드 경유 방식 사용 (Supabase client는 `services/db.js`에서만 호출, 프론트는 기존 `/api` 프록시 유지)

---

## 테이블 설계

### 1. `sessions` — 대화 세션 단위

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (pk) | 세션 식별자 (기존 Map의 key) |
| user_id | uuid (nullable, fk) | 익명 인증 사용 시 연결 |
| persona_id | text | 어떤 페르소나로 대화했는지 |
| created_at | timestamptz | |
| last_active_at | timestamptz | 세션 만료 판단용 |

### 2. `messages` — 실제 대화 내용

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (pk) | |
| session_id | uuid (fk → sessions.id) | |
| role | text | `'user'` \| `'assistant'` |
| content | text | STT 변환 텍스트 / LLM 응답 텍스트 |
| created_at | timestamptz | |

> ⚠️ 오디오 원본(webm/PCM/WAV)은 절대 저장하지 않음. STT 처리 후 즉시 폐기.

### 3. `user_settings` — 사용자 선호 설정

| 컬럼 | 타입 | 설명 |
|---|---|---|
| user_id | uuid (pk) | |
| voice_id | text | 선택한 TTS 보이스 |
| tone_preference | text | 페르소나 톤 (친근함/차분함 등) |
| response_length | text | 짧게/보통/길게 |
| onboarding_completed | boolean | |

### 4. (선택) `usage_stats` — 집계 통계

발표 데모용 "화면 없이 대화한 횟수" 등 집계값만 저장. 개별 대화 내용과 분리하여
프라이버시 부담을 최소화.

| 컬럼 | 타입 |
|---|---|
| user_id | uuid |
| week_start | date |
| session_count | int |
| total_messages | int |

---

## 넣지 말아야 할 것
- 원본 오디오 파일
- 실명, 이메일, 전화번호 (익명 인증 사용 시 애초에 불필요)
- IP 주소, 기기 식별자

## 인증 방향
Supabase Anonymous Sign-in 사용 검토. 이메일/이름 없이 기기별 고유 사용자 식별 가능하며,
필요 시 정식 계정으로 전환 가능. RLS(Row Level Security)로 "본인 대화만 조회 가능"을
DB 레벨에서 강제하여 프라이버시 설계를 발표 포인트로 활용 가능.

---

## 구현 우선순위 (3주차 기준)

1. **`sessions` + `messages`** — 기존 메모리 구조를 그대로 이관, 리스크 가장 낮음
2. **`user_settings`** — 보이스 선택 기능 구현 시 함께 진행
3. **`usage_stats`** — 시간 여유 시, 4주차 발표 준비 단계에서 추가

## 다음 단계 (미정 — 추후 결정)
- [ ] 테이블 생성 SQL 작성
- [ ] `services/db.js` 스캐폴딩
- [ ] 기존 라우트에서 Map → Supabase 호출로 교체
- [ ] RLS 정책 작성