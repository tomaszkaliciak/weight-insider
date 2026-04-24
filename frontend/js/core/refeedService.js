// js/core/refeedService.js
// E3: Classifies the current diet phase and recommends refeeds / diet breaks.

const STORAGE_KEY_SCHEDULED = "weightInsiderRefeedScheduledV1";
const STORAGE_KEY_DISMISSED  = "weightInsiderRefeedDismissedV1";

/**
 * Returns the recommendation tier given current conditions.
 * All thresholds come from the settings/CONFIG so they're overridable.
 *
 * @param {{
 *   inCut: boolean,
 *   cutWeeks: number,
 *   adaptationPct: number,      // negative = down-adaptation (e.g. -8 means TDEE dropped 8%)
 *   plateauDays: number,
 *   daysSinceLastRefeed: number,
 * }} params
 * @param {object} settings - from state.settings or DEFAULT_SETTINGS
 * @returns {'none'|'refeed-day'|'diet-break-1w'|'diet-break-2w'}
 */
function _tier(params, settings) {
  const { inCut, cutWeeks, adaptationPct, plateauDays } = params;
  const adaptation = Math.abs(adaptationPct); // treat as positive magnitude

  if (!inCut || cutWeeks < 3) return "none";

  // Diet break 2w first (most severe)
  if (cutWeeks >= (settings.refeedCutWeeksForDietBreak2w ?? 12)) return "diet-break-2w";
  if (adaptation >= (settings.refeedAdaptationPctDietBreak2w ?? 15)) return "diet-break-2w";

  // Diet break 1w
  if (cutWeeks >= (settings.refeedCutWeeksForDietBreak1w ?? 8)) return "diet-break-1w";
  if (adaptation >= (settings.refeedAdaptationPctDietBreak1w ?? 8)) return "diet-break-1w";

  // Refeed day
  if (plateauDays >= (settings.refeedPlateauDays ?? 14)) return "refeed-day";
  if (cutWeeks >= (settings.refeedCutWeeksForRefeedDay ?? 4) &&
      adaptation >= (settings.refeedAdaptationPctRefeedDay ?? 5)) return "refeed-day";

  return "none";
}

/**
 * Detect past refeed days from data: a day inside a cut phase where
 * calorieIntake >= maintenanceTDEE * 0.95.
 * @param {Array} data - processed data points
 * @param {Array} phases - periodization phases from state
 * @returns {Array<{date: Date, intake: number}>}
 */
function _detectPastRefeeds(data, phases) {
  if (!data?.length || !phases?.length) return [];
  const refeeds = [];
  const cutPhases = phases.filter(p => p.type === "cut" || p.phase === "cut");

  for (const point of data) {
    if (!point.date || point.calorieIntake == null) continue;
    const inCutPhase = cutPhases.some(p => point.date >= p.startDate && point.date <= (p.endDate || new Date()));
    if (!inCutPhase) continue;
    const maintenance = point.adaptiveTDEE ?? point.trendTDEE ?? null;
    if (maintenance != null && point.calorieIntake >= maintenance * 0.95) {
      refeeds.push({ date: point.date, intake: point.calorieIntake });
    }
  }
  return refeeds;
}

export const RefeedService = {
  /**
   * Main analysis function.
   * @param {object} state - full app state
   * @returns {{
   *   inCut: boolean, currentPhase: string|null,
   *   cutWeeks: number, adaptationPct: number, plateauDays: number,
   *   daysSinceLastRefeed: number|null,
   *   recommendation: 'none'|'refeed-day'|'diet-break-1w'|'diet-break-2w',
   *   maintenanceCalories: number|null, targetCalories: number|null,
   *   pastRefeeds: Array, isDismissed: boolean,
   * }}
   */
  analyze(state) {
    const phases = state.periodizationPhases || [];
    const data = state.processedData || [];
    const stats = state.displayStats || {};
    const settings = state.settings || {};

    // ---- Current phase ----
    const lastPhase = phases.length ? phases[phases.length - 1] : null;
    const currentPhase = lastPhase?.type || lastPhase?.phase || null;
    const inCut = currentPhase === "cut";

    // How long have we been cutting?
    let cutWeeks = 0;
    if (inCut && lastPhase?.startDate) {
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      cutWeeks = Math.floor((Date.now() - new Date(lastPhase.startDate).getTime()) / msPerWeek);
    }

    // Metabolic adaptation: compare start-of-cut TDEE to current TDEE
    let adaptationPct = 0;
    const currentTDEE = stats.adaptiveTDEE ?? stats.currentTDEE ?? null;
    if (inCut && lastPhase?.startDate && data.length) {
      const cutStart = new Date(lastPhase.startDate);
      const startPoint = data.find(d => d.date >= cutStart && d.adaptiveTDEE != null);
      if (startPoint && currentTDEE != null) {
        adaptationPct = ((currentTDEE - startPoint.adaptiveTDEE) / startPoint.adaptiveTDEE) * 100;
      }
    }

    // Plateau duration
    const plateauDays = stats.plateauDuration ?? 0;

    // Last refeed
    const pastRefeeds = _detectPastRefeeds(data, phases);
    let daysSinceLastRefeed = null;
    if (pastRefeeds.length) {
      const last = pastRefeeds[pastRefeeds.length - 1].date;
      daysSinceLastRefeed = Math.floor((Date.now() - last.getTime()) / (86400 * 1000));
    }

    const recommendation = _tier({ inCut, cutWeeks, adaptationPct, plateauDays, daysSinceLastRefeed: daysSinceLastRefeed ?? 999 }, settings);

    // Maintenance and refeed target calories
    const maintenanceCalories = currentTDEE != null ? Math.round(currentTDEE) : null;
    let targetCalories = null;
    if (recommendation === "refeed-day" && maintenanceCalories != null) {
      targetCalories = maintenanceCalories + 200; // slightly above maintenance
    } else if ((recommendation === "diet-break-1w" || recommendation === "diet-break-2w") && maintenanceCalories != null) {
      targetCalories = maintenanceCalories;
    }

    // Dismiss check
    const isDismissed = this._isDismissed();

    return {
      inCut, currentPhase, cutWeeks, adaptationPct, plateauDays,
      daysSinceLastRefeed, recommendation, maintenanceCalories, targetCalories,
      pastRefeeds, isDismissed,
    };
  },

  recordScheduled() {
    try { localStorage.setItem(STORAGE_KEY_SCHEDULED, new Date().toISOString()); } catch { /* quota */ }
  },

  dismiss() {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try { localStorage.setItem(STORAGE_KEY_DISMISSED, until.toISOString()); } catch { /* quota */ }
  },

  _isDismissed() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DISMISSED);
      if (!raw) return false;
      return new Date(raw) > new Date();
    } catch { return false; }
  },
};
