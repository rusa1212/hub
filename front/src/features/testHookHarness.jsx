// features/* 훅 테스트용 최소 렌더러. @testing-library/react의 renderHook은 루트 node_modules의
// react-dom을 참조해 front 사본과 섞이면 "Invalid hook call"이 나므로(AirPodsLog.bargeIn.test.jsx 참고)
// react-dom/client를 직접 쓴다.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export function renderHookWithProps(useHook, initialProps) {
  const container = document.createElement('div');
  const root = createRoot(container);
  function Harness(props) {
    useHook(props);
    return null;
  }
  act(() => root.render(<Harness {...initialProps} />));
  return {
    rerender: (props) => act(() => root.render(<Harness {...props} />)),
    unmount: () => act(() => root.unmount()),
  };
}
