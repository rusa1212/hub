// 세션/메시지 CRUD (Supabase sessions/messages 테이블 접근 계층)
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
    .select('id, persona_id, user_id, created_at, last_active_at, summary')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('id, role, content, interrupted, interrupted_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (messagesError) throw messagesError;

  return {
    situation: session.persona_id,
    userId: session.user_id,
    createdAt: session.created_at,
    lastActiveAt: session.last_active_at,
    summary: session.summary,
    history: messages.map(({ id, role, content, interrupted, interrupted_at: interruptedAt }) => ({
      id,
      role: DB_TO_GEMINI_ROLE[role] ?? role,
      parts: [{ text: content }],
      interrupted: Boolean(interrupted),
      interruptedAt,
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

// 개별 세션 삭제 (메시지는 ON DELETE CASCADE로 함께 삭제됨). 소유권 확인은 컨트롤러에서 처리.
export async function deleteSession(sessionId) {
  const supabase = getSupabase();
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  if (error) throw error;
}

export async function appendTurn(sessionId, role, text) {
  const supabase = getSupabase();
  const dbRole = GEMINI_TO_DB_ROLE[role] ?? role;

  const { data: insertedMessage, error: insertError } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role: dbRole, content: text })
    .select('id')
    .single();
  if (insertError) throw insertError;

  const { error: touchError } = await supabase
    .from('sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (touchError) throw touchError;
  return insertedMessage.id;
}

// TTS 중단은 응답 텍스트를 지우지 않고 해당 assistant 메시지에 표시한다. 별도 이벤트 행도
// 남겨 오탐률/중단 시점 등을 메시지 내용과 분리해 분석할 수 있게 한다.
export async function recordInterruption(sessionId, { messageId = null, playbackMs = null } = {}) {
  const supabase = getSupabase();
  const interruptedAt = new Date().toISOString();

  if (messageId) {
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message) return false;

    const { error: updateError } = await supabase
      .from('messages')
      .update({ interrupted: true, interrupted_at: interruptedAt })
      .eq('id', messageId);
    if (updateError) throw updateError;
  }

  const metadata = {};
  if (Number.isFinite(playbackMs)) metadata.playback_ms = Math.max(0, Math.round(playbackMs));
  const { error: eventError } = await supabase.from('conversation_events').insert({
    session_id: sessionId,
    message_id: messageId,
    event_type: 'barge_in',
    metadata,
  });
  if (eventError) throw eventError;
  return true;
}
