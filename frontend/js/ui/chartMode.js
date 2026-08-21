import { StateManager, ActionTypes } from "../core/stateManager.js";

export const PRESET_CHART_MODE = {
  "morning-checkin": "weight",
  "nutrition-focus": "calories",
};

export function syncChartModeButtons(mode) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".chart-mode-btn[data-chart-mode]").forEach((btn) => {
    const isActive = btn.getAttribute("data-chart-mode") === mode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

export function setChartMode(mode) {
  const next = ["weight", "calories", "tdee"].includes(mode) ? mode : "weight";
  syncChartModeButtons(next);
  StateManager.dispatch({ type: ActionTypes.SET_CHART_MODE, payload: next });
  return next;
}

export function chartModeForPreset(presetKey) {
  return PRESET_CHART_MODE[presetKey] || null;
}
