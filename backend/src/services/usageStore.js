// STT/TTS 일별 사용량 집계 계층 (api_usage_daily 테이블 접근 + 한도 계산)
//
// 한도가 두 층이다:
//  1) 프로젝트 전체 쿼터 — Gemini 무료 티어가 실제로 거는 제한. API 키 하나당 하루 N회.
//     (429 에러의 quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier)
//  2) 사용자 1인당 상한 — 한 사람이 프로젝트 쿼터를 통째로 먹지 못하게 하는 남용 방지용.
//     Gemini 쿼터와는 무관한, 우리가 정하는 값이다.
//
// rate limit 미들웨어(5분 창, in-memory)와도 역할이 다르다: 이쪽은 DB에 남는 누적 기록이라
// 서버를 재시작해도 유지되고, 관리자 화면의 "남은 횟수"를 계산하는 근거가 된다.
import { getSupabase } from './db.js';

export const USAGE_KINDS = ['stt', 'tts'];

// 프로젝트 전체 누적을 담는 예약 키 (010 마이그레이션의 record_api_usage와 값이 같아야 함)
export const PROJECT_USAGE_KEY = '__project__';

// 값이 비어 있으면 fallback, 숫자가 아니거나 0 이하면 null(= 한도 모름)으로 본다.
function parseQuota(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 프로젝트 전체 하루 쿼터. 정확한 값은 계정마다 다르므로
// https://aistudio.google.com/rate-limit 에서 확인해 .env에 넣는 것이 맞다.
//  - tts 기본값 10: docs/4th_wk/tues.md에 기록된 gemini-2.5-flash-tts 429 응답의 quotaValue 실측치.
//    현재 모델(gemini-3.1-flash-tts-preview)의 실제 한도는 미확인이라 보수적으로 같은 값을 쓴다.
//  - stt 기본값 null: 확인된 수치가 없어 "모름"으로 두고, 앱에서 막지 않고 사용량만 집계한다
//    (한도에 걸리면 Gemini가 429를 주고 기존 텍스트 폴백이 동작한다).
export const PROJECT_QUOTAS = {
  stt: parseQuota(process.env.STT_PROJECT_DAILY_QUOTA, null),
  tts: parseQuota(process.env.TTS_PROJECT_DAILY_QUOTA, 10),
};

// 사용자 1인당 하루 상한 (남용 방지용, Gemini 쿼터와 무관)
export const PER_USER_LIMITS = {
  stt: parseQuota(process.env.STT_USER_DAILY_LIMIT, 100),
  tts: parseQuota(process.env.TTS_USER_DAILY_LIMIT, 150),
};

// 서버가 어느 지역에서 돌든 한국 기준 날짜로 하루를 끊는다 (사용자가 체감하는 "오늘"과 맞추기 위함).
export const USAGE_TIMEZONE = process.env.USAGE_TIMEZONE || 'Asia/Seoul';

// 'YYYY-MM-DD' (USAGE_TIMEZONE 기준). en-CA 로캘이 정확히 이 형식을 준다.
export function usageDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: USAGE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function usageDateKeysBack(days, from = new Date()) {
  return Array.from({ length: days }, (_, i) => usageDateKey(new Date(from.getTime() - i * 86400000)));
}

// 집계 키: 로그인 사용자는 user id, 비로그인은 IP. (optionalAuth가 먼저 실행되어야 req.user가 찬다)
export function usageKeyFor(req) {
  return req.user?.id ?? `ip:${req.ip}`;
}

// 호출 1건 기록 후 { user, project } 누적 횟수를 반환.
export async function recordUsage(kind, usageKey, date = usageDateKey()) {
  const { data, error } = await getSupabase().rpc('record_api_usage', {
    p_usage_key: usageKey,
    p_kind: kind,
    p_usage_date: date,
  });
  if (error) throw error;
  // 010 마이그레이션 이전 버전은 정수 하나만 돌려준다 — 그 경우 프로젝트 합계는 알 수 없음.
  if (typeof data === 'number') return { user: data, project: null };
  return { user: data?.user ?? 0, project: data?.project ?? null };
}

// 지정한 날짜들의 모든 사용량 행. 행이 적어(사용자 수 × 2) 전부 읽어 JS에서 합산해도 충분하다.
export async function getUsageRows(dates) {
  const { data, error } = await getSupabase()
    .from('api_usage_daily')
    .select('usage_key, usage_date, kind, count, updated_at')
    .in('usage_date', dates);
  if (error) throw error;
  return data ?? [];
}

// 한도를 모르면(null) 잔여도 알 수 없으므로 null을 돌려준다.
export function remainingOf(limit, used) {
  if (limit == null) return null;
  return Math.max(0, limit - used);
}
