// Supabase 클라이언트 싱글턴 (서비스 롤 키 사용 — RLS를 우회하므로 접근 제어는 앱 코드가 책임짐)
import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.');
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
