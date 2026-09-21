// 관리자 전용 컨트롤러: 본인 관리자 여부 확인 + STT/TTS 사용량 현황 조회
import crypto from 'crypto';
import { listProfiles } from '../services/profileStore.js';
import {
  PER_USER_LIMITS,
  PROJECT_QUOTAS,
  PROJECT_USAGE_KEY,
  USAGE_KINDS,
  USAGE_TIMEZONE,
  getUsageRows,
  remainingOf,
  usageDateKey,
  usageDateKeysBack,
} from '../services/usageStore.js';

const TREND_DAYS = 7;

// 비로그인 사용량은 'ip:<주소>' 키로 쌓인다. 관리자에게도 IP 원문까지 보여줄 이유는 없으므로
// 행을 구분할 수 있을 만큼만 남기고 해시로 바꿔 내보낸다.
function maskKey(key) {
  if (!key.startsWith('ip:')) return key;
  return `anon:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 8)}`;
}

// 사이드바에 관리자 메뉴를 노출할지 프론트가 판단하기 위한 엔드포인트 (로그인만 필요)
export async function getAdminMe(req, res) {
  res.json({ isAdmin: req.isAdmin === true });
}

// 관리자 화면 본문: 프로젝트 전체 쿼터 잔여, 사용자별 사용량, 최근 7일 추이
export async function getAdminUsage(req, res, next) {
  try {
    const today = usageDateKey();
    const dates = usageDateKeysBack(TREND_DAYS);
    const [rows, profiles] = await Promise.all([getUsageRows(dates), listProfiles()]);

    const profileById = new Map(profiles.map((p) => [p.id, p]));

    // 그날 그 종류의 전체 호출 수. 010 이후엔 '__project__' 행이 정답이고,
    // 그 이전에 쌓인 날짜에는 행이 없으므로 사용자 행을 더해서 메운다.
    const totalFor = (date, kind) => {
      const projectRow = rows.find(
        (r) => r.usage_date === date && r.kind === kind && r.usage_key === PROJECT_USAGE_KEY
      );
      if (projectRow) return projectRow.count;
      return rows
        .filter((r) => r.usage_date === date && r.kind === kind && r.usage_key !== PROJECT_USAGE_KEY)
        .reduce((sum, r) => sum + r.count, 0);
    };

    // 오늘 프로젝트 전체 현황 (실제 Gemini 쿼터가 걸리는 단위)
    const project = Object.fromEntries(
      USAGE_KINDS.map((kind) => {
        const used = totalFor(today, kind);
        const quota = PROJECT_QUOTAS[kind];
        return [kind, { used, quota, remaining: remainingOf(quota, used) }];
      })
    );

    // usage_key별로 오늘치 stt/tts를 모은다 (프로젝트 합계 행은 사용자 목록에서 제외).
    const byKey = new Map();
    for (const row of rows) {
      if (row.usage_date !== today || row.usage_key === PROJECT_USAGE_KEY) continue;
      const entry = byKey.get(row.usage_key) ?? { key: row.usage_key, stt: 0, tts: 0, updatedAt: null };
      entry[row.kind] = row.count;
      if (!entry.updatedAt || row.updated_at > entry.updatedAt) entry.updatedAt = row.updated_at;
      byKey.set(row.usage_key, entry);
    }

    const users = [...byKey.values()]
      .map((entry) => {
        const profile = profileById.get(entry.key);
        const isAnonymous = entry.key.startsWith('ip:');
        return {
          key: maskKey(entry.key),
          // 비로그인 호출은 아이디가 없으므로 프론트에서 "비로그인 사용자"로 표시한다.
          username: profile?.username ?? (isAnonymous ? null : '(탈퇴한 사용자)'),
          isAnonymous,
          isAdmin: profile?.is_admin === true,
          updatedAt: entry.updatedAt,
          usage: Object.fromEntries(
            USAGE_KINDS.map((kind) => [
              kind,
              {
                used: entry[kind],
                limit: PER_USER_LIMITS[kind],
                remaining: remainingOf(PER_USER_LIMITS[kind], entry[kind]),
              },
            ])
          ),
        };
      })
      .sort((a, b) => b.usage.stt.used + b.usage.tts.used - (a.usage.stt.used + a.usage.tts.used));

    const trend = dates
      .map((date) => ({
        date,
        ...Object.fromEntries(USAGE_KINDS.map((kind) => [kind, totalFor(date, kind)])),
      }))
      .reverse();

    res.json({
      date: today,
      timezone: USAGE_TIMEZONE,
      project,
      perUserLimits: PER_USER_LIMITS,
      activeUserCount: users.length,
      registeredUserCount: profiles.length,
      users,
      trend,
    });
  } catch (err) {
    next(err);
  }
}
