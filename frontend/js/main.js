console.log("main.js: Module execution started.");

import { EventBus } from "./core/eventBus.js";
import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { ui, cacheSelectors } from "./ui/uiCache.js";
import { Utils } from "./core/utils.js";
import { DataService } from "./core/dataService.js";
import { ThemeManager } from "./core/themeManager.js";
import { initializeChartSetup } from "./ui/chartSetup.js";
import { DomainManager } from "./core/domainManager.js";
import { MasterUpdater } from "./ui/masterUpdater.js";
import { StatsManager } from "./core/statsManager.js";
import { InsightsGenerator } from "./ui/insightsGenerator.js";
import { LegendManager } from "./ui/legendManager.js";
import { AnnotationManager } from "./core/annotationManager.js";
import { GoalManager } from "./core/goalManager.js";
import { EventHandlers } from "./interactions/eventHandlers.js";
import { WeeklySummaryUpdater } from "./ui/weeklySummaryUpdater.js";
import { AnnotationListRenderer } from "./ui/renderers/annotationListRenderer.js";
import { StatsDisplayRenderer } from "./ui/renderers/statsDisplayRenderer.js";
import { initChartSubs } from "./ui/chartUpdaters.js";

async function initialize() {
  try {
    cacheSelectors();

    ThemeManager.init();
    MasterUpdater.init();
    AnnotationListRenderer.init();
    StatsDisplayRenderer.init();
    initChartSubs();
    WeeklySummaryUpdater.init();
    LegendManager.init();
    InsightsGenerator.init();

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

    AnnotationListRenderer.render();
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
