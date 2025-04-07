// masterUpdater.js
// Orchestrates updates across all chart components.

import { state } from "../state.js";
import { scales } from "./chartSetup.js";
import { ui } from "./uiCache.js";
import { Utils } from "../core/utils.js";
import { DomainManager } from "../core/domainManager.js";
import {
  FocusChartUpdater,
  ContextChartUpdater,
  BalanceChartUpdater,
  RateChartUpdater,
  TDEEDiffChartUpdater,
  ScatterPlotUpdater,
} from "./chartUpdaters.js";
import { DataService } from "../core/dataService.js";
import { EventHandlers } from "../interactions/eventHandlers.js";
import { EventBus } from "../core/eventBus.js";

// --- UI Helper Functions (Moved from EventHandlers) ---

/** Updates the analysis range date input fields to match the current view */
function _updateAnalysisRangeInputsFromCurrentView() {
  const range = EventHandlers.getAnalysisDateRange();
  ui.analysisStartDateInput?.property("value", Utils.formatDate(range.start));
  ui.analysisEndDateInput?.property("value", Utils.formatDate(range.end));
}

/** Updates the display text showing the current analysis range */
function _updateAnalysisRangeDisplay() {
  const range = EventHandlers.getAnalysisDateRange();
  const displayStr =
    range.start && range.end
      ? `${Utils.formatDateShort(range.start)} - ${Utils.formatDateShort(range.end)}`
      : "Full Range";

  // Use cached node for direct text update
  if (ui.statElements.analysisRangeDisplay) {
    ui.statElements.analysisRangeDisplay.textContent = displayStr;
  }
  // Update the small text in the results heading
  if (ui.analysisResultsHeading && !ui.analysisResultsHeading.empty()) {
    const headingSmallText = state.analysisRange.isCustom
      ? "(Custom Range)"
      : "(Chart View)";
    ui.analysisResultsHeading.select("small").text(headingSmallText);
  }
}

export const MasterUpdater = {
  /**
   * Updates all chart components based on the current state and domains.
   * Typically called after interactions like zoom, brush, or visibility changes.
   */

  init() {
    EventBus.subscribe("state::themeUpdated", this.updateAllCharts);
  },

  updateAllCharts() {
    if (!state.isInitialized || !scales.x) {
      console.warn(
        "MasterUpdater: Skipping update - chart not initialized or scales missing.",
      );
      return;
    }

    // --- Pre-calculations ---

    // 1. Calculate Regression for the current effective range *once*
    const regressionRange = EventHandlers.getEffectiveRegressionRange();
    let regressionResult = null;
    if (regressionRange.start && regressionRange.end) {
      const regressionData = state.processedData.filter(
        (d) =>
          d.date instanceof Date &&
          d.date >= regressionRange.start &&
          d.date <= regressionRange.end &&
          d.value != null &&
          !d.isOutlier,
      );
      regressionResult = DataService.calculateLinearRegression(
        regressionData,
        regressionRange.start,
      );
    } else {
      regressionResult = {
        slope: null,
        intercept: null,
        points: [],
        pointsWithCI: [],
      };
    }

    // 2. Recalculate domains based on the current interaction state (zoom/brush)
    DomainManager.updateDomainsOnInteraction(); // Pass result IN

    // 3. Get the data relevant for the current view (updated by DomainManager)
    const visibleProcessedData = state.filteredData;
    const visibleValidSmaData = visibleProcessedData.filter(
      (d) => d.sma != null,
    );
    const visibleRawWeightData = visibleProcessedData.filter(
      (d) => d.value != null,
    );

    // 4. Get current dimensions
    const xRangeFocus = scales.x?.range();
    const yRangeFocus = scales.y?.range();
    const focusWidth = xRangeFocus
      ? Math.abs(xRangeFocus[1] - xRangeFocus[0])
      : 0;
    const focusHeight = yRangeFocus
      ? Math.abs(yRangeFocus[0] - yRangeFocus[1])
      : 0;
    const xRangeBal = scales.xBalance?.range();
    const balWidth = xRangeBal ? Math.abs(xRangeBal[1] - xRangeBal[0]) : 0;
    const xRangeRate = scales.xRate?.range();
    const rateWidth = xRangeRate ? Math.abs(xRangeRate[1] - xRangeRate[0]) : 0;
    const xRangeTdee = scales.xTdeeDiff?.range();
    const tdeeWidth = xRangeTdee ? Math.abs(xRangeTdee[1] - xRangeTdee[0]) : 0;

    // --- Update Visual Components ---

    // Axes
    FocusChartUpdater.updateAxes(focusWidth, focusHeight);
    ContextChartUpdater.updateAxes();
    BalanceChartUpdater.updateAxes(balWidth);
    RateChartUpdater.updateAxes(rateWidth);
    TDEEDiffChartUpdater.updateAxes(tdeeWidth);
    ScatterPlotUpdater.updateAxes();

    // Paths & Areas (Focus Chart)
    FocusChartUpdater.updatePaths(visibleValidSmaData, regressionResult);

    // Dots & Markers (Focus Chart)
    FocusChartUpdater.updateDots(visibleRawWeightData);
    FocusChartUpdater.updateHighlightMarker(visibleRawWeightData);
    FocusChartUpdater.updateCrosshair(
      state.activeHoverData,
      focusWidth,
      focusHeight,
    );
    FocusChartUpdater.updateAnnotations(visibleProcessedData);
    FocusChartUpdater.updatePlateauRegions(focusHeight);
    FocusChartUpdater.updateTrendChangeMarkers(state.processedData);

    // <<< CALL Goal Visuals Update >>>
    FocusChartUpdater.updateGoalVisuals(focusWidth, focusHeight);

    // Brushes
    FocusChartUpdater.updateRegressionBrushDisplay(focusWidth);

    // Secondary Charts
    ContextChartUpdater.updateChart(state.processedData);
    BalanceChartUpdater.updateChart(visibleProcessedData, balWidth);
    RateChartUpdater.updateChart(visibleProcessedData, rateWidth);
    TDEEDiffChartUpdater.updateChart(visibleProcessedData);
    // Scatter plot updated by StatsManager

    // --- Update Miscellaneous UI Elements Related to View ---
    if (!state.analysisRange.isCustom) {
      _updateAnalysisRangeInputsFromCurrentView();
    }
    _updateAnalysisRangeDisplay();
  },
};
