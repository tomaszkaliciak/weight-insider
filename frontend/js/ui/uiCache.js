// js/ui/uiCache.js
// Manages the caching of D3 selections and direct DOM node references for UI elements.

import * as d3 from 'd3';
import { Utils } from "../core/utils.js";


// Export the ui object immediately, it will be populated by cacheSelectors
export const ui = {
  // --- Populated by cacheSelectors ---

  // == Core Containers & Global Elements ==
  body: null, // d3 selection
  tooltip: null, // d3 selection
  pinnedTooltipContainer: null, // d3 selection (or node)
  statusMessage: null, // d3 selection
  insightSummaryContainer: null, //d3 selection for #insight-summary

  // == Chart Sections & SVG Containers (d3 selections) ==
  chartContainer: null,
  contextContainer: null,
  balanceChartContainer: null,
  legendContainer: null,
  rateChartContainer: null,
  tdeeDiffContainer: null,
  correlationScatterContainer: null,
  weeklySummaryContainer: null, // Container for the weekly table

  // == SVG Elements & Groups (d3 selections - populated by chartSetup) ==
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
  // Paths & Areas
  smaLine: null,
  emaLine: null,
  bandArea: null,
  regressionLine: null,
  trendLine1: null,
  trendLine2: null,
  goalLine: null,
  goalLineHit: null, // Interactive hit area
  goalPrognosisLine: null,
  rateLine: null,
  rateMALine: null,
  tdeeDiffLine: null,
  contextArea: null,
  contextLine: null,
  balanceZeroLine: null,
  rateZeroLine: null,
  tdeeDiffZeroLine: null,
  optimalGainZoneRect: null,
  // Axes groups
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
  // Brush group
  brushGroup: null,

  // == Input/Control Elements (d3 selections) ==
  themeToggle: null,
  // Goal Form
  goalWeightInput: null,
  goalDateInput: null,
  goalTargetRateInput: null,
  // Trendline Form
  trendStartDateInput: null,
  trendInitialWeightInput: null,
  trendWeeklyIncrease1Input: null,
  trendWeeklyIncrease2Input: null,
  // Analysis Range Form
  analysisStartDateInput: null,
  analysisEndDateInput: null,
  updateAnalysisRangeBtn: null,
  // Annotation Form
  annotationForm: null,
  annotationDateInput: null,
  annotationTextInput: null,
  // What-If Form
  whatIfIntakeInput: null,
  whatIfDurationInput: null,
  whatIfSubmitBtn: null,
  whatIfResultDisplay: null, // The div showing the what-if result
  // Others
  annotationList: null, // The <ul> for annotations

  // == Statistic Display Elements (Refs to DOM nodes) ==
  // This sub-object holds direct HTMLElement references for performance-critical text updates.
  statElements: {},
  // Specific stat element keys are mapped from elementIdMap below.
  // Example: ui.statElements.currentWeight will hold the actual <span> node.
};

/**
 * Maps element IDs to keys in the `ui` object (for d3 selections)
 * or the `ui.statElements` object (for direct DOM node references).
 */
const elementIdMap = {
  // Containers / Global
  tooltip: { key: "tooltip", type: "d3" },
  "pinned-tooltip-container": { key: "pinnedTooltipContainer", type: "d3" },
  "status-message": { key: "statusMessage", type: "d3" },
  "insight-summary": { key: "insightSummaryContainer", type: "d3" }, // <<< ADDED MAPPING >>>
  // Chart Sections
  "chart-container": { key: "chartContainer", type: "d3" },
  "context-chart-container": { key: "contextContainer", type: "d3" },
  "balance-chart-container": { key: "balanceChartContainer", type: "d3" },
  "legend-container": { key: "legendContainer", type: "d3" },
  "rate-of-change-container": { key: "rateChartContainer", type: "d3" },
  "tdee-reconciliation-container": { key: "tdeeDiffContainer", type: "d3" },
  "weekly-summary-container": { key: "weeklySummaryContainer", type: "d3" },
  "correlation-scatter-container": {
    key: "correlationScatterContainer",
    type: "d3",
  },
  // Controls (d3 selections)
  "theme-toggle": { key: "themeToggle", type: "d3" },
  goalWeight: { key: "goalWeightInput", type: "d3" },
  goalDate: { key: "goalDateInput", type: "d3" },
  goalTargetRate: { key: "goalTargetRateInput", type: "d3" },
  trendStartDate: { key: "trendStartDateInput", type: "d3" },
  trendInitialWeight: { key: "trendInitialWeightInput", type: "d3" },
  trendWeeklyIncrease: { key: "trendWeeklyIncrease1Input", type: "d3" },
  trendWeeklyIncrease_2: { key: "trendWeeklyIncrease2Input", type: "d3" },
  analysisStartDate: { key: "analysisStartDateInput", type: "d3" },
  analysisEndDate: { key: "analysisEndDateInput", type: "d3" },
  updateAnalysisRange: { key: "updateAnalysisRangeBtn", type: "d3" },
  "annotation-form": { key: "annotationForm", type: "d3" },
  "annotation-date": { key: "annotationDateInput", type: "d3" },
  "annotation-text": { key: "annotationTextInput", type: "d3" },
  "annotation-list": { key: "annotationList", type: "d3" },
  "what-if-intake": { key: "whatIfIntakeInput", type: "d3" },
  "what-if-duration": { key: "whatIfDurationInput", type: "d3" },
  "what-if-submit": { key: "whatIfSubmitBtn", type: "d3" },
  "what-if-result": { key: "whatIfResultDisplay", type: "d3" },

  // Stat Displays (Direct DOM node references stored in ui.statElements)
  "starting-weight": { key: "startingWeight", type: "stat" },
  "current-weight": { key: "currentWeight", type: "stat" },
  "current-sma": { key: "currentSma", type: "stat" },
  "total-change": { key: "totalChange", type: "stat" },
  "max-weight": { key: "maxWeight", type: "stat" },
  "max-weight-date": { key: "maxWeightDate", type: "stat" },
  "min-weight": { key: "minWeight", type: "stat" },
  "min-weight-date": { key: "minWeightDate", type: "stat" },
  "starting-lbm": { key: "startingLbm", type: "stat" },
  "current-lbm-sma": { key: "currentLbmSma", type: "stat" },
  "total-lbm-change": { key: "totalLbmChange", type: "stat" },
  "current-fm-sma": { key: "currentFmSma", type: "stat" },
  "total-fm-change": { key: "totalFmChange", type: "stat" },
  "volatility-score": { key: "volatilityScore", type: "stat" },
  "rolling-volatility": { key: "rollingVolatility", type: "stat" },
  "rolling-weekly-change-sma": { key: "rollingWeeklyChangeSma", type: "stat" },
  "rate-consistency-stddev": { key: "rateConsistencyStdDev", type: "stat" },
  "regression-slope": { key: "regressionSlope", type: "stat" },
  "regression-start-date-label": {
    key: "regressionStartDateLabel",
    type: "stat",
  },
  "netcal-rate-correlation": { key: "netcalRateCorrelation", type: "stat" },
  "weight-consistency": { key: "weightConsistency", type: "stat" },
  "weight-consistency-details": {
    key: "weightConsistencyDetails",
    type: "stat",
  },
  "calorie-consistency": { key: "calorieConsistency", type: "stat" },
  "calorie-consistency-details": {
    key: "calorieConsistencyDetails",
    type: "stat",
  },
  "avg-intake": { key: "avgIntake", type: "stat" },
  "avg-expenditure": { key: "avgExpenditure", type: "stat" },
  "avg-net-balance": { key: "avgNetBalance", type: "stat" },
  "estimated-deficit-surplus": { key: "estimatedDeficitSurplus", type: "stat" },
  "avg-tdee-gfit": { key: "avgTdeeGfit", type: "stat" },
  "avg-tdee-wgt-change": { key: "avgTdeeWgtChange", type: "stat" },
  "avg-tdee-difference": { key: "avgTdeeDifference", type: "stat" },
  "avg-tdee-adaptive": { key: "avgTdeeAdaptive", type: "stat" },
  "target-weight-stat": { key: "targetWeightStat", type: "stat" },
  "target-rate-stat": { key: "targetRateStat", type: "stat" },
  "weight-to-goal": { key: "weightToGoal", type: "stat" },
  "estimated-time-to-goal": { key: "estimatedTimeToGoal", type: "stat" },
  "required-rate-for-goal": { key: "requiredRateForGoal", type: "stat" },
  "required-net-calories": { key: "requiredNetCalories", type: "stat" },
  "required-calorie-adjustment": {
    key: "requiredCalorieAdjustment",
    type: "stat",
  },
  "suggested-intake-range": { key: "suggestedIntakeRange", type: "stat" },
  "current-rate-feedback": { key: "currentRateFeedback", type: "stat" },
};

/**
 * Caches D3 selections or direct DOM nodes for frequently accessed UI elements.
 * Populates the exported `ui` object.
 * Must be called after the DOM is ready.
 * @throws {Error} If critical UI elements are missing.
 */
export function cacheSelectors() {
  console.log("uiCache: Caching UI element selections...");
  ui.body = d3.select("body"); // Special case for body

  let missingCritical = false;
  const criticalIds = ["chart-container", "context-chart-container", "tooltip"]; // Define essential elements
  ui.statElements = {}; // Reset stat elements cache on each call

  for (const [id, config] of Object.entries(elementIdMap)) {
    const elementNode = Utils.getElementByIdSafe(id);

    if (elementNode) {
      if (config.type === "d3") {
        ui[config.key] = d3.select(elementNode); // Cache d3 selection
      } else if (config.type === "stat") {
        ui.statElements[config.key] = elementNode; // Cache direct node reference
      }
    } else {
      // Handle missing elements
      if (config.type === "d3") {
        ui[config.key] = d3.select(null); // Assign empty d3 selection
      }
      // No need to assign null for statElements, check existence before use

      if (criticalIds.includes(id)) {
        console.error(
          `uiCache Error: Critical UI element #${id} (key: ${config.key}) not found.`,
        );
        missingCritical = true;
      } else {
        // Warn only for non-critical, non-stat elements
        if (config.type === "d3") {
          console.warn(
            `uiCache: UI element #${id} (key: ${config.key}) not found.`,
          );
        }
      }
    }
  }

  if (missingCritical) {
    throw new Error(
      "Missing critical UI elements required for initialization. Check console.",
    );
  }
  console.log("uiCache: UI element caching finished.");
}
