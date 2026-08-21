// Helpers for manual trendline configuration.

/**
 * A trendline is drawable when it has a start date, an initial weight,
 * and at least one weekly rate.
 * @param {{ startDate?: Date|null, initialWeight?: number|null, weeklyIncrease1?: number|null, weeklyIncrease2?: number|null }} config
 * @returns {boolean}
 */
export function parseOptionalNumber(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function isTrendConfigValid(config = {}) {
  const startOk = config.startDate instanceof Date && !isNaN(config.startDate.getTime());
  const initialOk = parseOptionalNumber(config.initialWeight) != null;
  const rate1Ok = parseOptionalNumber(config.weeklyIncrease1) != null;
  const rate2Ok = parseOptionalNumber(config.weeklyIncrease2) != null;
  return Boolean(startOk && initialOk && (rate1Ok || rate2Ok));
}
