import React, { useState } from 'react';

export default function ProjectIntro() {
  const [userInput, setUserInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioStatus, setAudioStatus] = useState('대기 중');

  const handleSimulate = () => {
    if (!userInput.trim()) return;
    
    setIsGenerating(true);
    setAudioStatus('AI가 상황 분석 및 오디오 생성 중...');
    
    setTimeout(() => {
      setIsGenerating(false);
      setAudioStatus('🔊 에어팟으로 오디오 답변 송출 중... (완료)');
    }, 2000);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#f8fafc', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
      {/* 프로젝트 헤더 */}
      <header style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '24px' }}>
        <span style={{ fontSize: '14px', color: '#3b82f6', fontWeight: 'bold', uppercase: 'true' }}>AI Agent & Audio UX Project</span>
        <h1 style={{ fontSize: '28px', color: '#1e293b', marginTop: '8px', marginBottom: '4px', fontWeight: '8px' }}>Project: 에어팟 로그 (AirPods Log)</h1>
        <p style={{ color: '#64748b', fontSize: '16px', margin: 0 }}>화면 피로도가 높은 대학생들을 위한 실시간 맥락 맞춤형 오디오 에이전트</p>
      </header>

      {/* 기획 배경 및 문제 정의 요약 */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', color: '#334155', marginBottom: '12px' }}>📌 기획 배경 (Problem & Solution)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ backgroundColor: '#fee2e2', padding: '16px', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '14px', color: '#991b1b', margin: '0 0 8px 0' }}>PROBLEM</h3>
            <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0, lineHeight: '1.5' }}>
              대학생들의 캠퍼스 내 무선 이어폰 착용률은 매우 높으나, 기존 플랫폼은 전부 화면을 주시해야 하는 텍스트/시각 중심이라 피로감이 큽니다. 이동이나 혼밥 시 가볍게 스트레스를 해소할 오디오 특화 서비스가 부재합니다.
            </p>
          </div>
          <div style={{ backgroundColor: '#dbeafe', padding: '16px', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '14px', color: '#1e40af', margin: '0 0 8px 0' }}>SOLUTION</h3>
            <p style={{ fontSize: '14px', color: '#1e3a8a', margin: 0, lineHeight: '1.5' }}>
              사용자가 자신의 실시간 상황이나 심정을 텍스트로 가볍게 툭 던지면, 학습된 LLM이 실시간으로 상황 맞춤형 텍스트를 짜내어 고품질 TTS(음성)로 변환 후 에어팟에 즉각 들려주는 비대칭 UX 솔루션입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 미리보기 인터랙션 (MVP 기능 시뮬레이터) */}
      <section style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '18px', color: '#334155', marginBottom: '4px' }}>🎧 에이전트 작동 미리보기</h2>
        <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>현재 겪고 있는 캠퍼스 상황을 입력하고 에어팟으로 어떻게 흘러나올지 확인해보세요.</p>
        
        <div style={{ marginBottom: '16px' }}>
          <input 
            type="text" 
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder='예시: 아 오늘 캡스톤 발표날인데 너무 떨린다... 내가 잘할 수 있을까'
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
          />
        </div>

        <button 
          onClick={handleSimulate}
          disabled={isGenerating}
          style={{ width: '100%', padding: '12px', backgroundColor: isGenerating ? '#94a3b8' : '#1e293b', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: isGenerating ? 'not-allowed' : 'pointer' }}
        >
          {isGenerating ? 'AI 분석 중...' : '에어팟으로 답변 듣기 (시뮬레이션)'}
        </button>

        {userInput && (
          <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px', borderLeft: '4px solid #475569' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>상태 수신 계통:</span>
            <p style={{ fontSize: '14px', color: '#334155', margin: '4px 0 0 0', fontWeight: '500' }}>{audioStatus}</p>
          </div>
        )}
      </section>
    </div>
  );
}