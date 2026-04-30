// js/ui/renderers/goalInlineStatusRenderer.js
// Compact inline status that lives directly under the goal form so users see
// "on track" / "behind" / "no goal" without scrolling to the alerts list.

import { StateManager } from "../../core/stateManager.js";
import * as Selectors from "../../core/selectors.js";
import { Utils } from "../../core/utils.js";

let _container = null;

function _formatKg(value) {
  if (value == null || !isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Utils.formatValue(value, 1)} kg`;
}

function _formatRate(value) {
  if (value == null || !isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Utils.formatValue(value, 2)} kg/wk`;
}

function _classify(currentRate, requiredRate, isGaining) {
  if (currentRate == null || requiredRate == null) return "neutral";
  // For loss goals, "more negative" is better; flip the sign for comparison.
  const direction = isGaining ? 1 : -1;
  const ratio = (currentRate * direction) / (requiredRate * direction || 1e-9);
  if (ratio >= 0.85) return "on-track";
  if (ratio >= 0.5) return "slightly-off";
  return "off-track";
}

function _render() {
  if (!_container) return;
  const state = StateManager.getState();
  const goal = Selectors.selectGoal(state);
  const stats = state.displayStats || {};

  if (!goal?.weight || !(goal.date instanceof Date)) {
    _container.hidden = true;
    _container.innerHTML = "";
    return;
  }

  const weightToGoal = stats.weightToGoal;
  const currentRate =
    stats.currentWeeklyRate ?? stats.regressionSlopeWeekly ?? null;
  const requiredRate = stats.requiredRateForGoal;
  const eta = stats.estimatedTimeToGoal || "--";
  const isGaining = (weightToGoal ?? 0) > 0;
  const tone = _classify(currentRate, requiredRate, isGaining);

  const labels = {
    "on-track": "On track",
    "slightly-off": "Slightly off pace",
    "off-track": "Off track",
    neutral: "Tracking",
  };

  _container.hidden = false;
  _container.dataset.tone = tone;
  _container.innerHTML = `
    <span class="gis-pill gis-${tone}">${labels[tone]}</span>
    <span class="gis-detail">
      <strong>${_formatKg(weightToGoal)}</strong> to go,
      eta <strong>${eta}</strong>
    </span>
    <span class="gis-rates">
      <span title="Current weekly rate">${_formatRate(currentRate)}</span>
      <span class="gis-sep">/</span>
      <span title="Required weekly rate">${_formatRate(requiredRate)}</span>
    </span>
    <button type="button" class="gis-more" title="Open goal forecast">Details</button>
  `;
}

function _onClick(event) {
  if (event.target?.closest(".gis-more")) {
    document
      .getElementById("goal-alerts-list")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export const GoalInlineStatusRenderer = {
  init() {
    _container = document.getElementById("goal-inline-status");
    if (!_container) return;
    _container.addEventListener("click", _onClick);
    StateManager.subscribeToSpecificEvent("state:goalChanged", _render);
    StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", _render);
    StateManager.subscribeToSpecificEvent(
      "state:initializationComplete",
      _render,
    );
    _render();
  },
};
