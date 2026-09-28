import { describe, it, expect } from 'vitest';
import { recommendSituation } from './situationRecommend';

const ALL = [{ id: 'exercising' }, { id: 'sleeping' }, { id: 'morning' }, { id: null }];
const at = (hours, minutes = 0) => new Date(2026, 8, 28, hours, minutes);

describe('recommendSituation', () => {
  it.each([
    [5, 0, 'morning'],
    [9, 59, 'morning'],
    [10, 0, null],
    [15, 0, null],
    [22, 29, null],
    [22, 30, 'sleeping'],
    [0, 0, 'sleeping'],
    [2, 59, 'sleeping'],
    [3, 0, null],
    [4, 59, null],
  ])('%i:%i → %s', (h, m, expected) => {
    expect(recommendSituation(at(h, m), ALL)).toBe(expected);
  });

  it('추천 대상이 목록에 없으면(숨김 처리 등) 추천하지 않는다', () => {
    expect(recommendSituation(at(7), [{ id: 'sleeping' }, { id: null }])).toBeNull();
  });
});
