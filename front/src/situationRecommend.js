// 상황 선택 화면의 시간대 추천 (SituationEnhancementPlan.md 4-1). 현재 시각으로 추천 상황 하나를
// 골라 "지금 추천" 배지만 붙인다 — 자동 선택이나 순서 변경(sort_order 유지)은 하지 않는다.

// [시작, 끝) 분 단위(0~1439). 끝이 시작보다 작으면 자정을 넘기는 구간.
const RECOMMEND_WINDOWS = [
  { id: 'morning', start: 5 * 60, end: 10 * 60 }, // 05:00–10:00
  { id: 'sleeping', start: 22 * 60 + 30, end: 3 * 60 }, // 22:30–03:00
];

function inWindow(minuteOfDay, { start, end }) {
  return start <= end
    ? minuteOfDay >= start && minuteOfDay < end
    : minuteOfDay >= start || minuteOfDay < end;
}

// now: Date(사용자 기기 로컬 시각), situations: 선택 화면에 노출 중인 상황 목록.
// 추천 대상이 숨김 처리돼 목록에 없으면 추천하지 않는다. 반환값은 상황 id 또는 null.
export function recommendSituation(now, situations) {
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const match = RECOMMEND_WINDOWS.find((w) => inWindow(minuteOfDay, w));
  if (!match) return null;
  return situations.some((s) => s.id === match.id) ? match.id : null;
}
