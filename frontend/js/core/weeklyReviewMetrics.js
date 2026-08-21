// Process vs outcome metrics for the last 7 logged days.

const MACRO_TOLERANCE = 0.10;

function inWindow(actual, target) {
  if (actual == null || target == null || !isFinite(actual) || !isFinite(target) || target <= 0) {
    return false;
  }
  const lo = target * (1 - MACRO_TOLERANCE);
  const hi = target * (1 + MACRO_TOLERANCE);
  return actual >= lo && actual <= hi;
}

function calorieHit(day, { isCutting, calorieTarget }) {
  const intake = day.calorieIntake;
  if (intake == null || !isFinite(intake) || intake < 0) return false;

  if (calorieTarget != null && isFinite(calorieTarget) && calorieTarget > 0) {
    if (isCutting) return intake <= calorieTarget * (1 + MACRO_TOLERANCE);
    if (isCutting === false) return intake >= calorieTarget * (1 - MACRO_TOLERANCE);
    return inWindow(intake, calorieTarget);
  }

  const tdee = day.adaptiveTDEE ?? day.googleFitTDEE;
  if (tdee == null || !isFinite(tdee)) return false;
  const balance = intake - tdee;
  return isCutting ? balance < 0 : balance > 0;
}

/**
 * @param {object} opts
 * @param {Array} opts.weekData
 * @param {boolean} opts.isCutting
 * @param {number|null} [opts.calorieTarget]
 * @param {number|null} [opts.proteinTarget]
 * @param {number|null} [opts.weeklyRate]
 * @returns {object}
 */
export function computeWeeklyReviewMetrics({
  weekData = [],
  isCutting = false,
  calorieTarget = null,
  proteinTarget = null,
  weeklyRate = null,
} = {}) {
  const days = Array.isArray(weekData) ? weekData : [];
  const loggingCount = days.filter((d) => d.calorieIntake != null && d.calorieIntake > 0).length;
  const calorieTargetDays = days.filter((d) => calorieHit(d, { isCutting, calorieTarget })).length;

  let proteinDays = null;
  if (proteinTarget != null && isFinite(proteinTarget) && proteinTarget > 0) {
    proteinDays = days.filter((d) => inWindow(d.protein, proteinTarget)).length;
  }

  const startSMA = days[0]?.sma ?? null;
  const endSMA = days[days.length - 1]?.sma ?? null;
  const smaChange = startSMA != null && endSMA != null ? endSMA - startSMA : null;

  const processHits = calorieTargetDays;
  const processStrong = processHits >= 5;
  const scaleMovedWithGoal = isCutting
    ? smaChange != null && smaChange < -0.15
    : smaChange != null && smaChange > 0.15;
  const scaleFlat = smaChange != null && Math.abs(smaChange) <= 0.15;

  let verdict = "Not enough movement to judge the week yet.";
  if (processStrong && scaleMovedWithGoal) {
    verdict = "Process hit, and the scale moved with the goal.";
  } else if (processStrong && scaleFlat) {
    verdict = "Process hit, but the scale stayed flat.";
  } else if (!processStrong && scaleMovedWithGoal) {
    verdict = "The scale moved with the goal even though process days were thin.";
  } else if (!processStrong && scaleFlat) {
    verdict = "Process missed, and the scale did not move.";
  }

  return {
    loggingCount,
    loggingPct: Math.round((loggingCount / 7) * 100),
    calorieTargetDays,
    proteinDays,
    smaChange,
    weeklyRate: weeklyRate ?? null,
    processStrong,
    scaleMovedWithGoal,
    verdict,
  };
}
