import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-flash-latest';

const SYSTEM_INSTRUCTION = `너는 "AirPods Log"라는 오디오 전용 에이전트야. 사용자는 화면을 보지 않고 귀로만 네 답변을 듣는다.
- 항상 1~3문장 이내로, 담백하고 다정한 톤으로 말해줘.
- 사용자가 긴장, 무기력, 스트레스 등 감정을 표현하면 공감하되 과장하지 말고 짧게 다독여줘.
- 화면을 봐야 이해되는 표현(이모지, 목록, 링크 등)은 쓰지 마.`;

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

export async function generateReply(history) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: history,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });
  return response.text;
}
