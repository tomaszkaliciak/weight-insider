// js/ui/chartUpdaters.js
// Contains objects responsible for updating the visual elements of each chart
// based on provided data and current scale/axis/brush configurations.
// Updaters receive necessary data and state flags as arguments from MasterUpdater.
// Event handler *logic* resides in EventHandlers.js, but handlers are *attached* here during element creation/update.

import { CONFIG } from "../config.js";
import { ui } from "./uiCache.js";
import { scales, axes, brushes } from "./chartSetup.js";
import { colors } from "../core/themeManager.js";
import { ChartInteractions } from "../interactions/chartInteractions.js";
import { TooltipManager } from "../interactions/tooltipManager.js";
import { Utils } from "../core/utils.js";

// --- Focus Chart Updater ---
export const FocusChartUpdater = {
  /**
   * Updates the X and Y axes of the focus chart.
   * @param {number} focusWidth - Current drawable width.
   * @param {number} focusHeight - Current drawable height.
   * @param {object} [options={}] - Rendering options.
   * @param {boolean} [options.isInteractive=false] - If true, use faster/no transitions.
   */
  updateAxes(focusWidth, focusHeight, options = {}) {
    if (
      !focusWidth ||
      !focusHeight ||
      focusWidth <= 0 ||
      focusHeight <= 0 ||
      !axes.xAxis ||
      !axes.yAxis ||
      !scales.x ||
      !scales.y
    ) {
      console.warn(
        "FocusChartUpdater: Axes/scales not initialized or invalid dimensions for axes update.",
      );
      return;
    }
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;

    // Update main X axis (ensure scale is current)
    axes.xAxis.scale(scales.x);
    const xAxisUpdate = ui.xAxisGroup;
    if (dur > 0) {
      xAxisUpdate?.transition().duration(dur).call(axes.xAxis);
    } else {
      xAxisUpdate?.call(axes.xAxis);
    }

    // Update main Y axis (ensure scale is current)
    // Y-axis updates instantly during interactions as domain changes are complex
    axes.yAxis.scale(scales.y);
    ui.yAxisGroup?.call(axes.yAxis);

    // Update Y grid lines based on the *current* Y-axis ticks
    // This ensures grid lines align correctly even with instant Y-axis updates.
    const yTicks = axes.yAxis.scale()?.ticks
      ? axes.yAxis.scale().ticks(axes.yAxis.ticks()[0])
      : [];
    const yGridAxis = d3
      .axisLeft(scales.y)
      .tickSize(-focusWidth)
      .tickFormat("")
      .tickValues(yTicks);

    const gridUpdate = ui.gridGroup;
    if (dur > 0 && !options.isInteractive) {
      // Only transition grid if not interactive
      gridUpdate?.transition().duration(dur).call(yGridAxis);
    } else {
      gridUpdate?.call(yGridAxis); // Update grid instantly during interaction or if no transition
    }
    gridUpdate?.selectAll(".domain").remove(); // Remove the domain line from the grid
  },

  /**
   * Updates chart paths (lines, areas) based on provided data and current scales.
   * Visibility is controlled by MasterUpdater via CSS/styles.
   * @param {Array} visibleValidSmaData - Filtered SMA data points for the current view.
   * @param {Array} visibleValidEmaData - Filtered EMA data points for the current view.
   * @param {object} regressionResult - Calculated regression result { points, pointsWithCI }.
   * @param {Array} trendLine1Data - Pre-calculated points for trend line 1 [{date, weight},...].
   * @param {Array} trendLine2Data - Pre-calculated points for trend line 2 [{date, weight},...].
   * @param {Array} goalLineData - Pre-calculated points for the goal line [{date, weight},...] or empty.
   * @param {object} [options={}] - Rendering options.
   * @param {boolean} [options.isInteractive=false] - If true, use faster/no transitions.
   */
  updatePaths(
    visibleValidSmaData,
    visibleValidEmaData,
    regressionResult,
    trendLine1Data, // Expect pre-calculated points
    trendLine2Data, // Expect pre-calculated points
    goalLineData,
    options = {},
  ) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (!ui.chartArea || !scales.x || !scales.y) {
      console.warn(
        "FocusChartUpdater: Chart area or scales not ready for path update.",
      );
      return;
    }
    // Capture current scales for generators
    const currentXScale = scales.x;
    const currentYScale = scales.y;

    // --- Line and Area Generators (Use current scales) ---
    const lineGenFactory = (yAccessor) =>
      d3
        .line()
        .x((d) => currentXScale(d.date))
        .y((d) => currentYScale(yAccessor(d)))
        .curve(d3.curveMonotoneX)
        .defined(
          (d) =>
            d.date instanceof Date &&
            !isNaN(d.date) &&
            yAccessor(d) != null &&
            isFinite(currentYScale(yAccessor(d))) &&
            isFinite(currentXScale(d.date)),
        );

    const areaGenFactory = (y0Accessor, y1Accessor) =>
      d3
        .area()
        .x((d) => currentXScale(d.date))
        .y0((d) => currentYScale(y0Accessor(d)))
        .y1((d) => currentYScale(y1Accessor(d)))
        .curve(d3.curveMonotoneX)
        .defined(
          (d) =>
            d.date instanceof Date &&
            !isNaN(d.date) &&
            y0Accessor(d) != null &&
            y1Accessor(d) != null &&
            isFinite(currentYScale(y0Accessor(d))) &&
            isFinite(currentYScale(y1Accessor(d))) &&
            isFinite(currentXScale(d.date)),
        );

    const smaLineGen = lineGenFactory((d) => d.sma);
    const emaLineGen = lineGenFactory((d) => d.ema);
    const smaBandAreaGen = areaGenFactory(
      (d) => d.lowerBound,
      (d) => d.upperBound,
    );
    const regressionLineGen = lineGenFactory((d) => d.regressionValue);
    const goalLineGen = lineGenFactory((d) => d.weight);
    const trendLineGen = lineGenFactory((d) => d.weight); // Generic trend line using 'weight' property

    // --- Helper to Update Selections ---
    const updateSelection = (selection, pathData, generator) => {
      if (!selection || selection.empty()) return;
      const pathString =
        pathData && pathData.length > 0 ? generator(pathData) : ""; // Generate path string if data exists
      if (dur > 0 && !options.isInteractive) {
        selection.transition().duration(dur).attr("d", pathString);
      } else {
        selection.attr("d", pathString); // Apply immediately
      }
      // Visibility is handled by MasterUpdater setting display: none based on state.visibility
    };

    // --- UPDATE PATHS ---
    updateSelection(ui.smaLine, visibleValidSmaData, smaLineGen);
    updateSelection(ui.bandArea, visibleValidSmaData, smaBandAreaGen);
    updateSelection(ui.emaLine, visibleValidEmaData, emaLineGen);
    updateSelection(
      ui.regressionLine,
      regressionResult?.points,
      regressionLineGen,
    );
    updateSelection(ui.goalLine, goalLineData, goalLineGen);
    updateSelection(ui.trendLine1, trendLine1Data, trendLineGen); // Use pre-calculated data
    updateSelection(ui.trendLine2, trendLine2Data, trendLineGen); // Use pre-calculated data
  },

  /**
   * Updates the raw data dots. Applies hover/pin styles based on passed state.
   * @param {Array} visibleRawWeightData - Filtered raw weight data points for the current view.
   * @param {object|null} [pinnedTooltipData=null] - Current pinned tooltip data { id, ... }.
   * @param {object|null} [activeHoverData=null] - Current hovered data point.
   * @param {object} [options={}] - Rendering options.
   * @param {boolean} [options.isInteractive=false] - If true, use faster/no transitions.
   */
  updateDots(
    visibleRawWeightData,
    pinnedTooltipData = null,
    activeHoverData = null,
    options = {},
  ) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs / 2; // Faster transition for dots
    if (!ui.rawDotsGroup || !scales.x || !scales.y) {
      console.warn("FocusChartUpdater: Raw dots group or scales not ready.");
      return;
    }
    // Visibility is handled by MasterUpdater based on state.visibility.raw

    // Filter for valid points that can be plotted
    const rawDotsDataValid = visibleRawWeightData.filter(
      (d) =>
        d.value != null &&
        d.date instanceof Date &&
        !isNaN(d.date) &&
        isFinite(scales.x(d.date)) &&
        isFinite(scales.y(d.value)),
    );

    const rawDots = ui.rawDotsGroup
      .selectAll(".raw-dot")
      .data(rawDotsDataValid, (d) => d.dateString || d.date.getTime()); // Use robust key

    rawDots.join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "raw-dot")
          .attr("r", CONFIG.rawDotRadius)
          .attr("cx", (d) => scales.x(d.date))
          .attr("cy", (d) => scales.y(d.value))
          .style("fill", colors.rawDot)
          .style("opacity", 0) // Start hidden for transition
          .style("pointer-events", "all") // Ensure dots are interactive
          .style("cursor", "pointer")
          .on("mouseover", ChartInteractions.dotMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.dotMouseOut)  // Use ChartInteractions
          .on("click", ChartInteractions.dotClick)        // Use ChartInteractions
          .call((enter) =>
            enter.transition().duration(dur).style("opacity", 0.4),
          ), // Fade in
      (update) =>
        update
          // Ensure handlers are attached on update too
          .on("mouseover", ChartInteractions.dotMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.dotMouseOut)  // Use ChartInteractions
          .on("click", ChartInteractions.dotClick)        // Use ChartInteractions
          .call((update) =>
            update
              .transition()
              .duration(dur) // Transition existing dots
              .attr("cx", (d) => scales.x(d.date))
              .attr("cy", (d) => scales.y(d.value))
              .attr("r", (d) => {
                // Update radius based on hover/pin state passed in
                const isPinned = pinnedTooltipData?.id === d.date?.getTime();
                const isHovered =
                  activeHoverData?.date?.getTime() === d.date?.getTime();
                return isHovered || isPinned
                  ? CONFIG.dotHoverRadius
                  : CONFIG.rawDotRadius;
              })
              .style("opacity", (d) => {
                // Update opacity based on hover/pin
                const isPinned = pinnedTooltipData?.id === d.date?.getTime();
                const isHovered =
                  activeHoverData?.date?.getTime() === d.date?.getTime();
                return isHovered || isPinned ? 1 : 0.4; // Make hovered/pinned fully opaque
              }),
          ),
      (exit) =>
        exit
          .style("pointer-events", "none") // Disable interaction on exit
          .transition()
          .duration(dur)
          .style("opacity", 0)
          .remove(), // Fade out
    );
  },

  /**
   * Updates the highlight marker for a specific date.
   * @param {Date|null} highlightedDate - The date to highlight, or null to remove.
   * @param {Array} visibleRawWeightData - Filtered raw weight data points for the current view.
   */
  updateHighlightMarker(highlightedDate, visibleRawWeightData) {
    const dur = CONFIG.transitionDurationMs / 2; // Faster transition for highlight
    if (!ui.highlightGroup || !scales.x || !scales.y) return;

    // Find the specific data point to highlight from the visible data
    const highlightDataPoint = highlightedDate
      ? visibleRawWeightData.find(
          (d) =>
            d.value != null &&
            d.date instanceof Date &&
            d.date.getTime() === highlightedDate.getTime() &&
            isFinite(scales.x(d.date)) &&
            isFinite(scales.y(d.value)), // Check if plottable
        )
      : null;

    const highlightMarker = ui.highlightGroup
      .selectAll(".highlight-marker")
      .data(highlightDataPoint ? [highlightDataPoint] : [], (d) =>
        d.date.getTime(),
      ); // Use date as key

    highlightMarker.join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "highlight-marker")
          .attr("r", 0) // Start invisible
          .attr("cx", (d) => scales.x(d.date))
          .attr("cy", (d) => scales.y(d.value))
          .style("fill", "none")
          .style("stroke", colors.highlightStroke || "orange")
          .style("stroke-width", "2.5px")
          .style("pointer-events", "none")
          .style("opacity", 0)
          .call((enter) =>
            enter
              .transition()
              .duration(dur) // Transition in
              .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
              .style("opacity", 0.8),
          ),
      (update) =>
        update
          .transition()
          .duration(dur) // Transition existing marker
          .attr("cx", (d) => scales.x(d.date))
          .attr("cy", (d) => scales.y(d.value))
          .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
          .style("opacity", 0.8), // Ensure it stays visible
      (exit) =>
        exit
          .transition()
          .duration(dur) // Transition out
          .attr("r", 0)
          .style("opacity", 0)
          .remove(),
    );
  },

  /**
   * Updates the crosshair lines based on hovered data.
   * @param {object|null} hoverData - The currently hovered data point { date, value?, sma? }, or null.
   * @param {number} focusWidth - Current drawable width.
   * @param {number} focusHeight - Current drawable height.
   */
  updateCrosshair(hoverData, focusWidth, focusHeight) {
    if (
      !ui.crosshairGroup ||
      !scales.x ||
      !scales.y ||
      !focusWidth ||
      !focusHeight
    ) {
      ui.crosshairGroup?.style("display", "none"); // Ensure hidden if setup incomplete
      return;
    }

    if (!hoverData || !hoverData.date) {
      ui.crosshairGroup.style("display", "none");
      return;
    }

    const xPos = scales.x(hoverData.date);
    // Use value if available, otherwise fall back to sma or ema for crosshair Y position
    const yValue = hoverData.value ?? hoverData.sma ?? hoverData.ema;
    const yPos = yValue != null && isFinite(yValue) ? scales.y(yValue) : null;

    // Check if calculated positions are valid numbers and within chart bounds
    if (
      yPos != null &&
      isFinite(xPos) &&
      isFinite(yPos) &&
      xPos >= 0 &&
      xPos <= focusWidth &&
      yPos >= 0 &&
      yPos <= focusHeight
    ) {
      ui.crosshairGroup.style("display", null); // Show group
      ui.crosshairGroup
        .select(".crosshair.crosshair-x")
        .attr("y1", 0)
        .attr("y2", focusHeight)
        .attr("transform", `translate(${xPos}, 0)`);
      ui.crosshairGroup
        .select(".crosshair.crosshair-y")
        .attr("x1", 0)
        .attr("x2", focusWidth)
        .attr("transform", `translate(0, ${yPos})`);
    } else {
      ui.crosshairGroup.style("display", "none"); // Hide if off-chart
    }
  },

  /**
   * Updates annotation markers on the chart.
   * @param {Array} annotations - The full list of annotation objects {id, date, text, type}.
   * @param {Array} processedData - Full processed data (used to find Y position).
   * @param {object} [options={}] - Rendering options.
   * @param {boolean} [options.isInteractive=false] - If true, use faster/no transitions.
   */
  updateAnnotations(annotations, processedData, options = {}) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (!ui.annotationsGroup || !scales.x || !scales.y) {
      console.warn(
        "FocusChartUpdater: Cannot update annotations - group or scales missing.",
      );
      return;
    }
    // Visibility handled by MasterUpdater based on state.visibility.annotations

    // Filter annotations to those within the current X domain and of type 'point'
    const xDomain = scales.x.domain();
    const visibleAnnotations = annotations.filter((a) => {
      const date = new Date(a.date + "T00:00:00"); // Parse YYYY-MM-DD as local
      return (
        !isNaN(date.getTime()) &&
        date >= xDomain[0] &&
        date <= xDomain[1] &&
        a.type === "point"
      );
    });

    // Helper to find Y position based on processedData's SMA or value
    const findYValue = (targetDate) => {
      if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
        return null;
      const targetTime = targetDate.getTime();
      // Find the closest point *in the processed data* to anchor the annotation marker
      let closestPoint = null;
      let minDiff = Infinity;
      processedData.forEach((d) => {
        if (d.date instanceof Date && !isNaN(d.date)) {
          const diff = Math.abs(d.date.getTime() - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPoint = d;
          }
        }
      });
      // Prefer SMA for Y position, fallback to raw value if SMA is null
      const yVal = closestPoint
        ? (closestPoint.sma ?? closestPoint.value)
        : null;
      return yVal != null && isFinite(scales.y(yVal)) ? yVal : null;
    };

    const markers = ui.annotationsGroup
      .selectAll(".annotation-marker-group")
      .data(visibleAnnotations, (d) => d.id); // Use annotation ID as key

    markers.join(
      (enter) => {
        const group = enter
          .append("g")
          .attr("class", "annotation-marker-group")
          .style("opacity", 0); // Start transparent

        group.attr("transform", (d) => {
          // Set initial position
          const yValue = findYValue(new Date(d.date + "T00:00:00"));
          const xPos = scales.x(new Date(d.date + "T00:00:00"));
          return yValue != null && isFinite(xPos)
            ? `translate(${xPos}, ${scales.y(yValue)})`
            : `translate(-1000, -1000)`;
        });

        group
          .append("circle") // Append the marker shape
          .attr("class", "annotation-marker")
          .attr("r", CONFIG.annotationMarkerRadius)
          .style("fill", colors.annotationMarker || "orange")
          .style("stroke", "var(--bg-secondary)")
          .style("stroke-width", 1.5)
          .style("cursor", "help");

        group
          .on("mouseover", ChartInteractions.annotationMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.annotationMouseOut);  // Use ChartInteractions

        group.transition().duration(dur).style("opacity", 0.8); // Transition in
        return group;
      },
      (update) =>
        update
          .on("mouseover", ChartInteractions.annotationMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.annotationMouseOut)  // Use ChartInteractions
          .transition()
          .duration(dur) // Transition to new position
          .style("opacity", 0.8)
          .attr("transform", (d) => {
            const yValue = findYValue(new Date(d.date + "T00:00:00"));
            const xPos = scales.x(new Date(d.date + "T00:00:00"));
            return yValue != null && isFinite(xPos)
              ? `translate(${xPos}, ${scales.y(yValue)})`
              : `translate(-1000, -1000)`;
          }),
      (exit) =>
        exit
          .transition()
          .duration(dur / 2)
          .style("opacity", 0) // Transition out
          .attr("transform", `translate(-1000, -1000)`)
          .remove(),
    );
  },

  /**
   * Updates plateau region rectangles.
   * @param {Array} plateaus - Array of plateau objects { startDate, endDate } from state.
   * @param {number} focusHeight - Current drawable height.
   * @param {object} [options={}] - Rendering options.
   */
  updatePlateauRegions(plateaus, focusHeight, options = {}) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (!ui.plateauGroup || !scales.x || !focusHeight) return;
    // Visibility handled by MasterUpdater based on state.visibility.plateaus

    const xDomain = scales.x.domain();
    const visiblePlateaus = plateaus.filter(
      (p) =>
        p.endDate instanceof Date &&
        p.startDate instanceof Date &&
        p.endDate >= xDomain[0] &&
        p.startDate <= xDomain[1],
    );

    const regions = ui.plateauGroup
      .selectAll(".plateau-region")
      .data(
        visiblePlateaus,
        (d) => `${d.startDate.toISOString()}-${d.endDate.toISOString()}`,
      );

    regions.join(
      (enter) =>
        enter
          .append("rect")
          .attr("class", "plateau-region")
          .attr("x", (d) => scales.x(d.startDate))
          .attr("y", 0)
          .attr("width", (d) =>
            Math.max(0, scales.x(d.endDate) - scales.x(d.startDate)),
          )
          .attr("height", focusHeight)
          .style("fill", colors.plateauColor || "rgba(127, 140, 141, 0.15)")
          .style("pointer-events", "none")
          .style("opacity", 0)
          .call((enter) =>
            enter.transition().duration(dur).style("opacity", 0.25),
          ),
      (update) =>
        update
          .transition()
          .duration(dur)
          .attr("x", (d) => scales.x(d.startDate))
          .attr("width", (d) =>
            Math.max(0, scales.x(d.endDate) - scales.x(d.startDate)),
          )
          .attr("height", focusHeight)
          .style("opacity", 0.25),
      (exit) =>
        exit
          .transition()
          .duration(dur / 2)
          .style("opacity", 0)
          .remove(),
    );
  },

  /**
   * Updates trend change markers on the chart.
   * @param {Array} trendChangePoints - Array of trend change objects { date, magnitude } from state.
   * @param {Array} processedData - Full processed data (needed to find Y position).
   * @param {object} [options={}] - Rendering options.
   */
  updateTrendChangeMarkers(trendChangePoints, processedData, options = {}) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (!ui.trendChangeGroup || !scales.x || !scales.y) return;
    // Visibility handled by MasterUpdater based on state.visibility.trendChanges

    const xDomain = scales.x.domain();
    const visibleMarkersData = trendChangePoints.filter(
      (p) =>
        p.date instanceof Date &&
        !isNaN(p.date) &&
        p.date >= xDomain[0] &&
        p.date <= xDomain[1],
    );

    const findYValue = (targetDate) => {
      if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
        return null;
      const targetTime = targetDate.getTime();
      let closestPoint = null;
      let minDiff = Infinity;
      processedData.forEach((d) => {
        if (d.date instanceof Date) {
          const diff = Math.abs(d.date.getTime() - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPoint = d;
          }
        }
      });
      const yVal = closestPoint
        ? (closestPoint.sma ?? closestPoint.value)
        : null;
      return yVal != null && isFinite(scales.y(yVal)) ? yVal : null;
    };

    const markerSize = 4;
    const markerPath = d3
      .symbol()
      .type(d3.symbolTriangle)
      .size(markerSize * markerSize * 1.5);

    const markers = ui.trendChangeGroup
      .selectAll(".trend-change-marker-group")
      .data(visibleMarkersData, (d) => d.date.getTime()); // Use timestamp as key

    markers.join(
      (enter) => {
        const group = enter
          .append("g")
          .attr("class", "trend-change-marker-group")
          .style("opacity", 0);
        group.attr("transform", (d) => {
          const yValue = findYValue(d.date);
          const rotation = d.magnitude > 0 ? 180 : 0;
          const xPos = scales.x(d.date);
          const yPos = yValue != null ? scales.y(yValue) : null;
          return xPos != null &&
            yPos != null &&
            isFinite(xPos) &&
            isFinite(yPos)
            ? `translate(${xPos}, ${yPos}) rotate(${rotation})`
            : `translate(-1000, -1000)`;
        });
        group
          .append("path")
          .attr("class", "trend-change-marker")
          .attr("d", markerPath)
          .style("fill", colors.trendChangeColor || "red")
          .style("cursor", "help");
        group
          .on("mouseover", ChartInteractions.trendChangeMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.trendChangeMouseOut);  // Use ChartInteractions
        group.transition().duration(dur).style("opacity", 1);
        return group;
      },
      (update) =>
        update
          .on("mouseover", ChartInteractions.trendChangeMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.trendChangeMouseOut)  // Use ChartInteractions
          .transition()
          .duration(dur)
          .style("opacity", 1)
          .attr("transform", (d) => {
            const yValue = findYValue(d.date);
            const rotation = d.magnitude > 0 ? 180 : 0;
            const xPos = scales.x(d.date);
            const yPos = yValue != null ? scales.y(yValue) : null;
            return xPos != null &&
              yPos != null &&
              isFinite(xPos) &&
              isFinite(yPos)
              ? `translate(${xPos}, ${yPos}) rotate(${rotation})`
              : `translate(-1000, -1000)`;
          }),
      (exit) =>
        exit
          .transition()
          .duration(dur / 2)
          .style("opacity", 0)
          .remove(),
    );
  },

  /**
   * Updates goal zone and achievement marker visuals. Goal line is handled by updatePaths.
   * @param {object} goal - Current goal object { weight, date, targetRate }.
   * @param {Date|null} goalAchievedDate - Date goal was achieved, or null.
   * @param {number} focusWidth - Current drawable width.
   * @param {number} focusHeight - Current drawable height.
   * @param {object} [options={}] - Rendering options.
   */
  updateGoalVisuals(
    goal,
    goalAchievedDate,
    focusWidth,
    focusHeight,
    options = {},
  ) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    // Visibility handled by MasterUpdater based on state.visibility.goal

    // --- Update Goal Zone Rect ---
    if (ui.goalZoneRect && !ui.goalZoneRect.empty()) {
      const goalWeight = goal?.weight;
      if (goalWeight != null && isFinite(goalWeight)) {
        const buffer = 0.15;
        const yUpper = scales.y(goalWeight + buffer);
        const yLower = scales.y(goalWeight - buffer);
        if (isFinite(yUpper) && isFinite(yLower) && yLower >= yUpper) {
          ui.goalZoneRect
            .transition()
            .duration(dur)
            .attr("x", 0)
            .attr("y", yUpper)
            .attr("width", focusWidth)
            .attr("height", Math.max(0, yLower - yUpper))
            // Style handled by CSS var, ensure fill is set
            .style("fill", colors.goal || "#9b59b6")
            .style("fill-opacity", 0.06);
        } else {
          // Hide if scale positions invalid, transition opacity?
          ui.goalZoneRect.transition().duration(dur).style("fill-opacity", 0);
        }
      } else {
        // Hide if goal weight not set/invalid, transition opacity?
        ui.goalZoneRect.transition().duration(dur).style("fill-opacity", 0);
      }
    }

    // --- Update Goal Achievement Marker ---
    const showMarker =
      goalAchievedDate instanceof Date &&
      !isNaN(goalAchievedDate) &&
      goal?.weight != null &&
      isFinite(goal.weight);
    const markerData = showMarker ? [goalAchievedDate] : [];
    const markerSymbol = "🚩";

    if (ui.goalAchievedGroup && !ui.goalAchievedGroup.empty()) {
      const markers = ui.goalAchievedGroup
        .selectAll(".goal-achieved-marker")
        .data(markerData, (d) => d.getTime());
      markers.join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "goal-achieved-marker")
            .attr("x", (d) => scales.x(d))
            .attr("y", (d) => scales.y(goal.weight))
            .attr("dy", "-0.5em")
            .attr("text-anchor", "middle")
            .style("font-size", "1.3em")
            .style("fill", colors.goal || "#9b59b6")
            .style("opacity", 0)
            .style("cursor", "default")
            .text(markerSymbol)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 1),
            ),
        (update) =>
          update
            .transition()
            .duration(dur)
            .attr("x", (d) => scales.x(d))
            .attr("y", (d) => scales.y(goal.weight))
            .style("opacity", 1),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .remove(),
      );
    }
  },

  /**
   * Updates the visual appearance of the regression brush based on the range state.
   * @param {object} interactiveRegressionRange - The current range { start, end } from state.
   * @param {number} focusWidth - Current drawable width.
   */
  updateRegressionBrushDisplay(interactiveRegressionRange, focusWidth) {
    if (
      !ui.regressionBrushGroup ||
      !brushes.regression ||
      !scales.x ||
      !focusWidth
    )
      return;

    const { start, end } = interactiveRegressionRange;
    let brushSelection = null;

    // Check if range is valid
    if (
      start instanceof Date &&
      end instanceof Date &&
      !isNaN(start.getTime()) &&
      !isNaN(end.getTime())
    ) {
      const pixelStart = scales.x(start);
      const pixelEnd = scales.x(end);

      // Check if pixel values are valid numbers and within bounds
      if (
        isFinite(pixelStart) &&
        isFinite(pixelEnd) &&
        pixelEnd > pixelStart &&
        pixelStart <= focusWidth &&
        pixelEnd >= 0
      ) {
        // Allow partial visibility
        // Clamp values to be within the drawable area
        const clampedStart = Math.max(0, pixelStart);
        const clampedEnd = Math.min(focusWidth, pixelEnd);
        if (clampedEnd > clampedStart) {
          brushSelection = [clampedStart, clampedEnd];
        }
      }
    }

    // Show or hide brush elements based on whether we have a valid selection
    ui.regressionBrushGroup
      .selectAll(".overlay, .selection, .handle")
      .style("display", brushSelection ? null : "none");

    // Programmatically move the brush only if the new selection differs from the current one
    const currentSelection = d3.brushSelection(ui.regressionBrushGroup.node());
    const tolerance = 1; // Pixel tolerance
    const selectionChanged =
      (!currentSelection && brushSelection) ||
      (currentSelection && !brushSelection) ||
      (currentSelection &&
        brushSelection &&
        (Math.abs(currentSelection[0] - brushSelection[0]) > tolerance ||
          Math.abs(currentSelection[1] - brushSelection[1]) > tolerance));

    if (selectionChanged) {
      ui.regressionBrushGroup.on(".brush", null).on(".end", null); // Disable listeners during move
      ui.regressionBrushGroup.call(brushes.regression.move, brushSelection); // Move or clear
      ui.regressionBrushGroup.on(
        "end.handler",
        EventHandlers.regressionBrushed,
      ); // Re-attach listener
    }
  },
}; // End FocusChartUpdater

// --- Context, Balance, Rate, TDEE Diff, Scatter Updaters ---
// (Minor tweaks for consistency and ensuring color fallbacks)

export const ContextChartUpdater = {
  updateAxes() {
    if (!axes.xAxisContext || !scales.xContext) return;
    axes.xAxisContext.scale(scales.xContext);
    ui.contextXAxisGroup?.call(axes.xAxisContext);
  },
  updateChart(processedData) {
    if (
      !ui.contextArea ||
      !ui.contextLine ||
      !scales.xContext ||
      !scales.yContext
    )
      return;
    const yContextScale = scales.yContext;
    const contextValueAccessor = (d) => d.sma ?? d.value;
    const contextAreaGen = d3
      .area()
      .curve(d3.curveMonotoneX)
      .x((d) => scales.xContext(d.date))
      .y0(yContextScale.range()[0])
      .y1((d) => yContextScale(contextValueAccessor(d)))
      .defined(
        (d) =>
          d.date instanceof Date &&
          !isNaN(d.date) &&
          contextValueAccessor(d) != null &&
          isFinite(scales.xContext(d.date)) &&
          isFinite(yContextScale(contextValueAccessor(d))),
      );
    const contextLineGen = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((d) => scales.xContext(d.date))
      .y((d) => yContextScale(contextValueAccessor(d)))
      .defined(
        (d) =>
          d.date instanceof Date &&
          !isNaN(d.date) &&
          contextValueAccessor(d) != null &&
          isFinite(scales.xContext(d.date)) &&
          isFinite(yContextScale(contextValueAccessor(d))),
      );
    ui.contextArea
      ?.datum(processedData)
      .attr("d", contextAreaGen)
      .style("fill", colors.band || CONFIG.fallbackColors.band);
    ui.contextLine
      ?.datum(processedData)
      .attr("d", contextLineGen)
      .style("stroke", colors.sma || CONFIG.fallbackColors.sma);
  },
};
export const BalanceChartUpdater = {
  updateAxes(balanceWidth) {
    if (
      !balanceWidth ||
      !axes.xBalanceAxis ||
      !axes.yBalanceAxis ||
      !scales.xBalance ||
      !scales.yBalance
    )
      return;
    const dur = CONFIG.transitionDurationMs;
    axes.yBalanceAxis.scale(scales.yBalance);
    ui.balanceYAxisGroup?.transition().duration(dur).call(axes.yBalanceAxis);
    ui.balanceYAxisGroup?.select(".domain").remove();
    axes.xBalanceAxis.scale(scales.xBalance);
    ui.balanceXAxisGroup?.transition().duration(dur).call(axes.xBalanceAxis);
  },
  updateChart(visibleData, balanceWidth, options = {}) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (
      !ui.balanceChartArea ||
      !scales.xBalance ||
      !scales.yBalance ||
      !balanceWidth
    )
      return;
    const yZero = scales.yBalance(0); // Position of the zero line remains correct
    if (isNaN(yZero)) {
      console.error("BalanceChartUpdater: Invalid Y=0 position.");
      return;
    }

    ui.balanceZeroLine
      ?.transition()
      .duration(dur)
      .attr("y1", yZero)
      .attr("y2", yZero);

    const validBarData = visibleData.filter(
      (d) =>
        d.netBalance != null &&
        !isNaN(d.netBalance) &&
        d.date instanceof Date &&
        !isNaN(d.date) &&
        isFinite(scales.xBalance(d.date)) &&
        isFinite(scales.yBalance(d.netBalance)),
    );
    const barWidth = Math.max(
      1,
      balanceWidth / Math.max(1, validBarData.length + 2),
    ); // Add padding

    const bars = ui.balanceChartArea
      .selectAll(".balance-bar")
      .data(validBarData, (d) => d.dateString || d.date.getTime());

    bars.join(
      (enter) =>
        enter
          .append("rect")
          .attr("class", "balance-bar")
          .classed("deficit", (d) => d.netBalance < 0) // Deficit is negative (will be below zero line)
          .classed("surplus", (d) => d.netBalance >= 0) // Surplus is positive (will be above zero line)
          .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
          // Set initial y/height based on yZero for entry transition
          .attr("y", yZero)
          .attr("height", 0)
          .style("fill", (d) =>
            d.netBalance >= 0
              ? colors.surplus || CONFIG.fallbackColors.surplus
              : colors.deficit || CONFIG.fallbackColors.deficit,
          )
          .on("mouseover", ChartInteractions.balanceMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.balanceMouseOut)  // Use ChartInteractions
          .call((enter) =>
            enter
              .transition()
              .duration(dur)
              // --- ADJUST Y POSITION ---
              // If positive (surplus), bar starts at its value (top) and goes down to zero.
              // If negative (deficit), bar starts at zero (top) and goes down to its value.
              .attr("y", (d) =>
                d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
              )
              // --- HEIGHT REMAINS ABSOLUTE DIFFERENCE ---
              .attr("height", (d) =>
                Math.abs(scales.yBalance(d.netBalance) - yZero),
              ),
          ),
      (update) =>
        update
          .classed("deficit", (d) => d.netBalance < 0)
          .classed("surplus", (d) => d.netBalance >= 0)
          .style("fill", (d) =>
            d.netBalance >= 0
              ? colors.surplus || CONFIG.fallbackColors.surplus
              : colors.deficit || CONFIG.fallbackColors.deficit,
          )
          .on("mouseover", ChartInteractions.balanceMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.balanceMouseOut)  // Use ChartInteractions
          .call((update) =>
            update
              .transition()
              .duration(dur)
              .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
              .attr("width", barWidth)
              // --- ADJUST Y POSITION (UPDATE) ---
              .attr("y", (d) =>
                d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
              )
              // --- ADJUST HEIGHT (UPDATE) ---
              .attr("height", (d) =>
                Math.abs(scales.yBalance(d.netBalance) - yZero),
              ),
          ),
      (exit) =>
        exit.call((exit) =>
          exit
            .transition()
            .duration(dur / 2)
            // Transition exit towards the zero line
            .attr("y", yZero)
            .attr("height", 0)
            .remove(),
        ),
    );
  },
};
export const RateChartUpdater = {
  updateAxes(rateWidth) {
    if (
      !rateWidth ||
      !axes.xRateAxis ||
      !axes.yRateAxis ||
      !scales.xRate ||
      !scales.yRate
    )
      return;
    const dur = CONFIG.transitionDurationMs;
    axes.yRateAxis.scale(scales.yRate);
    ui.rateYAxisGroup?.transition().duration(dur).call(axes.yRateAxis);
    ui.rateYAxisGroup?.select(".domain").remove();
    axes.xRateAxis.scale(scales.xRate);
    ui.rateXAxisGroup?.transition().duration(dur).call(axes.xRateAxis);
  },
  updateChart(visibleData, rateWidth, options = {}) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (!ui.rateChartArea || !scales.xRate || !scales.yRate || !rateWidth)
      return;
    const yRateScale = scales.yRate;
    const lowerBoundKgWk = CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK;
    const upperBoundKgWk = CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK;
    if (ui.optimalGainZoneRect && !ui.optimalGainZoneRect.empty()) {
      const yUpper = yRateScale(upperBoundKgWk);
      const yLower = yRateScale(lowerBoundKgWk);
      if (!isNaN(yUpper) && !isNaN(yLower) && yLower >= yUpper) {
        ui.optimalGainZoneRect
          .transition()
          .duration(dur)
          .attr("y", yUpper)
          .attr("height", yLower - yUpper)
          .attr("width", rateWidth)
          .style("display", null)
          .style(
            "fill",
            colors.optimalGainZone || CONFIG.fallbackColors.optimalGainZone,
          );
      } else {
        ui.optimalGainZoneRect.style("display", "none");
      }
    }
    const yZero = yRateScale(0);
    if (isNaN(yZero)) {
      console.error("RateChartUpdater: Invalid Y=0 position.");
      return;
    }
    ui.rateZeroLine
      ?.transition()
      .duration(dur)
      .attr("y1", yZero)
      .attr("y2", yZero);
    const rateLineGen = d3
      .line()
      .x((d) => scales.xRate(d.date))
      .y((d) => scales.yRate(d.smoothedWeeklyRate))
      .defined(
        (d) =>
          d.date instanceof Date &&
          !isNaN(d.date) &&
          d.smoothedWeeklyRate != null &&
          isFinite(scales.xRate(d.date)) &&
          isFinite(scales.yRate(d.smoothedWeeklyRate)),
      );
    ui.rateLine
      ?.datum(visibleData)
      .transition()
      .duration(dur)
      .attr("d", rateLineGen)
      .style(
        "stroke",
        colors.rateLineColor || CONFIG.fallbackColors.rateLineColor,
      );
    const rateMALineGen = d3
      .line()
      .x((d) => scales.xRate(d.date))
      .y((d) => scales.yRate(d.rateMovingAverage))
      .defined(
        (d) =>
          d.date instanceof Date &&
          !isNaN(d.date) &&
          d.rateMovingAverage != null &&
          isFinite(scales.xRate(d.date)) &&
          isFinite(scales.yRate(d.rateMovingAverage)),
      );
    // Rate MA line visibility handled by MasterUpdater
    ui.rateMALine
      ?.datum(visibleData)
      .transition()
      .duration(dur)
      .attr("d", rateMALineGen)
      .style("stroke", colors.rateMALine || CONFIG.fallbackColors.rateMALine);
  },
  addHoverDots(visibleData) {
    if (!ui.rateChartArea || !scales.xRate || !scales.yRate) return;
    ui.rateChartArea.selectAll(".rate-hover-dot").remove();
    const validData = visibleData.filter(
      (d) =>
        d.smoothedWeeklyRate != null &&
        isFinite(scales.xRate(d.date)) &&
        isFinite(scales.yRate(d.smoothedWeeklyRate)),
    );
    ui.rateChartArea
      .selectAll(".rate-hover-dot")
      .data(validData)
      .enter()
      .append("circle")
      .attr("class", "rate-hover-dot")
      .attr("cx", (d) => scales.xRate(d.date))
      .attr("cy", (d) => scales.yRate(d.smoothedWeeklyRate))
      .attr("r", 8)
      .style("fill", "transparent")
      .style("cursor", "help")
      .on("mouseover", (event, d) => {
        let tt = `<strong>${Utils.formatDateShort(d.date)}</strong>`;
        tt += `<div>Smoothed Rate: <b>${Utils.formatValue(d.smoothedWeeklyRate, 2)}</b> kg/wk</div>`;
        if (d.rateMovingAverage != null)
          tt += `<div>Moving Avg: <b>${Utils.formatValue(d.rateMovingAverage, 2)}</b> kg/wk</div>`;
        TooltipManager.show(tt, event); // Use TooltipManager
      })
      .on("mouseout", (event, d) => TooltipManager.hide()); // Use TooltipManager
  },
};
export const TDEEDiffChartUpdater = {
  updateAxes(tdeeDiffWidth) {
    if (
      !tdeeDiffWidth ||
      !axes.xTdeeDiffAxis ||
      !axes.yTdeeDiffAxis ||
      !scales.xTdeeDiff ||
      !scales.yTdeeDiff
    )
      return;
    const dur = CONFIG.transitionDurationMs;
    axes.yTdeeDiffAxis.scale(scales.yTdeeDiff);
    ui.tdeeDiffYAxisGroup?.transition().duration(dur).call(axes.yTdeeDiffAxis);
    ui.tdeeDiffYAxisGroup?.select(".domain").remove();
    axes.xTdeeDiffAxis.scale(scales.xTdeeDiff);
    ui.tdeeDiffXAxisGroup?.transition().duration(dur).call(axes.xTdeeDiffAxis);
  },
  updateChart(visibleData, options = {}) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (!ui.tdeeDiffChartArea || !scales.xTdeeDiff || !scales.yTdeeDiff) return;
    const yZero = scales.yTdeeDiff(0);
    if (isNaN(yZero)) {
      console.error("TDEEDiffChartUpdater: Invalid Y=0 position.");
      return;
    }
    ui.tdeeDiffZeroLine
      ?.transition()
      .duration(dur)
      .attr("y1", yZero)
      .attr("y2", yZero);
    const tdeeDiffLineGen = d3
      .line()
      .x((d) => scales.xTdeeDiff(d.date))
      .y((d) => scales.yTdeeDiff(d.avgTdeeDifference))
      .defined(
        (d) =>
          d.date instanceof Date &&
          !isNaN(d.date) &&
          d.avgTdeeDifference != null &&
          isFinite(scales.xTdeeDiff(d.date)) &&
          isFinite(scales.yTdeeDiff(d.avgTdeeDifference)),
      );
    ui.tdeeDiffLine
      ?.datum(visibleData)
      .transition()
      .duration(dur)
      .attr("d", tdeeDiffLineGen)
      .style(
        "stroke",
        colors.tdeeDiffLineColor || CONFIG.fallbackColors.tdeeDiffLineColor,
      );
  },
  addHoverDots(visibleData) {
    if (!ui.tdeeDiffChartArea || !scales.xTdeeDiff || !scales.yTdeeDiff) return;
    ui.tdeeDiffChartArea.selectAll(".tdee-diff-hover-dot").remove();
    const validData = visibleData.filter(
      (d) =>
        d.avgTdeeDifference != null &&
        isFinite(scales.xTdeeDiff(d.date)) &&
        isFinite(scales.yTdeeDiff(d.avgTdeeDifference)),
    );
    ui.tdeeDiffChartArea
      .selectAll(".tdee-diff-hover-dot")
      .data(validData)
      .enter()
      .append("circle")
      .attr("class", "tdee-diff-hover-dot")
      .attr("cx", (d) => scales.xTdeeDiff(d.date))
      .attr("cy", (d) => scales.yTdeeDiff(d.avgTdeeDifference))
      .attr("r", 8)
      .style("fill", "transparent")
      .style("cursor", "help")
      .on("mouseover", (event, d) => {
        const tt = `<strong>${Utils.formatDateShort(d.date)}</strong><br>TDEE Diff: <b>${Utils.formatValue(d.avgTdeeDifference, 0)}</b> kcal`;
        TooltipManager.show(tt, event); // Use TooltipManager
      })
      .on("mouseout", (event, d) => TooltipManager.hide()); // Use TooltipManager
  },
};
export const ScatterPlotUpdater = {
  updateAxes() {
    if (
      !axes.xScatterAxis ||
      !axes.yScatterAxis ||
      !scales.xScatter ||
      !scales.yScatter
    )
      return;
    const dur = CONFIG.transitionDurationMs;
    axes.xScatterAxis.scale(scales.xScatter);
    ui.correlationScatterXAxisGroup
      ?.transition()
      .duration(dur)
      .call(axes.xScatterAxis);
    axes.yScatterAxis.scale(scales.yScatter);
    ui.correlationScatterYAxisGroup
      ?.transition()
      .duration(dur)
      .call(axes.yScatterAxis);
  },
  updateChart(scatterData, options = {}) {
    const dur = options.isInteractive ? 0 : CONFIG.transitionDurationMs;
    if (!ui.scatterDotsGroup || !scales.xScatter || !scales.yScatter) return;
    const validScatterData = (
      Array.isArray(scatterData) ? scatterData : []
    ).filter(
      (d) =>
        d.avgNetCal != null &&
        !isNaN(d.avgNetCal) &&
        d.weeklyRate != null &&
        !isNaN(d.weeklyRate) &&
        isFinite(scales.xScatter(d.avgNetCal)) &&
        isFinite(scales.yScatter(d.weeklyRate)),
    );
    const dots = ui.scatterDotsGroup
      .selectAll(".scatter-dot")
      .data(validScatterData, (d) => d.weekKey);
    dots.join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "scatter-dot")
          .attr("cx", (d) => scales.xScatter(d.avgNetCal))
          .attr("cy", (d) => scales.yScatter(d.weeklyRate))
          .attr("r", 4)
          .style(
            "fill",
            colors.scatterDotColor || CONFIG.fallbackColors.scatterDotColor,
          )
          .style("opacity", 0)
          .style("cursor", "help")
          .on("mouseover", ChartInteractions.scatterMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.scatterMouseOut)  // Use ChartInteractions
          .call((enter) =>
            enter.transition().duration(dur).style("opacity", 0.7),
          ),
      (update) =>
        update
          .on("mouseover", ChartInteractions.scatterMouseOver) // Use ChartInteractions
          .on("mouseout", ChartInteractions.scatterMouseOut)  // Use ChartInteractions
          .transition()
          .duration(dur)
          .attr("cx", (d) => scales.xScatter(d.avgNetCal))
          .attr("cy", (d) => scales.yScatter(d.weeklyRate))
          .style("opacity", 0.7),
      (exit) =>
        exit
          .transition()
          .duration(dur / 2)
          .style("opacity", 0)
          .remove(),
    );
  },
};
