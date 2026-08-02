// 앱 최상위 컴포넌트: 실제 화면/로직은 전부 AirPodsLog에 위임
import React from 'react';
import AirPodsLog from './AirPodsLog';

export default function App() {
  return <AirPodsLog />;
}