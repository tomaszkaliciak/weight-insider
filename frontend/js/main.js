console.log("main.js: Module execution started.");

// --- Module Imports ---
import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { ui, cacheSelectors } from "./uiCache.js";
import { Utils } from "./utils.js";
import { DataService } from "./dataService.js";
import { ThemeManager } from "./themeManager.js";
import { initializeChartSetup } from "./chartSetup.js";
import { DomainManager } from "./domainManager.js";
import { MasterUpdater } from "./masterUpdater.js";
import { StatsManager } from "./statsManager.js";
import { InsightsGenerator } from "./insightsGenerator.js";
import { LegendManager } from "./legendManager.js";
import { AnnotationManager } from "./annotationManager.js";
import { GoalManager } from "./goalManager.js";
import { EventHandlers } from "./eventHandlers.js";
import { WeeklySummaryUpdater } from "./weeklySummaryUpdater.js";
import { StatsManager } from "./stateManager.js";

async function initialize() {
  try {
    cacheSelectors();

    ThemeManager.init();
    MasterUpdater.init();
    LegendManager.init();

    state.regressionStartDate = DataService.getRegressionStartDateFromUI();

    const rawDataObjects = await DataService.fetchData();
    state.rawData = DataService.mergeRawData(rawDataObjects);
    state.processedData = DataService.processData(state.rawData);

    GoalManager.load();
    AnnotationManager.load();

    if (!initializeChartSetup()) {
      throw new Error("Chart UI setup failed. Dimensions might be invalid.");
    }

    if (state.processedData?.length > 0) {
      DomainManager.initializeDomains(state.processedData);
      EventHandlers.syncBrushAndZoomToFocus();
    } else {
      console.warn(
        "Initialization: No data available. Chart will be mostly empty.",
      );
      DomainManager.setEmptyDomains();
    }

    AnnotationManager.renderList();
    EventHandlers.setupAll();

    state.isInitialized = true;
    MasterUpdater.updateAllCharts(); // Initial draw of all chart elements
    StatsManager.update(); // Initial calculation, display of statistics
    LegendManager.build();
  } catch (error) {
    console.error("CRITICAL INITIALIZATION ERROR:", error);
    state.isInitialized = false;

    if (ui.chartContainer && !ui.chartContainer.empty()) {
      Utils.showCriticalErrorMessage(
        error.message ||
          'Could not render the chart due to an error:${error.message || "Unknown error"}',
        "Please check the browser console for more details or try reloading the page",
      );
    } else {
      Utils.showCriticalErrorMessage(
        error.message || "Critical Error. Chart container not found",
      );
    }
  }
}

if (document.readyState === "loading") {
  console.log("main.js: DOM not ready, adding listener.");
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  console.log("main.js: DOM already ready, initializing.");
  setTimeout(initialize, 0);
}

console.log("main.js: Module execution finished.");
