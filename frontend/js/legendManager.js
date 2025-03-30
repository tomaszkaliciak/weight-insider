// legendManager.js
// Manages the creation and interaction of the chart legend.

import { state } from "./state.js";
import { ui } from "./uiCache.js";
import { colors } from "./themeManager.js"; // Import calculated colors
import { CONFIG } from "./config.js"; // For default window size display
// Import updaters/managers needed when toggling visibility
import { MasterUpdater } from "./masterUpdater.js";
import { StatsManager } from "./statsManager.js"; // Still needed? Keep import for now.
import { EventHandlers } from "./eventHandlers.js"; // Needed for pinned tooltip updates

export const LegendManager = {
  /**
   * Toggles the visibility of a specific data series on the chart.
   * @param {string} seriesId - The ID of the series to toggle (e.g., 'raw', 'smaLine', 'regression', 'trendChanges').
   * @param {boolean} isVisible - The desired visibility state (true for visible, false for hidden).
   */
  toggleSeriesVisibility(seriesId, isVisible) {
    // <<< --- ADD LOG --- >>>
    console.log(
      `[LM Toggle] START: Toggling "${seriesId}" to ${isVisible}. Current state before toggle: ${state.seriesVisibility[seriesId]}`,
    ); // Updated Log

    // Ensure the series ID is valid
    if (!state.seriesVisibility.hasOwnProperty(seriesId)) {
      console.warn(
        `[LM Toggle] Attempted to toggle unknown series: ${seriesId}`,
      );
      return;
    }

    // Update the visibility state
    state.seriesVisibility[seriesId] = isVisible;
    // <<< --- ADD LOG --- >>>
    console.log(
      `[LM Toggle] State updated: state.seriesVisibility.${seriesId} = ${state.seriesVisibility[seriesId]}`,
    );

    // --- Special handling for linked series ---
    // Regression <-> Regression CI
    if (seriesId === "regression") {
      console.log(`[LM Toggle] Handling linked series for regression.`); // <-- ADDED
      state.seriesVisibility.regressionCI = isVisible;
      this.updateAppearance("regressionCI", isVisible); // Update CI item appearance
      ui.regressionToggle?.property("checked", isVisible); // Sync checkbox
      console.log(
        `[LM Toggle] Synced regressionCI state (${state.seriesVisibility.regressionCI}) /appearance and checkbox.`,
      ); // <-- ADDED LOG + state
    }
    // Hiding SMA Line hides SMA Band
    if (seriesId === "smaLine" && !isVisible) {
      console.log(
        `[LM Toggle] Handling linked series for smaLine -> smaBand (hide).`,
      ); // <-- ADDED
      state.seriesVisibility.smaBand = false;
      this.updateAppearance("smaBand", false);
    }
    // Showing SMA Band requires showing SMA Line
    if (seriesId === "smaBand" && isVisible) {
      if (!state.seriesVisibility.smaLine) {
        console.log(
          `[LM Toggle] Handling linked series for smaBand -> smaLine (show).`,
        ); // <-- ADDED
        state.seriesVisibility.smaLine = true;
        this.updateAppearance("smaLine", true);
      }
    }
    // --- End Special Handling ---

    // Clear highlights/pins when visibility changes
    state.highlightedDate = null;
    state.pinnedTooltipData = null;
    if (
      typeof EventHandlers !== "undefined" &&
      EventHandlers.updatePinnedTooltipDisplay
    ) {
      EventHandlers.updatePinnedTooltipDisplay();
    }

    // Update the visual appearance of the legend item itself
    console.log(
      `[LM Toggle] Calling updateAppearance for "${seriesId}" with isVisible=${isVisible}`,
    ); // <-- ADDED
    this.updateAppearance(seriesId, isVisible);

    // Trigger necessary chart and stats updates
    if (typeof MasterUpdater !== "undefined" && MasterUpdater.updateAllCharts) {
      // <<< --- ADD LOG --- >>>
      console.log("[LM Toggle] Calling MasterUpdater.updateAllCharts()");
      MasterUpdater.updateAllCharts();
    } else {
      console.warn(
        "[LM Toggle] MasterUpdater not available to update charts on visibility toggle.",
      ); // Updated log
    }
    // Stats update still needs to run to recalculate things based on visibility
    if (typeof StatsManager !== "undefined" && StatsManager.update) {
      // <<< --- ADD LOG --- >>>
      console.log("[LM Toggle] Calling StatsManager.update()");
      StatsManager.update();
    } else {
      console.warn(
        "[LM Toggle] StatsManager not available to update stats on visibility toggle.",
      ); // Updated log
    }

    console.log(`[LM Toggle] END: Toggle finished for "${seriesId}"`); // <-- ADDED
  },

  /**
   * Updates the visual appearance (e.g., opacity, class) of a legend item.
   * @param {string} seriesId - The ID of the series legend item to update.
   * @param {boolean} isVisible - The current visibility state.
   */
  updateAppearance(seriesId, isVisible) {
    // <<< --- ADD LOG --- >>>
    console.log(
      `[LM Appearance] Updating appearance for "${seriesId}" to visible: ${isVisible}`,
    );
    const item = ui.legendContainer?.selectAll(
      `.legend-item[data-id='${seriesId}']`,
    );
    if (!item || item.empty()) {
      console.warn(`[LM Appearance] Legend item for "${seriesId}" not found.`); // <-- ADDED
      return;
    }
    item.classed("hidden", !isVisible);
    // <<< --- ADD LOG --- >>>
    console.log(
      `[LM Appearance] Applied .hidden=${!isVisible} to item "${seriesId}"`,
    );
  },

  /**
   * Builds the legend items in the legend container based on current state and configuration.
   */
  build() {
    // <<< --- ADD LOG --- >>>
    console.log("[LM Build] Starting legend build...");

    if (!ui.legendContainer || ui.legendContainer.empty()) {
      console.warn("[LM Build] Legend container not found.");
      return;
    }

    // Clear previous legend items
    ui.legendContainer.html("");

    // Check if prerequisites are met
    if (
      Object.keys(colors).length === 0 ||
      !state.processedData ||
      state.processedData.length === 0
    ) {
      console.warn(
        "[LM Build] Prerequisites not met (colors or data missing).",
      ); // <-- ADDED log
      ui.legendContainer
        .append("span")
        .attr("class", "legend-empty-msg")
        .text("Legend requires data.");
      return;
    }

    // Define the structure and properties of each legend item
    const legendItemsConfig = [
      {
        id: "raw",
        label: "Raw Data",
        type: "dot",
        colorKey: "rawDot",
        styleClass: "raw-dot",
      },
      {
        id: "smaLine",
        label: `Weight SMA (${CONFIG.movingAverageWindow}d)`,
        type: "line",
        colorKey: "sma",
        styleClass: "sma-line",
      },
      {
        id: "smaBand",
        label: "SMA Band (±SD)",
        type: "area",
        colorKey: "band",
        styleClass: "band-area",
      },
      {
        id: "regression",
        label: "Lin. Regression",
        type: "line",
        colorKey: "regression",
        styleClass: "regression-line",
      },
      {
        id: "regressionCI",
        label: "Regression 95% CI",
        type: "area",
        colorKey: "regressionCI",
        styleClass: "regression-ci-area",
      },
      {
        id: "trend1",
        label: "Manual Trend 1",
        type: "line",
        colorKey: "trend1",
        styleClass: "manual-trend-1",
        dash: "4, 4",
      },
      {
        id: "trend2",
        label: "Manual Trend 2",
        type: "line",
        colorKey: "trend2",
        styleClass: "manual-trend-2",
        dash: "4, 4",
      },
      ...(state.goal.weight != null
        ? [
            {
              id: "goal",
              label: "Goal Path",
              type: "line",
              colorKey: "goal",
              styleClass: "goal-line",
              dash: "6, 3",
            },
          ]
        : []),
      ...(state.annotations && state.annotations.length > 0
        ? [
            {
              id: "annotations",
              label: "Annotations",
              type: "marker",
              colorKey: "annotationMarker",
              styleClass: "annotation-marker",
            },
          ]
        : []),
      ...(state.plateaus && state.plateaus.length > 0
        ? [
            {
              id: "plateaus",
              label: "Plateaus",
              type: "area",
              colorKey: "plateauColor",
              styleClass: "plateau-region",
            },
          ]
        : []),
      ...(state.trendChangePoints && state.trendChangePoints.length > 0
        ? [
            {
              id: "trendChanges",
              label: "Trend Δ",
              type: "marker",
              colorKey: "trendChangeColor",
              styleClass: "trend-change-marker",
            },
          ]
        : []),
    ];

    // <<< --- ADD LOG --- >>>
    console.log(
      "[LM Build] Legend items config generated:",
      legendItemsConfig.map((i) => i.id),
    );

    // Create legend items based on the config
    legendItemsConfig.forEach((item) => {
      // <<< --- ADD LOG --- >>>
      // console.log(`[LM Build] Processing item: ${item.id}`);
      if (state.seriesVisibility.hasOwnProperty(item.id)) {
        const isVisible = state.seriesVisibility[item.id];
        const itemColor = colors[item.colorKey] || "#000000";

        // <<< --- ADD LOG --- >>>
        // console.log(`[LM Build] Item "${item.id}" visibility state: ${isVisible}`);

        const itemDiv = ui.legendContainer
          .append("div")
          .attr("class", `legend-item ${item.styleClass || ""}`)
          .attr("data-id", item.id)
          .classed("hidden", !isVisible)
          .on("click", () => {
            // Keep using arrow function for 'this' or use LegendManager directly
            const currentVisibility = state.seriesVisibility[item.id];
            // <<< --- ADD LOG --- >>>
            console.log(
              `[LM Build Click] Legend item "${item.id}" clicked. Current visibility: ${currentVisibility}. Toggling to ${!currentVisibility}.`,
            );
            LegendManager.toggleSeriesVisibility(item.id, !currentVisibility); // Use LegendManager directly
          });

        const swatch = itemDiv
          .append("span")
          .attr("class", `legend-swatch type-${item.type}`);

        switch (item.type) {
          case "dot":
          case "marker":
            swatch.style("background-color", itemColor);
            break;
          case "area":
            swatch.style("background-color", itemColor).style("opacity", 0.6);
            break;
          case "line":
            swatch
              .style("background-color", itemColor)
              .style("height", "4px")
              .style("border", "none");
            if (item.dash) {
              swatch
                .style(
                  "background-image",
                  `linear-gradient(to right, ${itemColor} 60%, transparent 40%)`,
                )
                .style("background-size", "8px 4px")
                .style("background-color", "transparent");
            }
            break;
        }

        itemDiv.append("span").attr("class", "legend-text").text(item.label);
      } else {
        console.warn(
          `[LM Build] Build: seriesVisibility state missing for key: ${item.id}`,
        );
      }
    });
    console.log("[LM Build] Finished legend build."); // <-- ADDED
  }, // End build method
}; // End LegendManager object
