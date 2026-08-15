// js/core/unitFormatter.js
// Central unit formatting helper for converting and displaying weight values,
// rates of change, deltas, and labels across all UI renderers.

import { StateManager } from './stateManager.js';
import { selectWeightUnit } from './selectors.js';

export const UnitFormatter = {
  /**
   * Returns current active weight unit ('kg' | 'lb').
   * @param {object} [state] Optional state snapshot.
   */
  getUnit(state) {
    const s = state || StateManager.getState();
    return selectWeightUnit(s);
  },

  /**
   * Convert kg to active unit.
   * @param {number|null} valKg
   * @param {string} [unit]
   */
  convert(valKg, unit) {
    if (valKg == null || !isFinite(valKg)) return null;
    const targetUnit = unit || this.getUnit();
    return targetUnit === 'lb' ? valKg * 2.2046226218 : valKg;
  },

  /**
   * Convert value from active unit back to kg.
   * @param {number|null} val
   * @param {string} [unit]
   */
  toKg(val, unit) {
    if (val == null || !isFinite(val)) return null;
    const srcUnit = unit || this.getUnit();
    return srcUnit === 'lb' ? val / 2.2046226218 : val;
  },

  /**
   * Returns display unit label ('kg' | 'lbs').
   * @param {object} [state]
   */
  getUnitLabel(state) {
    const unit = this.getUnit(state);
    return unit === 'lb' ? 'lbs' : 'kg';
  },

  /**
   * Returns rate unit label ('kg/wk' | 'lbs/wk').
   * @param {object} [state]
   */
  getRateLabel(state) {
    const unit = this.getUnit(state);
    return unit === 'lb' ? 'lbs/wk' : 'kg/wk';
  },

  /**
   * Format weight value in user unit with optional label.
   * @param {number|null} valKg Value in kg
   * @param {number} [decimals=1]
   * @param {boolean} [withUnit=false]
   * @param {object} [state]
   */
  formatWeight(valKg, decimals = 1, withUnit = false, state) {
    const converted = this.convert(valKg, this.getUnit(state));
    if (converted == null || isNaN(converted)) return 'N/A';
    const numStr = converted.toFixed(decimals);
    return withUnit ? `${numStr} ${this.getUnitLabel(state)}` : numStr;
  },

  /**
   * Format weight difference (+/-) in user unit with optional label.
   * @param {number|null} diffKg Value in kg
   * @param {number} [decimals=1]
   * @param {boolean} [withUnit=false]
   * @param {object} [state]
   */
  formatWeightDiff(diffKg, decimals = 1, withUnit = false, state) {
    const converted = this.convert(diffKg, this.getUnit(state));
    if (converted == null || isNaN(converted)) return 'N/A';
    const sign = converted > 0 ? '+' : '';
    const numStr = `${sign}${converted.toFixed(decimals)}`;
    return withUnit ? `${numStr} ${this.getUnitLabel(state)}` : numStr;
  },

  /**
   * Format weekly rate (+/-) in user unit with optional label.
   * @param {number|null} rateKgWk Rate in kg/week
   * @param {number} [decimals=2]
   * @param {boolean} [withUnit=false]
   * @param {object} [state]
   */
  formatRate(rateKgWk, decimals = 2, withUnit = false, state) {
    const converted = this.convert(rateKgWk, this.getUnit(state));
    if (converted == null || isNaN(converted)) return 'N/A';
    const sign = converted > 0 ? '+' : '';
    const numStr = `${sign}${converted.toFixed(decimals)}`;
    return withUnit ? `${numStr} ${this.getRateLabel(state)}` : numStr;
  }
};
