import { synthesizeSpeech } from '../services/geminiService.js';

export async function postTts(req, res, next) {
  const { text } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ message: 'text는 필수입니다.' });
  }

  try {
    const wavBuffer = await synthesizeSpeech(text);
    res.set('Content-Type', 'audio/wav');
    res.send(wavBuffer);
  } catch (err) {
    next(err);
  }
}
