// uiCache.js
// Manages the caching of D3 selections for UI elements.

import { Utils } from "./utils.js"; // Needed for getElementByIdSafe
import { state } from "./state.js"; // Needed for initial state checks (toggles)
import { CONFIG } from "./config.js"; // Needed for localStorageKeys

// Export the ui object immediately, it will be populated by cacheSelectors
export const ui = {
  // --- Populated by cacheSelectors ---
  // Container elements
  body: null,
  chartContainer: null,
  contextContainer: null,
  balanceChartContainer: null,
  legendContainer: null,
  rateChartContainer: null,
  tdeeDiffContainer: null,
  weeklySummaryContainer: null,
  correlationScatterContainer: null,
  tooltip: null,
  pinnedTooltipContainer: null,
  statusMessage: null,
  annotationForm: null,
  annotationList: null,
  insightSummaryContainer: null,
  actionableInsightsContainer: null,
  actionableInsightsList: null,
  analysisResultsHeading: null,
  // SVG elements & groups (populated during chart setup, not here)
  svg: null,
  focus: null,
  contextSvg: null,
  context: null,
  balanceSvg: null,
  balanceChartArea: null,
  rateSvg: null,
  rateChartArea: null,
  tdeeDiffSvg: null,
  tdeeDiffChartArea: null,
  correlationScatterSvg: null,
  correlationScatterArea: null,
  chartArea: null,
  gridGroup: null,
  plateauGroup: null,
  goalZoneRect: null,
  goalAchievedGroup: null,
  annotationsGroup: null,
  trendChangeGroup: null,
  highlightGroup: null,
  crosshairGroup: null,
  rawDotsGroup: null,
  smaDotsGroup: null,
  scatterDotsGroup: null,
  regressionBrushGroup: null,
  zoomCaptureRect: null,
  // Paths & Areas (populated during chart setup, not here)
  smaLine: null,
  bandArea: null,
  regressionLine: null,
  regressionCIArea: null,
  trendLine1: null,
  trendLine2: null,
  goalLine: null,
  rateLine: null,
  tdeeDiffLine: null,
  bfLine: null, // Retained but unused
  contextArea: null,
  contextLine: null,
  balanceZeroLine: null,
  rateZeroLine: null,
  tdeeDiffZeroLine: null,
  optimalGainZoneRect: null,
  // Axes groups (populated during chart setup, not here)
  xAxisGroup: null,
  yAxisGroup: null,
  contextXAxisGroup: null,
  balanceXAxisGroup: null,
  balanceYAxisGroup: null,
  rateXAxisGroup: null,
  rateYAxisGroup: null,
  tdeeDiffXAxisGroup: null,
  tdeeDiffYAxisGroup: null,
  correlationScatterXAxisGroup: null,
  correlationScatterYAxisGroup: null,
  // Brush group (populated during chart setup, not here)
  brushGroup: null,
  // Input/Control Elements (Refs to D3 selections)
  themeToggle: null,
  dynamicYAxisToggle: null,
  goalWeightInput: null,
  goalDateInput: null,
  goalTargetRateInput: null,
  regressionToggle: null,
  trendStartDateInput: null,
  trendInitialWeightInput: null,
  trendWeeklyIncrease1Input: null,
  trendWeeklyIncrease2Input: null,
  regressionStartDateLabel: null,
  analysisStartDateInput: null,
  analysisEndDateInput: null,
  updateAnalysisRangeBtn: null,
  resetAnalysisRangeBtn: null,
  analysisRangeDisplay: null,
  annotationDateInput: null,
  annotationTextInput: null,
  whatIfIntakeInput: null,
  whatIfDurationInput: null,
  whatIfResultDisplay: null,
  whatIfSubmitBtn: null,
  // Statistic Display Elements (Refs to actual DOM nodes for perf)
  statElements: {}, // e.g., statElements.currentWeight = <HTMLElement>
};

/**
 * Caches D3 selections for frequently accessed UI elements.
 * Populates the exported `ui` object.
 * Must be called after the DOM is ready.
 * @throws {Error} If critical UI elements are missing.
 */
export function cacheSelectors() {
  console.log("uiCache: Caching UI element selections...");
  ui.body = d3.select("body"); // Special case for body

  const elementIdMap = {
    // Containers
    "chart-container": "chartContainer",
    "context-chart-container": "contextContainer",
    "balance-chart-container": "balanceChartContainer",
    "legend-container": "legendContainer",
    "rate-of-change-container": "rateChartContainer",
    "tdee-reconciliation-container": "tdeeDiffContainer",
    "weekly-summary-container": "weeklySummaryContainer",
    "correlation-scatter-container": "correlationScatterContainer",
    tooltip: "tooltip",
    "pinned-tooltip-container": "pinnedTooltipContainer",
    "status-message": "statusMessage",
    "annotation-list": "annotationList",
    "insight-summary": "insightSummaryContainer",
    "actionable-insights-container": "actionableInsightsContainer",
    "actionable-insights-list": "actionableInsightsList",
    "analysis-results-heading": "analysisResultsHeading",
    // Controls
    "theme-toggle": "themeToggle",
    "dynamic-y-axis-toggle": "dynamicYAxisToggle",
    goalWeight: "goalWeightInput",
    goalDate: "goalDateInput",
    goalTargetRate: "goalTargetRateInput",
    toggleRegression: "regressionToggle",
    trendStartDate: "trendStartDateInput",
    trendInitialWeight: "trendInitialWeightInput",
    trendWeeklyIncrease: "trendWeeklyIncrease1Input",
    trendWeeklyIncrease_2: "trendWeeklyIncrease2Input",
    "regression-start-date-label": "regressionStartDateLabel",
    analysisStartDate: "analysisStartDateInput",
    analysisEndDate: "analysisEndDateInput",
    updateAnalysisRange: "updateAnalysisRangeBtn",
    resetAnalysisRange: "resetAnalysisRangeBtn",
    "analysis-range-display": "analysisRangeDisplay",
    "annotation-form": "annotationForm",
    "annotation-date": "annotationDateInput",
    "annotation-text": "annotationTextInput",
    "what-if-intake": "whatIfIntakeInput",
    "what-if-duration": "whatIfDurationInput",
    "what-if-submit": "whatIfSubmitBtn",
    "what-if-result": "whatIfResultDisplay",
    // Stat Display Elements (Mapped to statElements sub-object)
    "starting-weight": "startingWeight",
    "current-weight": "currentWeight",
    "current-sma": "currentSma",
    "total-change": "totalChange",
    "max-weight": "maxWeight",
    "max-weight-date": "maxWeightDate",
    "min-weight": "minWeight",
    "min-weight-date": "minWeightDate",
    "starting-lbm": "startingLbm",
    "current-lbm-sma": "currentLbmSma",
    "total-lbm-change": "totalLbmChange",
    "current-fm-sma": "currentFmSma",
    "total-fm-change": "totalFmChange",
    "volatility-score": "volatilityScore",
    "rolling-volatility": "rollingVolatility",
    "rolling-weekly-change-sma": "rollingWeeklyChangeSma",
    "regression-slope": "regressionSlope",
    "netcal-rate-correlation": "netcalRateCorrelation",
    "weight-consistency": "weightConsistency",
    "weight-consistency-details": "weightConsistencyDetails",
    "calorie-consistency": "calorieConsistency",
    "calorie-consistency-details": "calorieConsistencyDetails",
    "avg-intake": "avgIntake",
    "avg-expenditure": "avgExpenditure",
    "avg-net-balance": "avgNetBalance",
    "estimated-deficit-surplus": "estimatedDeficitSurplus",
    "avg-tdee-gfit": "avgTdeeGfit",
    "avg-tdee-wgt-change": "avgTdeeWgtChange",
    "avg-tdee-difference": "avgTdeeDifference",
    "avg-tdee-adaptive": "avgTdeeAdaptive",
    "target-weight-stat": "targetWeightStat",
    "target-rate-stat": "targetRateStat",
    "weight-to-goal": "weightToGoal",
    "estimated-time-to-goal": "estimatedTimeToGoal",
    "required-rate-for-goal": "requiredRateForGoal",
    "required-net-calories": "requiredNetCalories",
    "suggested-intake-range": "suggestedIntakeRange",
    "current-rate-feedback": "currentRateFeedback",
    "required-calorie-adjustment": "requiredCalorieAdjustment",
  };

  const statElementIds = [
    "startingWeight",
    "currentWeight",
    "currentSma",
    "totalChange",
    "maxWeight",
    "maxWeightDate",
    "minWeight",
    "minWeightDate",
    "startingLbm",
    "currentLbmSma",
    "totalLbmChange",
    "currentFmSma",
    "totalFmChange",
    "volatilityScore",
    "rollingVolatility",
    "rollingWeeklyChangeSma",
    "regressionSlope",
    "netcalRateCorrelation",
    "weightConsistency",
    "weightConsistencyDetails",
    "calorieConsistency",
    "calorieConsistencyDetails",
    "avgIntake",
    "avgExpenditure",
    "avgNetBalance",
    "estimatedDeficitSurplus",
    "avgTdeeGfit",
    "avgTdeeWgtChange",
    "avgTdeeDifference",
    "avgTdeeAdaptive",
    "targetWeightStat",
    "targetRateStat",
    "weightToGoal",
    "estimatedTimeToGoal",
    "requiredRateForGoal",
    "requiredNetCalories",
    "suggestedIntakeRange",
    "currentRateFeedback",
    "whatIfResultDisplay",
    "analysisRangeDisplay",
    "regressionStartDateLabel",
    "requiredCalorieAdjustment",
  ];

  let missingCritical = false;
  const criticalIds = ["chart-container", "context-chart-container", "tooltip"];
  ui.statElements = {}; // Reset stat elements cache

  for (const [id, key] of Object.entries(elementIdMap)) {
    const elementNode = Utils.getElementByIdSafe(id);
    if (elementNode) {
      // Cache D3 selection for non-stat elements
      if (!statElementIds.includes(key)) {
        ui[key] = d3.select(elementNode);
      }

      // Cache direct DOM node reference for stat display elements for performance
      if (statElementIds.includes(key)) {
        ui.statElements[key] = elementNode;
      }
    } else {
      // Assign empty D3 selection if element not found
      if (!statElementIds.includes(key)) {
        ui[key] = d3.select(null);
      }
      if (criticalIds.includes(id)) {
        console.error(`uiCache Error: Critical UI element #${id} not found.`);
        missingCritical = true;
      } else if (!statElementIds.includes(key)) {
        // Only warn for non-stat, non-critical elements
        // Check if it's one of the new optional elements before warning
        if (
          key !== "actionableInsightsContainer" &&
          key !== "actionableInsightsList" &&
          key !== "rollingVolatility"
        ) {
          console.warn(`uiCache: UI element #${id} (key: ${key}) not found.`);
        }
      }
    }
  }

  // --- Set Initial State Based on Controls ---
  if (ui.regressionToggle && !ui.regressionToggle.empty()) {
    state.seriesVisibility.regression = ui.regressionToggle.property("checked");
    state.seriesVisibility.regressionCI = state.seriesVisibility.regression;
  } else {
    state.seriesVisibility.regression = true;
    state.seriesVisibility.regressionCI = true;
  }

  const storedDynamicY = localStorage.getItem(
    CONFIG.localStorageKeys.dynamicYAxis,
  );
  if (ui.dynamicYAxisToggle && !ui.dynamicYAxisToggle.empty()) {
    state.useDynamicYAxis = ui.dynamicYAxisToggle.property("checked");
  } else if (storedDynamicY !== null) {
    state.useDynamicYAxis = storedDynamicY === "true";
  } else {
    state.useDynamicYAxis = false;
  }
  ui.dynamicYAxisToggle?.property("checked", state.useDynamicYAxis);

  if (missingCritical) {
    throw new Error(
      "Missing critical UI elements required for chart initialization. Check console for details.",
    );
  }
  console.log("uiCache: UI element caching finished.");
}
