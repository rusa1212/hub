// STT/TTS 일별 사용량 집계 계층 (api_usage_daily 테이블 접근 + 하루 한도 계산)
//
// rate limit 미들웨어(5분 창, in-memory)와 역할이 다르다: 이쪽은 DB에 남는 누적 기록이라
// 서버를 재시작해도 유지되고, 관리자 화면에서 "오늘 몇 번 남았는지"를 보여주는 근거가 된다.
import { getSupabase } from './db.js';

export const USAGE_KINDS = ['stt', 'tts'];

// 사용자 1명이 하루에 쓸 수 있는 횟수. .env로 조정 가능(STT_DAILY_LIMIT / TTS_DAILY_LIMIT).
export const DAILY_LIMITS = {
  stt: Number(process.env.STT_DAILY_LIMIT) || 100,
  tts: Number(process.env.TTS_DAILY_LIMIT) || 150,
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

// 호출 1건 기록 후 그날의 누적 횟수를 반환.
export async function recordUsage(kind, usageKey, date = usageDateKey()) {
  const { data, error } = await getSupabase().rpc('record_api_usage', {
    p_usage_key: usageKey,
    p_kind: kind,
    p_usage_date: date,
  });
  if (error) throw error;
  return data;
}

// 특정 날짜의 모든 사용량 행. 행이 적어(사용자 수 × 2) 전부 읽어 JS에서 합산해도 충분하다.
export async function getUsageRows(dates) {
  const { data, error } = await getSupabase()
    .from('api_usage_daily')
    .select('usage_key, usage_date, kind, count, updated_at')
    .in('usage_date', dates);
  if (error) throw error;
  return data ?? [];
}

export function remainingOf(kind, used) {
  return Math.max(0, DAILY_LIMITS[kind] - used);
}
