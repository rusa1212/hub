import { transcribeAudio } from '../services/geminiService.js';

export async function postStt(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ message: '오디오 파일(audio)이 필요합니다.' });
  }

  try {
    const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);
    res.json({ transcript });
  } catch (err) {
    next(err);
  }
}
