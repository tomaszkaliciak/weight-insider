// js/core/selectors.js
// Functions to extract specific pieces of state or derived data from the main state object.

import { CONFIG } from "../config.js"; // May be needed for some derived selectors

// --- Basic State Selectors ---

export const selectState = (state) => state; // Returns the whole state (use sparingly)
export const selectIsInitialized = (state) => state.isInitialized;
export const selectRawData = (state) => state.rawData;
export const selectProcessedData = (state) => state.processedData;
export const selectFilteredData = (state) => state.filteredData; // Data currently visible in focus chart
export const selectAnnotations = (state) => state.annotations;
export const selectPlateaus = (state) => state.plateaus;
export const selectTrendChangePoints = (state) => state.trendChangePoints;
export const selectGoal = (state) => state.goal;
export const selectGoalAchievedDate = (state) => state.goalAchievedDate;
export const selectAnalysisRange = (state) => state.analysisRange;
export const selectInteractiveRegressionRange = (state) =>
  state.interactiveRegressionRange;
export const selectRegressionStartDate = (state) => state.regressionStartDate; // UI-set start date
export const selectCurrentTheme = (state) => state.currentTheme;
export const selectDisplayStats = (state) => state.displayStats;
export const selectSeriesVisibility = (state) => state.seriesVisibility;
export const selectHighlightedDate = (state) => state.highlightedDate;
export const selectPinnedTooltipData = (state) => state.pinnedTooltipData;
export const selectActiveHoverData = (state) => state.activeHoverData;
export const selectLastZoomTransform = (state) => state.lastZoomTransform;
export const selectWeeklySummaryData = (state) => state.weeklySummaryData;
export const selectCorrelationScatterData = (state) =>
  state.correlationScatterData;
export const selectSortOptions = (state) => ({
  columnKey: state.sortColumnKey,
  direction: state.sortDirection,
});
export const selectSettings = (state) => state.settings;
export const selectTrendConfig = (state) => state.trendConfig;

// --- Derived/Calculated Selectors ---

/**
 * Gets the effective date range for regression calculations.
 * Prioritizes interactive brush range, falls back to analysis range + trend config start date.
 * @param {object} state - The application state object.
 * @returns {{start: Date|null, end: Date|null}} The effective start and end dates.
 */
export const selectEffectiveRegressionRange = (state) => {
  const interactiveRange = state.interactiveRegressionRange;
  const analysisRange = state.analysisRange;
  const trendConfigStartDate = state.trendConfig?.startDate; // Read trend config state

  if (
    interactiveRange.start instanceof Date &&
    !isNaN(interactiveRange.start) &&
    interactiveRange.end instanceof Date &&
    !isNaN(interactiveRange.end)
  ) {
    // Use interactive range if valid
    return { start: interactiveRange.start, end: interactiveRange.end };
  }

  // Fallback to analysis range
  if (
    !(analysisRange.start instanceof Date) ||
    !(analysisRange.end instanceof Date)
  ) {
    return { start: null, end: null }; // Cannot determine range
  }

  // Use Trend Config start date if valid within analysis range, otherwise use analysis start
  const start =
    trendConfigStartDate instanceof Date && // Use trendConfigStartDate
    !isNaN(trendConfigStartDate) &&
    trendConfigStartDate >= analysisRange.start &&
    trendConfigStartDate <= analysisRange.end
      ? trendConfigStartDate
      : analysisRange.start;

  return { start: start, end: analysisRange.end };
};

/**
 * Checks if the goal weight has been achieved based on the latest data.
 * @param {object} state - The application state object.
 * @returns {boolean} True if the goal is considered achieved.
 */
export const selectIsGoalAchieved = (state) => {
  if (
    state.goal.weight == null ||
    !state.processedData ||
    state.processedData.length === 0
  ) {
    return false;
  }
  // Use the goalAchievedDate from state if it's already set
  if (
    state.goalAchievedDate instanceof Date &&
    !isNaN(state.goalAchievedDate)
  ) {
    return true;
  }
  // Fallback check based on latest SMA/weight (less reliable than explicit date)
  const lastSmaEntry = [...state.processedData]
    .reverse()
    .find((d) => d.sma != null);
  const lastWeightEntry = [...state.processedData]
    .reverse()
    .find((d) => d.value != null);
  const referenceWeight = lastSmaEntry?.sma ?? lastWeightEntry?.value;

  if (referenceWeight == null) return false;

  const weightThreshold = 0.1; // +/- kg threshold
  return Math.abs(state.goal.weight - referenceWeight) <= weightThreshold;
};

/**
 * Selects the data needed for rendering the focus chart paths.
 * @param {object} state - The application state object.
 * @returns {object} Containing visible SMA, EMA data, and regression results.
 */
export const selectFocusChartPathData = (state) => {
  // Note: This assumes filteredData and regressionResult are updated in state
  // by the new centralized calculation logic (e.g., in StatsManager).
  return {
    visibleValidSmaData: state.filteredData?.filter((d) => d.sma != null) || [],
    visibleValidEmaData: state.filteredData?.filter((d) => d.ema != null) || [],
  };
};

/**
 * Selects the data needed for rendering the focus chart dots and markers.
 * @param {object} state - The application state object.
 * @returns {object} Containing raw weight data, annotations, etc.
 */
export const selectFocusChartMarkerData = (state) => {
  // Note: This assumes filteredData, annotations, plateaus, trendChangePoints are updated in state
  return {
    visibleRawWeightData:
      state.filteredData?.filter((d) => d.value != null) || [],
    // These are read directly from state by the updaters now, but could be selected here for consistency
    // annotations: state.annotations || [],
    // plateaus: state.plateaus || [],
    // trendChangePoints: state.trendChangePoints || [],
    // highlightedDate: state.highlightedDate,
  };
};

// Add more selectors as needed for specific UI components or calculations...

console.log("Selectors module loaded."); // Log loading
