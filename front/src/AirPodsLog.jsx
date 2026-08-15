// 앱의 핵심 화면/상태 머신: 라우팅(홈/상황선택/채팅/로그인/기록/설정), 음성 대화 루프
// (마이크 녹음 → 무음 감지(VAD) → STT → LLM 응답 → TTS 재생 → 자동 재청취), 파형 시각화,
// 사이드바 내비게이션까지 이 파일 하나에 모여 있음.
import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  createSession,
  sendMessage,
  transcribeAudio,
  synthesizeSpeech,
  getMySessions,
  getSessionDetail,
  recordInterruption,
} from './api';
import { blobToWav } from './audioUtils';
import { computeAmplitude, createBargeInDetector } from './bargeIn';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import AuthScreen from './AuthScreen';
import HistoryScreen from './HistoryScreen';
import SettingsScreen from './SettingsScreen';
import RecapScreen from './RecapScreen';
import { SITUATIONS, SITUATION_META_BY_ID } from './situations';
import './AirPodsLog.css';
import './Auth.css';
import './Settings.css';

const SITUATION_GREETINGS = {
  studying: '집중 모드구나, 방해되지 않게 조용히 있을게. 필요할 때 편하게 불러줘.',
  exercising: '운동 중이구나! 텐션 확 올려줄 준비 됐어.',
  sleeping: '자기 전이구나, 편안하게 갈 수 있게 준비할게.',
  morning: '좋은 아침, 일어나자마자 화면 볼 필요 없이 나랑 얘기하면서 하루 시작해보자.',
  commuting: '이동 중이구나, 눈이랑 손은 편하게 두고 나랑 얘기하면서 가자.',
  default: '안녕, 오늘 하루는 어땠어?',
};

// 무음 감지(VAD) 튜닝 값 — 환경/마이크에 따라 조정 필요
const SILENCE_THRESHOLD = 10; // 볼륨 임계값 (0~128), "발화가 끝났다"고 판단하는 기준이라 다소 보수적으로 높게 잡음
const SILENCE_DURATION_MS = 1500; // 발화 중 이만큼 무음이 지속되면 자동 종료
// STT를 호출할지 말지 거르는 용도로만 쓰는 훨씬 낮은 기준. SILENCE_THRESHOLD와 같은 값을 쓰면
// 마이크 입력 레벨이 낮은 환경/기기에서 실제로 말을 해도 "소리가 감지되지 않음"으로 오판해
// STT 자체를 호출 안 하는 문제가 생길 수 있어 분리함 (완전한 디지털 무음만 걸러내는 게 목적).
const MIN_SOUND_THRESHOLD = 3;

// STT/LLM/TTS 중 하나가 응답 없이 멈추는 상황을 대비한 타임아웃
const PROCESSING_TIMEOUT_MS = 20000;
// barge-in 직후에 실제 발화가 이어지지 않으면 기존 응답을 재생하지 않고
// 일반 듣기 모드로 안정화한다. 재생 재개는 이미 녹음된 사용자 음성과 겹칠 수 있다.
const BARGE_IN_CONFIRM_TIMEOUT_MS = 4000;

// STT/TTS가 사용 한도(429)에 걸리면 이 시간 동안 음성 기능을 끄고 텍스트로만 대화한다.
// 새로고침해도 바로 다시 시도해서 또 걸리는 일이 없도록 localStorage에 만료 시각을 남겨둔다.
const VOICE_QUOTA_COOLDOWN_MS = 30 * 60 * 1000;
const VOICE_DISABLED_STORAGE_KEY = 'airpodslog.voiceDisabledUntil';

function isVoiceQuotaCooldownActive() {
  const until = Number(window.localStorage.getItem(VOICE_DISABLED_STORAGE_KEY));
  return Number.isFinite(until) && until > Date.now();
}

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
  const { user, signOut } = useAuth();
  const { voice, speed, volume } = useSettings();
  // 대화 기록을 저장하는 배열 (API 연동 시 이 배열을 통째로 LLM에 보냄)
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState(null);
  // 로그인/기록보기/설정으로 이동하는 좌측 슬라이드 사이드바가 열려있는지
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 대화 전체 상태 머신: idle | listening | processing | speaking | interrupted
  const [conversationState, setConversationState] = useState('idle');
  // STT/TTS 사용 한도 초과로 음성 기능 전체(마이크 입력 + 음성 응답)를 끈 상태인지
  const [voiceDisabled, setVoiceDisabled] = useState(isVoiceQuotaCooldownActive);
  // 홈 화면의 "지난 대화 이어하기" 카드에 띄울, 로그인 사용자의 가장 최근 대화(메시지가 실제로 오간 세션)
  const [lastSession, setLastSession] = useState(null);
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
  // 끼어들기(barge-in, docs/nth_wk/Barkeinplan.md): SPEAKING 중에도 별도로 마이크를 열어
  // 음량을 감시하는 파이프라인. micAnalyserRef(LISTENING 전용)와는 별개 스트림/컨텍스트를 쓴다
  // — 재생 중에는 파형이 ttsAnalyserRef를 그리므로 화면에는 영향 없음.
  const bargeInStreamRef = useRef(null);
  const bargeInAudioContextRef = useRef(null);
  const bargeInAnalyserRef = useRef(null);
  const bargeInRafRef = useRef(null);
  // 끼어들기를 판정하는 300ms 동안의 발화 첫부분을 잃지 않도록 감시 시점부터
  // 같은 스트림을 프리롤 녹음한다. 감지 성공 시 이 recorder를 listening으로 그대로 넘긴다.
  const bargeInRecorderRef = useRef(null);
  const bargeInChunksRef = useRef(null);
  // 진행 중인 /api/tts 요청을 barge-in 시 취소하기 위한 AbortController
  const ttsAbortControllerRef = useRef(null);
  // playReply()의 Promise를 barge-in이 직접 settle시킬 수 있도록 resolve 콜백을 보관
  const ttsFinishRef = useRef(null);
  // 현재 TTS로 읽고 있는 UI/DB 메시지. barge-in 발생 시 해당 행만 중단 표시한다.
  const currentTtsMessageRef = useRef(null);
  const bargeInConfirmTimerRef = useRef(null);
  const recordingOriginRef = useRef('normal');
  // 파형 그리기 루프는 마운트 시 한 번만 시작해 계속 도는 rAF라서, 매 프레임 최신
  // conversationState를 읽으려면 state가 아니라 ref가 필요함 (stale closure 방지).
  const conversationStateRef = useRef('idle');
  // 녹음이 stop()될 때 그 결과를 실제로 처리할지(process) 그냥 버릴지(discard) 구분
  const pendingActionRef = useRef('process');
  // 이번 녹음에서 SILENCE_THRESHOLD를 넘는 실제 발화가 한 번이라도 감지됐는지. false인 채로
  // 끝나면(무음/배경소음만 녹음됨) STT를 호출하지 않음 — LLM 기반 STT는 무음에도 그럴듯한
  // 문장을 지어내는(hallucination) 경향이 있어, 애초에 보내지 않는 게 유일한 확실한 방어.
  const speechDetectedRef = useRef(false);
  // 대화 루프(SPEAKING → LISTENING 자동 전환)가 살아있는지. 마이크 권한이 없으면 false로 두고 텍스트 전용으로 동작.
  const conversationActiveRef = useRef(false);
  // 현재 세션이 아직 유효한지("대화 종료"를 누르지 않았는지). 이게 false면 처리 중이던
  // STT/LLM/TTS 응답이 뒤늦게 도착해도 화면/오디오에 반영하지 않음.
  const sessionAliveRef = useRef(false);
  // voiceDisabled state를 콜백/클로저 안에서도 최신값으로 읽기 위한 ref (다른 *Ref 필드들과 동일한 패턴)
  const voiceDisabledRef = useRef(voiceDisabled);

  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  useEffect(() => {
    voiceDisabledRef.current = voiceDisabled;
  }, [voiceDisabled]);

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
      if (bargeInRafRef.current) {
        cancelAnimationFrame(bargeInRafRef.current);
      }
      if (bargeInStreamRef.current) {
        bargeInStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (bargeInRecorderRef.current?.state === 'recording') {
        bargeInRecorderRef.current.stop();
      }
      if (bargeInAudioContextRef.current) {
        bargeInAudioContextRef.current.close();
      }
      ttsAbortControllerRef.current?.abort();
      if (bargeInConfirmTimerRef.current) clearTimeout(bargeInConfirmTimerRef.current);
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
      } else if (state === 'interrupted') {
        color = '#f472b6';
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

  // 사이드바 메뉴(기록 보기/설정/로그인)를 눌러 다른 화면으로 이동하면 사이드바는 자동으로 닫음
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // 홈 화면에 들어올 때마다(로그인 상태라면) 이어할 수 있는 가장 최근 대화를 조회.
  // last_active_at === created_at인 세션은 메시지가 한 번도 오간 적 없는 빈 세션이라 건너뜀.
  useEffect(() => {
    if (location.pathname !== '/' || !user) {
      setLastSession(null);
      return;
    }
    getMySessions()
      .then(({ sessions }) => {
        const resumable = sessions.find((s) => s.last_active_at !== s.created_at);
        setLastSession(resumable ?? null);
      })
      .catch((err) => console.error('최근 대화 조회 실패:', err));
  }, [location.pathname, user]);

  const handleStart = () => {
    navigate('/situation');
  };

  // 마이크 스트림에 AnalyserNode를 붙여 무음/발화를 감지.
  // 같은 AnalyserNode를 파형 그리기(drawWaveform)에도 그대로 공유해서 별도
  // AudioContext 없이 하나의 파이프라인으로 처리 (docs/3rd_wk/web_audio.md 참고).
  // WAITING_FOR_SPEECH: 사용자가 말을 시작할 때까지 무한정 대기 (녹음 시작 직후 오탐 방지)
  // SPEECH_ACTIVE: 한 번이라도 발화가 감지된 뒤부터 무음 지속시간을 재서 자동 종료
  const startSilenceWatcher = (stream, { speechAlreadyActive = false } = {}) => {
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
    let phase = speechAlreadyActive ? 'active' : 'waiting';
    let silenceStart = null;
    if (speechAlreadyActive) setListeningPhase('active');

    const checkVoice = () => {
      analyser.getByteTimeDomainData(dataArray);
      const avgAmplitude = computeAmplitude(dataArray);

      // phase(발화 시작/자동 종료 판단)와 별개로, 아주 낮은 기준으로 "이번 녹음에 소리가
      // 조금이라도 있었는지"만 계속 갱신 — SILENCE_THRESHOLD를 못 넘는 조용한 발화도 STT는 타게 함
      if (avgAmplitude > MIN_SOUND_THRESHOLD) {
        speechDetectedRef.current = true;
      }

      if (phase === 'waiting') {
        if (avgAmplitude > SILENCE_THRESHOLD) {
          phase = 'active';
          setListeningPhase('active');
          if (bargeInConfirmTimerRef.current) {
            clearTimeout(bargeInConfirmTimerRef.current);
            bargeInConfirmTimerRef.current = null;
          }
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

  // 끼어들기(barge-in) 감지: SPEAKING(TTS 재생) 중에 별도로 마이크를 열어 음량을 감시하다가,
  // BARGE_IN_THRESHOLD를 BARGE_IN_SUSTAIN_MS 이상 연속으로 넘기면(=createBargeInDetector) 사용자가
  // 다시 말하기 시작한 것으로 보고 handleBargeIn을 호출한다. 실패해도(권한 거부 등) TTS 재생
  // 자체는 계속돼야 하므로 조용히 무시한다.
  const startBargeInWatcher = async () => {
    try {
      // TTS가 스피커로 나오는 동안 여는 마이크라 에코 문제(Barkeinplan.md 3-1)가 가장 크게
      // 걸리는 지점 — 하드웨어 AEC에 의존해야 하므로 echoCancellation을 명시적으로 요청한다.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // 감시를 시작하기 전에 이미 재생이 끝났거나(응답이 매우 짧음) 대화가 끝났으면 그냥 스트림을 닫는다.
      if (conversationStateRef.current !== 'speaking' || !sessionAliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser); // destination에는 연결하지 않음 (하울링 방지)

      bargeInStreamRef.current = stream;
      bargeInAudioContextRef.current = audioContext;
      bargeInAnalyserRef.current = analyser;

      // 감지한 뒤 새 MediaRecorder/getUserMedia를 시작하면 짧은 발화가 통째로 빠진다.
      // 대신 AEC가 적용된 같은 스트림을 미리 녹음해 발화 첫부분을 보존한다.
      const preRollChunks = [];
      const preRollRecorder = new MediaRecorder(stream);
      preRollRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) preRollChunks.push(event.data);
      };
      preRollRecorder.start(250);
      bargeInRecorderRef.current = preRollRecorder;
      bargeInChunksRef.current = preRollChunks;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const detect = createBargeInDetector();

      const check = () => {
        analyser.getByteTimeDomainData(dataArray);
        const amplitude = computeAmplitude(dataArray);
        if (detect(amplitude, performance.now())) {
          handleBargeIn();
          return;
        }
        bargeInRafRef.current = requestAnimationFrame(check);
      };

      bargeInRafRef.current = requestAnimationFrame(check);
    } catch (err) {
      console.error('끼어들기 감지용 마이크 접근 실패:', err);
    }
  };

  const stopBargeInWatcher = ({ preserveRecording = false } = {}) => {
    if (bargeInRafRef.current) {
      cancelAnimationFrame(bargeInRafRef.current);
      bargeInRafRef.current = null;
    }
    if (!preserveRecording && bargeInRecorderRef.current?.state === 'recording') {
      bargeInRecorderRef.current.stop();
    }
    if (!preserveRecording && bargeInStreamRef.current) {
      bargeInStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (bargeInAudioContextRef.current) {
      bargeInAudioContextRef.current.close();
      bargeInAudioContextRef.current = null;
    }
    bargeInStreamRef.current = null;
    bargeInRecorderRef.current = null;
    bargeInChunksRef.current = null;
    bargeInAnalyserRef.current = null;
  };

  const takeBargeInRecording = () => {
    const recording = {
      stream: bargeInStreamRef.current,
      recorder: bargeInRecorderRef.current,
      chunks: bargeInChunksRef.current ?? [],
    };
    stopBargeInWatcher({ preserveRecording: true });
    return recording.stream && recording.recorder ? recording : null;
  };

  // TTS 재생을 즉시 중단한다 (재생 중인 <audio>, 진행 중인 /api/tts 요청 모두). barge-in뿐
  // 아니라 대화 종료/리셋(resetConversationPipeline)에서도 재사용한다.
  // interrupted:true로 호출하면 playReply()의 Promise를 true로 settle시켜, speakThenContinue가
  // (barge-in이 이미 후속 처리를 했거나, 애초에 세션이 끝났으니) 자동 재청취를 걸지 않고 그냥
  // 리턴하게 한다 — speakThenContinue는 !sessionAliveRef 체크를 먼저 하므로 세션 종료 상황에서도 안전.
  const stopTtsPlayback = ({ interrupted = false } = {}) => {
    const player = audioPlayerRef.current;
    if (player) {
      player.onended = null;
      player.onerror = null;
      player.pause();
    }
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }
    if (ttsFinishRef.current) {
      const finish = ttsFinishRef.current;
      ttsFinishRef.current = null;
      finish(interrupted);
    }
  };

  // TTS 재생 중 끼어들기가 감지되면 speaking → interrupted → listening으로 전환한다.
  // 전체 응답 텍스트는 유지하고 UI/DB에만 중단 표시하며, 이벤트는 분석용으로 별도 저장한다.
  const handleBargeIn = () => {
    if (conversationStateRef.current !== 'speaking') return;
    const spokenMessage = currentTtsMessageRef.current;
    const playbackMs = spokenMessage?.playbackStartedAt == null
      ? null
      : performance.now() - spokenMessage.playbackStartedAt;
    conversationStateRef.current = 'interrupted';
    setConversationState('interrupted');
    if (spokenMessage?.clientId != null) {
      setMessages((prev) => prev.map((message) =>
        message.id === spokenMessage.clientId ? { ...message, interrupted: true } : message
      ));
    }
    if (sessionIdRef.current) {
      recordInterruption(sessionIdRef.current, {
        messageId: spokenMessage?.serverMessageId ?? null,
        playbackMs,
      }).catch((err) => console.error('끼어들기 이벤트 저장 실패:', err));
    }
    const preRollRecording = takeBargeInRecording();
    stopTtsPlayback({ interrupted: true });
    currentTtsMessageRef.current = null;
    if (conversationActiveRef.current && sessionAliveRef.current) {
      if (preRollRecording) {
        beginListeningWithRecorder(preRollRecording.stream, preRollRecording.recorder, {
          fromBargeIn: true,
          initialChunks: preRollRecording.chunks,
        });
      } else {
        startListening({ fromBargeIn: true });
      }
    }
  };

  // 녹음/재생 중이던 오디오 파이프라인과 메시지 목록을 정리. "종료" 버튼뿐 아니라 새 페르소나를
  // 시작할 때도 호출해서, 뒤로가기 등으로 "종료"를 거치지 않고 이전 세션이 남아있던 경우에도
  // 이전 대화 내용이나 마이크 녹음이 새 세션으로 이어지지 않도록 함.
  const resetConversationPipeline = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      pendingActionRef.current = 'discard';
      mediaRecorderRef.current.stop();
    }
    stopSilenceWatcher();
    stopBargeInWatcher();
    stopTtsPlayback({ interrupted: true });
    currentTtsMessageRef.current = null;
    if (bargeInConfirmTimerRef.current) {
      clearTimeout(bargeInConfirmTimerRef.current);
      bargeInConfirmTimerRef.current = null;
    }

    sessionIdRef.current = null;
    setSessionId(null);
    setMessages([]);
    setInputValue('');
  };

  // STT/TTS가 사용 한도(429)에 걸렸을 때 호출. 마이크 루프를 끄고 이후로는 텍스트로만
  // 대화하게 하며, 새로고침해도 바로 재시도하지 않도록 쿨다운을 localStorage에 남긴다.
  const disableVoice = () => {
    if (voiceDisabledRef.current) return; // 이미 꺼진 상태면 중복 안내하지 않음
    voiceDisabledRef.current = true;
    setVoiceDisabled(true);
    conversationActiveRef.current = false;
    window.localStorage.setItem(VOICE_DISABLED_STORAGE_KEY, String(Date.now() + VOICE_QUOTA_COOLDOWN_MS));
    if (sessionAliveRef.current) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'agent',
          text: '🔇 음성 사용 한도를 다 써서 지금은 텍스트로만 대화할 수 있어요. 잠시 후 다시 음성을 사용할 수 있어요.',
        },
      ]);
    }
  };

  // 무음 감지(자동) 또는 마이크 버튼(수동 폴백) 둘 다 이 경로로 녹음을 종료하고 처리로 넘김
  const stopListeningAndProcess = () => {
    if (mediaRecorderRef.current?.state !== 'recording') return;
    pendingActionRef.current = 'process';
    mediaRecorderRef.current.stop();
  };

  const beginListeningWithRecorder = (
    stream,
    recorder,
    { fromBargeIn = false, initialChunks = [] } = {}
  ) => {
      audioChunksRef.current = initialChunks;
      pendingActionRef.current = 'process';
      // barge-in detector가 지속 발화를 이미 확인했으므로 핸드오프 직후 말이
      // 끝나도 무음으로 버리지 않도록 발화 감지 상태를 승계한다.
      speechDetectedRef.current = fromBargeIn;
      recordingOriginRef.current = fromBargeIn ? 'barge-in' : 'normal';

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        stopSilenceWatcher();
        const action = pendingActionRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (action === 'process') {
          if (speechDetectedRef.current) {
            processVoiceMessage(audioBlob, { fromBargeIn: recordingOriginRef.current === 'barge-in' });
          } else {
            handleNoSpeechDetected();
          }
        }
        // action === 'discard': 대화 종료/텍스트 전송으로 취소된 녹음이므로 버림
      };

      if (recorder.state !== 'recording') recorder.start();
      mediaRecorderRef.current = recorder;
      setConversationState('listening');
      setListeningPhase(fromBargeIn ? 'active' : 'waiting');
      startSilenceWatcher(stream, { speechAlreadyActive: fromBargeIn });
      if (fromBargeIn) {
        bargeInConfirmTimerRef.current = setTimeout(() => {
          bargeInConfirmTimerRef.current = null;
          // 짧은 소음으로 실제 발화가 시작되지 않아도 중단된 음성은 재개하지 않는다.
          // 현재 녹음은 계속 유지해 사용자가 다시 말하면 즉시 받을 수 있게 한다.
          if (!speechDetectedRef.current && mediaRecorderRef.current?.state === 'recording') {
            recordingOriginRef.current = 'normal';
            setListeningPhase('waiting');
          }
        }, BARGE_IN_CONFIRM_TIMEOUT_MS);
      }
  };

  // LISTENING 진입: 일반 전환은 새 마이크를 열고, barge-in은 위의 프리롤 녹음을 재사용한다.
  const startListening = async ({ fromBargeIn = false } = {}) => {
    if (!sessionAliveRef.current || !conversationActiveRef.current || voiceDisabledRef.current) {
      setConversationState('idle');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const recorder = new MediaRecorder(stream);
      beginListeningWithRecorder(stream, recorder, { fromBargeIn });
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

  // 에이전트 응답 텍스트를 TTS로 변환해 재생. 재생이 끝나면(성공/실패/끼어들기 무관) resolve.
  // resolve 값은 barge-in으로 중단됐는지 여부(interrupted) — speakThenContinue가 이를 보고
  // 자동 재청취를 다시 걸지 말지 판단한다 (barge-in 핸들러가 이미 새 녹음을 시작했으므로).
  const playReply = (text, message = null) => {
    return new Promise((resolve) => {
      if (!sessionAliveRef.current) {
        resolve(false);
        return;
      }
      setConversationState('speaking');
      currentTtsMessageRef.current = message
        ? { clientId: message.id, serverMessageId: message.serverMessageId ?? null, playbackStartedAt: null }
        : null;
      ensureTtsAnalyser();
      ttsAudioContextRef.current?.resume().catch(() => {});
      startBargeInWatcher(); // TTS 재생 중에도 마이크를 열어 끼어들기를 감시 (Barkeinplan.md Phase 1)

      let settled = false;
      const finish = (interrupted = false) => {
        if (settled) return;
        settled = true;
        ttsFinishRef.current = null;
        stopBargeInWatcher(); // 재생이 끝났으니(정상/실패/끼어들기 무관) 끼어들기 감시용 마이크도 닫음
        if (!interrupted && currentTtsMessageRef.current?.clientId === message?.id) {
          currentTtsMessageRef.current = null;
        }
        resolve(interrupted);
      };
      ttsFinishRef.current = finish;

      (async () => {
        try {
          const controller = new AbortController();
          ttsAbortControllerRef.current = controller;
          const audioBlob = await withTimeout(
            synthesizeSpeech(text, voice, { signal: controller.signal }),
            PROCESSING_TIMEOUT_MS,
            'TTS 응답 시간 초과'
          );
          ttsAbortControllerRef.current = null;
          if (settled) return; // barge-in 등으로 이미 중단됨 (fetch는 끝났지만 재생은 하지 않음)
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
          player.onended = () => finish();
          player.onerror = () => finish();
          player.src = url;
          player.playbackRate = speed;
          player.volume = volume;
          await player.play();
          if (currentTtsMessageRef.current?.clientId === message?.id) {
            currentTtsMessageRef.current.playbackStartedAt = performance.now();
          }
        } catch (err) {
          ttsAbortControllerRef.current = null;
          if (settled) return; // stopTtsPlayback이 이미 finish(interrupted)를 호출함
          if (err?.name === 'AbortError') {
            // barge-in이 아닌 다른 이유로 재생/요청이 중단된 경우(예: 브라우저 정책) — 그냥 정상 종료로 처리
            finish(false);
            return;
          }
          console.error('TTS 재생 실패:', err);
          if (err?.status === 429) {
            disableVoice();
          }
          finish();
        }
      })();
    });
  };

  // 응답을 말하고, 끝나면 대화가 살아있는 한 자동으로 LISTENING으로 돌아감 (이슈 3 핵심 루프)
  const speakThenContinue = async (text, message = null) => {
    // 음성이 꺼진 상태(사용 한도 초과)면 TTS 호출 자체를 건너뛰고 텍스트만 남긴다
    let interrupted = false;
    if (!voiceDisabledRef.current) {
      interrupted = await playReply(text, message);
    }
    if (!sessionAliveRef.current) return; // 재생 중/대기 중 "종료"를 눌렀으면 아무 것도 하지 않음
    if (interrupted) return; // 끼어들기(barge-in) 핸들러가 이미 새 녹음을 시작했으므로 여기선 아무 것도 하지 않음
    if (conversationActiveRef.current && !voiceDisabledRef.current) {
      startListening();
    } else {
      setConversationState('idle');
    }
  };

  const handleSelectSituation = async (situationId) => {
    resetConversationPipeline(); // 이전 페르소나의 대화/녹음이 남아있다면 정리하고 새로 시작
    navigate('/chat');
    sessionAliveRef.current = true;
    conversationActiveRef.current = true;
    setConversationState('processing');

    // "상황 선택" 클릭이 최초이자 유일한 사용자 제스처이므로, 이 안에서 마이크 권한을
    // 미리 확보해둬야 이후 SPEAKING → LISTENING 자동 전환 시 추가 클릭 없이 마이크를 켤 수 있음.
    // 단, 이미 사용 한도 초과로 음성이 꺼진 상태라면 굳이 권한을 다시 요청하지 않는다.
    if (voiceDisabledRef.current) {
      conversationActiveRef.current = false;
    } else {
      try {
        const permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permStream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.error('마이크 권한 확보 실패:', err);
        conversationActiveRef.current = false; // 텍스트 전용 폴백으로 진행
      }
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
      await speakThenContinue(greeting, greetingMsg);
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

  // 홈 화면의 "지난 대화 이어하기" 카드: 새 세션을 만들지 않고 기존 세션 히스토리를 불러와 이어감.
  // 과거 메시지들은 다시 TTS로 들려주지 않고(불필요한 음성 quota 소모 방지) 텍스트로만 복원한 뒤,
  // 바로 LISTENING(또는 텍스트 폴백)으로 넘어가 사용자가 곧장 이어 말할 수 있게 한다.
  const handleResumeSession = async (session) => {
    resetConversationPipeline(); // 이전 페르소나의 대화/녹음이 남아있다면 정리하고 새로 시작
    navigate('/chat');
    sessionAliveRef.current = true;
    conversationActiveRef.current = true;
    setConversationState('processing');

    if (voiceDisabledRef.current) {
      conversationActiveRef.current = false;
    } else {
      try {
        const permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permStream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.error('마이크 권한 확보 실패:', err);
        conversationActiveRef.current = false; // 텍스트 전용 폴백으로 진행
      }
    }
    if (!sessionAliveRef.current) return; // 권한 요청 중 "종료"를 눌렀으면 중단

    try {
      const { history } = await getSessionDetail(session.id);
      if (!sessionAliveRef.current) return; // 조회 중 "종료"를 눌렀으면 중단
      sessionIdRef.current = session.id;
      setSessionId(session.id);
      setMessages(
        history.map((msg, i) => ({
          id: Date.now() + i,
          sender: msg.role === 'user' ? 'user' : 'agent',
          text: msg.parts?.[0]?.text ?? '',
          serverMessageId: msg.id,
          interrupted: Boolean(msg.interrupted),
        }))
      );
      if (conversationActiveRef.current) {
        startListening();
      } else {
        setConversationState('idle');
      }
    } catch (err) {
      console.error('대화 이어하기 실패:', err);
      if (!sessionAliveRef.current) return;
      conversationActiveRef.current = false;
      setConversationState('idle');
      setMessages([
        { id: Date.now(), sender: 'agent', text: '이전 대화를 불러오지 못했어요. 새로고침 후 다시 시도해주세요.' },
      ]);
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
      const { reply, messageId } = await withTimeout(
        sendMessage(sessionIdRef.current, textToSend),
        PROCESSING_TIMEOUT_MS,
        '응답 시간 초과'
      );
      if (!sessionAliveRef.current) return; // 응답 대기 중 "종료"를 눌렀으면 반영하지 않음
      replyText = reply;
      const replyMessage = { id: Date.now() + 1, serverMessageId: messageId, sender: 'agent', text: reply };
      setMessages((prev) => [...prev, replyMessage]);
      await speakThenContinue(replyText, replyMessage);
      return;
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
  const processVoiceMessage = async (audioBlob, { fromBargeIn = false } = {}) => {
    if (bargeInConfirmTimerRef.current) {
      clearTimeout(bargeInConfirmTimerRef.current);
      bargeInConfirmTimerRef.current = null;
    }
    setConversationState('processing');

    if (!sessionIdRef.current) {
      const fallbackMsg = { id: Date.now(), sender: 'agent', text: '아직 세션이 연결되지 않았어요. 페이지를 새로고침 해주세요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
      conversationActiveRef.current = false;
      setConversationState('idle');
      return;
    }

    let replyText;
    let transcript;
    try {
      const wavBlob = await blobToWav(audioBlob);
      ({ transcript } = await withTimeout(
        transcribeAudio(wavBlob),
        PROCESSING_TIMEOUT_MS,
        'STT 응답 시간 초과'
      ));
    } catch (err) {
      console.error('STT 처리 실패:', err);
      if (!sessionAliveRef.current) return;
      // STT 사용 한도(429) 초과라면 음성 기능을 끄고 텍스트로만 계속한다 (disableVoice가 안내 메시지를 남김)
      if (err?.status === 429) {
        disableVoice();
        setConversationState('idle');
        return;
      }
      // 그 외 STT 호출 자체가 실패한 경우(네트워크, 타임아웃 등)는
      // "못 알아들었다"가 아니라 텍스트 경로(handleSendMessage)와 동일하게 안내한다.
      replyText = '지금은 응답을 받아올 수 없어요. 잠시 후 다시 시도해주세요.';
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'agent', text: replyText }]);
      await speakThenContinue(replyText);
      return;
    }
    if (!sessionAliveRef.current) return; // STT 대기 중 "종료"를 눌렀으면 반영하지 않음

    if (!transcript?.trim()) {
      if (fromBargeIn) {
        // 오탐이나 짧은 소리로 끼어들었지만 STT 발화가 없으면 원래 응답은
        // 재생하지 않고 새 듣기 모드로 복귀한다.
        if (conversationActiveRef.current) startListening();
        else setConversationState('idle');
        return;
      }
      // STT 호출은 성공했지만 결과가 빈 경우: 진짜로 알아듣지 못한 케이스
      replyText = '음성을 알아듣지 못했어요. 다시 한번 말씀해주시겠어요?';
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'agent', text: replyText }]);
      await speakThenContinue(replyText);
      return;
    }

    setMessages((prev) => [...prev, { id: Date.now(), sender: 'user', text: transcript }]);

    try {
      const { reply, messageId } = await withTimeout(
        sendMessage(sessionIdRef.current, transcript),
        PROCESSING_TIMEOUT_MS,
        '응답 시간 초과'
      );
      if (!sessionAliveRef.current) return; // 응답 대기 중 "종료"를 눌렀으면 반영하지 않음
      replyText = reply;
      const replyMessage = { id: Date.now() + 1, serverMessageId: messageId, sender: 'agent', text: reply };
      setMessages((prev) => [...prev, replyMessage]);
      await speakThenContinue(replyText, replyMessage);
      return;
    } catch (err) {
      console.error('메시지 전송 실패:', err);
      if (!sessionAliveRef.current) return;
      replyText = '지금은 응답을 받아올 수 없어요. 잠시 후 다시 시도해주세요.';
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'agent', text: replyText }]);
    }

    await speakThenContinue(replyText);
  };

  // 녹음 내내 SILENCE_THRESHOLD를 넘는 소리가 한 번도 없었던 경우: STT를 아예 호출하지 않고
  // (LLM 기반 STT는 무음에도 그럴듯한 문장을 지어내는 경향이 있어 애초에 보내지 않는 게 안전함)
  // 텍스트 안내만 보여준 뒤 대화가 살아있으면 바로 다시 LISTENING으로 돌아감. TTS는 쓰지 않아
  // 하루 제한이 있는 음성 합성 quota를 소모하지 않는다.
  const handleNoSpeechDetected = () => {
    if (!sessionAliveRef.current) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), sender: 'agent', text: '🔇 소리가 잘 안 들렸어요. 다시 말씀해주시겠어요?' },
    ]);
    if (conversationActiveRef.current) {
      startListening();
    } else {
      setConversationState('idle');
    }
  };

  // 자동 무음 감지가 오작동할 때를 위한 수동 폴백: LISTENING 중에만 "말 다 했어요"로 즉시 종료
  const handleMicClick = () => {
    if (conversationState !== 'listening') return;
    stopListeningAndProcess();
  };

  // 상태와 무관하게 항상 눌러서 대화를 끝내고, 생성된 세션이 있으면 리캡으로 이동한다.
  const handleEndConversation = () => {
    sessionAliveRef.current = false;
    conversationActiveRef.current = false;
    const endingSessionId = sessionIdRef.current; // resetConversationPipeline이 지우기 전에 따로 보관
    resetConversationPipeline();
    setConversationState('idle');
    navigate(endingSessionId ? `/recap/${endingSessionId}` : '/');
  };

  const HomeScreen = (
    <div className="home-screen">
      <button
        type="button"
        className="hamburger-button"
        onClick={() => setSidebarOpen(true)}
        aria-label="메뉴 열기"
      >
        <span aria-hidden="true">☰</span>
      </button>
      {/* 브랜드 마크: 이모지 대신 오디오 파형 형태의 커스텀 아이콘 (각 막대가 다른 위상으로 움직여 이퀄라이저처럼 보임) */}
      <div className="home-icon" aria-hidden="true">
        <svg className="home-icon-svg" viewBox="0 0 64 64" width="64" height="64">
          <rect className="wave-bar wave-bar--1" x="4" y="24" width="8" height="16" rx="4" />
          <rect className="wave-bar wave-bar--2" x="16" y="16" width="8" height="32" rx="4" />
          <rect className="wave-bar wave-bar--3" x="28" y="6" width="8" height="52" rx="4" />
          <rect className="wave-bar wave-bar--4" x="40" y="16" width="8" height="32" rx="4" />
          <rect className="wave-bar wave-bar--5" x="52" y="24" width="8" height="16" rx="4" />
        </svg>
      </div>
      <h1 className="home-title">AirPods Log</h1>
      <p className="home-subtitle">상황을 기록하면, 당신만의 에이전트가<br/>오디오로 대화를 이어갑니다.</p>
      <button className="btn-primary" onClick={handleStart}>
        에이전트 연결하기
      </button>
      {lastSession && (() => {
        const meta = SITUATION_META_BY_ID[lastSession.persona_id ?? 'default'] ?? SITUATION_META_BY_ID.default;
        return (
          <button
            type="button"
            className="resume-card"
            onClick={() => handleResumeSession(lastSession)}
          >
            <span className="resume-card-emoji" aria-hidden="true">{meta.emoji}</span>
            <span className="resume-card-body">
              <span className="resume-card-label">'{meta.label}' 대화 이어하기</span>
              {lastSession.summary && <span className="resume-card-summary">{lastSession.summary}</span>}
            </span>
            <span className="resume-card-arrow" aria-hidden="true">→</span>
          </button>
        );
      })()}
    </div>
  );

  const SituationScreen = (
    <div className="situation-screen">
      <button
        type="button"
        className="hamburger-button"
        onClick={() => setSidebarOpen(true)}
        aria-label="메뉴 열기"
      >
        <span aria-hidden="true">☰</span>
      </button>
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
    idle: voiceDisabled ? '음성 사용 한도 초과 (텍스트로 대화 중)' : '텍스트로 대화 중 (마이크 사용 불가)',
    listening: listeningPhase === 'active' ? '듣는 중...' : '편하게 말씀해주세요',
    processing: '생각하는 중...',
    speaking: '말하는 중...',
    interrupted: '응답을 멈추고 있어요...',
  }[conversationState];

  const ChatScreen = (
    <div className="chat-container">
      {/* 상단 헤더 */}
      <header className="chat-header">
        <div className="chat-header-status">
          <button
            type="button"
            className="hamburger-button hamburger-button--inline"
            onClick={() => setSidebarOpen(true)}
            aria-label="메뉴 열기"
          >
            <span aria-hidden="true">☰</span>
          </button>
          <span
            className={`status-dot ${conversationState === 'listening' ? 'status-dot--recording' : ''} ${conversationState === 'processing' || conversationState === 'speaking' ? 'status-dot--analyzing' : ''} ${conversationState === 'interrupted' ? 'status-dot--interrupted' : ''}`}
          ></span>
          <span className="status-text">{statusText}</span>
        </div>
        <div className="chat-header-actions">
          <button className="end-button" onClick={handleEndConversation} title="대화 종료">
            종료
          </button>
        </div>
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
            <div className={`bubble ${msg.sender === 'user' ? 'bubble--user' : 'bubble--agent'} ${msg.interrupted ? 'bubble--interrupted' : ''}`}>
              {msg.text}
              {msg.interrupted && <span className="bubble-interrupted-label">음성 중단됨</span>}
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
        {conversationState === 'interrupted' && (
          <div className="msg-row msg-row--agent" aria-live="polite">
            <div className="agent-avatar agent-avatar--interrupted">AI</div>
            <div className="bubble bubble--agent bubble--interruption-cue">🎙️ 응답을 멈추고 들을게요.</div>
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
          title={
            conversationState === 'listening'
              ? '말 다 했어요 (수동 종료)'
              : voiceDisabled
              ? '음성 사용 한도 초과로 꺼져 있어요'
              : '자동으로 듣고 있어요'
          }
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

  // 로그인/기록보기/설정으로 이동하는 좌측 슬라이드 사이드바. 홈/채팅 화면의 햄버거 버튼으로 연다.
  const Sidebar = (
    <>
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-backdrop--open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <nav className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`} aria-label="메뉴">
        <div className="sidebar-header">
          {user ? (
            <div className="sidebar-user">
              <span className="auth-status-avatar" aria-hidden="true">
                {user.email?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="sidebar-user-email" title={user.email}>{user.email}</span>
            </div>
          ) : (
            <button type="button" className="sidebar-login-btn" onClick={() => navigate('/login')}>
              <span aria-hidden="true">🔑</span> 로그인 / 회원가입
            </button>
          )}
        </div>
        <div className="sidebar-nav">
          <button type="button" className="sidebar-nav-item" onClick={() => navigate('/history')}>
            <span aria-hidden="true">🗒️</span> 기록 보기
          </button>
          <button type="button" className="sidebar-nav-item" onClick={() => navigate('/settings')}>
            <span aria-hidden="true">⚙️</span> 설정
          </button>
        </div>
        {user && (
          <button type="button" className="sidebar-logout-btn" onClick={signOut}>
            로그아웃
          </button>
        )}
      </nav>
    </>
  );

  return (
    <div className="app-shell">
      <div className="app-window">
        <Routes>
          <Route path="/" element={HomeScreen} />
          <Route path="/situation" element={SituationScreen} />
          <Route path="/chat" element={ChatScreen} />
          <Route path="/login" element={<AuthScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/recap/:sessionId" element={<RecapScreen onContinue={handleResumeSession} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {Sidebar}
      </div>
    </div>
  );
}
