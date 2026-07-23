// front/src/audioUtils.test.js
import { describe, it, expect } from 'vitest';
import { interleave } from './audioUtils.js';

describe('interleave', () => {
  // ── 정상 케이스 ──────────────────────────────
  describe('정상 케이스', () => {
    it('N1: 같은 길이의 두 배열을 순서대로 교차 배치한다', () => {
      const result = interleave([1, 2, 3], [10, 20, 30]);
      expect(Array.from(result)).toEqual([1, 10, 2, 20, 3, 30]);
    });

    it('N2: 반환값은 Float32Array 인스턴스다', () => {
      const result = interleave([1], [2]);
      expect(result).toBeInstanceOf(Float32Array);
    });

    it('N3: 길이가 같을 때 반환 길이는 left.length + right.length 다', () => {
      const left = [1, 2, 3, 4];
      const right = [5, 6, 7, 8];
      const result = interleave(left, right);
      expect(result.length).toBe(left.length + right.length);
    });

    it('N4: 부동소수점 값이 Float32 정밀도 내에서 보존된다', () => {
      const result = interleave([0.5, -0.25], [0.75, -0.5]);
      expect(result[0]).toBeCloseTo(0.5);
      expect(result[1]).toBeCloseTo(0.75);
      expect(result[2]).toBeCloseTo(-0.25);
      expect(result[3]).toBeCloseTo(-0.5);
    });
  });

  // ── 빈 값 케이스 ──────────────────────────────
  describe('빈 값 케이스', () => {
    it('E1: 둘 다 빈 배열이면 길이 0의 배열을 반환한다', () => {
      const result = interleave([], []);
      expect(result.length).toBe(0);
    });

    it('E2/E3: 한쪽이 비어있으면 공통 길이가 0이라 빈 배열을 반환한다', () => {
      expect(interleave([], [1, 2]).length).toBe(0);
      expect(interleave([1, 2], []).length).toBe(0);
    });
  });

  // ── 경계값 케이스 ──────────────────────────────
  describe('경계값 케이스', () => {
    it('B1: 길이 1인 배열도 정상적으로 인터리브한다', () => {
      const result = interleave([5], [9]);
      expect(Array.from(result)).toEqual([5, 9]);
    });

    it('B2: 큰 배열(1초 분량, 44100 샘플)도 정확히 처리한다', () => {
      const size = 44100;
      const left = new Array(size).fill(0).map((_, i) => i / size);
      const right = new Array(size).fill(0).map((_, i) => -(i / size));
      const result = interleave(left, right);

      expect(result.length).toBe(size * 2);
      expect(result[0]).toBeCloseTo(left[0]);
      expect(result[1]).toBeCloseTo(right[0]);
      expect(result[result.length - 2]).toBeCloseTo(left[size - 1]);
      expect(result[result.length - 1]).toBeCloseTo(right[size - 1]);
    });

    it('B3: 오디오 샘플 유효 범위의 극단값(-1, 1, 0)을 클리핑 없이 저장한다', () => {
      const result = interleave([-1, 1, 0], [1, -1, 0]);
      expect(Array.from(result)).toEqual([-1, 1, 1, -1, 0, 0]);
    });

    it('B4: 홀수 개 원소를 가진 배열도 정상 동작한다', () => {
      const result = interleave([1, 2, 3], [10, 20, 30]);
      expect(result.length).toBe(6);
    });
  });

  // ── 길이가 다른 채널 처리 (TDD로 추가한 기능) ──────────────────────────────
  describe('길이가 다른 채널 처리 (TDD)', () => {
    it('right가 left보다 짧으면 공통 길이까지만 인터리브한다 (NaN 없이)', () => {
      const result = interleave([1, 2, 3], [10]);
      expect(Array.from(result)).toEqual([1, 10]);
    });

    it('left가 right보다 짧으면 공통 길이까지만 인터리브한다 (데이터 유실 대신 잘라냄)', () => {
      const result = interleave([1], [10, 20, 30]);
      expect(Array.from(result)).toEqual([1, 10]);
    });

    it('반환 배열 길이는 2 * min(left.length, right.length) 다', () => {
      const result = interleave([1, 2, 3, 4], [10, 20]);
      expect(result.length).toBe(4); // 2 * min(4, 2)
    });
  });

  // ── 실패/비정상 케이스 ──────────────────────────────
  describe('실패/비정상 케이스', () => {
    it('F3: null/undefined를 넘기면 TypeError가 발생한다', () => {
      expect(() => interleave(null, [1, 2])).toThrow(TypeError);
      expect(() => interleave([1, 2], undefined)).toThrow(TypeError);
    });

    it('F4: 숫자가 아닌 값이 섞여 있으면 NaN으로 변환된다 (현재 동작 문서화)', () => {
      const result = interleave(['a', 'b'], [1, 2]);
      expect(Number.isNaN(result[0])).toBe(true); // 'a' → NaN
      expect(result[1]).toBe(1);
      expect(Number.isNaN(result[2])).toBe(true); // 'b' → NaN
      expect(result[3]).toBe(2);
    });
  });
});