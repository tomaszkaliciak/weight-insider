export const NEVER_AUTO_HIDE = new Set([
  "hero-weight-widget",
  "executive-hub-card",
  "chart-section",
  "key-stats-widget",
  "goal-widget",
  "rate-change-card",
  "data-health-card",
  "event-countdown-card",
]);

function count(data, pred) {
  return (Array.isArray(data) ? data : []).filter(pred).length;
}

function hasPair(d, a, b) {
  return d[a] != null && isFinite(d[a]) && d[b] != null && isFinite(d[b]);
}

/**
 * Widget ids that currently have no series, matching renderer empty gates.
 */
export function emptyWidgetIds(state = {}) {
  const processed = state.processedData || [];
  const filtered = Array.isArray(state.filteredData) ? state.filteredData : processed;
  const stats = state.displayStats || {};
  const phases = state.periodizationPhases || [];
  const n = processed.length;
  const nf = filtered.length;

  const gfitIntake = count(filtered, (d) => hasPair(d, "calorieIntake", "googleFitTDEE"));
  const intakeTdee = count(
    filtered,
    (d) =>
      d.calorieIntake != null &&
      isFinite(d.calorieIntake) &&
      ((d.adaptiveTDEE != null && isFinite(d.adaptiveTDEE)) ||
        (d.googleFitTDEE != null && isFinite(d.googleFitTDEE))),
  );
  const calorieDays = count(filtered, (d) => d.calorieIntake != null && isFinite(d.calorieIntake));
  const empty = [];

  const hide = (id, cond) => {
    if (cond && !NEVER_AUTO_HIDE.has(id)) empty.push(id);
  };

  hide("tdee-accuracy-card", nf < 7 || gfitIntake < 7);
  hide("tdee-reconcile-card", gfitIntake < 3);
  hide("reverse-diet-card", n < 14);
  hide("correlation-matrix-card", nf < 10);
  hide("scatter-card", nf < 10);
  hide("goal-simulator-card", stats.currentWeight == null);
  hide("energy-sankey-card", nf < 7 || intakeTdee < 7);
  hide("energy-balance-card", nf < 7 || intakeTdee < 3);
  hide("macro-summary-card", stats.latestProtein == null);
  hide("protein-adequacy-card", stats.avgProteinPerKg == null);
  hide("macro-impact-card", !stats.macroSplit);
  hide("weekly-review-card", nf < 2);
  hide("periodization-card", !phases.length);
  hide("period-comparison-card", n < 14);
  hide("calorie-heatmap-card", n < 7);
  hide("calorie-audit-card", nf < 14 || calorieDays < 7);
  hide("water-weight-card", nf < 7);
  hide("weekend-analysis-card", nf < 14);
  hide("rolling-averages-card", nf < 14);
  hide("prediction-bands-card", nf < 7);
  hide("plateau-breaker-card", n < 21);
  hide("what-worked-card", n < 30);
  hide("monthly-report-card", n < 30);
  hide("adaptive-rate-card", n < 30);
  hide("rate-optimizer-card", n < 14);
  hide("streak-tracker-card", n < 7);
  hide("metabolic-adaptation-card", n < 28);
  hide("refeed-history-card", !phases.some((p) => p.type === "cut"));
  hide("insight-summary-card", n < 7);

  return empty;
}
