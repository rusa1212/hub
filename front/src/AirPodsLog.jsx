import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { createSession, sendMessage, transcribeAudio, synthesizeSpeech } from './api';
import { blobToWav } from './audioUtils';
import './AirPodsLog.css';

const SITUATIONS = [
  { id: 'studying', emoji: '📚', label: '공부 중' },
  { id: 'exercising', emoji: '🏃', label: '운동 중' },
  { id: 'sleeping', emoji: '🌙', label: '자기 전' },
  { id: null, emoji: '💬', label: '그냥 대화' },
];

const SITUATION_GREETINGS = {
  studying: '공부 중이구나, 방해되지 않게 조용히 있을게. 필요할 때 편하게 불러줘.',
  exercising: '운동 중이구나! 텐션 확 올려줄 준비 됐어.',
  sleeping: '자기 전이구나, 편안하게 갈 수 있게 준비할게.',
  default: '안녕, 나는 너의 플레이리스트 친구야. 오늘 하루는 어땠어?',
};

// 무음 감지(VAD) 튜닝 값 — 환경/마이크에 따라 조정 필요
const SILENCE_THRESHOLD = 10; // 볼륨 임계값 (0~128)
const SILENCE_DURATION_MS = 1500; // 발화 중 이만큼 무음이 지속되면 자동 종료

// STT/LLM/TTS 중 하나가 응답 없이 멈추는 상황을 대비한 타임아웃
const PROCESSING_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export default function AirPodsLog() {
  const navigate = useNavigate();
  const location = useLocation();
  // 대화 기록을 저장하는 배열 (API 연동 시 이 배열을 통째로 LLM에 보냄)
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState(null);
  // 대화 전체 상태 머신: idle(대기/텍스트 전용 폴백) | listening(듣는 중) | processing(STT→LLM→TTS) | speaking(응답 재생 중)
  const [conversationState, setConversationState] = useState('idle');
  // listening 상태의 서브 단계: waiting(발화 대기, 무한정) | active(발화 중, 무음 지속시간 감지 시작)
  const [listeningPhase, setListeningPhase] = useState('waiting');

  const chatEndRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  // 음성 루프(startListening → processVoiceMessage 등)는 최초 호출 시점의 클로저를 그대로
  // 재사용하므로, sessionId를 state로만 읽으면 이후 갱신된 값을 못 보고 stale closure에 갇힘.
  // 그래서 ref로도 동기화해서 항상 최신 값을 참조하도록 함.
  const sessionIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const objectUrlRef = useRef(null);
  const audioContextRef = useRef(null); // 마이크 입력용 AudioContext (VAD + 파형 공용)
  const micAnalyserRef = useRef(null); // 마이크 입력 AnalyserNode (VAD와 파형 그리기가 공유)
  const silenceRafRef = useRef(null);
  const ttsAudioContextRef = useRef(null); // TTS 재생용 AudioContext (오디오 엘리먼트당 한 번만 생성)
  const ttsAnalyserRef = useRef(null); // TTS 재생 AnalyserNode
  const waveformRafRef = useRef(null);
  // 파형 그리기 루프는 마운트 시 한 번만 시작해 계속 도는 rAF라서, 매 프레임 최신
  // conversationState를 읽으려면 state가 아니라 ref가 필요함 (stale closure 방지).
  const conversationStateRef = useRef('idle');
  // 녹음이 stop()될 때 그 결과를 실제로 처리할지(process) 그냥 버릴지(discard) 구분
  const pendingActionRef = useRef('process');
  // 대화 루프(SPEAKING → LISTENING 자동 전환)가 살아있는지. 마이크 권한이 없으면 false로 두고 텍스트 전용으로 동작.
  const conversationActiveRef = useRef(false);
  // 현재 세션이 아직 유효한지("대화 종료"를 누르지 않았는지). 이게 false면 처리 중이던
  // STT/LLM/TTS 응답이 뒤늦게 도착해도 화면/오디오에 반영하지 않음.
  const sessionAliveRef = useRef(false);

  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  // 메시지 관련 작성
  // 메시지가 추가될 때마다 스크롤을 맨 아래로 내림
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, conversationState]);

  // 언마운트 시 재생 중이던 오디오 objectURL과 오디오/파형 파이프라인 정리
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      if (silenceRafRef.current) {
        cancelAnimationFrame(silenceRafRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (ttsAudioContextRef.current) {
        ttsAudioContextRef.current.close();
      }
      if (waveformRafRef.current) {
        cancelAnimationFrame(waveformRafRef.current);
      }
    };
  }, []);

  // 파형 그리기: LISTENING이면 마이크 AnalyserNode, SPEAKING이면 TTS AnalyserNode를 그리고,
  // 그 외에는 가운데 직선을 그림. Canvas는 매 프레임 다시 그려야 하므로 SVG 대신 사용.
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    // index.css의 --color-teal / --color-gold / --line-neutral 값과 맞춤
    const TEAL = '#2dd4a7';
    const GOLD = '#e0a83e';
    const IDLE = 'rgba(120, 120, 120, 0.4)';
    const dataArray = new Uint8Array(128); // fftSize 256 → frequencyBinCount 128 (mic/tts 공용)

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const state = conversationStateRef.current;
      let analyser = null;
      let color = IDLE;
      if (state === 'listening' && micAnalyserRef.current) {
        analyser = micAnalyserRef.current;
        color = TEAL;
      } else if (state === 'speaking' && ttsAnalyserRef.current) {
        analyser = ttsAnalyserRef.current;
        color = GOLD;
      }

      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = color;
      ctx.beginPath();

      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);
        const sliceWidth = width / dataArray.length;
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
      } else {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
      }
      ctx.stroke();

      waveformRafRef.current = requestAnimationFrame(draw);
    };

    waveformRafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (waveformRafRef.current) {
        cancelAnimationFrame(waveformRafRef.current);
        waveformRafRef.current = null;
      }
    };
    // <canvas>는 /chat 라우트에서만 렌더되므로, 경로가 바뀔 때마다(=canvas가 새로
    // mount/unmount될 때마다) 루프를 다시 붙여야 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // /chat을 새로고침 등으로 직접 열면 세션 상태가 없으니 처음 화면으로 돌려보냄
  useEffect(() => {
    if (location.pathname === '/chat' && !sessionId) {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    navigate('/situation');
  };

  // 마이크 스트림에 AnalyserNode를 붙여 무음/발화를 감지.
  // 같은 AnalyserNode를 파형 그리기(drawWaveform)에도 그대로 공유해서 별도
  // AudioContext 없이 하나의 파이프라인으로 처리 (docs/3rd_wk/web_audio.md 참고).
  // WAITING_FOR_SPEECH: 사용자가 말을 시작할 때까지 무한정 대기 (녹음 시작 직후 오탐 방지)
  // SPEECH_ACTIVE: 한 번이라도 발화가 감지된 뒤부터 무음 지속시간을 재서 자동 종료
  const startSilenceWatcher = (stream) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; // 파형 해상도, 값이 클수록 세밀하지만 무거움
    // source를 analyser에만 연결하고 destination에는 연결하지 않음 (연결 시 마이크 소리가
    // 스피커로 그대로 나가 하울링 발생)
    source.connect(analyser);
    audioContextRef.current = audioContext;
    micAnalyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let phase = 'waiting';
    let silenceStart = null;

    const checkVoice = () => {
      analyser.getByteTimeDomainData(dataArray);
      const avgAmplitude =
        dataArray.reduce((sum, v) => sum + Math.abs(v - 128), 0) / dataArray.length;

      if (phase === 'waiting') {
        if (avgAmplitude > SILENCE_THRESHOLD) {
          phase = 'active';
          setListeningPhase('active');
        }
      } else if (avgAmplitude < SILENCE_THRESHOLD) {
        if (silenceStart === null) {
          silenceStart = performance.now();
        } else if (performance.now() - silenceStart > SILENCE_DURATION_MS) {
          stopListeningAndProcess();
          return;
        }
      } else {
        silenceStart = null;
      }

      silenceRafRef.current = requestAnimationFrame(checkVoice);
    };

    silenceRafRef.current = requestAnimationFrame(checkVoice);
  };

  const stopSilenceWatcher = () => {
    if (silenceRafRef.current) {
      cancelAnimationFrame(silenceRafRef.current);
      silenceRafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    micAnalyserRef.current = null;
  };

  // 무음 감지(자동) 또는 마이크 버튼(수동 폴백) 둘 다 이 경로로 녹음을 종료하고 처리로 넘김
  const stopListeningAndProcess = () => {
    if (mediaRecorderRef.current?.state !== 'recording') return;
    pendingActionRef.current = 'process';
    mediaRecorderRef.current.stop();
  };

  // LISTENING 진입: 마이크를 열고 녹음을 시작. SPEAKING → LISTENING 자동 전환과
  // 최초 "대화 시작" 클릭 이후 마이크 권한이 이미 있으므로 별도 사용자 제스처 없이 호출 가능.
  const startListening = async () => {
    if (!sessionAliveRef.current || !conversationActiveRef.current) {
      setConversationState('idle');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      pendingActionRef.current = 'process';

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        stopSilenceWatcher();
        const action = pendingActionRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (action === 'process') {
          processVoiceMessage(audioBlob);
        }
        // action === 'discard': 대화 종료/텍스트 전송으로 취소된 녹음이므로 버림
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setConversationState('listening');
      setListeningPhase('waiting');
      startSilenceWatcher(stream);
    } catch (err) {
      console.error('마이크 접근 실패:', err);
      conversationActiveRef.current = false;
      setConversationState('idle');
      const fallbackMsg = { id: Date.now(), sender: 'agent', text: '마이크를 사용할 수 없어요. 브라우저 권한을 확인해주세요. 텍스트로는 계속 대화할 수 있어요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
    }
  };

  // TTS 재생 경로에 AnalyserNode를 붙여 응답 파형을 그릴 수 있게 함.
  // createMediaElementSource는 같은 <audio> 엘리먼트에 대해 한 번만 호출 가능하므로,
  // 앱 전체에서 재사용하는 하나의 <audio> 엘리먼트에 대해 최초 1회만 생성해 재사용한다.
  const ensureTtsAnalyser = () => {
    if (ttsAnalyserRef.current) return ttsAnalyserRef.current;
    const player = audioPlayerRef.current;
    if (!player) return null;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaElementSource(player);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);
    analyser.connect(audioContext.destination); // 스피커로 출력해야 하므로 연결

    ttsAudioContextRef.current = audioContext;
    ttsAnalyserRef.current = analyser;
    return analyser;
  };

  // 에이전트 응답 텍스트를 TTS로 변환해 재생. 재생이 끝나면(성공/실패 무관) resolve.
  const playReply = (text) => {
    return new Promise((resolve) => {
      if (!sessionAliveRef.current) {
        resolve();
        return;
      }
      setConversationState('speaking');
      ensureTtsAnalyser();
      ttsAudioContextRef.current?.resume().catch(() => {});

      const finish = () => resolve();

      (async () => {
        try {
          const audioBlob = await withTimeout(
            synthesizeSpeech(text),
            PROCESSING_TIMEOUT_MS,
            'TTS 응답 시간 초과'
          );
          const url = URL.createObjectURL(audioBlob);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
          }
          objectUrlRef.current = url;
          const player = audioPlayerRef.current;
          if (!player) {
            finish();
            return;
          }
          player.onended = finish;
          player.onerror = finish;
          player.src = url;
          await player.play();
        } catch (err) {
          console.error('TTS 재생 실패:', err);
          finish();
        }
      })();
    });
  };

  // 응답을 말하고, 끝나면 대화가 살아있는 한 자동으로 LISTENING으로 돌아감 (이슈 3 핵심 루프)
  const speakThenContinue = async (text) => {
    await playReply(text);
    if (!sessionAliveRef.current) return; // 재생 중/대기 중 "종료"를 눌렀으면 아무 것도 하지 않음
    if (conversationActiveRef.current) {
      startListening();
    } else {
      setConversationState('idle');
    }
  };

  const handleSelectSituation = async (situationId) => {
    navigate('/chat');
    sessionAliveRef.current = true;
    conversationActiveRef.current = true;
    setConversationState('processing');

    // "상황 선택" 클릭이 최초이자 유일한 사용자 제스처이므로, 이 안에서 마이크 권한을
    // 미리 확보해둬야 이후 SPEAKING → LISTENING 자동 전환 시 추가 클릭 없이 마이크를 켤 수 있음.
    try {
      const permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permStream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      console.error('마이크 권한 확보 실패:', err);
      conversationActiveRef.current = false; // 텍스트 전용 폴백으로 진행
    }
    if (!sessionAliveRef.current) return; // 권한 요청 중 "종료"를 눌렀으면 중단

    try {
      const { sessionId } = await createSession(situationId);
      if (!sessionAliveRef.current) return; // 세션 생성 중 "종료"를 눌렀으면 중단
      sessionIdRef.current = sessionId;
      setSessionId(sessionId);

      const greeting = SITUATION_GREETINGS[situationId] ?? SITUATION_GREETINGS.default;
      const greetingMsg = { id: Date.now(), sender: 'agent', text: greeting };
      setMessages((prev) => [...prev, greetingMsg]);
      await speakThenContinue(greeting);
    } catch (err) {
      console.error('세션 생성 실패:', err);
      if (!sessionAliveRef.current) return;
      conversationActiveRef.current = false;
      setConversationState('idle');
      const fallbackMsg = {
        id: Date.now(),
        sender: 'agent',
        text: '서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인한 뒤 새로고침 해주세요.',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    }
  };

  // 텍스트 입력은 LISTENING(마이크가 배경에서 대기 중) 또는 idle(마이크 권한 없음 폴백) 상태에서만 허용
  const canType = conversationState === 'listening' || conversationState === 'idle';

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !canType) return;
    if (!sessionIdRef.current) {
      const fallbackMsg = { id: Date.now(), sender: 'agent', text: '아직 세션이 연결되지 않았어요. 페이지를 새로고침 해주세요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
      return;
    }

    // 마이크가 배경에서 듣고 있었다면, 텍스트 전송이 우선이므로 녹음은 버림
    if (mediaRecorderRef.current?.state === 'recording') {
      pendingActionRef.current = 'discard';
      mediaRecorderRef.current.stop();
    }

    const newUserMsg = { id: Date.now(), sender: 'user', text: inputValue };
    setMessages((prev) => [...prev, newUserMsg]);
    const textToSend = inputValue;
    setInputValue('');

    setConversationState('processing');

    let replyText;
    try {
      const { reply } = await withTimeout(
        sendMessage(sessionIdRef.current, textToSend),
        PROCESSING_TIMEOUT_MS,
        '응답 시간 초과'
      );
      if (!sessionAliveRef.current) return; // 응답 대기 중 "종료"를 눌렀으면 반영하지 않음
      replyText = reply;
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'agent', text: reply }]);
    } catch (err) {
      console.error('메시지 전송 실패:', err);
      if (!sessionAliveRef.current) return;
      replyText = '지금은 응답을 받아올 수 없어요. 잠시 후 다시 시도해주세요.';
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'agent', text: replyText }]);
    }

    await speakThenContinue(replyText);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 녹음 종료 후: WAV 변환 -> STT -> 채팅 전송 -> TTS 재생 -> (대화가 살아있으면) 다시 LISTENING
  const processVoiceMessage = async (audioBlob) => {
    setConversationState('processing');

    if (!sessionIdRef.current) {
      const fallbackMsg = { id: Date.now(), sender: 'agent', text: '아직 세션이 연결되지 않았어요. 페이지를 새로고침 해주세요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
      conversationActiveRef.current = false;
      setConversationState('idle');
      return;
    }

    let replyText;
    try {
      const wavBlob = await blobToWav(audioBlob);
      const { transcript } = await withTimeout(
        transcribeAudio(wavBlob),
        PROCESSING_TIMEOUT_MS,
        'STT 응답 시간 초과'
      );
      if (!sessionAliveRef.current) return; // STT 대기 중 "종료"를 눌렀으면 반영하지 않음

      if (!transcript?.trim()) {
        throw new Error('빈 STT 결과');
      }

      setMessages((prev) => [...prev, { id: Date.now(), sender: 'user', text: transcript }]);

      const { reply } = await withTimeout(
        sendMessage(sessionIdRef.current, transcript),
        PROCESSING_TIMEOUT_MS,
        '응답 시간 초과'
      );
      if (!sessionAliveRef.current) return; // 응답 대기 중 "종료"를 눌렀으면 반영하지 않음
      replyText = reply;
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'agent', text: reply }]);
    } catch (err) {
      console.error('음성 메시지 처리 실패:', err);
      if (!sessionAliveRef.current) return;
      replyText = '음성을 알아듣지 못했어요. 다시 한번 말씀해주시겠어요?';
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'agent', text: replyText }]);
    }

    await speakThenContinue(replyText);
  };

  // 자동 무음 감지가 오작동할 때를 위한 수동 폴백: LISTENING 중에만 "말 다 했어요"로 즉시 종료
  const handleMicClick = () => {
    if (conversationState !== 'listening') return;
    stopListeningAndProcess();
  };

  // 상태와 무관하게 항상 눌러서 대화를 완전히 끝내고 홈으로 돌아갈 수 있는 버튼
  const handleEndConversation = () => {
    sessionAliveRef.current = false;
    conversationActiveRef.current = false;

    if (mediaRecorderRef.current?.state === 'recording') {
      pendingActionRef.current = 'discard';
      mediaRecorderRef.current.stop();
    }
    stopSilenceWatcher();

    if (audioPlayerRef.current) {
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      audioPlayerRef.current.pause();
    }

    setConversationState('idle');
    sessionIdRef.current = null;
    setSessionId(null);
    setMessages([]);
    setInputValue('');
    navigate('/');
  };

  const HomeScreen = (
    <div className="home-screen">
      <div className="home-icon">🎧</div>
      <h1 className="home-title">AirPods Log</h1>
      <p className="home-subtitle">상황을 기록하면, 당신만의 에이전트가<br/>오디오로 대화를 이어갑니다.</p>
      <button className="btn-primary" onClick={handleStart}>
        에이전트 연결하기
      </button>
    </div>
  );

  const SituationScreen = (
    <div className="situation-screen">
      <h2 className="situation-title">지금 어떤 상황이야?</h2>
      <p className="situation-subtitle">상황에 맞춰 톤과 추천을 바꿀게요.</p>
      <div className="situation-options">
        {SITUATIONS.map((s) => (
          <button
            key={s.label}
            className="situation-option"
            onClick={() => handleSelectSituation(s.id)}
          >
            <span className="situation-option-emoji">{s.emoji}</span>
            <span className="situation-option-label">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const statusText = {
    idle: '텍스트로 대화 중 (마이크 사용 불가)',
    listening: listeningPhase === 'active' ? '듣는 중...' : '편하게 말씀해주세요',
    processing: '생각하는 중...',
    speaking: '말하는 중...',
  }[conversationState];

  const ChatScreen = (
    <div className="chat-container">
      {/* 상단 헤더 */}
      <header className="chat-header">
        <div className="chat-header-status">
          <span
            className={`status-dot ${conversationState === 'listening' ? 'status-dot--recording' : ''} ${conversationState === 'processing' || conversationState === 'speaking' ? 'status-dot--analyzing' : ''}`}
          ></span>
          <span className="status-text">{statusText}</span>
        </div>
        <button className="end-button" onClick={handleEndConversation} title="대화 종료">
          종료
        </button>
      </header>

      {/* 음성 파형: 듣는 중엔 마이크 입력, 말하는 중엔 TTS 응답을 시각화 */}
      <canvas ref={waveformCanvasRef} className="waveform-canvas" />

      {/* 대화 로그 영역 */}
      <div className="messages-area">
        {messages.length === 0 && (
          <p className="empty-message">"오늘 하루는 어땠나요? 가볍게 털어놓아 보세요."</p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row ${msg.sender === 'user' ? 'msg-row--user' : 'msg-row--agent'}`}>
            {msg.sender === 'agent' && <div className="agent-avatar">AI</div>}
            <div className={`bubble ${msg.sender === 'user' ? 'bubble--user' : 'bubble--agent'}`}>
              {msg.text}
            </div>
          </div>
        ))}

        {/* 분석 중 애니메이션 인디케이터 */}
        {conversationState === 'processing' && (
          <div className="msg-row msg-row--agent">
            <div className="agent-avatar">AI</div>
            <div className="bubble bubble--agent">분석 중...</div>
          </div>
        )}

        {/* 응답 음성 재생 중임을 알려주는 인디케이터 */}
        {conversationState === 'speaking' && (
          <div className="msg-row msg-row--agent">
            <div className="agent-avatar">AI</div>
            <div className="bubble bubble--agent bubble--speaking">🔊 말하는 중...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 하단 입력 영역 */}
      <div className="input-area">
        <button
          className={`mic-button ${conversationState === 'listening' ? 'mic-button--recording' : ''}`}
          onClick={handleMicClick}
          disabled={conversationState !== 'listening'}
          title={conversationState === 'listening' ? '말 다 했어요 (수동 종료)' : '자동으로 듣고 있어요'}
        >
          {conversationState === 'listening' ? '⏹️' : '🎙️'}
        </button>
        <textarea
          className="chat-textarea"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={canType ? '메시지 입력...' : '에이전트가 응답 중입니다...'}
          disabled={!canType}
          rows={1}
        />
        <button
          className="btn-primary send-button"
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || !canType}
        >
          전송
        </button>
      </div>

      <audio ref={audioPlayerRef} hidden />
    </div>
  );

  return (
    <div className="app-shell">
      <div className="app-window">
        <Routes>
          <Route path="/" element={HomeScreen} />
          <Route path="/situation" element={SituationScreen} />
          <Route path="/chat" element={ChatScreen} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
