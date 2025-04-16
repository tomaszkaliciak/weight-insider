// js/main.js
// Main application entry point and initialization sequence.

import { ui, cacheSelectors } from "./ui/uiCache.js";
import { initializeChartSetup } from "./ui/chartSetup.js";
import { EventHandlers } from "./interactions/eventHandlers.js";
import { DataService } from "./core/dataService.js";
import { StateManager } from "./core/stateManager.js";
import { DomainManager } from "./core/domainManager.js";
import { StatsManager } from "./core/statsManager.js";
import { ThemeManager } from "./core/themeManager.js";
import { GoalManager } from "./core/goalManager.js";
import { AnnotationManager } from "./core/annotationManager.js";
import { MasterUpdater } from "./ui/masterUpdater.js";
import { LegendManager } from "./ui/legendManager.js";
import { InsightsGenerator } from "./ui/insightsGenerator.js";
import { StatsDisplayRenderer } from "./ui/renderers/statsDisplayRenderer.js";
import { AnnotationListRenderer } from "./ui/renderers/annotationListRenderer.js";
import { WeeklySummaryUpdater } from "./ui/weeklySummaryUpdater.js";
import { Utils } from "./core/utils.js";
import { CONFIG } from "./config.js";
import * as Selectors from "./core/selectors.js"; // Import selectors

/**
 * Initializes the application step-by-step.
 */
async function initialize() {
  console.log("[Main Init] Application initialization started.");
  try {
    // 0. Initial Dispatch (Optional: good for resetting state on hot reload)
    // StateManager.dispatch({ type: 'INITIALIZE_START' });

    // 1. Cache UI Elements (Essential for subsequent steps)
    cacheSelectors();
    if (!ui.body || !ui.chartContainer) {
      // Basic check
      throw new Error(
        "Essential UI elements (body, chartContainer) not found.",
      );
    }

    // 2. Load Settings (Read from CONFIG, dispatch to state)
    const initialSettings = {
      smaWindow: CONFIG.movingAverageWindow,
      rollingVolatilityWindow: CONFIG.ROLLING_VOLATILITY_WINDOW,
    };
    StateManager.dispatch({ type: "LOAD_SETTINGS", payload: initialSettings });
    console.log(`[Main Init] Dispatched initial settings:`, initialSettings);

    // 3. Initialize Theme (Reads localStorage, dispatches initial theme)
    ThemeManager.init(); // Sets up subscription and applies initial theme

    // 4. Initialize Persistence Managers (Load saved state, dispatch updates)
    GoalManager.init(); // Loads saved goal, dispatches LOAD_GOAL
    AnnotationManager.init(); // Loads saved annotations, dispatches LOAD_ANNOTATIONS

    // 5. Setup Event Handlers (Attaches listeners to UI elements)
    EventHandlers.setupAll(); // Assumes EventHandlers doesn't need state yet

    // 6. Initialize UI Modules that Subscribe to State
    // These need to be ready *before* data/stats updates start flowing
    MasterUpdater.init(); // Listens for state changes to trigger renders
    AnnotationListRenderer.init(); // Listens for annotation changes
    StatsDisplayRenderer.init(); // Listens for display stats updates
    WeeklySummaryUpdater.init(); // Listens for weekly data/sort changes
    LegendManager.init(); // Listens for visibility/goal/etc changes
    InsightsGenerator.init(); // Listens for display stats updates

    // 7. Fetch and Process Data
    const rawDataObjects = await DataService.fetchData();
    const mergedData = DataService.mergeRawData(rawDataObjects);
    const processedData = DataService.processData(mergedData); // Initial processing

    // 8. Set Initial Data in State
    StateManager.dispatch({
      type: "SET_INITIAL_DATA",
      payload: { rawData: mergedData, processedData: processedData },
    });

    // 9. Initialize Trend Config State from UI Defaults (after caching selectors)
    const initialStartDateVal = ui.trendStartDateInput?.property("value");
    const initialWeightVal = ui.trendInitialWeightInput?.property("value");
    const initialWeeklyIncrease1Val =
      ui.trendWeeklyIncrease1Input?.property("value");
    const initialWeeklyIncrease2Val =
      ui.trendWeeklyIncrease2Input?.property("value");
    StateManager.dispatch({
      type: "UPDATE_TREND_CONFIG",
      payload: {
        startDate: initialStartDateVal ? new Date(initialStartDateVal) : null,
        initialWeight: initialWeightVal, // Let reducer parse
        weeklyIncrease1: initialWeeklyIncrease1Val, // Let reducer parse
        weeklyIncrease2: initialWeeklyIncrease2Val, // Let reducer parse
      },
    });
    console.log(
      "[Main Init] Dispatched initial trend config from UI defaults.",
    );

    // 10. Initialize StatsManager (Sets up subscriptions for derived data calc)
    StatsManager.init(); // Sets up subscriptions, initial calc triggered by INITIALIZATION_COMPLETE

    // 11. Initialize Chart Setup (Creates SVGs, scales, axes - BEFORE domain setup)
    if (!initializeChartSetup()) {
      throw new Error("Chart SVG/scale/axis setup failed.");
    }

    // 12. Initialize Domains (Reads state, sets scale domains, dispatches initial range/filter)
    const stateAfterData = StateManager.getState(); // Get state including processed data
    if (Selectors.selectProcessedData(stateAfterData)?.length > 0) {
      DomainManager.initializeDomains(stateAfterData); // Pass snapshot
    } else {
      console.warn(
        "[Main Init] No processed data available. Setting empty domains.",
      );
      DomainManager.setEmptyDomains();
      // Dispatch empty derived data? StatsManager might handle this if it runs.
      StateManager.dispatch({ type: "SET_FILTERED_DATA", payload: [] });
      StateManager.dispatch({ type: "SET_WEEKLY_SUMMARY", payload: [] });
      StateManager.dispatch({ type: "SET_CORRELATION_DATA", payload: [] });
      StateManager.dispatch({
        type: "SET_REGRESSION_RESULT",
        payload: { slope: null, intercept: null, points: [] },
      });
      StateManager.dispatch({ type: "UPDATE_DISPLAY_STATS", payload: {} }); // Send empty stats
    }

    // 13. Restore Initial Viewport (if applicable)
    EventHandlers.restoreViewAfterResize(); // Reads lastZoomTransform state

    // 14. Final Signal: Initialization Complete -> Triggers initial calculations/renders
    StateManager.dispatch({ type: "INITIALIZATION_COMPLETE" });
    console.log("[Main Init] Dispatched INITIALIZATION_COMPLETE.");
    // Initial stats calc (StatsManager) and render (MasterUpdater) are triggered by this event via subscriptions.

    console.log(
      "[Main Init] Application initialization finished successfully.",
    );
  } catch (error) {
    console.error(`[Main Init] Initialization failed"`, error);
    StateManager.dispatch({ type: "INITIALIZATION_FAILED" }); // Signal failure state
    Utils.showCriticalErrorMessage(
      error.message || `An unknown error occurred`,
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  console.log("[Main Init] DOM already ready, initializing.");
  setTimeout(initialize, 0);
}
