// js/core/macroTargetService.js
// Persists daily macro gram targets and provides adherence-checking utilities.
// Targets are stored only in localStorage; no global state involvement.

import { CONFIG } from '../config.js';

/** Tolerance: actual must be within ±TOLERANCE of target to count as a hit. */
export const MACRO_TOLERANCE = 0.10;

const DEFAULT_TARGETS = { protein: null, carbs: null, fat: null };

export const MacroTargetService = {
  /**
   * Load saved targets from localStorage.
   * @returns {{ protein: number|null, carbs: number|null, fat: number|null }}
   */
  load() {
    try {
      const raw = localStorage.getItem(CONFIG.localStorageKeys.macroTargets);
      if (!raw) return { ...DEFAULT_TARGETS };
      const parsed = JSON.parse(raw);
      return {
        protein: parsed.protein != null ? parseFloat(parsed.protein) : null,
        carbs:   parsed.carbs   != null ? parseFloat(parsed.carbs)   : null,
        fat:     parsed.fat     != null ? parseFloat(parsed.fat)     : null
      };
    } catch {
      return { ...DEFAULT_TARGETS };
    }
  },

  /**
   * Save targets to localStorage.
   * @param {{ protein?: number|null, carbs?: number|null, fat?: number|null }} targets
   */
  save(targets) {
    try {
      localStorage.setItem(
        CONFIG.localStorageKeys.macroTargets,
        JSON.stringify(targets),
      );
    } catch {
      // Storage quota exceeded — silently ignore
    }
  },

  /**
   * Check whether a single data point meets all set macro targets.
   * @param {{ protein?: number, carbs?: number, fat?: number }} dayData
   * @param {{ protein?: number|null, carbs?: number|null, fat?: number|null }} targets
   * @returns {boolean}
   */
  dayMeetsTargets(dayData, targets) {
    const macros = ['protein', 'carbs', 'fat'];
    for (const macro of macros) {
      const target = targets[macro];
      if (target == null || target <= 0) continue; // target not set — ignore
      const actual = dayData[macro];
      if (actual == null) return false; // target set but no data — miss
      const lo = target * (1 - MACRO_TOLERANCE);
      const hi = target * (1 + MACRO_TOLERANCE);
      if (actual < lo || actual > hi) return false;
    }
    return true;
  },

  /**
   * Returns true only if at least one macro target is set.
   * @param {{ protein?: number|null, carbs?: number|null, fat?: number|null }} targets
   * @returns {boolean}
   */
  hasAnyTarget(targets) {
    return Object.values(targets).some((v) => v != null && v > 0);
  },

  /**
   * Compute adherence stats over an array of processed data points.
   * @param {Array} data - Processed data points (sorted chronologically).
   * @param {object} targets
   * @returns {{ streak: number, weekAdherence: number|null, todayHit: boolean|null, hasTargets: boolean }}
   */
  computeAdherence(data, targets) {
    if (!this.hasAnyTarget(targets)) {
      return { streak: 0, weekAdherence: null, todayHit: null, hasTargets: false };
    }

    // Filter to days that have at least protein or carbs logged
    const macroData = data.filter(
      (d) => d.protein != null || d.carbs != null || d.fat != null,
    );

    if (macroData.length === 0) {
      return { streak: 0, weekAdherence: null, todayHit: null, hasTargets: true };
    }

    // Today hit — latest data point
    const latest = macroData[macroData.length - 1];
    const todayHit = this.dayMeetsTargets(latest, targets);

    // Streak — consecutive days from latest backward
    let streak = 0;
    for (let i = macroData.length - 1; i >= 0; i--) {
      if (this.dayMeetsTargets(macroData[i], targets)) {
        streak++;
      } else {
        break;
      }
    }

    // 7-day adherence
    const last7 = macroData.slice(-7);
    const hitsIn7 = last7.filter((d) => this.dayMeetsTargets(d, targets)).length;
    const weekAdherence = last7.length > 0 ? Math.round((hitsIn7 / last7.length) * 100) : null;

    return { streak, weekAdherence, todayHit, hasTargets: true };
  },
};
