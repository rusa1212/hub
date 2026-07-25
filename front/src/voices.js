// 설정 화면(음성 선택)에서 고를 수 있는 Gemini TTS voice 목록
// backend/src/services/geminiService.js의 AVAILABLE_TTS_VOICES와 동기화 유지
export const VOICES = [
  { id: 'Kore', label: 'Kore', description: '차분하고 또렷한 기본 목소리' },
  { id: 'Puck', label: 'Puck', description: '경쾌하고 발랄한 목소리' },
  { id: 'Charon', label: 'Charon', description: '안정적이고 설명적인 목소리' },
  { id: 'Fenrir', label: 'Fenrir', description: '활기차고 에너지 있는 목소리' },
  { id: 'Aoede', label: 'Aoede', description: '산뜻하고 가벼운 목소리' },
  { id: 'Leda', label: 'Leda', description: '젊고 밝은 목소리' },
  { id: 'Achird', label: 'Achird', description: '다정하고 친근한 목소리' },
  { id: 'Sulafat', label: 'Sulafat', description: '따뜻하고 부드러운 목소리' },
];

export const DEFAULT_VOICE = 'Kore';
