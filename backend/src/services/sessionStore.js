import { getSupabase } from './db.js';

// Gemini API가 쓰는 role('user'/'model')과 DB에 저장하는 role('user'/'assistant')이 달라서 매핑해줌
const DB_TO_GEMINI_ROLE = { user: 'user', assistant: 'model' };
const GEMINI_TO_DB_ROLE = { user: 'user', model: 'assistant' };

export async function createSession(situation = null, userId = null) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sessions')
    .insert({ persona_id: situation, user_id: userId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function getSession(sessionId) {
  const supabase = getSupabase();
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, persona_id, user_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (messagesError) throw messagesError;

  return {
    situation: session.persona_id,
    userId: session.user_id,
    history: messages.map(({ role, content }) => ({
      role: DB_TO_GEMINI_ROLE[role] ?? role,
      parts: [{ text: content }],
    })),
  };
}

// 로그인 사용자 전용: 본인이 로그인한 채로 만든 세션 목록만 (RLS로도 이중 보호됨)
export async function getSessionsByUser(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('sessions')
    .select('id, persona_id, created_at, last_active_at, summary')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function setSessionSummary(sessionId, summary) {
  const supabase = getSupabase();
  const { error } = await supabase.from('sessions').update({ summary }).eq('id', sessionId);
  if (error) throw error;
}

// 로그인 사용자 전용: 본인의 세션 기록 전체 삭제 (메시지는 messages.session_id의
// ON DELETE CASCADE로 함께 삭제됨, sql/001_sessions_and_messages.sql 참고)
export async function deleteSessionsByUser(userId) {
  const supabase = getSupabase();
  const { error } = await supabase.from('sessions').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function appendTurn(sessionId, role, text) {
  const supabase = getSupabase();
  const dbRole = GEMINI_TO_DB_ROLE[role] ?? role;

  const { error: insertError } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role: dbRole, content: text });
  if (insertError) throw insertError;

  const { error: touchError } = await supabase
    .from('sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (touchError) throw touchError;
}
