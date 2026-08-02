// 로그인 사용자의 음성 설정(selectedVoiceId) 조회/저장 컨트롤러
import { getUserSettings, upsertUserSettings } from '../services/settingsStore.js';
import { AVAILABLE_TTS_VOICES } from '../services/geminiService.js';

export async function getSettings(req, res, next) {
  try {
    const settings = await getUserSettings(req.user.id);
    res.json({ selectedVoiceId: settings?.selected_voice_id ?? null });
  } catch (err) {
    next(err);
  }
}

export async function putSettings(req, res, next) {
  const { voice } = req.body;
  if (!AVAILABLE_TTS_VOICES.includes(voice)) {
    return res.status(400).json({ message: '유효하지 않은 voice입니다.' });
  }

  try {
    await upsertUserSettings(req.user.id, voice);
    res.json({ selectedVoiceId: voice });
  } catch (err) {
    next(err);
  }
}
