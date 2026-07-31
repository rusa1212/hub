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
