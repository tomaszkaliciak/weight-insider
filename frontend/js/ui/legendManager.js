// legendManager.js
// Manages the creation and interaction of the chart legend.

import { state } from "../state.js";
import { ui } from "./uiCache.js";
import { colors } from "../core/themeManager.js";
import { CONFIG } from "../config.js";
import { MasterUpdater } from "./masterUpdater.js";
import { StatsManager } from "../core/statsManager.js";
import { EventBus } from "../core/eventBus.js";

export const LegendManager = {
  /**
   * Toggles the visibility of a specific data series on the chart.
   * @param {string} seriesId - The ID of the series to toggle (e.g., 'raw', 'smaLine', 'regression', 'trendChanges').
   * @param {boolean} isVisible - The desired visibility state (true for visible, false for hidden).
   */

  toggleSeriesVisibility(seriesId, isVisible) {
    console.log(
      `[LM Toggle] START: Toggling "${seriesId}" to ${isVisible}. Current state before toggle: ${state.seriesVisibility[seriesId]}`,
    );

    if (!state.seriesVisibility.hasOwnProperty(seriesId)) {
      console.warn(
        `[LM Toggle] Attempted to toggle unknown series: ${seriesId}`,
      );
      return;
    }

    state.seriesVisibility[seriesId] = isVisible;
    console.log(
      `[LM Toggle] State updated: state.seriesVisibility.${seriesId} = ${state.seriesVisibility[seriesId]}`,
    );

    if (seriesId === "regression") {
      state.seriesVisibility.regressionCI = isVisible;
      this.updateAppearance("regressionCI", isVisible);
      console.log(
        `[LM Toggle] Synced regressionCI state (${state.seriesVisibility.regressionCI}) /appearance and checkbox.`,
      );
    }

    if (seriesId === "regressionCI" && isVisible) {
      state.seriesVisibility.regression = isVisible;
      this.updateAppearance("regression", isVisible);
      console.log(
        `[LM Toggle] Synced regression state (${state.seriesVisibility.regression}) /appearance and checkbox.`,
      );
    }

    // Clear highlights/pins when visibility changes
    state.highlightedDate = null;
    state.pinnedTooltipData = null;

    // Update the visual appearance of the legend item itself
    console.log(
      `[LM Toggle] Calling updateAppearance for "${seriesId}" with isVisible=${isVisible}`,
    );
    this.updateAppearance(seriesId, isVisible);

    EventBus.publish("state::seriesVisibilityUpdate");
    LegendManager.build();

    console.log(`[LM Toggle] END: Toggle finished for "${seriesId}"`);
  },

  /**
   * Updates the visual appearance (e.g., opacity, class) of a legend item.
   * @param {string} seriesId - The ID of the series legend item to update.
   * @param {boolean} isVisible - The current visibility state.
   */
  updateAppearance(seriesId, isVisible) {
    console.log(
      `[LM Appearance] Updating appearance for "${seriesId}" to visible: ${isVisible}`,
    );
    const item = ui.legendContainer?.selectAll(
      `.legend-item[data-id='${seriesId}']`,
    );
    if (!item || item.empty()) {
      console.warn(`[LM Appearance] Legend item for "${seriesId}" not found.`);
      return;
    }
    item.classed("hidden", !isVisible);
  },

  /**
   * Builds the legend items in the legend container based on current state and configuration.
   */
  build() {
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
      );
      ui.legendContainer
        .append("span")
        .attr("class", "legend-empty-msg")
        .text("Legend requires data.");
      return;
    }

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

    console.log(
      "[LM Build] Legend items config generated:",
      legendItemsConfig.map((i) => i.id),
    );

    legendItemsConfig.forEach((item) => {
      if (state.seriesVisibility.hasOwnProperty(item.id)) {
        const isVisible = state.seriesVisibility[item.id];
        const itemColor = colors[item.colorKey] || "#000000";

        const itemDiv = ui.legendContainer
          .append("div")
          .attr("class", `legend-item ${item.styleClass || ""}`)
          .attr("data-id", item.id)
          .classed("hidden", !isVisible)
          .on("click", () => {
            const currentVisibility = state.seriesVisibility[item.id];
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
    console.log("[LM Build] Finished legend build.");
  },
  init() {
    EventBus.subscribe("state::themeUpdated", LegendManager.build);
    EventBus.subscribe("state::annotationUpdate", LegendManager.build);
  },
};
