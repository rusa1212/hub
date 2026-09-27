// 음성 합성(TTS) 컨트롤러: 텍스트를 Gemini로 음성(WAV)으로 변환해 응답 (상황별 말투 반영)
import { synthesizeSpeech } from '../services/geminiService.js';
import { getPersona } from '../services/personaStore.js';

export async function postTts(req, res, next) {
  const { text, voice, situation } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ message: 'text는 필수입니다.' });
  }

  try {
    // 말투 지시는 서버에 저장된 상황 설정에서만 가져온다 (클라이언트가 임의 지시문을 넣을 수 없게).
    const persona = typeof situation === 'string' ? await getPersona(situation) : null;
    const wavBuffer = await synthesizeSpeech(text, voice, persona?.ttsStyle ?? null);
    res.set('Content-Type', 'audio/wav');
    res.send(wavBuffer);
  } catch (err) {
    next(err);
  }
}
