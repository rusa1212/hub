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

export default function AirPodsLog() {
  const navigate = useNavigate();
  const location = useLocation();
  // 대화 기록을 저장하는 배열 (API 연동 시 이 배열을 통째로 LLM에 보냄)
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [agentStatus, setAgentStatus] = useState('idle'); // 'idle' | 'analyzing'
  const [sessionId, setSessionId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const chatEndRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const objectUrlRef = useRef(null);

  // 메시지 관련 작성
  // 메시지가 추가될 때마다 스크롤을 맨 아래로 내림
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStatus]);

  // 언마운트 시 재생 중이던 오디오 objectURL 정리
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

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

  const handleSelectSituation = async (situationId) => {
    navigate('/chat');
    try {
      const { sessionId } = await createSession(situationId);
      setSessionId(sessionId);

      const greeting = SITUATION_GREETINGS[situationId] ?? SITUATION_GREETINGS.default;
      const greetingMsg = { id: Date.now(), sender: 'agent', text: greeting };
      setMessages((prev) => [...prev, greetingMsg]);
      playReply(greeting);
    } catch (err) {
      const fallbackMsg = {
        id: Date.now(),
        sender: 'agent',
        text: '서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인한 뒤 새로고침 해주세요.',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      console.error('세션 생성 실패:', err);
    }
  };

  // 에이전트 응답 텍스트를 TTS로 변환해 재생 (실패해도 텍스트 대화 자체는 이미 끝난 상태라 조용히 무시)
  const playReply = async (text) => {
    setIsSpeaking(true);
    try {
      const audioBlob = await synthesizeSpeech(text);
      const url = URL.createObjectURL(audioBlob);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = url;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = url;
        await audioPlayerRef.current.play();
      }
    } catch (err) {
      console.error('TTS 재생 실패:', err);
    } finally {
      setIsSpeaking(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || agentStatus !== 'idle') return;
    if (!sessionId) {
      const fallbackMsg = { id: Date.now(), sender: 'agent', text: '아직 세션이 연결되지 않았어요. 페이지를 새로고침 해주세요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
      return;
    }

    // 1. 사용자 메시지 추가
    const newUserMsg = { id: Date.now(), sender: 'user', text: inputValue };
    setMessages((prev) => [...prev, newUserMsg]);
    const textToSend = inputValue;
    setInputValue('');

    // 2. AI 분석 상태로 전환
    setAgentStatus('analyzing');

    try {
      const { reply } = await sendMessage(sessionId, textToSend);
      const newAgentMsg = { id: Date.now() + 1, sender: 'agent', text: reply };
      setMessages((prev) => [...prev, newAgentMsg]);
      playReply(reply);
    } catch (err) {
      const fallbackMsg = { id: Date.now() + 1, sender: 'agent', text: '지금은 응답을 받아올 수 없어요. 잠시 후 다시 시도해주세요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
      console.error('메시지 전송 실패:', err);
    } finally {
      setAgentStatus('idle');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 녹음 종료 후: WAV 변환 -> STT -> 채팅 전송 -> TTS 재생까지 한 번에 처리
  const handleVoiceMessage = async (audioBlob) => {
    if (!sessionId) {
      const fallbackMsg = { id: Date.now(), sender: 'agent', text: '아직 세션이 연결되지 않았어요. 페이지를 새로고침 해주세요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
      return;
    }
    setAgentStatus('analyzing');

    try {
      const wavBlob = await blobToWav(audioBlob);
      const { transcript } = await transcribeAudio(wavBlob);

      if (!transcript?.trim()) {
        throw new Error('빈 STT 결과');
      }

      const newUserMsg = { id: Date.now(), sender: 'user', text: transcript };
      setMessages((prev) => [...prev, newUserMsg]);

      const { reply } = await sendMessage(sessionId, transcript);
      const newAgentMsg = { id: Date.now() + 1, sender: 'agent', text: reply };
      setMessages((prev) => [...prev, newAgentMsg]);
      playReply(reply);
    } catch (err) {
      const fallbackMsg = { id: Date.now() + 1, sender: 'agent', text: '음성을 알아듣지 못했어요. 다시 한번 말씀해주시겠어요?' };
      setMessages((prev) => [...prev, fallbackMsg]);
      console.error('음성 메시지 처리 실패:', err);
    } finally {
      setAgentStatus('idle');
    }
  };

  const handleMicClick = async () => {
    if (agentStatus !== 'idle') return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setIsRecording(false);
        handleVoiceMessage(audioBlob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('마이크 접근 실패:', err);
      const fallbackMsg = { id: Date.now(), sender: 'agent', text: '마이크를 사용할 수 없어요. 브라우저 권한을 확인해주세요.' };
      setMessages((prev) => [...prev, fallbackMsg]);
    }
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

  const ChatScreen = (
    <div className="chat-container">
      {/* 상단 헤더 */}
      <header className="chat-header">
        <span
          className={`status-dot ${isRecording ? 'status-dot--recording' : ''} ${agentStatus === 'analyzing' || isSpeaking ? 'status-dot--analyzing' : ''}`}
        ></span>
        <span className="status-text">
          {isRecording
            ? '음성 듣는 중...'
            : agentStatus === 'analyzing'
            ? '상황 분석 중...'
            : isSpeaking
            ? '답변 준비 중...'
            : '에이전트 대기 중'}
        </span>
      </header>

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
        {agentStatus !== 'idle' && (
          <div className="msg-row msg-row--agent">
            <div className="agent-avatar">AI</div>
            <div className="bubble bubble--agent">분석 중...</div>
          </div>
        )}

        {/* 텍스트 응답 후 음성 생성 중임을 알려주는 인디케이터 (체감 지연 완화) */}
        {agentStatus === 'idle' && isSpeaking && (
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
          className={`mic-button ${isRecording ? 'mic-button--recording' : ''}`}
          onClick={handleMicClick}
          disabled={agentStatus !== 'idle'}
          title={isRecording ? '녹음 종료' : '음성 입력'}
        >
          {isRecording ? '⏹️' : '🎙️'}
        </button>
        <textarea
          className="chat-textarea"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={agentStatus === 'idle' ? "메시지 입력..." : "에이전트가 말하는 중입니다..."}
          disabled={agentStatus !== 'idle' || isRecording}
          rows={1}
        />
        <button
          className="btn-primary send-button"
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || agentStatus !== 'idle' || isRecording}
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
