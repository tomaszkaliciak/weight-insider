import { state } from "../state.js";
import { ui } from "../ui/uiCache.js";
import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";
import { EventBus } from "./eventBus.js";

export const GoalManager = {
  load() {
    const storedGoal = localStorage.getItem(CONFIG.localStorageKeys.goal);
    const defaultGoal = { weight: null, date: null, targetRate: null };
    if (storedGoal) {
      try {
        const parsed = JSON.parse(storedGoal);
        const weight = parsed.weight ? parseFloat(parsed.weight) : null;
        const dateStr = parsed.date?.replace(/\//g, "-");
        const date = dateStr ? new Date(dateStr) : null;
        const targetRate = parsed.targetRate
          ? parseFloat(parsed.targetRate)
          : null;
        state.goal.weight = weight != null && !isNaN(weight) ? weight : null;
        state.goal.date =
          date instanceof Date && !isNaN(date.getTime()) ? date : null;
        state.goal.targetRate =
          targetRate != null && !isNaN(targetRate) ? targetRate : null;
        GoalManager.updateGoalUI?.();
      } catch (e) {
        console.error("GoalManager: Error parsing goal from localStorage", e);
        localStorage.removeItem(CONFIG.localStorageKeys.goal);
        state.goal = { ...defaultGoal };
        GoalManager.updateGoalUI?.();
      }
    } else {
      state.goal = { ...defaultGoal };
    }

    EventBus.publish("state::goalUpdate", state.goal);
  },
  save() {
    try {
      const goalToStore = {
        weight: state.goal.weight,
        date: state.goal.date
          ? state.goal.date.toISOString().slice(0, 10)
          : null,
        targetRate: state.goal.targetRate,
      };
      localStorage.setItem(
        CONFIG.localStorageKeys.goal,
        JSON.stringify(goalToStore),
      );
      Utils.showStatusMessage("Goal saved successfully.", "success");
    } catch (e) {
      console.error("GoalManager: Error saving goal to localStorage", e);
      Utils.showStatusMessage(
        "Could not save goal due to storage error.",
        "error",
      );
    }
  // Remove DD-MM-YYYY display span update (no longer in HTML)
  },

  updateGoalUI() {
    ui.goalWeightInput?.property("value", state.goal.weight ?? "");
    // Set input value as YYYY-MM-DD for browser compatibility
    ui.goalDateInput?.property(
      "value",
      state.goal.date
        ? d3.timeFormat("%Y-%m-%d")(state.goal.date)
        : "",
    );
    // Set display span as DD-MM-YYYY
    const dateDisplay = document.getElementById("goalDateDisplay");
    if (dateDisplay) {
      dateDisplay.textContent =
        state.goal.date && state.goal.date instanceof Date && !isNaN(state.goal.date)
          ? Utils.formatDateDMY(state.goal.date)
          : "";
    }
    ui.goalTargetRateInput?.property("value", state.goal.targetRate ?? "");
  },
};
