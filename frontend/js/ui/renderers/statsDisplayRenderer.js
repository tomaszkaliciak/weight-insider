// statsManager.js
// Calculates and updates various statistics based on the processed data and current view/analysis range.

import { CONFIG } from "../../config.js";
import { ui } from "../uiCache.js";
import { Utils } from "../../core/utils.js";

import { DataService } from "../../core/dataService.js";
import { EventHandlers } from "../../interactions/eventHandlers.js";
import { InsightsGenerator } from "../insightsGenerator.js";
import { WeeklySummaryUpdater } from "../weeklySummaryUpdater.js";
import { ScatterPlotUpdater } from "../chartUpdaters.js";
import { EventBus } from "../../core/eventBus.js";

export const StatsDisplayRenderer = {
  updateStatsDisplay(stats) {
    const fv = Utils.formatValue;
    const fd = Utils.formatDate;
    const fdShort = Utils.formatDateShort;
    const na = (v) => v ?? "N/A";
    const updateElement = (key, value, formatter = na, args = undefined) => {
      const element = ui.statElements[key];
      if (element) {
        let formattedValue = formatter(value, args);
        if (key === "currentRateFeedback" && stats.targetRateFeedback) {
          element.className = `stat-value feedback ${stats.targetRateFeedback.class || ""}`;
          element.textContent = stats.targetRateFeedback.text;
        } else if (
          key === "weightConsistencyDetails" &&
          stats.weightDataConsistency
        ) {
          element.textContent = `(${stats.weightDataConsistency.count}/${stats.weightDataConsistency.totalDays} days)`;
        } else if (
          key === "calorieConsistencyDetails" &&
          stats.calorieDataConsistency
        ) {
          element.textContent = `(${stats.calorieDataConsistency.count}/${stats.calorieDataConsistency.totalDays} days)`;
        } else if (
          key === "suggestedIntakeRange" &&
          value &&
          value.min != null &&
          value.max != null
        ) {
          element.textContent = `${value.min} - ${value.max}`;
        } else {
          element.textContent = formattedValue;
        }
        // Add/Remove highlightable class and listener for date stats
        if (key === "maxWeightDate" || key === "minWeightDate") {
          if (value instanceof Date && !isNaN(value)) {
            element.classList.add("highlightable");
            element.style.cursor = "pointer";
            element.style.textDecoration = "underline dotted";
            element.__highlightDate = value; // Store date ref on element
            element.removeEventListener(
              "click",
              EventHandlers.statDateClickWrapper,
            ); // Avoid duplicates
            element.addEventListener(
              "click",
              EventHandlers.statDateClickWrapper,
            );
          } else {
            element.classList.remove("highlightable");
            element.style.cursor = "";
            element.style.textDecoration = "";
            element.removeEventListener(
              "click",
              EventHandlers.statDateClickWrapper,
            );
            element.__highlightDate = null;
          }
        }
      }
    };

    // Update all stat elements
    updateElement("startingWeight", stats.startingWeight, fv, 1);
    updateElement("currentWeight", stats.currentWeight, fv, 1);
    updateElement("currentSma", stats.currentSma, fv, 1);
    updateElement("totalChange", stats.totalChange, fv, 1);
    updateElement("maxWeight", stats.maxWeight, fv, 1);
    updateElement("maxWeightDate", stats.maxWeightDate, fd);
    updateElement("minWeight", stats.minWeight, fv, 1);
    updateElement("minWeightDate", stats.minWeightDate, fd);
    updateElement("startingLbm", stats.startingLbm, fv, 1);
    updateElement("currentLbmSma", stats.currentLbmSma, fv, 1);
    updateElement("totalLbmChange", stats.totalLbmChange, fv, 1);
    updateElement("currentFmSma", stats.currentFmSma, fv, 1);
    updateElement("totalFmChange", stats.totalFmChange, fv, 1);
    updateElement("volatilityScore", stats.volatility, fv, 2); // Overall volatility
    updateElement("rollingVolatility", stats.rollingVolatility, fv, 2);
    updateElement("rollingWeeklyChangeSma", stats.currentWeeklyRate, fv, 2);
    updateElement("regressionSlope", stats.regressionSlopeWeekly, fv, 2);
    if (ui.statElements.regressionStartDateLabel) {
      ui.statElements.regressionStartDateLabel.textContent =
        stats.regressionStartDate
          ? `(${fdShort(stats.regressionStartDate)})`
          : "(Range Start)";
    }
    updateElement("netcalRateCorrelation", stats.netCalRateCorrelation, fv, 2);
    updateElement(
      "weightConsistency",
      stats.weightDataConsistency?.percentage,
      fv,
      0,
    );
    updateElement("weightConsistencyDetails"); // Updates based on stats.weightDataConsistency
    updateElement(
      "calorieConsistency",
      stats.calorieDataConsistency?.percentage,
      fv,
      0,
    );
    updateElement("calorieConsistencyDetails"); // Updates based on stats.calorieDataConsistency
    updateElement("avgIntake", stats.avgIntake, fv, 0);
    updateElement("avgExpenditure", stats.avgExpenditureGFit, fv, 0); // Renamed from avgExpenditure to avgTdeeGfit in HTML
    updateElement("avgNetBalance", stats.avgNetBalance, fv, 0);
    updateElement(
      "estimatedDeficitSurplus",
      stats.estimatedDeficitSurplus,
      fv,
      0,
    );
    updateElement("avgTdeeGfit", stats.avgExpenditureGFit, fv, 0);
    updateElement("avgTdeeWgtChange", stats.avgTDEE_WgtChange, fv, 0);
    updateElement("avgTdeeDifference", stats.avgTDEE_Difference, fv, 0);
    updateElement("avgTdeeAdaptive", stats.avgTDEE_Adaptive, fv, 0);
    updateElement("targetWeightStat", stats.targetWeight, fv, 1);
    updateElement("targetRateStat", stats.targetRate, fv, 2);
    updateElement("weightToGoal", stats.weightToGoal, fv, 1);
    updateElement("estimatedTimeToGoal", stats.estimatedTimeToGoal);
    updateElement("requiredRateForGoal", stats.requiredRateForGoal, fv, 2);
    updateElement("requiredNetCalories", stats.requiredNetCalories, fv, 0);
    updateElement(
      "requiredCalorieAdjustment",
      stats.requiredCalorieAdjustment,
      fv,
      0,
    );
    updateElement("suggestedIntakeRange"); // Updates based on stats.suggestedIntakeRange
    updateElement("currentRateFeedback"); // Updates based on stats.targetRateFeedback
  },
  init() {
    EventBus.subscribe("state::statsUpdated", this.updateStatsDisplay);
  },
};
