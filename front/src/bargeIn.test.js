// bargeIn.computeAmplitude / createBargeInDetector에 대한 단위 테스트
// (정상/빈 값/경계값/실패 케이스). docs/nth_wk/Barkeinplan.md Phase 1 대응.
import { describe, it, expect } from 'vitest';
import { computeAmplitude, createBargeInDetector, BARGE_IN_THRESHOLD, BARGE_IN_SUSTAIN_MS } from './bargeIn.js';

describe('computeAmplitude', () => {
  // ── 정상 케이스 ──────────────────────────────
  describe('정상 케이스', () => {
    it('N1: 128(무음 기준값)로만 채워진 배열은 진폭 0을 반환한다', () => {
      const data = new Uint8Array(8).fill(128);
      expect(computeAmplitude(data)).toBe(0);
    });

    it('N2: 128에서 균일하게 벗어난 값들의 평균 절대편차를 계산한다', () => {
      const data = Uint8Array.from([128 + 10, 128 - 10, 128 + 10, 128 - 10]);
      expect(computeAmplitude(data)).toBe(10);
    });

    it('N3: 편차가 다른 값들도 정확히 평균낸다', () => {
      const data = Uint8Array.from([128, 138, 108, 128]); // 0, 10, 20, 0 → 평균 7.5
      expect(computeAmplitude(data)).toBeCloseTo(7.5);
    });
  });

  // ── 빈 값 케이스 ──────────────────────────────
  describe('빈 값 케이스', () => {
    it('E1: 빈 배열이면 0을 반환한다 (0으로 나누지 않음)', () => {
      expect(computeAmplitude(new Uint8Array(0))).toBe(0);
    });

    it('E2: null/undefined를 넘기면 0을 반환한다', () => {
      expect(computeAmplitude(null)).toBe(0);
      expect(computeAmplitude(undefined)).toBe(0);
    });
  });

  // ── 경계값 케이스 ──────────────────────────────
  describe('경계값 케이스', () => {
    it('B1: 가능한 최대 편차(0과 255)일 때 진폭 128을 반환한다', () => {
      const data = Uint8Array.from([0, 255]); // |0-128|=128, |255-128|=127
      expect(computeAmplitude(data)).toBeCloseTo(127.5);
    });

    it('B2: 원소 1개짜리 배열도 정상 동작한다', () => {
      expect(computeAmplitude(Uint8Array.from([128]))).toBe(0);
      expect(computeAmplitude(Uint8Array.from([200]))).toBeCloseTo(72);
    });
  });
});

describe('createBargeInDetector', () => {
  // ── 정상 케이스 ──────────────────────────────
  describe('정상 케이스', () => {
    it('N1: 임계값을 sustainMs 이상 연속으로 넘기면 true를 반환한다', () => {
      const detect = createBargeInDetector({ threshold: 15, sustainMs: 300 });
      expect(detect(20, 0)).toBe(false); // 이제 막 넘기 시작
      expect(detect(20, 150)).toBe(false); // 아직 300ms 안 지남
      expect(detect(20, 300)).toBe(true); // 300ms 지속
    });

    it('N2: 임계값 이하 진폭에서는 계속 false를 반환한다', () => {
      const detect = createBargeInDetector({ threshold: 15, sustainMs: 300 });
      expect(detect(5, 0)).toBe(false);
      expect(detect(5, 1000)).toBe(false);
    });

    it('N3: 기본값(threshold/sustainMs 미지정)으로도 동작한다', () => {
      const detect = createBargeInDetector();
      expect(detect(BARGE_IN_THRESHOLD + 5, 0)).toBe(false);
      expect(detect(BARGE_IN_THRESHOLD + 5, BARGE_IN_SUSTAIN_MS)).toBe(true);
    });
  });

  // ── 경계값 케이스 ──────────────────────────────
  describe('경계값 케이스', () => {
    it('B1: 진폭이 임계값과 정확히 같으면 넘긴 것으로 치지 않는다(strictly greater)', () => {
      const detect = createBargeInDetector({ threshold: 15, sustainMs: 100 });
      expect(detect(15, 0)).toBe(false);
      expect(detect(15, 200)).toBe(false);
    });

    it('B2: 경과 시간이 sustainMs와 정확히 같은 시점에 true를 반환한다', () => {
      const detect = createBargeInDetector({ threshold: 15, sustainMs: 300 });
      detect(20, 1000);
      expect(detect(20, 1300)).toBe(true);
    });

    it('B3: 한 번 true를 반환한 뒤 계속 호출해도 true를 유지한다 (aboveSince가 갱신되지 않으므로)', () => {
      const detect = createBargeInDetector({ threshold: 15, sustainMs: 300 });
      detect(20, 0);
      expect(detect(20, 300)).toBe(true);
      expect(detect(20, 9999)).toBe(true);
    });
  });

  // ── 실패/비정상 케이스 ──────────────────────────────
  describe('실패/비정상 케이스 (오탐 방지)', () => {
    it('F1: 중간에 잠깐 임계값 아래로 떨어지면 지속 시간이 리셋된다', () => {
      const detect = createBargeInDetector({ threshold: 15, sustainMs: 300 });
      expect(detect(20, 0)).toBe(false);
      expect(detect(20, 250)).toBe(false); // 300ms 되기 직전
      expect(detect(5, 260)).toBe(false); // 순간적으로 조용해짐 → 리셋
      expect(detect(20, 400)).toBe(false); // 리셋 후 다시 시작(aboveSince=400), 아직 300ms 안 지남
      expect(detect(20, 700)).toBe(true); // 400 기준 300ms 지남
    });

    it('F2: 짧은 스파이크(임계값을 순간적으로만 넘김)는 끼어들기로 인정하지 않는다', () => {
      const detect = createBargeInDetector({ threshold: 15, sustainMs: 300 });
      expect(detect(50, 0)).toBe(false);
      expect(detect(5, 10)).toBe(false); // 바로 다시 조용해짐
      expect(detect(5, 400)).toBe(false);
    });
  });
});
