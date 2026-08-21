// Pure helpers for walking processed days. No wrap at the ends.

export function startOfDay(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function skeletonDay(date) {
  const d = startOfDay(date);
  if (!d) return null;
  return {
    date: d,
    value: null,
    sma: null,
    calorieIntake: null,
    googleFitTDEE: null,
    adaptiveTDEE: null,
    protein: null,
    carbs: null,
    fat: null,
    fiber: null,
    isOutlier: false,
    _skeleton: true,
  };
}

/**
 * Adjacent day in a sorted list. Does not wrap.
 * If `date` is not in the list, -1 finds the last day before it and +1 the first after.
 */
export function neighborDay(days, date, delta) {
  if (!Array.isArray(days) || !days.length || !delta) return null;
  const t = startOfDay(date)?.getTime();
  if (t == null) return null;

  const times = days.map((d) => startOfDay(d.date)?.getTime());
  const idx = times.findIndex((x) => x === t);

  if (idx >= 0) {
    const next = days[idx + delta];
    return next || null;
  }

  if (delta < 0) {
    for (let i = days.length - 1; i >= 0; i--) {
      if (times[i] != null && times[i] < t) return days[i];
    }
    return null;
  }

  for (let i = 0; i < days.length; i++) {
    if (times[i] != null && times[i] > t) return days[i];
  }
  return null;
}
