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

    // 5. Load Persistent User Settings
    DataService.loadGoal(); // Loads goal from localStorage into state
    AnnotationManager.load(); // Loads annotations from localStorage into state

    // 6. Initialize Chart SVG Elements, Scales, Axes, Brushes, Zoom
    if (!initializeChartSetup()) {
      // Creates SVG/D3 constructs
      throw new Error("Chart UI setup failed. Dimensions might be invalid.");
    }

    // 7. Initialize Chart Domains
    if (state.processedData?.length > 0) {
      DomainManager.initializeDomains(state.processedData); // Sets initial view/domains
      // Initial sync of brush/zoom after domains are set
      EventHandlers.syncBrushAndZoomToFocus();
    } else {
      console.warn(
        "Initialization: No data available. Chart will be mostly empty.",
      );
      // Set empty domains if no data
      DomainManager.setXDomains([]);
      DomainManager.setContextYDomain([]);
      DomainManager.setFocusYDomains([], null);
      DomainManager.setSecondaryYDomains([]);
      DomainManager.setScatterPlotDomains([]);
    }

    // 8. Build UI Components Dependent on Initial State/Data
    // <<<---- LEGEND BUILD REMOVED FROM HERE ---->>>
    // LegendManager.build(); // Now handled by StatsManager.update()
    AnnotationManager.renderList(); // Render annotation list initially

    // 9. Setup Event Handlers
    EventHandlers.setupAll(); // Attaches listeners to controls, chart elements etc.

    // 10. Mark as Initialized and Perform Initial Render/Update
    state.isInitialized = true;
    MasterUpdater.updateAllCharts(); // Initial draw of all chart elements
    StatsManager.update(); // Initial calculation, display of statistics, AND LEGEND BUILD
  } catch (error) {
    console.error("CRITICAL INITIALIZATION ERROR:", error);
    state.isInitialized = false; // Ensure state reflects failure

    // Display a user-friendly error message in the chart container
    if (ui.chartContainer && !ui.chartContainer.empty()) {
      ui.chartContainer.html(
        `<div class="init-error"><h2>Chart Initialization Failed</h2><p>Could not render the chart due to an error:</p><pre>${error.message || "Unknown error"}</pre><p>Please check the browser console for more details or try reloading the page.</p></div>`,
      );
    } else {
      // Fallback if chart container itself isn't available
      document.body.innerHTML = `<div class="init-error"><h2>Critical Error</h2><p>Chart container not found. ${error.message || ""}</p></div>`;
    }

    // Optionally disable other parts of the UI
    d3.selectAll(
      ".dashboard-container > *:not(.chart-section), .left-sidebar > *, .right-sidebar > *",
    )
      .style("opacity", 0.3)
      .style("pointer-events", "none");
    ui.chartContainer?.style("opacity", 1).style("pointer-events", "auto"); // Ensure error message is interactive
  }
}

// --- Run Initialization ---

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
