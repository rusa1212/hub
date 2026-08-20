# 대화 기록 삭제 & 카테고리화 기능 설계 (historyManagePlan)

## 1. 배경 및 목표

`HistoryScreen.jsx`(내 대화 기록 화면)는 현재 로그인 사용자의 세션 목록/상세 조회와 **계정 전체 삭제**만
지원한다. 여기에 아래 두 가지를 추가한다.

1. **대화 삭제** — 세션 하나만 골라서 지우는 개별 삭제, 그리고 기록 전체를 한 번에 지우는 전체 삭제
2. **기록 카테고리화** — 세션 시작 시 사용자가 고른 **페르소나(persona_id) 기준으로 분류**. 새 테이블 없이
   기존 `persona_id` 데이터를 히스토리 화면에서 필터/그룹핑하는 데 쓴다.

README 5절(프라이버시·최소 보관 원칙)과 맞닿아 있는 기능이라, "사용자가 직접 지우고 정리할 수 있게 한다"는
방향 자체가 기존 원칙과 상충하지 않는다.

---

## 2. 현재 상태 점검 (코드 기준)

이미 있는 것

| 항목 | 위치 | 비고 |
|---|---|---|
| 세션 전체 삭제 API | `DELETE /api/sessions/mine` (`sessionController.deleteMySessions`) | 백엔드 구현은 끝났지만 **프론트에서 호출하는 곳이 없음** |
| 계정(전체) 삭제 | `DELETE /api/account` + `HistoryScreen`의 "🗑 계정 삭제" 버튼 | Supabase Auth 유저 자체를 삭제 → `sessions.user_id` FK `ON DELETE CASCADE`로 세션도 함께 삭제됨 |
| 페르소나(카테고리) 데이터 | `sessions.persona_id` / `personas` 테이블 (`005_personas_and_message_views.sql`) | 세션 **생성 시점**에 사용자가 고른 값. `SITUATION_META_BY_ID`로 이모지/라벨 표시. 5종 상황(운동 중/자기 전/아침 기상/이동 중/집중 모드) + null("그냥 대화") |
| 메시지 cascade 삭제 | `messages.session_id` FK `ON DELETE CASCADE` (`001_sessions_and_messages.sql`) | 세션을 지우면 메시지는 자동으로 함께 삭제됨 → 개별 삭제 구현이 단순해짐 |

없는 것

- 세션 **개별** 삭제 API/버튼 (`DELETE /api/session/:id` 자체가 없음)
- "전체 삭제" 버튼 UI (백엔드는 있는데 UI 미노출)
- `persona_id` 기준 **필터링/그룹핑 UI** (지금은 목록에 이모지·라벨만 표시할 뿐, 카테고리별로 묶거나 걸러보는 기능은 없음)

---

## 3. 기능 범위 (Scope)

### 3.1 대화 삭제

- **개별 삭제**: 히스토리 목록의 각 항목에 삭제 버튼 추가. 본인 소유 세션만 삭제 가능(`user_id` 확인).
- **전체 삭제**: 기존 `DELETE /api/sessions/mine`을 히스토리 화면 "위험 구역"에 노출. 계정 삭제와는
  구분되는 별도 버튼("기록만 삭제", 계정은 유지).
- **삭제 방식**: hard delete로 통일 (계정 삭제가 이미 hard cascade이므로 일관성 유지). 되돌릴 수 없다는
  점을 `window.confirm` 문구로 명시 — 기존 `handleDeleteAccount`와 동일한 패턴 재사용.
- 삭제 확인 후 목록에서 즉시 제거(낙관적 업데이트) + 실패 시 에러 메시지.

### 3.2 기록 카테고리화 (페르소나 기준)

- 새 테이블/컬럼 없이 기존 `persona_id`를 그대로 카테고리 기준으로 사용한다.
- 히스토리 화면 상단에 **페르소나 필터 chip**(🏃 운동 중 / 🌙 자기 전 / ☀️ 아침 기상 / 🚌 이동 중 /
  📚 집중 모드 / 💬 그냥 대화)을 두고, 선택한 카테고리의 세션만 걸러 보여준다.
- 목록을 페르소나별로 **그룹 헤더**로 묶어서 보여주는 것도 검토 (예: "운동 중 (3)" 섹션 아래 세션들).
  1단계는 필터만, 그룹핑은 여유가 되면 2단계로.
- `persona_id`는 세션 생성 시점에 정해지는 값이라 **사후 재분류(수정)는 이번 범위에 포함하지 않음**.
  나중에 "카테고리를 나중에 바꾸고 싶다"는 요구가 나오면 별도 계획으로 다룬다.

---

## 4. 데이터 모델 변경안

삭제, 카테고리화 모두 **기존 테이블 구조로 충분** — 스키마 변경이 필요 없다.

- 삭제: `sessions` 삭제 시 `messages`가 `ON DELETE CASCADE`로 함께 지워지므로 라우트만 추가하면 됨.
- 카테고리화: `sessions.persona_id`가 이미 존재하므로, 목록 조회 쿼리에 필터 조건만 추가하면 됨.

---

## 5. API 설계

| 메서드/경로 | 인증 | 설명 |
|---|---|---|
| `DELETE /api/session/:id` | `requireAuth` | 개별 세션 삭제. 본인 세션 아니면 404 (기존 `getSessionById`의 404 처리 방식과 동일) |
| `DELETE /api/sessions/mine` | `requireAuth` | 이미 구현됨. 프론트 연결만 하면 됨 |
| `GET /api/sessions/mine?persona=<id>` | `requireAuth` | 기존 목록 조회에 페르소나 필터 쿼리 파라미터 추가 (`persona=null` 또는 값 미지정 시 "그냥 대화") |

개별 삭제 컨트롤러는 `getSessionById`와 동일한 소유권 확인 패턴을 따르면 됨:

```js
// sessionController.js 추가안
export async function deleteSessionById(req, res, next) {
  try {
    const session = await getSession(req.params.id);
    if (!session || session.userId !== req.user.id) {
      return res.status(404).json({ message: '세션을 찾을 수 없습니다.' });
    }
    await deleteSession(req.params.id); // sessionStore.js에 신규 함수 추가
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
```

`sessionStore.js`에는 `deleteSessionsByUser`와 나란히 아래 함수를 추가:

```js
// sessionStore.js 추가안
export async function deleteSession(sessionId) {
  const supabase = getSupabase();
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) throw error;
}
```

페르소나 필터는 `getSessionsByUser`에 옵션 파라미터만 추가하면 됨:

```js
// sessionStore.js 수정안
export async function getSessionsByUser(userId, { personaId } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('sessions')
    .select('id, persona_id, created_at, last_active_at, summary')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false });
  if (personaId !== undefined) {
    query = personaId === null ? query.is('persona_id', null) : query.eq('persona_id', personaId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

---

## 6. 프론트엔드 변경 (`HistoryScreen.jsx` 중심)

- 목록 각 항목(`history-item`)에 삭제 아이콘 버튼 추가 → 클릭 시 `window.confirm` → `deleteSession(id)` 호출
  → 성공 시 `sessions` state에서 제거
- 상단 또는 danger zone에 "기록 전체 삭제" 버튼 추가 (계정 삭제 버튼과 나란히, 문구로 구분)
- 목록 상단에 페르소나 필터 chip 목록 추가 (`SITUATIONS` 배열을 그대로 활용, 선택된 chip은 강조 표시)
  - 클라이언트에서 이미 불러온 `sessions`를 `persona_id` 기준으로 걸러도 되고(간단), 세션이 많아지면
    `getMySessions(personaId)`로 서버 필터를 태우는 방식으로 확장 (1단계는 클라이언트 필터로 충분)
- `api.js`에 추가: `deleteSession(id)`. 필요 시 `getMySessions(personaId)`로 시그니처 확장

---

## 7. 프라이버시/일관성 체크

- 삭제는 hard delete + cascade로, README의 "최소 보관 원칙"과 일치
- 삭제 전 확인 문구는 계정 삭제와 톤 통일 ("되돌릴 수 없어요" 명시)
- 카테고리 필터는 조회 전용 기능이라 새로운 개인정보 저장이 없음 — RLS는 기존 `select_own_sessions`
  정책으로 이미 보호됨
- 익명 세션(`user_id = null`)은 애초에 히스토리 화면에 노출되지 않으므로 카테고리 필터 대상에서도
  자연히 제외됨

---

## 8. 구현 순서 (우선순위)

1. **개별 세션 삭제** — 백엔드 라우트 1개 + 프론트 버튼. 스키마 변경 없이 바로 가능, 사용자 임팩트 가장 큼
2. **전체 삭제 버튼 UI 노출** — 백엔드 이미 있음, 프론트 연결만
3. **페르소나 필터 UI** — `persona_id` 그대로 활용, 신규 스키마·API 불필요 (클라이언트 필터부터 시작)
4. (여유 되면) **서버 사이드 필터 쿼리 파라미터** — 세션 수가 많아질 때 대비
5. (여유 되면) **페르소나별 그룹 헤더로 목록 재구성**

---

## 9. 다음 단계 (미정 — 추후 결정)

- [ ] `DELETE /api/session/:id` 라우트 + `sessionStore.js`에 `deleteSession` 함수 추가
- [ ] `HistoryScreen.jsx`에 개별 삭제 버튼 + 전체 삭제 버튼 연결
- [ ] 페르소나 필터 chip UI 추가 (클라이언트 필터링부터)
- [ ] 세션 수가 늘었을 때를 대비한 서버 사이드 필터(`?persona=`) 적용 여부 결정
- [ ] 그룹 헤더 방식 도입 여부 결정