import * as d3 from "d3";

const SHORT = {
  dmy: "%d %b '%y",
  mdy: "%b %d '%y",
  iso: "%Y-%m-%d",
};

const LONG = {
  dmy: "%a, %d %b %Y",
  mdy: "%a, %b %d %Y",
  iso: "%a, %Y-%m-%d",
};

function asDate(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return date instanceof Date && !isNaN(date.getTime()) ? date : null;
}

export function formatDateShortWith(dateInput, dateFormat = "dmy") {
  const date = asDate(dateInput);
  if (!date) return "N/A";
  const pattern = SHORT[dateFormat] || SHORT.dmy;
  return d3.timeFormat(pattern)(date);
}

export function formatDateLongWith(dateInput, dateFormat = "dmy") {
  const date = asDate(dateInput);
  if (!date) return "N/A";
  const pattern = LONG[dateFormat] || LONG.dmy;
  return d3.timeFormat(pattern)(date);
}

export function parseDateMDY(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10) - 1;
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const date = new Date(year, month, day);
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    return null;
  }
  return date;
}

export function parseDateDMYParts(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const date = new Date(year, month, day);
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    return null;
  }
  return date;
}

export function parseFlexibleDate(dateStr, dateFormat = "dmy") {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00`);
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  const primary = dateFormat === "mdy" ? parseDateMDY(trimmed) : parseDateDMYParts(trimmed);
  if (primary) return primary;
  return dateFormat === "mdy" ? parseDateDMYParts(trimmed) : parseDateMDY(trimmed);
}
