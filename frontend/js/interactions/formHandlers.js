// js/interactions/formHandlers.js
// Handles interactions with form elements like goal setting, trendlines, date ranges, etc.

import { StateManager, ActionTypes } from "../core/stateManager.js";
import { ui } from "../ui/uiCache.js";
import { scales } from "../ui/chartSetup.js";
import { CONFIG } from "../config.js";
import { Utils } from "../core/utils.js";
import * as Selectors from "../core/selectors.js";
import { ChartInteractions } from "./chartInteractions.js";

// Debounced handler for analysis range date inputs
const debouncedRangeInputChange = Utils.debounce(() => {
  console.log("[FormHandlers] Debounced range input change handler triggered.");
  const startVal = ui.analysisStartDateInput?.property("value");
  const endVal = ui.analysisEndDateInput?.property("value");
  const startDate = Utils.parseDateDMY(startVal);
  const endDate = Utils.parseDateDMY(endVal);

  if (
    startDate instanceof Date &&
    !isNaN(startDate) &&
    endDate instanceof Date &&
    !isNaN(endDate) &&
    startDate <= endDate
  ) {
    const newStart = new Date(startDate.setHours(0, 0, 0, 0));
    const newEnd = new Date(endDate.setHours(23, 59, 59, 999));
    const currentRange = Selectors.selectAnalysisRange(StateManager.getState());

    if (
      currentRange.start?.getTime() !== newStart.getTime() ||
      currentRange.end?.getTime() !== newEnd.getTime()
    ) {
      console.log("[FormHandlers Debounce] Dispatching range change from inputs:", newStart, newEnd);
      StateManager.dispatch({ type: ActionTypes.SET_ANALYSIS_RANGE, payload: { start: newStart, end: newEnd } });
      StateManager.dispatch({ type: ActionTypes.SET_PINNED_TOOLTIP, payload: null });
      StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: null });
      StateManager.dispatch({ type: ActionTypes.SET_INTERACTIVE_REGRESSION_RANGE, payload: { start: null, end: null } });

      if (scales.x) scales.x.domain([newStart, newEnd]);
      ChartInteractions.syncBrushAndZoomToFocus(); // Sync chart view

      Utils.showStatusMessage("Analysis range updated from input.", "info", 1500);
    } else {
      console.log("[FormHandlers Debounce] Range input change detected, but value is same as current state. No dispatch.");
    }
  } else if (startVal || endVal) {
    Utils.showStatusMessage("Invalid date range entered in inputs.", "error");
  }
}, 400); // Debounce for 400ms


export const FormHandlers = {
  handleTrendlineInputChange() {
    console.log("[FormHandlers] Trendline input changed.");
    const startDateVal = ui.trendStartDateInput?.property("value");
    const initialWeightVal = ui.trendInitialWeightInput?.property("value");
    const weeklyIncrease1Val = ui.trendWeeklyIncrease1Input?.property("value");
    const weeklyIncrease2Val = ui.trendWeeklyIncrease2Input?.property("value");

    StateManager.dispatch({
      type: ActionTypes.UPDATE_TREND_CONFIG, // Use ActionTypes
      payload: {
        startDate: startDateVal ? new Date(startDateVal) : null,
        initialWeight: initialWeightVal,
        weeklyIncrease1: weeklyIncrease1Val,
        weeklyIncrease2: weeklyIncrease2Val,
      },
    });
  },

  handleGoalSubmit(event) {
    event.preventDefault();
    const weightVal = ui.goalWeightInput?.property("value");
    const dateVal = ui.goalDateInput?.property("value");
    const rateVal = ui.goalTargetRateInput?.property("value");

    // Parse values to proper types (weight and rate as numbers, date as Date object)
    const parsedWeight = weightVal ? parseFloat(weightVal) : null;
    const parsedRate = rateVal ? parseFloat(rateVal) : null;
    // Parse date as local midnight
    const parsedDate = dateVal ? new Date(dateVal + "T00:00:00") : null;

    StateManager.dispatch({
      type: ActionTypes.LOAD_GOAL, // Use ActionTypes
      payload: {
        weight: parsedWeight != null && !isNaN(parsedWeight) ? parsedWeight : null,
        date: parsedDate instanceof Date && !isNaN(parsedDate.getTime()) ? parsedDate : null,
        targetRate: parsedRate != null && !isNaN(parsedRate) ? parsedRate : null,
      },
    });
    // Dynamically import GoalManager only when needed
    import("../core/goalManager.js")
      .then(({ GoalManager }) => {
        GoalManager.save();
      })
      .catch((err) => console.error("Failed to load GoalManager for save", err));
  },

  handleAnalysisRangeUpdate() {
    console.log("[FormHandlers] Apply Range button clicked.");
    debouncedRangeInputChange.flush(); // Use internal debounced function
  },

  handleAnalysisRangeInputChange() {
    console.log("[FormHandlers] Date input change detected.");
    debouncedRangeInputChange(); // Use internal debounced function
  },

  handleWhatIfSubmit(event) {
    event.preventDefault();
    const futureIntake = parseFloat(ui.whatIfIntakeInput.property("value"));
    const durationDays = parseInt(ui.whatIfDurationInput.property("value"), 10);
    const resultDisplay = ui.whatIfResultDisplay;

    resultDisplay.classed("error", false).text("Calculating...");
    if (isNaN(futureIntake) || isNaN(durationDays) || durationDays <= 0) {
      resultDisplay.classed("error", true).text("Please enter valid intake and duration > 0.");
      return;
    }
    const stateSnapshot = StateManager.getState();
    const currentDisplayStats = Selectors.selectDisplayStats(stateSnapshot);
    const tdeeEstimate =
      currentDisplayStats.avgTDEE_Adaptive ??
      currentDisplayStats.avgTDEE_WgtChange ??
      currentDisplayStats.avgExpenditureGFit;
    const tdeeSource =
      tdeeEstimate === currentDisplayStats.avgTDEE_Adaptive ? "Adaptive" :
        tdeeEstimate === currentDisplayStats.avgTDEE_WgtChange ? "Trend" : "GFit";

    if (tdeeEstimate == null || isNaN(tdeeEstimate)) {
      resultDisplay.classed("error", true).text(`Cannot project: TDEE estimate unavailable.`);
      return;
    }
    const dailyNetBalance = futureIntake - tdeeEstimate;
    const dailyWeightChangeKg = dailyNetBalance / CONFIG.KCALS_PER_KG;
    const totalWeightChangeKg = dailyWeightChangeKg * durationDays;
    const startWeight = currentDisplayStats.currentSma ?? currentDisplayStats.currentWeight;
    if (startWeight == null || isNaN(startWeight)) {
      resultDisplay.classed("error", true).text("Cannot project: Current weight unknown.");
      return;
    }
    const projectedWeight = startWeight + totalWeightChangeKg;
    const fv = Utils.formatValue;
    resultDisplay.html(
      `Based on ${tdeeSource} TDEE ≈ ${fv(tdeeEstimate, 0)} kcal:<br> Est. change: ${fv(totalWeightChangeKg, 1)} kg in ${durationDays} days. (${fv((totalWeightChangeKg / durationDays) * 7, 1)} kg/wk)<br> Projected Weight: <strong>${fv(projectedWeight, 1)} kg</strong>.`
    );
  },

  // Add a setup function if needed to attach listeners managed by this module
  // setup() { ... }
};

console.log("FormHandlers module loaded.");