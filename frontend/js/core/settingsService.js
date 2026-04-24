// js/core/settingsService.js
// Persistent user settings with a schema version so future shape changes
// can migrate old data instead of silently using stale values.

import { CONFIG } from "../config.js";

const STORAGE_KEY = "weightInsiderSettingsV1";

export const DEFAULT_SETTINGS = {
  // Display
  weightUnit: "kg",          // 'kg' | 'lb'
  dateFormat: "dmy",         // 'dmy' | 'mdy' | 'iso'
  weekStart: "mon",          // 'mon' | 'sun'
  // Analysis (overrides CONFIG defaults at runtime)
  smaWindow: CONFIG.movingAverageWindow,
  emaWindow: CONFIG.emaWindow,
  rollingVolatilityWindow: CONFIG.ROLLING_VOLATILITY_WINDOW,
  // Motion
  animationsEnabled: true,
  animationSpeed: 1.0,       // 0.5 – 2.0 multiplier
  // A4 chip preference
  budgetUseMaintenance: false,
};

function sanitize(raw) {
  const out = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  // Hard clamps so bad stored data can't break the pipeline.
  out.smaWindow = clampInt(out.smaWindow, 3, 30, DEFAULT_SETTINGS.smaWindow);
  out.emaWindow = clampInt(out.emaWindow, 3, 30, DEFAULT_SETTINGS.emaWindow);
  out.rollingVolatilityWindow = clampInt(out.rollingVolatilityWindow, 5, 60, DEFAULT_SETTINGS.rollingVolatilityWindow);
  out.animationSpeed = clampNum(out.animationSpeed, 0.5, 2.0, DEFAULT_SETTINGS.animationSpeed);
  out.animationsEnabled = !!out.animationsEnabled;
  out.budgetUseMaintenance = !!out.budgetUseMaintenance;
  if (!["kg", "lb"].includes(out.weightUnit)) out.weightUnit = DEFAULT_SETTINGS.weightUnit;
  if (!["dmy", "mdy", "iso"].includes(out.dateFormat)) out.dateFormat = DEFAULT_SETTINGS.dateFormat;
  if (!["mon", "sun"].includes(out.weekStart)) out.weekStart = DEFAULT_SETTINGS.weekStart;
  return out;
}

function clampInt(v, lo, hi, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}
function clampNum(v, lo, hi, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export const SettingsService = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return sanitize(raw ? JSON.parse(raw) : null);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  save(patch) {
    const merged = sanitize({ ...this.load(), ...patch });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* quota */ }
    return merged;
  },

  reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  },

  /** Dump all weightInsider* keys — used by the Data tab export button. */
  exportAll() {
    const entries = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("weightInsider") || k.startsWith("weightInsights"))) {
          entries[k] = localStorage.getItem(k);
        }
      }
    } catch { /* ignore */ }
    return { exportedAt: new Date().toISOString(), entries };
  },

  /** Restore a previously exported dump. */
  importAll(dump) {
    if (!dump?.entries) throw new Error("Invalid import format.");
    for (const [k, v] of Object.entries(dump.entries)) {
      if (typeof v === "string") {
        try { localStorage.setItem(k, v); } catch { /* quota */ }
      }
    }
  },
};
