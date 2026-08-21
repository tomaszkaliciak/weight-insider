import * as d3 from "d3";

export function startOfWeek(date, weekStart = "mon") {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  return weekStart === "sun" ? d3.timeSunday(date) : d3.timeMonday(date);
}

export function weekKey(date, weekStart = "mon") {
  const floor = startOfWeek(date, weekStart);
  if (!floor) return null;
  const fmt = weekStart === "sun" ? d3.timeFormat("%Y-U%U") : d3.timeFormat("%Y-W%W");
  return fmt(floor);
}
