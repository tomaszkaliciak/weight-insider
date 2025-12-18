// js/interactions/eventHandlers.js
// Handles user interactions, focusing on dispatching actions to StateManager.

import { StateManager } from "../core/stateManager.js";
import { ui } from "../ui/uiCache.js";
import {
  scales,
  brushes,
  zoom,
  initializeChartSetup,
} from "../ui/chartSetup.js";
import { CONFIG } from "../config.js";
import { Utils } from "../core/utils.js";
import { DomainManager } from "../core/domainManager.js";
import { MasterUpdater } from "../ui/masterUpdater.js";
import { FocusChartUpdater } from "../ui/chartUpdaters.js";
import * as Selectors from "../core/selectors.js";
import { TooltipManager } from "./tooltipManager.js";
import { ChartInteractions } from "./chartInteractions.js";
import { FormHandlers } from "./formHandlers.js";
import { UIInteractions } from "./uiInteractions.js";
import { ResizeHandler } from "./resizeHandler.js";

export const EventHandlers = {
  // --- Setup ---
  setupAll() {
    console.log("EventHandlers: Setting up event listeners...");
    // Use ResizeObserver monitoring the Fullscreen Element (.chart-section)
    // This is more reliable as it is the element that actually changes state
    const chartSection = document.querySelector('.chart-section');
    if (chartSection) {
      const ro = new ResizeObserver((entries) => {
        // Trigger resize handler whenever specific layout element changes
        ResizeHandler.handleResize();
      });
      ro.observe(chartSection);
    } else if (ui.chartContainer && ui.chartContainer.node()) {
      // Fallback to container if section is missing
      const ro = new ResizeObserver(() => ResizeHandler.handleResize());
      ro.observe(ui.chartContainer.node());
    }

    // Backup listener for window resize
    window.addEventListener("resize", ResizeHandler.handleResize);
    ui.themeToggle?.on("click", UIInteractions.handleThemeToggle);
    d3.select("#goal-setting-form").on(
      "submit",
      FormHandlers.handleGoalSubmit,
    );
    ui.annotationForm?.on("submit", (event) => {
      import("../core/annotationManager.js")
        .then(({ AnnotationManager }) => {
          AnnotationManager.handleSubmit(event);
        })
        .catch((err) => console.error("Failed to load AnnotationManager", err));
    });
    ui.updateAnalysisRangeBtn?.on(
      "click",
      FormHandlers.handleAnalysisRangeUpdate,
    );
    ui.analysisStartDateInput?.on(
      "change.range",
      FormHandlers.handleAnalysisRangeInputChange,
    );
    ui.analysisEndDateInput?.on(
      "change.range",
      FormHandlers.handleAnalysisRangeInputChange,
    );
    ui.whatIfSubmitBtn?.on("click", FormHandlers.handleWhatIfSubmit);
    ui.whatIfIntakeInput?.on("keydown", (event) => {
      if (event.key === "Enter") FormHandlers.handleWhatIfSubmit(event);
    });
    ui.whatIfDurationInput?.on("keydown", (event) => {
      if (event.key === "Enter") FormHandlers.handleWhatIfSubmit(event);
    });
    const trendInputs = [
      ui.trendStartDateInput,
      ui.trendInitialWeightInput,
      ui.trendWeeklyIncrease1Input,
      ui.trendWeeklyIncrease2Input,
    ];
    trendInputs.forEach((input) =>
      input?.on("input.trend", FormHandlers.handleTrendlineInputChange),
    );

    // Remove redundant brush/zoom listener attachments - they are now set in chartSetup.js
    // if (brushes.context && ui.brushGroup) {
    //   ui.brushGroup.on(
    //     "brush.handler end.handler",
    //     ChartInteractions.contextBrushed,
    //   );
    // }
    // if (zoom && ui.zoomCaptureRect) {
    //   ui.zoomCaptureRect.on("zoom", ChartInteractions.zoomed);
    // }
    // if (brushes.regression && ui.regressionBrushGroup) {
    //   ui.regressionBrushGroup.on(
    //     "end.handler",
    //     ChartInteractions.regressionBrushed,
    //   );
    // }

    ui.svg?.on("click", ChartInteractions.handleBackgroundClick); // Use ChartInteractions

    d3.select("body").on("click.cardToggle", (event) => {
      const toggleButton = event.target.closest(".card-toggle-btn");
      const heading = event.target.closest("h2");
      if (toggleButton && toggleButton.closest(".card.collapsible")) {
        UIInteractions.handleCardToggle(toggleButton);
      } else if (
        heading &&
        !toggleButton &&
        heading.closest(".card.collapsible")
      ) {
        const cardSection = heading.closest(".card.collapsible");
        const btn = cardSection?.querySelector(".card-toggle-btn");
        if (btn) {
          event.preventDefault();
          UIInteractions.handleCardToggle(btn);
        }
      }
    });
    console.log("EventHandlers: Setup complete.");
  },
};
