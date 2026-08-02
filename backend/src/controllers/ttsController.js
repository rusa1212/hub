// 음성 합성(TTS) 컨트롤러: 텍스트를 Gemini로 음성(WAV)으로 변환해 응답
import { synthesizeSpeech } from '../services/geminiService.js';

export async function postTts(req, res, next) {
  const { text, voice } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ message: 'text는 필수입니다.' });
  }

  try {
    const wavBuffer = await synthesizeSpeech(text, voice);
    res.set('Content-Type', 'audio/wav');
    res.send(wavBuffer);
  } catch (err) {
    next(err);
  }
}
