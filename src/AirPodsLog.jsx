import React, { useState, useRef, useEffect } from 'react';

export default function AirPodsLog() {
  const [currentStep, setCurrentStep] = useState('home');
  // 대화 기록을 저장하는 배열 (API 연동 시 이 배열을 통째로 LLM에 보냄)
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [agentStatus, setAgentStatus] = useState('idle'); // 'idle' | 'analyzing' | 'speaking'
  
  const chatEndRef = useRef(null);

  // 메시지가 추가될 때마다 스크롤을 맨 아래로 내림
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStatus]);

  const handleStart = () => {
    setCurrentStep('chat');
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || agentStatus !== 'idle') return;

    // 1. 사용자 메시지 추가
    const newUserMsg = { id: Date.now(), sender: 'user', text: inputValue };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputValue('');
    
    // 2. AI 분석 상태로 전환
    setAgentStatus('analyzing');

    // 3. (가상 연출) 1.5초 후 분석 끝, 오디오 송출 시작
    setTimeout(() => {
      setAgentStatus('speaking');
      
      const newAgentMsg = { id: Date.now() + 1, sender: 'agent', text: '오디오 답변이 도착했습니다.' };
      setMessages((prev) => [...prev, newAgentMsg]);

      // 4. (가상 연출) 3초간 오디오 재생 후 다시 입력 대기 상태로 복귀
      setTimeout(() => {
        setAgentStatus('idle');
      }, 3000);

    }, 1500);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div style={containerStyle}>
      <div style={appWindowStyle}>
        
        {/* 시작 화면 */}
        {currentStep === 'home' && (
          <div style={centerFlexStyle}>
            <div style={iconStyle}>🎧</div>
            <h1 style={titleStyle}>AirPods Log</h1>
            <p style={subtitleStyle}>상황을 기록하면, 당신만의 에이전트가<br/>오디오로 대화를 이어갑니다.</p>
            <button style={primaryButtonStyle} onClick={handleStart}>
              에이전트 연결하기
            </button>
          </div>
        )}

        {/* 연속 대화 화면 */}
        {currentStep === 'chat' && (
          <div style={chatContainerStyle}>
            {/* 상단 헤더 */}
            <header style={chatHeaderStyle}>
              <span style={statusDotStyle(agentStatus === 'idle' ? '#22c55e' : '#eab308')}></span>
              <span style={statusTextStyle}>
                {agentStatus === 'idle' ? '에이전트 대기 중' : 
                 agentStatus === 'analyzing' ? '상황 분석 중...' : '🔊 오디오 송출 중'}
              </span>
            </header>

            {/* 대화 로그 영역 */}
            <div style={messagesAreaStyle}>
              {messages.length === 0 && (
                <p style={emptyMessageStyle}>"오늘 하루는 어땠나요? 가볍게 털어놓아 보세요."</p>
              )}
              
              {messages.map((msg) => (
                <div key={msg.id} style={msg.sender === 'user' ? userMsgWrapperStyle : agentMsgWrapperStyle}>
                  {msg.sender === 'agent' && <div style={agentAvatarStyle}>AI</div>}
                  <div style={msg.sender === 'user' ? userBubbleStyle : agentBubbleStyle}>
                    {msg.sender === 'agent' ? (
                      <div style={audioBubbleContentStyle}>
                        <span>▶️</span>
                        <span>{msg.text}</span>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}
              
              {/* 타이핑/재생 중 애니메이션 인디케이터 */}
              {agentStatus !== 'idle' && (
                <div style={agentMsgWrapperStyle}>
                  <div style={agentAvatarStyle}>AI</div>
                  <div style={agentBubbleStyle}>
                    {agentStatus === 'analyzing' ? '분석 중...' : '🔊 재생 중...'}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 하단 입력 영역 */}
            <div style={inputAreaStyle}>
              <button style={micButtonStyle} disabled={agentStatus !== 'idle'} title="음성 입력 (개발 예정)">
                🎙️
              </button>
              <textarea 
                style={chatTextareaStyle} 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={agentStatus === 'idle' ? "메시지 입력..." : "에이전트가 말하는 중입니다..."}
                disabled={agentStatus !== 'idle'}
                rows={1}
              />
              <button 
                style={sendButtonStyle} 
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

// --- 스타일 객체들 ---
const containerStyle = { minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: '20px', boxSizing: 'border-box' };
const appWindowStyle = { width: '100%', maxWidth: '400px', height: '600px', backgroundColor: '#1e293b', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', color: '#f8fafc', overflow: 'hidden' };
const centerFlexStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '32px' };
const iconStyle = { fontSize: '64px', marginBottom: '24px' };
const titleStyle = { fontSize: '28px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#e2e8f0' };
const subtitleStyle = { fontSize: '15px', color: '#94a3b8', lineHeight: '1.5', marginBottom: '40px' };
const primaryButtonStyle = { width: '100%', backgroundColor: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' };

// 채팅 전용 스타일
const chatContainerStyle = { display: 'flex', flexDirection: 'column', height: '100%' };
const chatHeaderStyle = { padding: '16px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b' };
const statusDotStyle = (color) => ({ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color });
const statusTextStyle = { fontSize: '14px', color: '#cbd5e1', fontWeight: 'bold' };

const messagesAreaStyle = { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#0f172a' };
const emptyMessageStyle = { textAlign: 'center', color: '#64748b', fontSize: '14px', marginTop: 'auto', marginBottom: 'auto' };

const userMsgWrapperStyle = { display: 'flex', justifyContent: 'flex-end', gap: '8px' };
const agentMsgWrapperStyle = { display: 'flex', justifyContent: 'flex-start', gap: '8px' };
const agentAvatarStyle = { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' };

const userBubbleStyle = { maxWidth: '75%', backgroundColor: '#3b82f6', color: '#fff', padding: '12px 16px', borderRadius: '16px 16px 0 16px', fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word' };
const agentBubbleStyle = { maxWidth: '75%', backgroundColor: '#334155', color: '#f8fafc', padding: '12px 16px', borderRadius: '16px 16px 16px 0', fontSize: '14px', lineHeight: '1.4' };
const audioBubbleContentStyle = { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '500' };

const inputAreaStyle = { padding: '16px', backgroundColor: '#1e293b', borderTop: '1px solid #334155', display: 'flex', alignItems: 'flex-end', gap: '8px' };
const micButtonStyle = { padding: '10px', backgroundColor: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', opacity: 0.7 };
const chatTextareaStyle = { flex: 1, backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '20px', padding: '10px 16px', color: '#f8fafc', fontSize: '14px', resize: 'none', outline: 'none', boxSizing: 'border-box' };
const sendButtonStyle = { padding: '10px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' };