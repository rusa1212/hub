import { describe, expect, it } from 'vitest';
import { classifyRequestError } from './requestError';

describe('classifyRequestError', () => {
  it.each([
    [429, 'rate_limit'],
    [503, 'unavailable'],
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not_found'],
    [408, 'timeout'],
    [504, 'timeout'],
    [500, 'server'],
  ])('HTTP %s를 %s 상태로 분류한다', (status, code) => {
    expect(classifyRequestError({ status, message: 'error' }).code).toBe(code);
  });

  it('클라이언트 타임아웃 메시지를 timeout으로 분류한다', () => {
    expect(classifyRequestError(new Error('응답 시간 초과')).code).toBe('timeout');
  });

  it('fetch 자체가 실패하면 network로 분류한다', () => {
    expect(classifyRequestError(new TypeError('Failed to fetch')).code).toBe('network');
  });
});
