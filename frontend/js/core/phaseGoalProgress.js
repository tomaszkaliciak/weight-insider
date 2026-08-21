import { resolveThisPhase, phaseLabel } from "./phaseHelpers.js";

function weightAt(day) {
  if (!day) return null;
  if (day.sma != null && isFinite(day.sma)) return day.sma;
  if (day.value != null && isFinite(day.value)) return day.value;
  return null;
}

function signedKg(n) {
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

export function phaseForGoal(phases, analysisRange, processed) {
  const list = Array.isArray(phases) ? phases : [];
  const start = analysisRange?.start;
  if (start instanceof Date && !isNaN(start)) {
    const hit = list.find(
      (p) => p.startDate instanceof Date && p.endDate instanceof Date && start >= p.startDate && start <= p.endDate,
    );
    if (hit) return hit;
  }
  const last = [...(processed || [])].reverse().find((d) => d.date instanceof Date);
  return resolveThisPhase(list, last?.date ?? null);
}

/**
 * Actual SMA change in a phase vs planned change from goal.targetRate.
 */
export function computePhaseGoalProgress({ phase, processed = [], goal = {} } = {}) {
  if (!phase?.startDate || !phase?.endDate) return null;
  const inPhase = (processed || [])
    .filter((d) => d.date instanceof Date && d.date >= phase.startDate && d.date <= phase.endDate && weightAt(d) != null)
    .sort((a, b) => a.date - b.date);
  if (inPhase.length < 2) return null;

  const startW = weightAt(inPhase[0]);
  const endW = weightAt(inPhase[inPhase.length - 1]);
  if (startW == null || endW == null) return null;

  const weeks = Math.max(
    0.1,
    (inPhase[inPhase.length - 1].date - inPhase[0].date) / (7 * 86400000),
  );
  const actual = endW - startW;
  const hasPlan = goal.targetRate != null && isFinite(goal.targetRate);
  const plan = hasPlan ? goal.targetRate * weeks : null;

  const label = phaseLabel(phase.type).toLowerCase();
  let copy = `This ${label}: ${signedKg(actual)} kg in ${weeks.toFixed(1)} weeks`;
  if (plan != null) {
    copy += `, plan was ${signedKg(plan)}`;
  }

  return { actual, weeks, plan, copy, phase };
}
