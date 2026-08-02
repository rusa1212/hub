// 로그인 사용자별 음성 설정 CRUD (Supabase user_settings 테이블 접근 계층)
import { getSupabase } from './db.js';

export async function getUserSettings(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_settings')
    .select('selected_voice_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertUserSettings(userId, voice) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, selected_voice_id: voice, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
}
