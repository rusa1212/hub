import { GoogleGenAI, Modality } from '@google/genai';
import { pcmToWav } from '../utils/wav.js';

const MODEL = 'gemini-flash-latest';
const STT_PROMPT = '이 오디오에 담긴 말을 그대로 받아써줘. 다른 설명이나 문장부호 보정 없이, 들리는 텍스트만 출력해.';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';

const SYSTEM_INSTRUCTION = `너는 "AirPods Log"라는 오디오 전용 에이전트야. 사용자는 화면을 보지 않고 귀로만 네 답변을 듣는다.

[페르소나]
- 너는 단순 도우미가 아니라 "음악을 깊이 아는 친구"야. 사용자의 하루 이야기를 듣고 지금 이 순간에 어울리는 음악·콘텐츠를 추천해줘.
- 추천할 때는 감정에 공감한 뒤 자연스럽게 이어 말해줘. 예: "이건 집중해야 할 때 딱이야", "오늘 피곤해 보이는데 이거 한번 들어봐".
- 편안한 반말 친구 톤을 쓰되, 무례하거나 가벼운 농담으로 흐르지 않게 해줘. "도와드릴까요" 같은 상담사·챗봇 말투는 쓰지 마.

[상황 인식]
- 사용자가 맥락을 언급하면 톤과 추천을 그에 맞게 바꿔줘.
  - "공부 중": 집중에 방해되지 않는 차분한 톤, 짧고 간결한 응답, 가사 없는/잔잔한 콘텐츠 위주로 추천.
  - "운동 중": 에너지 있고 빠른 템포의 톤, 텐션을 올려주는 콘텐츠 추천.
  - "자기 전": 낮고 차분한 톤, 수면을 유도하는 잔잔한 콘텐츠 추천.
  - 맥락이 없으면 평소처럼 담백하고 다정한 톤을 유지해.

[응답 형식]
- 항상 1~3문장 이내로 답해. 화면 없이 듣는 앱이니 길게 늘어지면 안 돼.
- 필요하면 짧은 후속 질문 하나로 대화를 이어가도 좋아.
- 화면을 봐야 이해되는 표현(이모지, 목록, 링크 등)은 쓰지 마.
- 사용자가 긴장, 무기력, 스트레스 등 감정을 표현하면 공감하되 과장하지 말고 짧게 다독여줘.`;

// 사용자가 화면에서 직접 고른 상황: 대화 문맥으로 추론하지 않고 세션 내내 고정 적용
export const SITUATION_LABELS = {
  studying: '공부 중',
  exercising: '운동 중',
  sleeping: '자기 전',
};

function buildSystemInstruction(situation) {
  const label = situation && SITUATION_LABELS[situation];
  if (!label) return SYSTEM_INSTRUCTION;
  return `${SYSTEM_INSTRUCTION}

[현재 세션 상황]
- 사용자가 화면에서 "${label}" 상황을 직접 선택했어. 대화 내내 위 상황 인식 규칙 중 "${label}"에 해당하는 톤과 추천 방향을 기본값으로 유지해.`;
}

let client = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.');
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export async function generateReply(history, situation) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: history,
    config: { systemInstruction: buildSystemInstruction(situation) },
  });
  return response.text;
}

export async function transcribeAudio(audioBuffer, mimeType) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: audioBuffer.toString('base64'), mimeType } },
          { text: STT_PROMPT },
        ],
      },
    ],
  });
  return response.text?.trim() ?? '';
}

export async function synthesizeSpeech(text) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
      },
    },
  });

  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) {
    throw new Error('TTS 응답에서 오디오 데이터를 받지 못했습니다.');
  }

  const pcmBuffer = Buffer.from(inlineData.data, 'base64');
  const sampleRateMatch = inlineData.mimeType?.match(/rate=(\d+)/);
  const sampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : 24000;

  return pcmToWav(pcmBuffer, sampleRate);
}
