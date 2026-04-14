// js/core/goalManager.js
// Handles loading and saving goal settings to localStorage and dispatching state updates.

import { StateManager } from "./stateManager.js";
import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";
import * as Selectors from "./selectors.js";

export const GoalManager = {
  _historyLoaded: false,
  _historyListenerBound: false,
  _normalizeGoal(rawGoal) {
    if (!rawGoal) return { weight: null, date: null, targetRate: null };
    const weight =
      rawGoal.weight != null && !isNaN(parseFloat(rawGoal.weight))
        ? parseFloat(rawGoal.weight)
        : null;
    const targetRate =
      rawGoal.targetRate != null && !isNaN(parseFloat(rawGoal.targetRate))
        ? parseFloat(rawGoal.targetRate)
        : null;
    let date = null;
    if (rawGoal.date instanceof Date && !isNaN(rawGoal.date.getTime())) {
      date = rawGoal.date;
    } else if (typeof rawGoal.date === "string" && rawGoal.date) {
      const parsed = new Date(rawGoal.date + "T00:00:00");
      date = !isNaN(parsed.getTime()) ? parsed : null;
    }
    return { weight, date, targetRate };
  },
  _isValidGoal(goal) {
    return goal.weight != null && goal.date instanceof Date && !isNaN(goal.date.getTime());
  },
  _goalFingerprint(goal) {
    if (!this._isValidGoal(goal)) return null;
    const dateStr = goal.date.toISOString().slice(0, 10);
    const rateStr = goal.targetRate != null && !isNaN(goal.targetRate)
      ? goal.targetRate.toFixed(2)
      : "na";
    return `${goal.weight.toFixed(1)}|${dateStr}|${rateStr}`;
  },
  _syncFormInputs(goal) {
    const normalized = this._normalizeGoal(goal);
    const goalWeightInput = document.getElementById("goalWeight");
    const goalDateInput = document.getElementById("goalDate");
    const goalTargetRateInput = document.getElementById("goalTargetRate");

    if (goalWeightInput) {
      goalWeightInput.value =
        normalized.weight != null ? normalized.weight.toFixed(1) : "";
    }
    if (goalDateInput) {
      goalDateInput.value =
        normalized.date instanceof Date ? Utils.formatDateDMY(normalized.date) : "";
    }
    if (goalTargetRateInput) {
      goalTargetRateInput.value =
        normalized.targetRate != null ? normalized.targetRate.toFixed(2) : "";
    }

    // FEATURE 5: Auto-calculate targetRate when goal weight + date are both filled
    // but rate is empty (user hasn't explicitly set it yet)
    this._autoRecalcRate(goalWeightInput, goalDateInput, goalTargetRateInput);
  },

  /**
   * Feature 5: If goal weight and date are both filled but rate is empty,
   * auto-calculate the required weekly rate based on current weight.
   */
  _autoRecalcRate(weightInput, dateInput, rateInput) {
    if (!weightInput || !dateInput || !rateInput) return;
    // Don't overwrite a manually-set rate
    if (rateInput.value && rateInput.value.trim() !== "") return;

    const targetWeight = weightInput.value ? parseFloat(weightInput.value) : null;
    const dateStr = dateInput.value ? dateInput.value.trim() : "";
    if (targetWeight == null || !dateStr) return;

    const targetDate = Utils.parseDateInput(dateStr);
    if (!(targetDate instanceof Date) || isNaN(targetDate)) return;

    const state = StateManager.getState();
    const displayStats = Selectors.selectDisplayStats(state) || {};
    const currentWeight = displayStats.currentSma ?? displayStats.currentWeight;
    if (currentWeight == null) return;

    const daysToGoal = (targetDate - new Date()) / (1000 * 60 * 60 * 24);
    if (daysToGoal <= 0) return; // past date

    const weeks = daysToGoal / 7;
    const rate = (targetWeight - currentWeight) / weeks;
    // Only show if rate is reasonable
    if (Math.abs(rate) < 5) {
      rateInput.value = rate.toFixed(2);
      rateInput.title = `Auto-calculated from current weight ${currentWeight.toFixed(1)} kg and target date. Overwrite if needed.`;
    }
  },
  _computeConfidencePct(state, goal) {
    const displayStats = Selectors.selectDisplayStats(state) || {};
    const referenceWeight = displayStats.currentSma ?? displayStats.currentWeight;
    const currentRate = displayStats.currentWeeklyRate;
    const requiredRate = displayStats.requiredRateForGoal;
    const volatility = displayStats.rollingVolatility ?? displayStats.volatility ?? 0.25;
    if (
      !this._isValidGoal(goal) ||
      referenceWeight == null ||
      currentRate == null ||
      requiredRate == null
    ) {
      return null;
    }

    const uncertaintyKgWeek = Math.max(0.05, volatility * Math.sqrt(7) * 0.6);
    const goalIsLoss = goal.weight < referenceWeight;
    const z = (requiredRate - currentRate) / uncertaintyKgWeek;
    const cdf = (value) => {
      const sign = value < 0 ? -1 : 1;
      const x = Math.abs(value) / Math.sqrt(2);
      const t = 1 / (1 + 0.3275911 * x);
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const erf =
        1 -
        (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
        Math.exp(-x * x);
      return 0.5 * (1 + sign * erf);
    };
    const pHit = goalIsLoss ? cdf(z) : 1 - cdf(z);
    return Math.max(0, Math.min(100, Math.round(pHit * 100)));
  },
  getHistory() {
    try {
      const raw = JSON.parse(
        localStorage.getItem(CONFIG.localStorageKeys.goalHistory) || "[]",
      );
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  },
  _saveHistory(history) {
    try {
      localStorage.setItem(
        CONFIG.localStorageKeys.goalHistory,
        JSON.stringify(history.slice(-12)),
      );
    } catch (e) {
      console.error("GoalManager: Error saving goal history", e);
    }
  },
  syncHistory(goalOverride = null) {
    const state = StateManager.getState();
    const currentGoal = this._normalizeGoal(
      goalOverride ?? Selectors.selectGoal(state),
    );
    const history = this.getHistory();
    const fingerprint = this._goalFingerprint(currentGoal);
    const nowIso = new Date().toISOString();

    if (!fingerprint) {
      this._saveHistory(history);
      return history;
    }

    history.forEach((entry) => {
      if (entry.status === "active" && entry.fingerprint !== fingerprint) {
        entry.status = entry.achievedDate
          ? "achieved"
          : entry.targetDate && entry.targetDate < nowIso.slice(0, 10)
            ? "missed"
            : "replaced";
        entry.closedAt = entry.closedAt || nowIso;
        entry.lastSeenAt = nowIso;
      }
    });

    const goalAchievedDate = Selectors.selectGoalAchievedDate(state);
    const displayStats = Selectors.selectDisplayStats(state) || {};
    const confidencePct = this._computeConfidencePct(state, currentGoal);
    const currentWeight = displayStats.currentSma ?? displayStats.currentWeight ?? null;
    const currentRate = displayStats.currentWeeklyRate ?? null;
    const requiredRate = displayStats.requiredRateForGoal ?? null;

    const derivedStatus =
      goalAchievedDate instanceof Date && !isNaN(goalAchievedDate.getTime())
        ? "achieved"
        : currentGoal.date < new Date(new Date().setHours(0, 0, 0, 0))
          ? "missed"
          : "active";

    const existing = history.find((entry) => entry.fingerprint === fingerprint);
    const basePayload = {
      fingerprint,
      targetWeight: currentGoal.weight,
      targetDate: currentGoal.date.toISOString().slice(0, 10),
      targetRate: currentGoal.targetRate,
      lastSeenAt: nowIso,
      status: derivedStatus,
      achievedDate:
        goalAchievedDate instanceof Date && !isNaN(goalAchievedDate.getTime())
          ? goalAchievedDate.toISOString().slice(0, 10)
          : null,
      lastConfidencePct: confidencePct,
      lastKnownWeight: currentWeight,
      lastKnownRate: currentRate,
      requiredRate,
    };

    if (existing) {
      Object.assign(existing, basePayload);
      existing.closedAt =
        existing.status !== "active" ? existing.closedAt || nowIso : null;
    } else {
      history.push({
        id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: nowIso,
        confidenceAtSet: confidencePct,
        ...basePayload,
      });
    }

    history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    this._saveHistory(history);
    return history;
  },
  /**
   * Loads the goal from localStorage and dispatches an action to update the state.
   */
  load() {
    const storedGoal = localStorage.getItem(CONFIG.localStorageKeys.goal);
    let loadedGoalData = { weight: null, date: null, targetRate: null }; // Default structure

    if (storedGoal) {
      try {
        const parsed = JSON.parse(storedGoal);
        // Validate and parse data carefully
        const weight = parsed.weight ? parseFloat(parsed.weight) : null;
        // Ensure date string is handled correctly (YYYY-MM-DD expected from save)
        const date =
          parsed.date && typeof parsed.date === "string"
            ? new Date(parsed.date + "T00:00:00")
            : null; // Parse as local midnight
        const targetRate = parsed.targetRate
          ? parseFloat(parsed.targetRate)
          : null;

        loadedGoalData.weight =
          weight != null && !isNaN(weight) ? weight : null;
        loadedGoalData.date =
          date instanceof Date && !isNaN(date.getTime()) ? date : null;
        loadedGoalData.targetRate =
          targetRate != null && !isNaN(targetRate) ? targetRate : null;
      } catch (e) {
        console.error("GoalManager: Error parsing goal from localStorage", e);
        localStorage.removeItem(CONFIG.localStorageKeys.goal); // Clear invalid data
        // loadedGoalData remains default
      }
    }
    // Dispatch action to update state with the loaded or default goal
    StateManager.dispatch({ type: "LOAD_GOAL", payload: loadedGoalData });
    this._syncFormInputs(loadedGoalData);
    this.syncHistory(loadedGoalData);
    // UI updates are handled by components subscribing to state:goalChanged or state:displayStatsUpdated
  },

  /**
   * Saves the current goal state to localStorage.
   * Should be called after the state has been updated (e.g., after form submit dispatches).
   */
  save() {
    try {
      // Read the current goal directly from the state using a selector
      const currentGoal = Selectors.selectGoal(StateManager.getState());

      // Prepare object for storage, ensuring date is formatted correctly
      const goalToStore = {
        weight: currentGoal.weight,
        // Format Date object to YYYY-MM-DD string or null
        date:
          currentGoal.date instanceof Date && !isNaN(currentGoal.date)
            ? currentGoal.date.toISOString().slice(0, 10)
            : null,
        targetRate: currentGoal.targetRate,
      };

      localStorage.setItem(
        CONFIG.localStorageKeys.goal,
        JSON.stringify(goalToStore),
      );
      this._syncFormInputs(currentGoal);
      this.syncHistory(currentGoal);
    } catch (e) {
      console.error("GoalManager: Error saving goal to localStorage", e);
      Utils.showStatusMessage(
        "Could not save goal due to storage error.",
        "error",
      );
    }
  },

  /**
   * Initializes the GoalManager by loading any saved goal.
   * Typically called during application startup.
   */
  init() {
    if (!this._historyListenerBound) {
      this._historyListenerBound = true;
      StateManager.subscribeToSpecificEvent("state:goalAchievementUpdated", () => {
        this.syncHistory();
      });
      StateManager.subscribeToSpecificEvent("state:goalChanged", () => {
        this._syncFormInputs(Selectors.selectGoal(StateManager.getState()));
      });
    }
    this.load();

    // FEATURE 5: Live auto-recalc as user types
    this._setupAutoRateListeners();
  },

  /**
   * Feature 5: Re-runs rate auto-calculation whenever the user edits
   * goal weight or date, until they explicitly set a rate.
   */
  _setupAutoRateListeners() {
    const weightInput = document.getElementById("goalWeight");
    const dateInput = document.getElementById("goalDate");
    const rateInput = document.getElementById("goalTargetRate");
    if (!weightInput || !dateInput || !rateInput) return;

    const recalc = () => this._autoRecalcRate(weightInput, dateInput, rateInput);

    weightInput.addEventListener("input", recalc);
    dateInput.addEventListener("input", recalc);

    // When user manually edits the rate, stop auto-updating
    rateInput.addEventListener("input", () => {
      if (rateInput.value.trim() !== "") {
        rateInput.title = "";
      }
    });
  },
};
