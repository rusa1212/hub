// 대화 중 상황 전환(switch_situation 도구) 흐름 검증. Gemini SDK는 모킹한다.
// 실행: 리포 루트에서 `npx vitest run backend`
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    this.models = { generateContent };
  }),
  Modality: { AUDIO: 'AUDIO' },
}));

const { generateReply, buildSystemInstruction, buildSwitchTools, SWITCH_SITUATION_TOOL } = await import('./geminiService.js');

const SLEEPING = { id: 'sleeping', label: '자기 전', prompt: '낮고 차분한 톤.', maxSentences: 2 };
const EXERCISING = { id: 'exercising', label: '운동 중', prompt: '에너지 있는 톤.', maxSentences: 1 };
const HISTORY = [{ id: 1, role: 'user', parts: [{ text: '이제 잘 거야' }], interrupted: false }];

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  generateContent.mockReset();
});

describe('buildSwitchTools', () => {
  it('전환 대상이 없으면 도구를 넘기지 않는다', () => {
    expect(buildSwitchTools([])).toBeNull();
  });

  it('전환 대상 id만 enum으로 허용한다', () => {
    const [tool] = buildSwitchTools([SLEEPING, EXERCISING]);
    const decl = tool.functionDeclarations[0];
    expect(decl.name).toBe(SWITCH_SITUATION_TOOL);
    expect(decl.parameters.properties.id.enum).toEqual(['sleeping', 'exercising']);
  });
});

describe('buildSystemInstruction', () => {
  it('전환 대상이 있을 때만 전환 규칙을 넣는다', () => {
    expect(buildSystemInstruction(null)).not.toContain('[상황 전환]');
    expect(buildSystemInstruction(null, { switchTargets: [SLEEPING] })).toContain('바꿀 수 있는 상황: 자기 전');
  });

  it('방금 전환했으면 이전·새 상황을 알려주고 한 문장으로 알리게 한다', () => {
    const text = buildSystemInstruction(SLEEPING, { switchedFrom: null });
    expect(text).toContain('"그냥 대화"에서 "자기 전"(으)로 바꿨어');
    expect(text).toContain('반드시 2문장 이내');
  });
});

describe('generateReply', () => {
  it('도구 호출이 없으면 한 번만 호출하고 그대로 답한다', async () => {
    generateContent.mockResolvedValueOnce({ text: '응 그래', functionCalls: undefined });
    const result = await generateReply(HISTORY, EXERCISING, { switchTargets: [SLEEPING] });
    expect(result).toEqual({ text: '응 그래', switchedTo: null });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const [{ contents, config }] = generateContent.mock.calls[0];
    expect(contents).toEqual([{ role: 'user', parts: [{ text: '이제 잘 거야' }] }]);
    expect(config.tools).toBeDefined();
  });

  it('switch_situation을 부르면 도구 결과와 새 상황 프롬프트로 한 번 더 호출해 답한다', async () => {
    const modelContent = { role: 'model', parts: [{ functionCall: { name: SWITCH_SITUATION_TOOL, args: { id: 'sleeping' } } }] };
    generateContent
      .mockResolvedValueOnce({
        text: undefined,
        functionCalls: [{ name: SWITCH_SITUATION_TOOL, args: { id: 'sleeping' } }],
        candidates: [{ content: modelContent }],
      })
      .mockResolvedValueOnce({ text: '자기 전 모드로 바꿨어. 푹 쉬자.' });

    const result = await generateReply(HISTORY, EXERCISING, { switchTargets: [SLEEPING] });

    expect(result).toEqual({ text: '자기 전 모드로 바꿨어. 푹 쉬자.', switchedTo: SLEEPING });
    const [{ contents, config }] = generateContent.mock.calls[1];
    expect(contents[1]).toBe(modelContent);
    expect(contents[2].parts[0].functionResponse).toEqual({
      name: SWITCH_SITUATION_TOOL,
      response: { switched: true, label: '자기 전' },
    });
    expect(config.systemInstruction).toContain('"운동 중"에서 "자기 전"(으)로 바꿨어');
    expect(config.toolConfig.functionCallingConfig.mode).toBe('NONE');
  });

  it('허용 목록 밖의 id면 전환하지 않고 원래 상황으로 답한다', async () => {
    generateContent
      .mockResolvedValueOnce({
        functionCalls: [{ name: SWITCH_SITUATION_TOOL, args: { id: 'driving' } }],
        candidates: [{ content: { role: 'model', parts: [] } }],
      })
      .mockResolvedValueOnce({ text: '그래, 계속 얘기하자.' });

    const result = await generateReply(HISTORY, EXERCISING, { switchTargets: [SLEEPING] });

    expect(result).toEqual({ text: '그래, 계속 얘기하자.', switchedTo: null });
    const [{ contents, config }] = generateContent.mock.calls[1];
    expect(contents[2].parts[0].functionResponse.response).toEqual({ switched: false });
    expect(config.systemInstruction).toContain('지금 사용자의 상황은 "운동 중"');
  });
});
