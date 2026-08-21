// js/ui/renderers/goalHistoryRenderer.js
// Renders a compact history of past and current goals.

import { StateManager, ActionTypes } from "../../core/stateManager.js";
import * as Selectors from "../../core/selectors.js";
import { GoalManager } from "../../core/goalManager.js";
import { Utils } from "../../core/utils.js";

export const GoalHistoryRenderer = {
  _container: null,

  init() {
    this._container = document.getElementById("goal-history-list");
    if (!this._container) {
      console.warn("[GoalHistoryRenderer] Container #goal-history-list not found.");
      return;
    }

    StateManager.subscribeToSpecificEvent("state:goalChanged", () => {
      GoalManager.syncHistory();
      this._render();
    });
    StateManager.subscribeToSpecificEvent("state:goalAchievementUpdated", () => {
      GoalManager.syncHistory();
      this._render();
    });
    StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", () => this._render());
    StateManager.subscribeToSpecificEvent("state:initializationComplete", () => this._render());

    this._render();
  },

  _decorateEntry(entry, state) {
    const goal = Selectors.selectGoal(state);
    const displayStats = Selectors.selectDisplayStats(state) || {};
    const currentFingerprint = GoalManager._goalFingerprint(goal);
    const goalAchievedDate = Selectors.selectGoalAchievedDate(state);
    const isCurrent = entry.fingerprint === currentFingerprint;
    const currentWeight = displayStats.currentSma ?? displayStats.currentWeight ?? entry.lastKnownWeight;
    const currentRate = displayStats.currentWeeklyRate ?? entry.lastKnownRate;
    const currentConfidence = GoalManager._computeConfidencePct(state, goal);

    let status = entry.status;
    let achievedDate = entry.achievedDate;
    if (isCurrent) {
      if (goalAchievedDate instanceof Date && !isNaN(goalAchievedDate.getTime())) {
        status = "achieved";
        achievedDate = goalAchievedDate.toISOString().slice(0, 10);
      } else if (entry.targetDate && entry.targetDate < Utils.formatDate(new Date())) {
        status = "missed";
      } else {
        status = "active";
      }
    }

    return {
      ...entry,
      status,
      achievedDate,
      currentWeight,
      currentRate,
      currentConfidence:
        isCurrent && currentConfidence != null ? currentConfidence : entry.lastConfidencePct,
      isCurrent,
    };
  },

  _render() {
    if (!this._container) return;
    const state = StateManager.getState();
    const history = GoalManager.getHistory().slice(0, 4).map((entry) =>
      this._decorateEntry(entry, state),
    );

    if (!history.length) {
      this._container.innerHTML = "";
      return;
    }

    const badgeLabel = (status) => {
      switch (status) {
        case "achieved":
          return "Achieved";
        case "missed":
          return "Missed";
        case "replaced":
          return "Archived";
        default:
          return "Active";
      }
    };

    const fmtDate = (dateStr) => {
      if (!dateStr) return "N/A";
      const parsed = Utils.parseDateInput(dateStr);
      return parsed ? Utils.formatDateDMY(parsed) : dateStr;
    };

    this._container.innerHTML = `
      <div class="goal-history-list">
        <div class="goal-history-header">
          <span class="goal-history-title">Goal History</span>
          <span class="goal-history-subtitle">Recent targets and outcomes</span>
        </div>
        <div class="goal-history-items">
          ${history.map((entry) => `
            <div class="goal-history-item ${entry.isCurrent ? "goal-history-item-current" : ""}">
              <div class="goal-history-top">
                <span class="goal-history-target">${entry.targetWeight?.toFixed(1) ?? "N/A"} kg by ${fmtDate(entry.targetDate)}</span>
                <span class="goal-history-badge gh-${entry.status}">${badgeLabel(entry.status)}</span>
              </div>
              <div class="goal-history-meta">
                <span>Set ${fmtDate(entry.createdAt?.slice?.(0, 10) || entry.createdAt)}</span>
                ${entry.achievedDate ? `<span>Done ${fmtDate(entry.achievedDate)}</span>` : ""}
                ${entry.currentConfidence != null ? `<span>${entry.currentConfidence}% confidence</span>` : ""}
              </div>
              <div class="goal-history-detail">
                ${entry.currentRate != null ? `<span>Rate ${entry.currentRate > 0 ? "+" : ""}${entry.currentRate.toFixed(2)} kg/wk</span>` : "<span>Rate N/A</span>"}
                ${entry.currentWeight != null ? `<span>Ref ${entry.currentWeight.toFixed(1)} kg</span>` : "<span>Ref N/A</span>"}
                ${entry.targetRate != null ? `<span>Target ${entry.targetRate > 0 ? "+" : ""}${entry.targetRate.toFixed(2)} kg/wk</span>` : ""}
              </div>
              ${!entry.isCurrent ? `
                <div class="goal-history-actions">
                  <button type="button" class="goal-history-reuse-btn" data-goal-id="${entry.id}">Reuse Goal</button>
                </div>
              ` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `;

    this._container.querySelectorAll(".goal-history-reuse-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = history.find((item) => item.id === button.dataset.goalId);
        if (!entry) return;
        StateManager.dispatch({
          type: ActionTypes.SET_GOAL,
          payload: {
            weight: entry.targetWeight,
            date: entry.targetDate ? new Date(entry.targetDate + "T00:00:00") : null,
            targetRate: entry.targetRate ?? null,
          },
        });
        GoalManager.save();
        Utils.showStatusMessage(`Reused goal: ${entry.targetWeight?.toFixed(1)} kg by ${fmtDate(entry.targetDate)}`, "success", 1800);
      });
    });
  },
};
