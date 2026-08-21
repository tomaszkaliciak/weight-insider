const SMA_FLAT = 0.05;

function signKcal(n) {
  const v = Math.round(n);
  return `${v > 0 ? "+" : ""}${v}`;
}

/**
 * One-line caption for the highlighted chart day.
 * @param {{ day?: object|null, prev?: object|null, formatDate?: (d: Date) => string }} opts
 */
export function buildFilmstripCaption({ day, prev = null, formatDate } = {}) {
  if (!day?.date) return "";
  const dateLabel = formatDate ? formatDate(day.date) : "";
  if (day._skeleton) {
    return [dateLabel, "Not logged yet"].filter(Boolean).join(" · ");
  }

  const parts = dateLabel ? [dateLabel] : [];
  const tdee = day.adaptiveTDEE ?? day.googleFitTDEE;
  if (day.calorieIntake != null && isFinite(day.calorieIntake) && tdee != null && isFinite(tdee)) {
    parts.push(`intake ${signKcal(day.calorieIntake - tdee)} vs TDEE`);
  } else if (day.calorieIntake != null && isFinite(day.calorieIntake)) {
    parts.push(`${Math.round(day.calorieIntake)} kcal`);
  }

  if (day.sma != null && isFinite(day.sma) && prev?.sma != null && isFinite(prev.sma)) {
    const delta = day.sma - prev.sma;
    if (Math.abs(delta) < SMA_FLAT) parts.push("SMA flat");
    else parts.push(delta > 0 ? "SMA up" : "SMA down");
  }

  if (day.isOutlier) parts.push("outlier");
  return parts.join(" · ");
}
