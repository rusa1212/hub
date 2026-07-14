import React, { useState, useRef, useEffect } from 'react';
import { createSession, sendMessage } from './api';
import './AirPodsLog.css';

export default function AirPodsLog() {
  const [currentStep, setCurrentStep] = useState('home');
  // 대화 기록을 저장하는 배열 (API 연동 시 이 배열을 통째로 LLM에 보냄)
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [agentStatus, setAgentStatus] = useState('idle'); // 'idle' | 'analyzing'
  const [sessionId, setSessionId] = useState(null);

  const chatEndRef = useRef(null);
  // 메시지 관련 작성
  // 메시지가 추가될 때마다 스크롤을 맨 아래로 내림
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStatus]);

  const handleStart = async () => {
    setCurrentStep('chat');
    try {
      const { sessionId } = await createSession();
      setSessionId(sessionId);
    } catch (err) {
      console.error('세션 생성 실패:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || agentStatus !== 'idle' || !sessionId) return;

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

  return (
    <div className="app-shell">
      <div className="app-window">

        {/* 시작 화면 */}
        {currentStep === 'home' && (
          <div className="home-screen">
            <div className="home-icon">🎧</div>
            <h1 className="home-title">AirPods Log</h1>
            <p className="home-subtitle">상황을 기록하면, 당신만의 에이전트가<br/>오디오로 대화를 이어갑니다.</p>
            <button className="btn-primary" onClick={handleStart}>
              에이전트 연결하기
            </button>
          </div>
        )}

        {/* 연속 대화 화면 */}
        {currentStep === 'chat' && (
          <div className="chat-container">
            {/* 상단 헤더 */}
            <header className="chat-header">
              <span className={`status-dot ${agentStatus === 'analyzing' ? 'status-dot--analyzing' : ''}`}></span>
              <span className="status-text">
                {agentStatus === 'idle' ? '에이전트 대기 중' : '상황 분석 중...'}
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
              <div ref={chatEndRef} />
            </div>

            {/* 하단 입력 영역 */}
            <div className="input-area">
              <button className="mic-button" disabled={agentStatus !== 'idle'} title="음성 입력 (개발 예정)">
                🎙️
              </button>
              <textarea
                className="chat-textarea"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={agentStatus === 'idle' ? "메시지 입력..." : "에이전트가 말하는 중입니다..."}
                disabled={agentStatus !== 'idle'}
                rows={1}
              />
              <button
                className="btn-primary send-button"
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || agentStatus !== 'idle'}
              >
                전송
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
