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
import { PeriodizationRenderer } from "./ui/renderers/periodizationRenderer.js";
import { PeriodComparisonRenderer } from "./ui/renderers/periodComparisonRenderer.js";
import { GoalAlertRenderer } from "./ui/renderers/goalAlertRenderer.js";
import { GoalSuggestionRenderer } from "./ui/renderers/goalSuggestionRenderer.js";
import { EventCountdownRenderer } from "./ui/renderers/eventCountdownRenderer.js";
import { WeekendAnalysisRenderer } from "./ui/renderers/weekendAnalysisRenderer.js";
import { PredictionBandsRenderer } from "./ui/renderers/predictionBandsRenderer.js";
import { AdaptiveRateRenderer } from "./ui/renderers/adaptiveRateRenderer.js";
import { CalorieAuditRenderer } from "./ui/renderers/calorieAuditRenderer.js";
import { MonthlyReportRenderer } from "./ui/renderers/monthlyReportRenderer.js";
import { WhatWorkedRenderer } from "./ui/renderers/whatWorkedRenderer.js";
import { PlateauBreakerRenderer } from "./ui/renderers/plateauBreakerRenderer.js";
import { RollingAveragesRenderer } from "./ui/renderers/rollingAveragesRenderer.js";
import { TdeeAccuracyRenderer } from "./ui/renderers/tdeeAccuracyRenderer.js";
import { CalorieHeatmapRenderer } from "./ui/renderers/calorieHeatmapRenderer.js";
import { StreakTrackerRenderer } from "./ui/renderers/streakTrackerRenderer.js";
import { WaterWeightRenderer } from "./ui/renderers/waterWeightRenderer.js";
import { ReverseDietRenderer } from "./ui/renderers/reverseDietRenderer.js";
import { RateOptimizerRenderer } from "./ui/renderers/rateOptimizerRenderer.js";
import { WeeklySummaryUpdater } from "./ui/weeklySummaryUpdater.js";
import { Utils } from "./core/utils.js";
import { CONFIG } from "./config.js";
import * as Selectors from "./core/selectors.js";
import { ResizeHandler } from "./interactions/resizeHandler.js";
import { SidebarTabs } from "./ui/sidebarTabs.js";
import { ProgressRing } from "./ui/components/progressRing.js";
import { QuickStatsRenderer } from "./ui/renderers/quickStatsRenderer.js";
import { KeyboardNav } from "./interactions/keyboardNav.js";
import { SparklineRenderer } from "./ui/renderers/sparklineRenderer.js";
import { EnergyBalanceRenderer } from "./ui/renderers/energyBalanceRenderer.js";
import { SmartCoachRenderer } from "./ui/renderers/smartCoachRenderer.js";
import { WeeklyReviewRenderer } from "./ui/renderers/weeklyReviewRenderer.js";
import { ExecutiveHubRenderer } from "./ui/renderers/executiveHubRenderer.js";
import { MacroCorrelationRenderer } from "./ui/renderers/macroCorrelationRenderer.js";
import { CorrelationMatrixRenderer } from "./ui/renderers/correlationMatrixRenderer.js";
import { MetabolicAdaptationRenderer } from "./ui/renderers/metabolicAdaptationRenderer.js";
import { GoalSimulatorRenderer } from "./ui/renderers/goalSimulatorRenderer.js";
import { EnergySankeyRenderer } from "./ui/renderers/energySankeyRenderer.js";
import { DataTableModal } from "./ui/dataTableModal.js";
import { ChartControls } from "./ui/chartControls.js";
import { VitalStatsEnricher } from "./ui/renderers/vitalStatsEnricher.js";
import { WidgetCollapser } from "./ui/widgetCollapser.js";
import { MobileNav } from "./ui/mobileNav.js";
import { ManualEntryWidget } from "./ui/manualEntryWidget.js";
import { ManualEntryService } from "./core/manualEntryService.js";
import { MacroSummaryRenderer } from "./ui/renderers/macroSummaryRenderer.js";
import { ProteinAdequacyRenderer } from "./ui/renderers/proteinAdequacyRenderer.js";
import { WidgetOrderManager } from "./ui/widgetOrderManager.js";
import { DashboardPresets } from "./ui/dashboardPresets.js";

/**
 * Defers renderer.init() until the element with anchorId enters the viewport.
 * Falls back to eager init if the element does not exist or IntersectionObserver
 * is unavailable.
 * @param {{ init: Function }} renderer
 * @param {string} anchorId - ID of the bento widget to observe.
 */
function lazyInit(renderer, anchorId) {
  const el = document.getElementById(anchorId);
  if (!el || typeof IntersectionObserver === 'undefined') {
    renderer.init();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        renderer.init();
      }
    },
    { rootMargin: '300px' }, // start loading 300 px before widget is visible
  );
  observer.observe(el);
}

/**
 * Initializes the application step-by-step.
 */
async function initialize() {
  try {
    // 1. Cache UI Elements
    cacheSelectors();
    if (!ui.body || !ui.chartContainer) {
      throw new Error(
        "Essential UI elements (body, chartContainer) not found.",
      );
    }

    // 1a. Apply saved widget order BEFORE collapse/renderers so DOM order is stable.
    WidgetOrderManager.applyOrder();

    // 1b. Initialize Sidebar Tabs
    SidebarTabs.init();

    // 1c. Initialize Chart Controls (Fullscreen, etc.)
    ChartControls.init();

    // 1d. Initialize Widget Collapse/Expand
    WidgetCollapser.init();

    // 1d-ii. Dashboard presets (must run after WidgetCollapser.init so it can override)
    DashboardPresets.init();

    // 1e. Mobile navigation FAB
    MobileNav.init();

    // 1f. Manual entry widget
    ManualEntryWidget.init();


    // 2. Load Settings (Read from CONFIG, dispatch to state)
    const initialSettings = {
      smaWindow: CONFIG.movingAverageWindow,
      rollingVolatilityWindow: CONFIG.ROLLING_VOLATILITY_WINDOW,
    };
    StateManager.dispatch({ type: "LOAD_SETTINGS", payload: initialSettings });

    // 3. Initialize Theme (Reads localStorage, dispatches initial theme)
    ThemeManager.init(); // Sets up subscription and applies initial theme

    // 4. Initialize Persistence Managers (Load saved state, dispatch updates)
    GoalManager.init(); // Loads saved goal, dispatches LOAD_GOAL
    AnnotationManager.init(); // Loads saved annotations, dispatches LOAD_ANNOTATIONS

    // 5. Setup Event Handlers (Attaches listeners to UI elements)
    EventHandlers.setupAll();

    // 6. Initialize UI Modules that Subscribe to State
    // Critical renderers (above-the-fold or non-visual) are initialized immediately.
    // Below-the-fold bento widgets are deferred via lazyInit (IntersectionObserver)
    // so they only subscribe to state and build DOM once they are about to scroll
    // into view — reducing startup CPU and memory cost.

    // --- Critical: always initialize immediately ---
    MasterUpdater.init();
    ExecutiveHubRenderer.init();
    AnnotationListRenderer.init();
    StatsDisplayRenderer.init();
    GoalAlertRenderer.init();
    VitalStatsEnricher.init();
    GoalSuggestionRenderer.init();
    SmartCoachRenderer.init();
    TdeeAccuracyRenderer.init();
    WeeklySummaryUpdater.init();
    LegendManager.init();
    InsightsGenerator.init();
    ProgressRing.init();
    QuickStatsRenderer.init();
    KeyboardNav.init();
    SparklineRenderer.init();
    DataTableModal.init();

    // Sidebar/non-bento renderers: init immediately (they target hidden panels,
    // IntersectionObserver would never fire for collapsed sidebar content).
    MacroCorrelationRenderer.init();
    PeriodizationRenderer.init();
    PeriodComparisonRenderer.init();
    EventCountdownRenderer.init();
    WeekendAnalysisRenderer.init();
    PredictionBandsRenderer.init();
    AdaptiveRateRenderer.init();
    CalorieAuditRenderer.init();
    MonthlyReportRenderer.init();
    WhatWorkedRenderer.init();
    PlateauBreakerRenderer.init();
    RollingAveragesRenderer.init();
    StreakTrackerRenderer.init();
    WaterWeightRenderer.init();
    ReverseDietRenderer.init();
    RateOptimizerRenderer.init();
    MetabolicAdaptationRenderer.init();
    GoalSimulatorRenderer.init();

    // --- Deferred: bento widgets below the fold ---
    lazyInit(EnergyBalanceRenderer,    'energy-balance-card');
    lazyInit(EnergySankeyRenderer,     'energy-sankey-card');
    lazyInit(MacroSummaryRenderer,     'macro-summary-card');
    lazyInit(ProteinAdequacyRenderer,  'protein-adequacy-card');
    lazyInit(WeeklyReviewRenderer,     'weekly-review-card');
    lazyInit(CalorieHeatmapRenderer,   'calorie-heatmap-card');
    lazyInit(CorrelationMatrixRenderer,'correlation-matrix-card');

    // 7. Fetch and Process Data
    const fetchedRaw = await DataService.fetchData();
    // Overlay any manually-entered records (localStorage) onto the fetched data.
    const rawDataObjects = ManualEntryService.mergeInto(fetchedRaw);
    const mergedData = DataService.mergeRawData(rawDataObjects);
    // Apply processing steps sequentially using the new DataService methods
    let processedData = DataService.calculateBodyComposition(mergedData);
    processedData = DataService.calculateSMAAndStdDev(processedData);
    processedData = DataService.calculateEMA(processedData);
    processedData = DataService.identifyOutliers(processedData);
    processedData = DataService.calculateRollingVolatility(processedData); // Uses default window from CONFIG
    processedData = DataService.calculateDailyRatesAndTDEETrend(processedData);
    processedData = DataService.calculateAdaptiveTDEE(processedData); // Uses default window from CONFIG
    processedData = DataService.smoothRatesAndTDEEDifference(processedData);
    processedData = DataService.calculateRateMovingAverage(processedData);

    // 8. Set Initial Data in State
    StateManager.dispatch({
      type: "SET_INITIAL_DATA",
      payload: { rawData: mergedData, processedData: processedData },
    });

    // 9. Initialize Trend Config State from UI Defaults (after caching selectors)
    const initialStartDateVal = ui.trendStartDateInput?.property("value");

    StateManager.dispatch({
      type: "UPDATE_TREND_CONFIG",
      payload: {
        startDate: initialStartDateVal ? new Date(initialStartDateVal) : null,
        initialWeight: ui.trendInitialWeightInput?.property("value"),
        weeklyIncrease1: ui.trendWeeklyIncrease1Input?.property("value"),
        weeklyIncrease2: ui.trendWeeklyIncrease2Input?.property("value"),
      },
    });

    // 10. Initialize Resize Handler (Binds window resize and fullscreen events)
    ResizeHandler.init();

    // 11. Initialize StatsManager (Sets up subscriptions for derived data calc)
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
      StateManager.dispatch({ type: "SET_FILTERED_DATA", payload: [] });
      StateManager.dispatch({ type: "SET_WEEKLY_SUMMARY", payload: [] });
      StateManager.dispatch({ type: "SET_CORRELATION_DATA", payload: [] });
      StateManager.dispatch({
        type: "SET_REGRESSION_RESULT",
        payload: { slope: null, intercept: null, points: [] },
      });
      StateManager.dispatch({ type: "UPDATE_DISPLAY_STATS", payload: {} });
    }

    // 13. Restore Initial Viewport (if applicable)
    // Get the analysis range *after* domains have been initialized
    const stateAfterDomains = StateManager.getState();
    const initialAnalysisRange = Selectors.selectAnalysisRange(stateAfterDomains);
    ResizeHandler.restoreViewAfterResize(initialAnalysisRange); // Use ResizeHandler and pass range

    // 14. Final Signal: Initialization Complete -> Triggers initial calculations/renders
    StateManager.dispatch({ type: "INITIALIZATION_COMPLETE" });
    // Initial stats calc (StatsManager) and render (MasterUpdater) are triggered by this event via subscriptions.

    // 15. Enable drag-and-drop reordering now that all renderers and content are in place.
    WidgetOrderManager.initSortable();

  } catch (error) {
    console.error(`[Main Init] Initialization failed"`, error);
    StateManager.dispatch({ type: "INITIALIZATION_FAILED" });
    Utils.showCriticalErrorMessage(
      error.message || `An unknown error occurred`,
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  setTimeout(initialize, 0);
}

// Register service worker and listen for data-update messages from the SW.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .catch((err) => console.warn("[SW] Registration failed:", err));

  navigator.serviceWorker.addEventListener("message", (event) => {
    const { type } = event.data || {};
    if (type === "DATA_UPDATED") {
      Utils.showStatusMessage(
        "New data available — reload the page to apply.",
        "info",
        8000,
      );
    } else if (type === "SERVING_CACHED_DATA") {
      Utils.showStatusMessage(
        "You appear to be offline. Showing cached data.",
        "warn",
        5000,
      );
    }
  });
}
