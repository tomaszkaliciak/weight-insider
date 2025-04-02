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
import { EventHandlers } from "./eventHandlers.js";
import { WeeklySummaryUpdater } from "./weeklySummaryUpdater.js";

async function initialize() {

  try {
    cacheSelectors();

    ThemeManager.init();

    state.regressionStartDate = DataService.getRegressionStartDateFromUI();

    const rawDataObjects = await DataService.fetchData();
    state.rawData = DataService.mergeRawData(rawDataObjects);
    state.processedData = DataService.processData(state.rawData);

    DataService.loadGoal();
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
      DomainManager.setXDomains([]);
      DomainManager.setContextYDomain([]);
      DomainManager.setFocusYDomains([], null);
      DomainManager.setSecondaryYDomains([]);
      DomainManager.setScatterPlotDomains([]);
    }

    AnnotationManager.renderList();

    EventHandlers.setupAll();

    state.isInitialized = true;
    MasterUpdater.updateAllCharts(); // Initial draw of all chart elements
    StatsManager.update(); // Initial calculation, display of statistics, AND LEGEND BUILD
  } catch (error) {
    console.error("CRITICAL INITIALIZATION ERROR:", error);
    state.isInitialized = false; // Ensure state reflects failure

    if (ui.chartContainer && !ui.chartContainer.empty()) {

      Utils.showCriticalErrorMessage(error.message || "Could not render the chart due to an error:${error.message || \"Unknown error\"}",
        "Please check the browser console for more details or try reloading the page");
    } else {
      Utils.showCriticalErrorMessage(error.message || "Critical Error. Chart container not found");
    }

    d3.selectAll(
      ".dashboard-container > *:not(.chart-section), .left-sidebar > *, .right-sidebar > *",
    )
      .style("opacity", 0.3)
      .style("pointer-events", "none");
    ui.chartContainer?.style("opacity", 1).style("pointer-events", "auto"); // Ensure error message is interactive
  }
}


// Use DOMContentLoaded to ensure the DOM is ready before caching selectors and initializing
if (document.readyState === "loading") {
  console.log("main.js: DOM not ready, adding listener.");
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  // DOM is already ready, execute immediately
  // Use setTimeout to ensure it runs after the current JS execution cycle
  console.log("main.js: DOM already ready, initializing.");
  setTimeout(initialize, 0);
}

console.log("main.js: Module execution finished.");
