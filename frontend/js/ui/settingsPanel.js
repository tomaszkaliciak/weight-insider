// js/ui/settingsPanel.js
// Settings drawer: open/close, tab switching, read/write settings via SettingsService.

import { SettingsService, DEFAULT_SETTINGS } from "../core/settingsService.js";
import { StateManager, ActionTypes } from "../core/stateManager.js";
import { DataService } from "../core/dataService.js";
import { Utils } from "../core/utils.js";

// Elements — cached on init.
let _drawer, _overlay, _openBtn, _closeBtn, _cancelBtn, _saveBtn;
// Working copy of settings while the panel is open.
let _draft = null;
// Cached raw merged data so we can re-run the pipeline after analysis settings change.
let _cachedMergedData = null;

// ---- helpers ----------------------------------------------------------------

function _getInputValue(id) {
  return document.getElementById(id);
}

function _populate(settings) {
  _draft = { ...settings };

  const su = _getInputValue("setting-weight-unit");
  const df = _getInputValue("setting-date-format");
  const ws = _getInputValue("setting-week-start");
  const sw = _getInputValue("setting-sma-window");
  const swv = _getInputValue("setting-sma-window-val");
  const ew = _getInputValue("setting-ema-window");
  const ewv = _getInputValue("setting-ema-window-val");
  const vw = _getInputValue("setting-volatility-window");
  const vwv = _getInputValue("setting-volatility-window-val");
  const ae = _getInputValue("setting-animations-enabled");
  const as_ = _getInputValue("setting-animation-speed");
  const asv = _getInputValue("setting-animation-speed-val");

  if (su) su.value = settings.weightUnit;
  if (df) df.value = settings.dateFormat;
  if (ws) ws.value = settings.weekStart;
  if (sw) { sw.value = settings.smaWindow; if (swv) swv.textContent = settings.smaWindow; }
  if (ew) { ew.value = settings.emaWindow; if (ewv) ewv.textContent = settings.emaWindow; }
  if (vw) { vw.value = settings.rollingVolatilityWindow; if (vwv) vwv.textContent = settings.rollingVolatilityWindow; }
  if (ae) ae.checked = settings.animationsEnabled;
  if (as_) {
    as_.value = settings.animationSpeed;
    if (asv) asv.textContent = `${parseFloat(settings.animationSpeed).toFixed(1)}×`;
  }
  _updateSpeedGroupVisibility(settings.animationsEnabled);
}

function _updateSpeedGroupVisibility(enabled) {
  const g = document.getElementById("setting-speed-group");
  if (g) g.style.opacity = enabled ? "" : "0.4";
}

function _readDraft() {
  const draft = { ...DEFAULT_SETTINGS };
  const su = _getInputValue("setting-weight-unit");
  const df = _getInputValue("setting-date-format");
  const ws = _getInputValue("setting-week-start");
  const sw = _getInputValue("setting-sma-window");
  const ew = _getInputValue("setting-ema-window");
  const vw = _getInputValue("setting-volatility-window");
  const ae = _getInputValue("setting-animations-enabled");
  const as_ = _getInputValue("setting-animation-speed");

  if (su) draft.weightUnit = su.value;
  if (df) draft.dateFormat = df.value;
  if (ws) draft.weekStart = ws.value;
  if (sw) draft.smaWindow = parseInt(sw.value, 10);
  if (ew) draft.emaWindow = parseInt(ew.value, 10);
  if (vw) draft.rollingVolatilityWindow = parseInt(vw.value, 10);
  if (ae) draft.animationsEnabled = ae.checked;
  if (as_) draft.animationSpeed = parseFloat(as_.value);
  return draft;
}

// ---- open / close -----------------------------------------------------------

function _open() {
  _populate(SettingsService.load());
  _drawer.hidden = false;
  _overlay.hidden = false;
  _drawer.removeAttribute("aria-hidden");
  document.getElementById("settings-btn")?.setAttribute("aria-expanded", "true");
  _saveBtn?.focus();
}

function _close() {
  _drawer.hidden = true;
  _overlay.hidden = true;
  _drawer.setAttribute("aria-hidden", "true");
  document.getElementById("settings-btn")?.setAttribute("aria-expanded", "false");
}

// ---- tab switching ----------------------------------------------------------

function _switchTab(tabEl) {
  document.querySelectorAll(".settings-tab").forEach(t => {
    t.classList.toggle("active", t === tabEl);
    t.setAttribute("aria-selected", t === tabEl ? "true" : "false");
  });
  const target = tabEl.dataset.tab;
  document.querySelectorAll(".settings-panel").forEach(p => {
    const active = p.dataset.panel === target;
    p.classList.toggle("active", active);
    p.hidden = !active;
  });
}

// ---- save -------------------------------------------------------------------

function _save() {
  const draft = _readDraft();
  const previous = SettingsService.load();
  const saved = SettingsService.save(draft);

  StateManager.dispatch({ type: ActionTypes.UPDATE_SETTINGS, payload: saved });

  // Apply motion prefs immediately.
  document.body.classList.toggle("motion-reduced", !saved.animationsEnabled);
  document.documentElement.style.setProperty("--motion-speed", String(saved.animationSpeed));

  // Re-run the data pipeline if analysis windows changed.
  const pipelineKeys = ["smaWindow", "emaWindow", "rollingVolatilityWindow"];
  const pipelineChanged = pipelineKeys.some(k => saved[k] !== previous[k]);
  if (pipelineChanged && _cachedMergedData) {
    _reprocessData(saved, _cachedMergedData);
  }

  _close();
  Utils.showStatusMessage("Settings saved.", "success", 2500);
}

function _reprocessData(settings, mergedData) {
  // Temporarily override CONFIG values that the pipeline reads.
  // We do this by passing explicit window parameters to each step.
  let p = DataService.calculateBodyComposition(mergedData);
  p = DataService.calculateSMAAndStdDev(p, settings.smaWindow);
  p = DataService.calculateEMA(p, settings.emaWindow);
  p = DataService.identifyOutliers(p);
  p = DataService.calculateRollingVolatility(p, settings.rollingVolatilityWindow);
  p = DataService.calculateDailyRatesAndTDEETrend(p);
  p = DataService.calculateAdaptiveTDEE(p);
  p = DataService.smoothRatesAndTDEEDifference(p);
  p = DataService.calculateRateMovingAverage(p);
  const currentState = StateManager.getState();
  StateManager.dispatch({
    type: "SET_INITIAL_DATA",
    payload: { rawData: currentState.rawData, processedData: p },
  });
  StateManager.dispatch({ type: "INITIALIZATION_COMPLETE" });
}

// ---- data tab actions -------------------------------------------------------

function _exportAll() {
  const dump = SettingsService.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weight-insider-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function _importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const dump = JSON.parse(e.target.result);
      SettingsService.importAll(dump);
      Utils.showStatusMessage("Data imported. Reload the page to apply.", "success", 6000);
    } catch (err) {
      Utils.showStatusMessage(`Import failed: ${err.message}`, "error", 5000);
    }
  };
  reader.readAsText(file);
}

function _resetAll() {
  if (!window.confirm("This will delete all your saved data (goals, annotations, entries, settings). Are you sure?")) return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("weightInsider") || k.startsWith("weightInsights"))) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    Utils.showStatusMessage("All data cleared. Reload to apply.", "warn", 6000);
  } catch (err) {
    Utils.showStatusMessage(`Reset failed: ${err.message}`, "error", 5000);
  }
}

// ---- public -----------------------------------------------------------------

export const SettingsPanel = {
  /**
   * @param {Array} mergedData - Cached merged data array for re-processing on analysis-window change.
   */
  setCachedData(mergedData) {
    _cachedMergedData = mergedData;
  },

  init() {
    _drawer  = document.getElementById("settings-drawer");
    _overlay = document.getElementById("settings-overlay");
    _openBtn = document.getElementById("settings-btn");
    _closeBtn = document.getElementById("settings-close-btn");
    _cancelBtn = document.getElementById("settings-cancel-btn");
    _saveBtn  = document.getElementById("settings-save-btn");

    if (!_drawer || !_overlay) return;

    _openBtn?.addEventListener("click", _open);
    _closeBtn?.addEventListener("click", _close);
    _cancelBtn?.addEventListener("click", _close);
    _overlay.addEventListener("click", _close);
    _saveBtn?.addEventListener("click", _save);

    // Tab switching
    document.querySelectorAll(".settings-tab").forEach(tab => {
      tab.addEventListener("click", () => _switchTab(tab));
    });

    // Live range label updates
    for (const [rangeId, labelId] of [
      ["setting-sma-window", "setting-sma-window-val"],
      ["setting-ema-window", "setting-ema-window-val"],
      ["setting-volatility-window", "setting-volatility-window-val"],
    ]) {
      const el = document.getElementById(rangeId);
      const lbl = document.getElementById(labelId);
      if (el && lbl) el.addEventListener("input", () => { lbl.textContent = el.value; });
    }

    const speedRange = document.getElementById("setting-animation-speed");
    const speedLabel = document.getElementById("setting-animation-speed-val");
    if (speedRange && speedLabel) {
      speedRange.addEventListener("input", () => {
        speedLabel.textContent = `${parseFloat(speedRange.value).toFixed(1)}×`;
      });
    }

    const animToggle = document.getElementById("setting-animations-enabled");
    if (animToggle) {
      animToggle.addEventListener("change", () => _updateSpeedGroupVisibility(animToggle.checked));
    }

    // Keyboard: close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !_drawer.hidden) _close();
    });

    // Data tab buttons
    document.getElementById("settings-export-btn")?.addEventListener("click", _exportAll);
    document.getElementById("settings-import-file")?.addEventListener("change", (e) => {
      _importFile(e.target.files?.[0]);
      e.target.value = ""; // reset so same file can be re-imported
    });
    document.getElementById("settings-reset-btn")?.addEventListener("click", _resetAll);
  },
};
