// 상황(페르소나) 정의 조회 계층: personas 테이블이 라벨/이모지/인사말/상황별 프롬프트의 단일 출처.
// 대화 요청마다 조회되므로 메모리에 잠깐 캐시한다 (DB에서 값을 고치면 최대 CACHE_TTL_MS 뒤 반영).
import { getSupabase } from './db.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = null; // { personas: [...], expiresAt }

function toPersona(row) {
  return {
    id: row.id,
    label: row.label,
    emoji: row.emoji,
    greeting: row.greeting,
    description: row.description,
    prompt: row.prompt,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    ttsStyle: row.tts_style,
    maxSentences: row.max_sentences,
    silenceThreshold: row.silence_threshold,
    silenceDurationMs: row.silence_duration_ms,
    features: row.features ?? {},
    safetyProfile: row.safety_profile ?? 'standard',
  };
}

// 비활성(숨김) 상황도 포함해 전부 반환: 과거 세션의 라벨 표시·대화 이어하기에 필요하기 때문
export async function listPersonas() {
  if (cache && cache.expiresAt > Date.now()) return cache.personas;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('personas')
    .select('id, label, emoji, greeting, description, prompt, sort_order, is_active, tts_style, max_sentences, silence_threshold, silence_duration_ms, features, safety_profile')
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const personas = data.map(toPersona);
  cache = { personas, expiresAt: Date.now() + CACHE_TTL_MS };
  return personas;
}

export async function getPersona(id) {
  if (!id) return null;
  const personas = await listPersonas();
  return personas.find((p) => p.id === id) ?? null;
}
