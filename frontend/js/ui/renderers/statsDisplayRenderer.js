// js/ui/renderers/statsDisplayRenderer.js
// Renders statistics to the UI display elements.

import { ui } from "../uiCache.js";
import { Utils } from "../../core/utils.js";
import { StateManager } from "../../core/stateManager.js";
import { EventHandlers } from "../../interactions/eventHandlers.js";
import * as Selectors from "../../core/selectors.js"; // Import selectors

export const StatsDisplayRenderer = {
  /**
   * Updates the text content of various stat display elements.
   * @param {object} displayStats - The displayStats object received from the state update event.
   */
  _render(displayStats) {
    console.log("[StatsDisplayRenderer] _render called with displayStats:", JSON.stringify(displayStats));
    if (!displayStats || typeof displayStats !== 'object') {
        console.warn("StatsDisplayRenderer: _render called without valid stats data. Rendering N/A.");
        displayStats = {}; // Use empty object to avoid errors below and render N/A
    }

    const fv = Utils.formatValue;
    const fd = Utils.formatDate;
    const fdShort = Utils.formatDateShort;
    const na = (v) => (v != null ? v : "N/A");

    const updateElement = (key, value, formatter = na, args = undefined) => {
      const element = ui.statElements[key];
      if (element) {
        let formattedValue = formatter(value, args);
        // Special handling (remains the same)
        if (key === "currentRateFeedback" && displayStats.targetRateFeedback) {
             element.className = `stat-value feedback ${displayStats.targetRateFeedback.class || ""}`;
             element.textContent = displayStats.targetRateFeedback.text ?? "N/A";
        } else if (key === "weightConsistencyDetails" && displayStats.weightDataConsistency) {
             element.textContent = `(${displayStats.weightDataConsistency.count ?? '?'}/${displayStats.weightDataConsistency.totalDays ?? '?'} days)`;
        } else if (key === "calorieConsistencyDetails" && displayStats.calorieDataConsistency) {
             element.textContent = `(${displayStats.calorieDataConsistency.count ?? '?'}/${displayStats.calorieDataConsistency.totalDays ?? '?'} days)`;
        } else if (key === "suggestedIntakeRange" && value && value.min != null && value.max != null) {
             element.textContent = `${value.min} - ${value.max}`;
        } else {
             element.textContent = formattedValue; // Default
        }

        // Add/Remove highlightable class and listener (remains the same)
        if (key === "maxWeightDate" || key === "minWeightDate") {
            if (value instanceof Date && !isNaN(value)) {
                element.classList.add("highlightable"); element.style.cursor = "pointer"; element.style.textDecoration = "underline dotted";
                element.__highlightDate = value;
                element.removeEventListener("click", EventHandlers.statDateClickWrapper);
                element.addEventListener("click", EventHandlers.statDateClickWrapper);
            } else {
                element.classList.remove("highlightable"); element.style.cursor = ""; element.style.textDecoration = "";
                element.removeEventListener("click", EventHandlers.statDateClickWrapper);
                element.__highlightDate = null;
                element.textContent = "N/A"; // Ensure N/A
            }
        }
      }
      // else { console.warn(`StatsDisplayRenderer: UI element for key "${key}" not found.`); } // Keep commented unless debugging needed
    };

    // Update all stat elements using the provided displayStats object
    updateElement("startingWeight", displayStats.startingWeight, fv, 1);
    updateElement("currentWeight", displayStats.currentWeight, fv, 1);
    updateElement("currentSma", displayStats.currentSma, fv, 1);
    updateElement("totalChange", displayStats.totalChange, fv, 1);
    updateElement("maxWeight", displayStats.maxWeight, fv, 1);
    updateElement("maxWeightDate", displayStats.maxWeightDate, fd);
    updateElement("minWeight", displayStats.minWeight, fv, 1);
    updateElement("minWeightDate", displayStats.minWeightDate, fd);
    updateElement("startingLbm", displayStats.startingLbm, fv, 1);
    updateElement("currentLbmSma", displayStats.currentLbmSma, fv, 1);
    updateElement("totalLbmChange", displayStats.totalLbmChange, fv, 1);
    updateElement("currentFmSma", displayStats.currentFmSma, fv, 1);
    updateElement("totalFmChange", displayStats.totalFmChange, fv, 1);
    updateElement("volatilityScore", displayStats.volatility, fv, 2);
    updateElement("rollingVolatility", displayStats.rollingVolatility, fv, 2);
    updateElement("rollingWeeklyChangeSma", displayStats.currentWeeklyRate, fv, 2);
    updateElement("regressionSlope", displayStats.regressionSlopeWeekly, fv, 2);
    // Update regression start date label directly
    if (ui.statElements.regressionStartDateLabel) {
        ui.statElements.regressionStartDateLabel.textContent = displayStats.regressionStartDate
            ? `(${fdShort(displayStats.regressionStartDate)})` : "(Range Start)";
    }
    updateElement("netcalRateCorrelation", displayStats.netCalRateCorrelation, fv, 2);
    updateElement("weightConsistency", displayStats.weightDataConsistency?.percentage, fv, 0);
    updateElement("weightConsistencyDetails"); // Special handling inside updateElement
    updateElement("calorieConsistency", displayStats.calorieDataConsistency?.percentage, fv, 0);
    updateElement("calorieConsistencyDetails"); // Special handling inside updateElement
    updateElement("avgIntake", displayStats.avgIntake, fv, 0);
    updateElement("avgExpenditure", displayStats.avgExpenditureGFit, fv, 0);
    updateElement("avgNetBalance", displayStats.avgNetBalance, fv, 0);
    updateElement("estimatedDeficitSurplus", displayStats.estimatedDeficitSurplus, fv, 0);
    updateElement("avgTdeeGfit", displayStats.avgExpenditureGFit, fv, 0);
    updateElement("avgTdeeWgtChange", displayStats.avgTDEE_WgtChange, fv, 0);
    updateElement("avgTdeeDifference", displayStats.avgTDEE_Difference, fv, 0);
    updateElement("avgTdeeAdaptive", displayStats.avgTDEE_Adaptive, fv, 0);
    updateElement("targetWeightStat", displayStats.targetWeight, fv, 1);
    updateElement("targetRateStat", displayStats.targetRate, fv, 2);
    updateElement("weightToGoal", displayStats.weightToGoal, fv, 1);
    updateElement("estimatedTimeToGoal", displayStats.estimatedTimeToGoal);
    updateElement("requiredRateForGoal", displayStats.requiredRateForGoal, fv, 2);
    updateElement("requiredNetCalories", displayStats.requiredNetCalories, fv, 0);
    updateElement("requiredCalorieAdjustment", displayStats.requiredCalorieAdjustment, fv, 0);
    updateElement("suggestedIntakeRange", displayStats.suggestedIntakeRange); // Special handling
    updateElement("currentRateFeedback", displayStats.targetRateFeedback); // Special handling
  },

  init() {
    // Subscribe specifically to the event carrying the display stats
    StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', this._render);
    console.log("[StatsDisplayRenderer Init] Subscribed to state:displayStatsUpdated.");
    // Render initial empty state
    this._render({});
  },
};