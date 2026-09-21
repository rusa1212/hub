// profiles 테이블 접근 계층 (관리자 여부 조회, 관리자 화면용 사용자 목록)
import { getSupabase } from './db.js';

// 관리자 판별. 조회 실패/행 없음은 전부 "관리자 아님"으로 처리해 실패 시 닫히는 쪽으로 기운다.
export async function isAdmin(userId) {
  if (!userId) return false;
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[profileStore] is_admin 조회 실패:', error.message);
    return false;
  }
  return data?.is_admin === true;
}

export async function listProfiles() {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, username, email, is_admin, created_at');
  if (error) throw error;
  return data ?? [];
}
