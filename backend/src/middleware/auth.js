// Supabase Bearer 토큰 검증 미들웨어: requireAuth(로그인 필수), optionalAuth(로그인 선택)
import { getSupabase } from '../services/db.js';

async function verify(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length);
  const { data, error } = await getSupabase().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// /api/sessions/mine, /api/account 처럼 반드시 로그인해야 하는 엔드포인트용
export async function requireAuth(req, res, next) {
  const user = await verify(req);
  if (!user) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }
  req.user = user;
  next();
}

// 로그인 여부와 무관하게 동작하되, 로그인했다면 req.user를 채워주는 엔드포인트용
// (예: 세션 생성 시 로그인 상태면 user_id를 연결, 아니면 익명으로 진행)
export async function optionalAuth(req, res, next) {
  req.user = await verify(req);
  next();
}
