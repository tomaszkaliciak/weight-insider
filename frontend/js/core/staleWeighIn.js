import { startOfDay } from "./timelineNav.js";

const DAY_MS = 86400000;

export function lastWeighInDate(processed) {
  const days = (processed || [])
    .filter((d) => d.value != null && isFinite(d.value) && d.date instanceof Date && !isNaN(d.date));
  if (!days.length) return null;
  return days.reduce((best, d) => (d.date > best ? d.date : best), days[0].date);
}

/**
 * @returns {{ stale: boolean, days: number|null, label: string|null }}
 */
export function staleWeighInStatus(lastDate, now = new Date()) {
  const today = startOfDay(now);
  if (!today) return { stale: false, days: null, label: null };
  const last = startOfDay(lastDate);
  if (!last) {
    return { stale: true, days: null, label: "No weigh-in yet · Log today" };
  }
  const days = Math.round((today.getTime() - last.getTime()) / DAY_MS);
  if (days <= 0) return { stale: false, days: 0, label: null };
  return { stale: true, days, label: `Last weigh-in ${days}d ago · Log today` };
}
