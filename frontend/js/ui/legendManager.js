// js/ui/legendManager.js
// Manages the creation and interaction of the chart legend based on application state.

import { StateManager } from "../core/stateManager.js";
import { ui } from "./uiCache.js";
import { colors } from "../core/themeManager.js"; // Needed for swatch colors
import { CONFIG } from "../config.js";
import * as Selectors from "../core/selectors.js"; // Import selectors

export const LegendManager = {
  /**
   * Dispatches actions to toggle the visibility of a specific data series.
   * Handles synchronization for related series (e.g., regression + CI).
   * @param {string} seriesId - The ID of the series to toggle.
   * @param {boolean} isVisible - The desired visibility state.
   */
  toggleSeriesVisibility(seriesId, isVisible) {
    console.log(`[LM Toggle] Dispatching actions for "${seriesId}" to ${isVisible}.`);
    const currentVisibilityState = Selectors.selectSeriesVisibility(StateManager.getState()); // Use selector

    if (!currentVisibilityState.hasOwnProperty(seriesId)) {
      console.warn(`[LM Toggle] Attempted to toggle unknown series: ${seriesId}`);
      return;
    }

    // Dispatch the primary action
    StateManager.dispatch({
        type: 'TOGGLE_SERIES_VISIBILITY',
        payload: { seriesId, isVisible }
    });

    // Synchronize related items
     // If toggling SMA Line off, also toggle SMA Band off? (Optional business logic)
     /* if (seriesId === "smaLine" && !isVisible && currentVisibilityState.smaBand) {
         StateManager.dispatch({
             type: 'TOGGLE_SERIES_VISIBILITY',
             payload: { seriesId: 'smaBand', isVisible: false }
         });
     } else if (seriesId === "smaBand" && isVisible && !currentVisibilityState.smaLine) {
          StateManager.dispatch({
             type: 'TOGGLE_SERIES_VISIBILITY',
             payload: { seriesId: 'smaLine', isVisible: true }
         });
     } */

    // State change subscriptions will handle UI updates (rebuilding legend, redrawing charts)
    console.log(`[LM Toggle] END: Dispatched actions for "${seriesId}"`);
  },

  // updateAppearance method removed - handled by build()

  /**
   * Builds or rebuilds the legend items in the legend container
   * based on the current application state (visibility, goal, annotations, etc.).
   */
  _build() {
    console.log('[LM Build] Build function called.');

    if (!ui.legendContainer || ui.legendContainer.empty()) {
      console.warn("[LM Build] Legend container not found.");
      return;
    }

    // Get current state needed for building the legend using selectors
    const stateSnapshot = StateManager.getState();
    const currentVisibility = Selectors.selectSeriesVisibility(stateSnapshot);
    const goal = Selectors.selectGoal(stateSnapshot);
    const annotations = Selectors.selectAnnotations(stateSnapshot);
    const plateaus = Selectors.selectPlateaus(stateSnapshot);
    const trendChangePoints = Selectors.selectTrendChangePoints(stateSnapshot);
    const processedData = Selectors.selectProcessedData(stateSnapshot);

    ui.legendContainer.html(""); // Clear previous legend items

    if (Object.keys(colors).length === 0 || !processedData || processedData.length === 0) {
      console.warn("[LM Build] Prerequisites not met (colors or data missing).");
      ui.legendContainer.append("span").attr("class", "legend-empty-msg").text("Legend requires data.");
      return;
    }

    // Define the configuration for all possible legend items
    // Conditionally add items based on whether relevant data exists in the *state*
    const legendItemsConfig = [
      { id: "raw", label: "Raw Data", type: "dot", colorKey: "rawDot", styleClass: "raw-dot" },
      { id: "smaLine", label: `Weight SMA (${CONFIG.movingAverageWindow}d)`, type: "line", colorKey: "sma", styleClass: "sma-line" },
      { id: "emaLine", label: `Weight EMA (${CONFIG.emaWindow}d)`, type: "line", colorKey: "ema", styleClass: "ema-line", dash: "5, 3" },
      { id: "smaBand", label: "SMA Band (±SD)", type: "area", colorKey: "band", styleClass: "band-area" },
      { id: "regression", label: "Lin. Regression", type: "line", colorKey: "regression", styleClass: "regression-line" },
      // { id: "regressionCI", label: "Regression 95% CI", type: "area", colorKey: "regressionCI", styleClass: "regression-ci-area" },
      { id: "trend1", label: "Manual Trend 1", type: "line", colorKey: "trend1", styleClass: "manual-trend-1", dash: "4, 4" },
      { id: "trend2", label: "Manual Trend 2", type: "line", colorKey: "trend2", styleClass: "manual-trend-2", dash: "4, 4" },
      ...(goal.weight != null ? [{ id: "goal", label: "Goal Path", type: "line", colorKey: "goal", styleClass: "goal-line", dash: "6, 3" }] : []),
      { id: "rateMA", label: `Rate MA (${CONFIG.rateMovingAverageWindow}d)`, type: "line", colorKey: "rateMALine", styleClass: "rate-ma-line", dash: "2, 2" },
      ...(annotations && annotations.length > 0 ? [{ id: "annotations", label: "Annotations", type: "marker", colorKey: "annotationMarker", styleClass: "annotation-marker" }] : []),
      ...(plateaus && plateaus.length > 0 ? [{ id: "plateaus", label: "Plateaus", type: "area", colorKey: "plateauColor", styleClass: "plateau-region" }] : []),
      ...(trendChangePoints && trendChangePoints.length > 0 ? [{ id: "trendChanges", label: "Trend Δ", type: "marker", colorKey: "trendChangeColor", styleClass: "trend-change-marker" }] : []),
    ];

    console.log("[LM Build] Legend items config generated:", legendItemsConfig.map(i => i.id));

    // Create legend items based on the config and current visibility state
    legendItemsConfig.forEach((item) => {
      // Check if visibility state exists for this item ID
      if (!currentVisibility.hasOwnProperty(item.id)) {
         console.warn(`[LM Build] Visibility state missing for legend item: ${item.id}`);
         return; // Skip item if no visibility state is defined
      }

      const isVisible = currentVisibility[item.id]; // Get visibility from state
      const itemColor = colors[item.colorKey] || "#000000"; // Use theme colors

      const itemDiv = ui.legendContainer.append("div")
          .attr("class", `legend-item ${item.styleClass || ""}`)
          .attr("data-id", item.id)
          .classed("hidden", item.id !== "raw" && !isVisible) // Apply 'hidden' based on state
          .on("click", () => {
              // Read the *current* visibility state at the time of the click
              const visibilityOnClick = Selectors.selectSeriesVisibility(StateManager.getState())[item.id];
              console.log(`[Legend Click] Clicked on: ${item.id}. Current visibility: ${visibilityOnClick}. Toggling to ${!visibilityOnClick}.`);
              // Call method to dispatch toggle actions
              LegendManager.toggleSeriesVisibility(item.id, !visibilityOnClick);
          });

      const swatch = itemDiv.append("span").attr("class", `legend-swatch type-${item.type}`);

      // Style swatch (same logic as before)
        switch (item.type) {
          case "dot": case "marker": swatch.style("background-color", itemColor); break;
          case "area": swatch.style("background-color", itemColor).style("opacity", 0.6); break;
          case "line":
            swatch.style("background-color", itemColor).style("height", "4px").style("border", "none");
            if (item.dash) {
                const dashLength = item.dash.split(",")[0].trim(); const gapLength = item.dash.split(",")[1]?.trim() || dashLength;
                const totalLength = parseFloat(dashLength) + parseFloat(gapLength); const dashPercent = (parseFloat(dashLength) / totalLength) * 100;
                swatch.style("background-image", `linear-gradient(to right, ${itemColor} ${dashPercent}%, transparent ${dashPercent}%)`)
                      .style("background-size", `${totalLength}px 4px`).style("background-color", "transparent");
            } break;
        }

      itemDiv.append("span").attr("class", "legend-text").text(item.label);
    });
    console.log("[LM Build] Finished legend build.");
  },

  /**
   * Initializes subscriptions to relevant state changes.
   */
  init() {
    // Define events that require the legend to be rebuilt or appearance updated
    const rebuildEvents = [
        'state:visibilityChanged', // Visibility directly affects appearance
        'state:goalChanged', // Goal item presence might change
        'state:annotationsChanged', // Annotation item presence might change
        'state:plateausChanged', // Plateau item presence might change
        'state:trendChangesChanged', // Trend change item presence might change
        'state:themeUpdated', // Colors change
        'state:initializationComplete', // Build initially when ready
    ];

    rebuildEvents.forEach(eventName => {
         StateManager.subscribeToSpecificEvent(eventName, () => {
            console.log(`[LegendManager] Received event: ${eventName}. Rebuilding legend.`);
            this._build(); // Rebuild the legend fully
        });
    });

    console.log("[LM Init] Subscribed to relevant state changes.");
    // Initial build will happen upon 'state:initializationComplete'
  },
};