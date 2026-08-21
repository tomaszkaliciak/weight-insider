// Helpers for auto-detected periodization phases.

function toTime(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.getTime();
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

/**
 * Latest phase that contains `asOfDate`, otherwise the last phase, otherwise null.
 * @param {Array<{ startDate: Date, endDate: Date }>} phases
 * @param {Date|null} [asOfDate]
 * @returns {object|null}
 */
export function resolveThisPhase(phases, asOfDate = null) {
  if (!Array.isArray(phases) || phases.length === 0) return null;

  const asOf = toTime(asOfDate);
  if (asOf != null) {
    for (let i = phases.length - 1; i >= 0; i--) {
      const start = toTime(phases[i]?.startDate);
      const end = toTime(phases[i]?.endDate);
      if (start == null || end == null) continue;
      if (asOf >= start && asOf <= end) return phases[i];
    }
  }

  return phases[phases.length - 1] ?? null;
}

export function phaseLabel(type) {
  if (type === "bulk") return "Bulk";
  if (type === "cut") return "Cut";
  if (type === "maintenance") return "Maintenance";
  return type || "Phase";
}
