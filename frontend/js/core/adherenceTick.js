const HIGH_RATIO = 1.15;

/**
 * Context-strip class for a processed day.
 * outlier > high intake > logged > missing
 */
export function adherenceKind(day) {
  if (day?.isOutlier) return "outlier";
  const intake = day?.calorieIntake;
  if (intake == null || !isFinite(intake) || intake <= 0) return "missing";
  const tdee = day.adaptiveTDEE ?? day.googleFitTDEE;
  if (tdee != null && isFinite(tdee) && tdee > 0 && intake > tdee * HIGH_RATIO) {
    return "high";
  }
  return "logged";
}
