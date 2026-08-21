const MIN_KCAL = 300;
const RELATIVE = 0.15;

export function tdeeDisagreementKcal(day) {
  const adaptive = day?.adaptiveTDEE;
  const gfit = day?.googleFitTDEE;
  if (adaptive == null || gfit == null || !isFinite(adaptive) || !isFinite(gfit)) {
    return null;
  }
  return gfit - adaptive;
}

export function hasTdeeDisagreement(day) {
  const diff = tdeeDisagreementKcal(day);
  if (diff == null) return false;
  const adaptive = Math.abs(day.adaptiveTDEE);
  const threshold = Math.max(MIN_KCAL, RELATIVE * adaptive);
  return Math.abs(diff) >= threshold;
}
