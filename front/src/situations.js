export const SITUATIONS = [
  { id: 'exercising', emoji: '🏃', label: '운동 중' },
  { id: 'sleeping', emoji: '🌙', label: '자기 전' },
  { id: 'morning', emoji: '☀️', label: '아침 기상' },
  { id: 'commuting', emoji: '🚌', label: '이동 중' },
  { id: 'studying', emoji: '📚', label: '집중 모드' },
  { id: null, emoji: '💬', label: '그냥 대화' },
];

// 세션의 persona_id로 상황 메타(이모지/라벨)를 조회할 때 사용 (id가 null인 세션은 'default' 키로 조회)
export const SITUATION_META_BY_ID = Object.fromEntries(SITUATIONS.map((s) => [s.id ?? 'default', s]));
