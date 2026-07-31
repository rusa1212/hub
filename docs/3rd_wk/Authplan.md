# 로그인 & 세션 기록 기능 설계 (authPlan)

## 1. 핵심 원칙

- **로그인은 완전히 선택사항(optional)**이다. 로그인 없이도 기존과 동일하게 전체 기능 사용 가능.
- 로그인은 오직 **"내가 사용했던 세션 기록을 다시 볼 수 있는 기능"**만을 위해 존재한다.
- 익명 세션과 로그인 세션은 **소급 연결되지 않는다** — 세션 시작 시점의 로그인 상태로 고정.
- 프로젝트의 프라이버시 우선 원칙(오디오 원본 미저장, STT 텍스트만 보관)은 로그인 여부와 무관하게 동일하게 적용된다.

---

## 2. 사용자 흐름

| 상태 | 세션 생성 | 세션 조회 |
|---|---|---|
| 비로그인 | `sessions.user_id = NULL` (완전 익명) | 조회 불가 (기록 확인 기능 없음) |
| 로그인 | `sessions.user_id = auth.uid()` | 본인 세션만 목록/상세 조회 가능 |

- 비로그인 상태에서 쓰던 세션 도중 로그인해도, **그 세션은 계속 익명으로 남는다** (실시간 전환 없음). 다음 세션부터 로그인 세션으로 기록됨.

---

## 3. 인증 방식

- **Supabase Auth** 사용 (이미 Supabase를 DB로 쓰고 있어 별도 서비스 불필요)
- 로그인 옵션: 이메일/비밀번호 + Google OAuth (대학생 대상 UX 마찰 최소화)
- 무료 티어 범위 내에서 충분히 커버 가능 (MAU 제한 여유)
- 프론트엔드는 Supabase Auth 클라이언트로 로그인/로그아웃만 처리
- 세션 데이터 조회는 반드시 **백엔드 프록시(`/api/sessions/*`)를 통해서만** — 기존 `services/db.js` 프록시 패턴 유지, 프론트가 DB에 직접 접근하지 않음

---

## 4. 데이터 모델 변경

```sql
-- 기존 sessions 테이블에 컬럼만 추가 (최소 침습)
ALTER TABLE sessions ADD COLUMN user_id UUID REFERENCES auth.users(id) NULL;

-- RLS(Row Level Security) 필수 적용
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_sessions" ON sessions
  FOR SELECT
  USING (auth.uid() = user_id);
```

- `user_id`가 `NULL`인 세션은 그 누구도(로그인해도) 조회 대상에 포함되지 않음
- RLS는 백엔드 로직 실수와 무관하게 DB 레벨에서 이중으로 보호

---

## 5. 백엔드 구조 변경

```
services/db.js
  ├─ createSession(userId | null)      // 로그인 여부에 따라 user_id 분기 저장
  └─ getSessionsByUser(userId)         // 로그인 사용자 전용 조회, RLS로 이중 보호

routes/
  └─ GET /api/sessions/mine            // 인증 미들웨어 통과 필요
```

- 인증 미들웨어: Supabase Auth 토큰 검증 후 `req.user.id` 주입
- `/api/sessions/mine`은 미인증 요청 시 401 반환

---

## 6. 계정 삭제 정책

- 계정 삭제 시 연결된 세션도 함께 제거
- `ON DELETE CASCADE` 적용 또는 소프트 삭제(soft delete) 방식 중 선택 필요 (추후 논의)

---

## 7. UI/UX 주의사항

- 로그인 여부와 관계없이 핵심 음성 대화 기능은 100% 동일하게 제공
- "로그인하면 대화 기록을 볼 수 있어요" 정도의 가벼운 안내만 노출 (강제 유도 X)
- 익명 세션은 로그인 후에도 소급해서 보이지 않는다는 점을 기록 화면에 명시 (사용자 혼란 방지)

---

## 8. TODO / 다음 단계

- [ ] Supabase Auth 프로젝트 설정 (이메일 + Google OAuth)
- [ ] `sessions` 테이블 마이그레이션 (`user_id` 컬럼 + RLS 정책)
- [ ] 인증 미들웨어 구현
- [ ] `/api/sessions/mine` 엔드포인트 구현
- [ ] 프론트엔드 로그인/로그아웃 UI + 세션 기록 조회 화면
- [ ] 계정 삭제 시 cascade 정책 결정