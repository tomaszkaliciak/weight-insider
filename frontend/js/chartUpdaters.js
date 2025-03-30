// Contains objects responsible for updating the visual elements of each chart.

import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { ui } from "./uiCache.js";
import { scales, axes, brushes } from "./chartSetup.js"; // Import constructs
import { colors } from "./themeManager.js"; // Import calculated colors
import { EventHandlers } from "./eventHandlers.js";
import { AnnotationManager } from "./annotationManager.js"; // Needed for annotation updates
import { DataService } from "./dataService.js"; // Needed for trend calculation
import { Utils } from "./utils.js";

// --- Focus Chart Updater ---
export const FocusChartUpdater = {
  updateAxes(focusWidth, focusHeight) {
    // Pass dimensions explicitly
    if (!focusWidth || !focusHeight || focusWidth <= 0 || focusHeight <= 0)
      return;
    const dur = CONFIG.transitionDurationMs;

    if (!axes.xAxis || !axes.yAxis) {
      console.warn("FocusChartUpdater: Axes not initialized.");
      return;
    }

    // Update main X and Y axes
    ui.xAxisGroup?.transition().duration(dur).call(axes.xAxis);
    ui.yAxisGroup?.transition().duration(dur).call(axes.yAxis);

    // Update Y grid lines
    const yTicks = axes.yAxis.scale().ticks(axes.yAxis.ticks()[0]); // Get calculated ticks
    ui.gridGroup?.transition().duration(dur).call(
      d3
        .axisLeft(scales.y)
        .tickSize(-focusWidth) // Use calculated width
        .tickFormat("")
        .tickValues(yTicks), // Use the calculated ticks for grid
    );
    // Ensure domain path is removed from grid lines
    ui.gridGroup?.selectAll(".domain").remove();
  },

  updatePaths(visibleValidSmaData, regressionResult) {
    const dur = CONFIG.transitionDurationMs;
    if (!ui.chartArea || !scales.x || !scales.y) {
      console.warn(
        "FocusChartUpdater: Chart area or scales not ready for path update.",
      );
      return;
    }

    // --- Line and Area Generators ---
    const smaLineGen = d3
      .line()
      .x((d) => scales.x(d.date))
      .y((d) => scales.y(d.sma))
      .curve(d3.curveMonotoneX)
      .defined(
        (d) =>
          d.sma != null && !isNaN(scales.x(d.date)) && !isNaN(scales.y(d.sma)),
      );
    const smaBandAreaGen = d3
      .area()
      .x((d) => scales.x(d.date))
      .y0((d) => scales.y(d.lowerBound))
      .y1((d) => scales.y(d.upperBound))
      .curve(d3.curveMonotoneX)
      .defined(
        (d) =>
          d.lowerBound != null &&
          d.upperBound != null &&
          !isNaN(scales.x(d.date)) &&
          !isNaN(scales.y(d.lowerBound)) &&
          !isNaN(scales.y(d.upperBound)),
      );
    const regressionLineGen = d3
      .line()
      .x((d) => scales.x(d.date))
      .y((d) => scales.y(d.regressionValue))
      .defined(
        (d) =>
          d.regressionValue != null &&
          !isNaN(scales.x(d.date)) &&
          !isNaN(scales.y(d.regressionValue)),
      );
    const regressionCIAreaGen = d3
      .area()
      .x((d) => scales.x(d.date))
      .y0((d) => scales.y(d.lowerCI))
      .y1((d) => scales.y(d.upperCI))
      .curve(d3.curveMonotoneX)
      .defined(
        (d) =>
          d.lowerCI != null &&
          d.upperCI != null &&
          !isNaN(scales.x(d.date)) &&
          !isNaN(scales.y(d.lowerCI)) &&
          !isNaN(scales.y(d.upperCI)),
      );
    const trendLineGen = (startDate, initialWeight, weeklyIncrease) =>
      d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => {
          const weight = DataService.calculateTrendWeight(
            startDate,
            initialWeight,
            weeklyIncrease,
            d.date,
          );
          return weight != null && !isNaN(weight) ? scales.y(weight) : NaN;
        })
        .defined((d) => {
          const weight = DataService.calculateTrendWeight(
            startDate,
            initialWeight,
            weeklyIncrease,
            d.date,
          );
          return (
            d.date >= startDate &&
            weight != null &&
            !isNaN(weight) &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(weight))
          );
        });
    const goalLineGen = d3
      .line()
      .x((d) => scales.x(d.date))
      .y((d) => scales.y(d.weight))
      .defined((d) => !isNaN(scales.x(d.date)) && !isNaN(scales.y(d.weight)));

    // --- Update Selections ---
    ui.bandArea
      ?.datum(visibleValidSmaData)
      .transition()
      .duration(dur)
      .style("display", state.seriesVisibility.smaBand ? null : "none")
      .attr("d", smaBandAreaGen);
    ui.smaLine
      ?.datum(visibleValidSmaData)
      .transition()
      .duration(dur)
      .style("display", state.seriesVisibility.smaLine ? null : "none")
      .attr("d", smaLineGen);

    // Regression Line & CI
    const showReg = state.seriesVisibility.regression;
    const showRegCI = state.seriesVisibility.regressionCI && showReg;
    // Ensure regressionResult exists before accessing points/pointsWithCI
    const regPoints =
      showReg && regressionResult?.points ? regressionResult.points : [];
    const regCIPoints =
      showRegCI && regressionResult?.pointsWithCI
        ? regressionResult.pointsWithCI
        : [];

    // <<< --- ADD LOG --- >>>
    console.log(
      `[FocusUpdater Paths] Regression visibility state: showReg=${showReg}, showRegCI=${showRegCI}. Points length: ${regPoints.length}. CI Points length: ${regCIPoints.length}`,
    );

    ui.regressionLine
      ?.datum(regPoints) // Pass potentially empty array if not visible or no points
      .transition()
      .duration(dur)
      // Use 'display' style based directly on showReg and points length
      .style("display", showReg && regPoints.length > 0 ? null : "none") // <-- Check logic here
      .attr("d", regressionLineGen); // Generator will handle empty data

    ui.regressionCIArea
      ?.datum(regCIPoints) // Pass potentially empty array
      .transition()
      .duration(dur)
      // Use 'display' style based directly on showRegCI and points length
      .style("display", showRegCI && regCIPoints.length > 0 ? null : "none") // <-- Check logic here
      .attr("d", regressionCIAreaGen); // Generator will handle empty data

    // Manual Trendlines
    const trendConfig = DataService.getTrendlineConfigFromUI();
    const trendData = trendConfig.isValid ? state.processedData : [];
    ui.trendLine1
      ?.datum(
        state.seriesVisibility.trend1 && trendData.length ? trendData : [],
      )
      .transition()
      .duration(dur)
      .style(
        "display",
        state.seriesVisibility.trend1 && trendData.length ? null : "none",
      )
      .attr(
        "d",
        trendLineGen(
          trendConfig.startDate,
          trendConfig.initialWeight,
          trendConfig.weeklyIncrease1,
        ),
      );
    ui.trendLine2
      ?.datum(
        state.seriesVisibility.trend2 && trendData.length ? trendData : [],
      )
      .transition()
      .duration(dur)
      .style(
        "display",
        state.seriesVisibility.trend2 && trendData.length ? null : "none",
      )
      .attr(
        "d",
        trendLineGen(
          trendConfig.startDate,
          trendConfig.initialWeight,
          trendConfig.weeklyIncrease2,
        ),
      );

    // Goal Line
    let goalLineData = [];
    if (
      state.seriesVisibility.goal &&
      state.goal.weight != null &&
      state.processedData.length > 0
    ) {
      const lastSmaPoint = [...state.processedData]
        .reverse()
        .find((d) => d.sma != null && d.date instanceof Date && !isNaN(d.date));
      if (lastSmaPoint?.date) {
        const startDate = lastSmaPoint.date;
        const startWeight = lastSmaPoint.sma;
        const endDateRaw = state.goal.date
          ? state.goal.date
          : scales.x?.domain()?.[1];
        if (
          endDateRaw instanceof Date &&
          !isNaN(endDateRaw) &&
          endDateRaw >= startDate
        ) {
          goalLineData = [
            { date: startDate, weight: startWeight },
            { date: endDateRaw, weight: state.goal.weight },
          ];
        }
      }
    }
    ui.goalLine
      ?.datum(goalLineData)
      .transition()
      .duration(dur)
      .style("display", goalLineData.length > 0 ? null : "none")
      .attr("d", goalLineGen);
  },

  updateDots(visibleRawWeightData) {
    const dur = CONFIG.transitionDurationMs;
    if (!ui.rawDotsGroup || !ui.smaDotsGroup || !scales.x || !scales.y) return;

    const showRaw = state.seriesVisibility.raw;
    const showSmaDots = state.seriesVisibility.smaLine;

    // Raw Dots
    ui.rawDotsGroup?.style("display", showRaw ? null : "none");
    if (showRaw && ui.rawDotsGroup) {
      const rawDotsDataValid = visibleRawWeightData.filter(
        (d) =>
          d.value != null &&
          d.date instanceof Date &&
          !isNaN(d.date) &&
          !isNaN(scales.x(d.date)) &&
          !isNaN(scales.y(d.value)),
      );
      const rawDots = ui.rawDotsGroup
        .selectAll(".raw-dot")
        .data(rawDotsDataValid, (d) => d.dateString || d.date);
      rawDots.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "raw-dot")
            .attr("r", CONFIG.rawDotRadius)
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value))
            .style("fill", colors.rawDot)
            .style("opacity", 0)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.4),
            ),
        (update) =>
          update.call((update) =>
            update
              .transition()
              .duration(dur)
              .attr("cx", (d) => scales.x(d.date))
              .attr("cy", (d) => scales.y(d.value))
              .style("opacity", 0.4),
          ),
        (exit) => exit.transition().duration(dur).style("opacity", 0).remove(),
      );
    } else {
      ui.rawDotsGroup?.selectAll(".raw-dot").remove();
    }

    // SMA Dots (represent raw values when SMA line is visible)
    ui.smaDotsGroup?.style("display", showSmaDots ? null : "none");
    if (showSmaDots && ui.smaDotsGroup) {
      const smaDotsDataValid = visibleRawWeightData.filter(
        (d) =>
          d.value != null &&
          d.date instanceof Date &&
          !isNaN(d.date) &&
          !isNaN(scales.x(d.date)) &&
          !isNaN(scales.y(d.value)),
      );
      const smaDots = ui.smaDotsGroup
        .selectAll(".dot")
        .data(smaDotsDataValid, (d) => d.dateString || d.date);
      smaDots.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "dot")
            .classed("outlier", (d) => d.isOutlier)
            .attr("r", CONFIG.dotRadius)
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value))
            .style("fill", (d) =>
              d.isOutlier ? colors.outlier || "red" : colors.dot || "blue",
            )
            .style("opacity", 0)
            .style("cursor", "pointer")
            .on("mouseover", EventHandlers.dotMouseOver)
            .on("mouseout", EventHandlers.dotMouseOut)
            .on("click", EventHandlers.dotClick)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.7),
            ),
        (update) =>
          update
            .classed("outlier", (d) => d.isOutlier)
            .classed(
              "highlighted",
              (d) =>
                state.highlightedDate &&
                d.date.getTime() === state.highlightedDate.getTime(),
            )
            .call((update) =>
              update
                .transition()
                .duration(dur)
                .attr("cx", (d) => scales.x(d.date))
                .attr("cy", (d) => scales.y(d.value))
                .style("fill", (d) =>
                  d.isOutlier ? colors.outlier || "red" : colors.dot || "blue",
                )
                .attr("r", (d) =>
                  state.highlightedDate &&
                  d.date.getTime() === state.highlightedDate.getTime()
                    ? CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier * 0.8
                    : CONFIG.dotRadius,
                )
                .style("opacity", (d) =>
                  state.highlightedDate &&
                  d.date.getTime() === state.highlightedDate.getTime()
                    ? 1
                    : 0.7,
                ),
            ),
        (exit) => exit.transition().duration(dur).style("opacity", 0).remove(),
      );
    } else {
      ui.smaDotsGroup?.selectAll(".dot").remove();
    }
  },

  updateHighlightMarker(visibleRawWeightData) {
    const dur = CONFIG.transitionDurationMs;
    if (!ui.highlightGroup || !scales.x || !scales.y) return;
    const highlightDataPoint = state.highlightedDate
      ? visibleRawWeightData.find(
          (d) =>
            d.value != null &&
            d.date instanceof Date &&
            d.date.getTime() === state.highlightedDate.getTime() &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.value)),
        )
      : null;
    const highlightMarker = ui.highlightGroup
      .selectAll(".highlight-marker")
      .data(highlightDataPoint ? [highlightDataPoint] : [], (d) => d.date);
    highlightMarker.join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "highlight-marker")
          .attr("r", 0)
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
              .duration(dur * 0.8)
              .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
              .style("opacity", 0.8),
          ),
      (update) =>
        update
          .transition()
          .duration(dur)
          .attr("cx", (d) => scales.x(d.date))
          .attr("cy", (d) => scales.y(d.value))
          .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
          .style("opacity", 0.8),
      (exit) =>
        exit
          .transition()
          .duration(dur / 2)
          .attr("r", 0)
          .style("opacity", 0)
          .remove(),
    );
  },

  updateCrosshair(hoverData, focusWidth, focusHeight) {
    if (!ui.crosshairGroup) return;
    if (!hoverData || !hoverData.date || !focusWidth || !focusHeight) {
      ui.crosshairGroup.style("display", "none");
      return;
    }
    if (!scales.x || !scales.y) return;
    const xPos = scales.x(hoverData.date);
    const yValue = hoverData.value ?? hoverData.sma;
    const yPos = yValue != null && !isNaN(yValue) ? scales.y(yValue) : null;
    if (
      yPos != null &&
      isFinite(xPos) &&
      isFinite(yPos) &&
      xPos >= 0 &&
      xPos <= focusWidth &&
      yPos >= 0 &&
      yPos <= focusHeight
    ) {
      ui.crosshairGroup.style("display", null);
      ui.crosshairGroup
        .select(".crosshair.crosshair-y")
        .attr("transform", `translate(0, ${yPos})`);
      ui.crosshairGroup
        .select(".crosshair.crosshair-x")
        .attr("transform", `translate(${xPos}, 0)`);
    } else {
      ui.crosshairGroup.style("display", "none");
    }
  },

  updateAnnotations(visibleData) {
    const dur = CONFIG.transitionDurationMs;
    if (!ui.annotationsGroup || !scales.x || !scales.y) return;
    const annotationData = state.seriesVisibility.annotations
      ? state.annotations
      : [];
    const xDomain = scales.x.domain();
    const visibleAnnotations = annotationData.filter((a) => {
      const date = new Date(a.date);
      return (
        !isNaN(date.getTime()) &&
        date >= xDomain[0] &&
        date <= xDomain[1] &&
        a.type === "point"
      );
    });
    const findYValue = (targetDate) => {
      if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
        return null;
      const targetTime = targetDate.getTime();
      const pointData = visibleData.find(
        (d) => d.date instanceof Date && d.date.getTime() === targetTime,
      );
      const yVal = pointData ? (pointData.sma ?? pointData.value) : null;
      return yVal != null && !isNaN(scales.y(yVal)) ? yVal : null;
    };
    const markers = ui.annotationsGroup
      .selectAll(".annotation-marker-group")
      .data(visibleAnnotations, (d) => d.id);
    markers.join(
      (enter) => {
        const group = enter
          .append("g")
          .attr("class", "annotation-marker-group")
          .style("opacity", 0);
        group.attr("transform", (d) => {
          const yValue = findYValue(new Date(d.date));
          return yValue != null
            ? `translate(${scales.x(new Date(d.date))}, ${scales.y(yValue)})`
            : `translate(-1000, -1000)`;
        });
        group
          .append("circle")
          .attr("class", "annotation-marker")
          .attr("r", CONFIG.annotationMarkerRadius)
          .style("fill", colors.annotationMarker || "orange")
          .style("stroke", "var(--bg-secondary)")
          .style("stroke-width", 1.5)
          .style("cursor", "help");
        group
          .on("mouseover", EventHandlers.annotationMouseOver)
          .on("mouseout", EventHandlers.annotationMouseOut);
        group.transition().duration(dur).style("opacity", 0.8);
        return group;
      },
      (update) =>
        update
          .transition()
          .duration(dur)
          .style("opacity", 0.8)
          .attr("transform", (d) => {
            const yValue = findYValue(new Date(d.date));
            return yValue != null
              ? `translate(${scales.x(new Date(d.date))}, ${scales.y(yValue)})`
              : `translate(-1000, -1000)`;
          }),
      (exit) =>
        exit
          .transition()
          .duration(dur / 2)
          .style("opacity", 0)
          .attr("transform", `translate(-1000, -1000)`)
          .remove(),
    );
  },

  updatePlateauRegions(focusHeight) {
    const dur = CONFIG.transitionDurationMs;
    if (!ui.plateauGroup || !scales.x || !focusHeight) return;
    const plateauData = state.seriesVisibility.plateaus ? state.plateaus : [];
    const xDomain = scales.x.domain();
    const visiblePlateaus = plateauData.filter(
      (p) =>
        p.endDate instanceof Date &&
        p.startDate instanceof Date &&
        p.endDate >= xDomain[0] &&
        p.startDate <= xDomain[1],
    );
    const regions = ui.plateauGroup
      .selectAll(".plateau-region")
      .data(visiblePlateaus, (d) => `${d.startDate}-${d.endDate}`);
    regions.join(
      (enter) =>
        enter
          .append("rect")
          .attr("class", "plateau-region")
          .attr("x", (d) => scales.x(d.startDate))
          .attr("y", 0)
          .attr("width", (d) => {
            const xStart = scales.x(d.startDate);
            const xEnd = scales.x(d.endDate);
            return !isNaN(xStart) && !isNaN(xEnd)
              ? Math.max(0, xEnd - xStart)
              : 0;
          })
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
          .attr("width", (d) => {
            const xStart = scales.x(d.startDate);
            const xEnd = scales.x(d.endDate);
            return !isNaN(xStart) && !isNaN(xEnd)
              ? Math.max(0, xEnd - xStart)
              : 0;
          })
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

  updateTrendChangeMarkers(processedData) {
    const dur = CONFIG.transitionDurationMs;
    if (!ui.trendChangeGroup || !scales.x || !scales.y) return;

    // <<< --- ADD LOG --- >>>
    console.log(
      `[FocusChartUpdater] Running updateTrendChangeMarkers. Visibility state (trendChanges) = ${state.seriesVisibility.trendChanges}`,
    );

    const markerData = state.seriesVisibility.trendChanges // Check the flag
      ? state.trendChangePoints
      : []; // Use empty array if hidden

    const xDomain = scales.x.domain();
    const findYValue = (targetDate) => {
      // <<< Use function scope for pointData, avoid potential closure issues >>>
      const localProcessedData = processedData; // Use passed data
      if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
        return null;
      const targetTime = targetDate.getTime();
      const pointData = localProcessedData.find(
        (d) => d.date instanceof Date && d.date.getTime() === targetTime,
      );
      const yVal = pointData ? (pointData.sma ?? pointData.value) : null;
      return yVal != null && !isNaN(scales.y(yVal)) ? yVal : null;
    };
    const visibleMarkers = markerData.filter(
      (p) =>
        p.date instanceof Date && // <<< Add check for valid date object
        !isNaN(p.date) &&
        p.date >= xDomain[0] &&
        p.date <= xDomain[1],
    );

    // <<< --- ADD LOG --- >>>
    console.log(
      `[FocusChartUpdater] Filtered markerData length: ${markerData.length}, visibleMarkers length: ${visibleMarkers.length}`,
    );

    const markerSize = 4;
    const markerPath = d3
      .symbol()
      .type(d3.symbolTriangle)
      .size(markerSize * markerSize * 1.5);

    const markers = ui.trendChangeGroup
      .selectAll(".trend-change-marker-group")
      .data(visibleMarkers, (d) => d.date); // Bind to potentially empty data

    // Join logic handles adding/removing based on visibleMarkers data
    markers.join(
      (enter) => {
        // <<< --- ADD LOG --- >>>
        console.log(
          `[FocusChartUpdater] Entering ${enter.size()} trend change markers.`,
        );
        const group = enter
          .append("g")
          .attr("class", "trend-change-marker-group")
          .style("opacity", 0);
        group.attr("transform", (d) => {
          const yValue = findYValue(d.date);
          const rotation = d.magnitude > 0 ? 180 : 0;
          const xPos = scales.x(d.date);
          const yPos = yValue != null ? scales.y(yValue) : null;
          return xPos != null && yPos != null && !isNaN(xPos) && !isNaN(yPos)
            ? `translate(${xPos}, ${yPos}) rotate(${rotation})`
            : `translate(-1000, -1000)`; // Hide if position is invalid
        });
        group
          .append("path")
          .attr("class", "trend-change-marker")
          .attr("d", markerPath)
          .style("fill", colors.trendChangeColor || "red")
          .style("cursor", "help");
        group
          .on("mouseover", EventHandlers.trendChangeMouseOver)
          .on("mouseout", EventHandlers.trendChangeMouseOut);
        group.transition().duration(dur).style("opacity", 1);
        return group;
      },
      (update) => {
        // <<< --- ADD LOG --- >>>
        console.log(
          `[FocusChartUpdater] Updating ${update.size()} trend change markers.`,
        );
        return update // <<< Make sure to return the update selection
          .transition()
          .duration(dur)
          .style("opacity", 1)
          .attr("transform", (d) => {
            const yValue = findYValue(d.date);
            const rotation = d.magnitude > 0 ? 180 : 0;
            const xPos = scales.x(d.date);
            const yPos = yValue != null ? scales.y(yValue) : null;
            return xPos != null && yPos != null && !isNaN(xPos) && !isNaN(yPos)
              ? `translate(${xPos}, ${yPos}) rotate(${rotation})`
              : `translate(-1000, -1000)`; // Hide if position is invalid
          });
      },
      (exit) => {
        // <<< --- ADD LOG --- >>>
        console.log(
          `[FocusChartUpdater] Exiting ${exit.size()} trend change markers.`,
        );
        return exit // <<< Make sure to return the exit selection
          .transition()
          .duration(dur / 2)
          .style("opacity", 0)
          .attr("transform", `translate(-1000, -1000)`)
          .remove();
      },
    );
  },

  updateGoalVisuals(focusWidth, focusHeight) {
    const dur = CONFIG.transitionDurationMs;
    const goalWeight = state.goal.weight;
    const isGoalVisible = state.seriesVisibility.goal;
    const achievedDate = state.goalAchievedDate; // Get date from state

    // --- Update Goal Zone Rect ---
    if (
      ui.goalZoneRect &&
      !ui.goalZoneRect.empty() &&
      goalWeight != null &&
      isGoalVisible
    ) {
      const buffer = 0.15; // +/- 0.15 kg buffer zone
      const yUpper = scales.y(goalWeight + buffer);
      const yLower = scales.y(goalWeight - buffer);

      if (!isNaN(yUpper) && !isNaN(yLower) && yLower >= yUpper) {
        ui.goalZoneRect
          .transition()
          .duration(dur)
          .attr("x", 0)
          .attr("y", yUpper)
          .attr("width", focusWidth)
          .attr("height", Math.max(0, yLower - yUpper))
          .style("display", null)
          .style("fill", colors.goal || "#9b59b6") // Match goal line color
          .style("fill-opacity", 0.06); // Subtle opacity
      } else {
        ui.goalZoneRect.style("display", "none");
      }
    } else {
      ui.goalZoneRect?.style("display", "none");
    }

    // --- Update Goal Achievement Marker ---
    const markerData =
      achievedDate instanceof Date &&
      !isNaN(achievedDate) &&
      goalWeight != null &&
      isGoalVisible
        ? [achievedDate] // Use an array for D3 data join
        : [];

    const markerSymbol = "🚩"; // Or ★

    if (ui.goalAchievedGroup && !ui.goalAchievedGroup.empty()) {
      const markers = ui.goalAchievedGroup
        .selectAll(".goal-achieved-marker")
        .data(markerData, (d) => d.getTime()); // Use date timestamp as key

      markers.join(
        (enter) =>
          enter
            .append("text")
            .attr("class", "goal-achieved-marker")
            .attr("x", (d) => scales.x(d))
            .attr("y", (d) => scales.y(goalWeight))
            .attr("dy", "-0.5em") // Position slightly above the line
            .attr("text-anchor", "middle")
            .style("font-size", "1.3em") // Adjust size
            .style("fill", colors.goal || "#9b59b6") // Use goal color
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
            .attr("y", (d) => scales.y(goalWeight))
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

  updateRegressionBrushDisplay(focusWidth) {
    if (
      !ui.regressionBrushGroup ||
      !brushes.regression ||
      !scales.x ||
      !focusWidth
    )
      return;
    const range = state.interactiveRegressionRange;
    if (
      range.start instanceof Date &&
      range.end instanceof Date &&
      !isNaN(range.start.getTime()) &&
      !isNaN(range.end.getTime())
    ) {
      const pixelStart = Math.max(
        0,
        Math.min(focusWidth, scales.x(range.start)),
      );
      const pixelEnd = Math.max(0, Math.min(focusWidth, scales.x(range.end)));
      if (
        pixelEnd > pixelStart &&
        pixelEnd > 0 &&
        pixelStart < focusWidth &&
        !isNaN(pixelStart) &&
        !isNaN(pixelEnd)
      ) {
        ui.regressionBrushGroup
          .selectAll(".overlay, .selection, .handle")
          .style("display", null);
        const currentSelection = d3.brushSelection(
          ui.regressionBrushGroup.node(),
        );
        const tolerance = 1;
        if (
          !currentSelection ||
          Math.abs(currentSelection[0] - pixelStart) > tolerance ||
          Math.abs(currentSelection[1] - pixelEnd) > tolerance
        ) {
          ui.regressionBrushGroup.on(".brush", null).on(".end", null);
          ui.regressionBrushGroup.call(brushes.regression.move, [
            pixelStart,
            pixelEnd,
          ]);
          ui.regressionBrushGroup.on(
            "end.handler",
            EventHandlers.regressionBrushed,
          );
        }
      } else {
        ui.regressionBrushGroup
          .selectAll(".overlay, .selection, .handle")
          .style("display", "none");
        if (d3.brushSelection(ui.regressionBrushGroup.node())) {
          ui.regressionBrushGroup.on(".brush", null).on(".end", null);
          ui.regressionBrushGroup.call(brushes.regression.move, null);
          ui.regressionBrushGroup.on(
            "end.handler",
            EventHandlers.regressionBrushed,
          );
        }
      }
    } else {
      ui.regressionBrushGroup
        .selectAll(".overlay, .selection, .handle")
        .style("display", "none");
      if (d3.brushSelection(ui.regressionBrushGroup.node())) {
        ui.regressionBrushGroup.on(".brush", null).on(".end", null);
        ui.regressionBrushGroup.call(brushes.regression.move, null);
        ui.regressionBrushGroup.on(
          "end.handler",
          EventHandlers.regressionBrushed,
        );
      }
    }
  },
};

// --- Context Chart Updater ---
export const ContextChartUpdater = {
  updateAxes() {
    if (!axes.xAxisContext) return;
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
    const contextValueAccessor = (d) => d.sma ?? d.value;
    const contextAreaGen = d3
      .area()
      .curve(d3.curveMonotoneX)
      .x((d) => scales.xContext(d.date))
      .y0(scales.yContext.range()[0])
      .y1((d) => scales.yContext(contextValueAccessor(d)))
      .defined(
        (d) =>
          contextValueAccessor(d) != null &&
          !isNaN(scales.xContext(d.date)) &&
          !isNaN(scales.yContext(contextValueAccessor(d))),
      );
    const contextLineGen = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((d) => scales.xContext(d.date))
      .y((d) => scales.yContext(contextValueAccessor(d)))
      .defined(
        (d) =>
          contextValueAccessor(d) != null &&
          !isNaN(scales.xContext(d.date)) &&
          !isNaN(scales.yContext(contextValueAccessor(d))),
      );
    ui.contextArea?.datum(processedData).attr("d", contextAreaGen);
    ui.contextLine?.datum(processedData).attr("d", contextLineGen);
  },
};

// --- Balance Chart Updater ---
export const BalanceChartUpdater = {
  updateAxes(balanceWidth) {
    if (!balanceWidth || !axes.xBalanceAxis || !axes.yBalanceAxis) return;
    const dur = CONFIG.transitionDurationMs;
    ui.balanceYAxisGroup?.transition().duration(dur).call(axes.yBalanceAxis);
    ui.balanceYAxisGroup?.select(".domain").remove();
    ui.balanceXAxisGroup?.transition().duration(dur).call(axes.xBalanceAxis);
  },
  updateChart(visibleData, balanceWidth) {
    const dur = CONFIG.transitionDurationMs;
    if (
      !ui.balanceChartArea ||
      !scales.xBalance ||
      !scales.yBalance ||
      !balanceWidth
    )
      return;
    const yZero = scales.yBalance(0);
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
        !isNaN(scales.xBalance(d.date)) &&
        !isNaN(scales.yBalance(d.netBalance)),
    );
    const barWidth = Math.max(
      1,
      balanceWidth / Math.max(1, validBarData.length) - 1,
    );
    const bars = ui.balanceChartArea
      .selectAll(".balance-bar")
      .data(validBarData, (d) => d.dateString || d.date);
    bars.join(
      (enter) =>
        enter
          .append("rect")
          .attr("class", "balance-bar")
          .classed("deficit", (d) => d.netBalance < 0)
          .classed("surplus", (d) => d.netBalance >= 0)
          .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
          .attr("y", yZero)
          .attr("width", barWidth)
          .attr("height", 0)
          .style("fill", (d) =>
            d.netBalance >= 0
              ? colors.surplus || "red"
              : colors.deficit || "green",
          )
          .on("mouseover", EventHandlers.balanceMouseOver)
          .on("mouseout", EventHandlers.balanceMouseOut)
          .call((enter) =>
            enter
              .transition()
              .duration(dur)
              .attr("y", (d) =>
                d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
              )
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
              ? colors.surplus || "red"
              : colors.deficit || "green",
          )
          .on("mouseover", EventHandlers.balanceMouseOver)
          .on("mouseout", EventHandlers.balanceMouseOut)
          .call((update) =>
            update
              .transition()
              .duration(dur)
              .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
              .attr("width", barWidth)
              .attr("y", (d) =>
                d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
              )
              .attr("height", (d) =>
                Math.abs(scales.yBalance(d.netBalance) - yZero),
              ),
          ),
      (exit) =>
        exit.call((exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .attr("y", yZero)
            .attr("height", 0)
            .remove(),
        ),
    );
  },
};

// --- Rate of Change Chart Updater ---
export const RateChartUpdater = {
  updateAxes(rateWidth) {
    if (!rateWidth || !axes.xRateAxis || !axes.yRateAxis) return;
    const dur = CONFIG.transitionDurationMs;
    ui.rateYAxisGroup?.transition().duration(dur).call(axes.yRateAxis);
    ui.rateYAxisGroup?.select(".domain").remove();
    ui.rateXAxisGroup?.transition().duration(dur).call(axes.xRateAxis);
  },
  updateChart(visibleData, rateWidth) {
    const dur = CONFIG.transitionDurationMs;
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
          .style("fill", colors.optimalGainZone || "hsla(120, 60%, 50%, 0.1)");
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
          d.smoothedWeeklyRate != null &&
          !isNaN(scales.xRate(d.date)) &&
          !isNaN(scales.yRate(d.smoothedWeeklyRate)),
      );
    ui.rateLine
      ?.datum(visibleData)
      .transition()
      .duration(dur)
      .attr("d", rateLineGen);
  },
};

// --- TDEE Difference Chart Updater ---
export const TDEEDiffChartUpdater = {
  updateAxes(tdeeDiffWidth) {
    if (!tdeeDiffWidth || !axes.xTdeeDiffAxis || !axes.yTdeeDiffAxis) return;
    const dur = CONFIG.transitionDurationMs;
    ui.tdeeDiffYAxisGroup?.transition().duration(dur).call(axes.yTdeeDiffAxis);
    ui.tdeeDiffYAxisGroup?.select(".domain").remove();
    ui.tdeeDiffXAxisGroup?.transition().duration(dur).call(axes.xTdeeDiffAxis);
  },
  updateChart(visibleData) {
    const dur = CONFIG.transitionDurationMs;
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
          d.avgTdeeDifference != null &&
          !isNaN(scales.xTdeeDiff(d.date)) &&
          !isNaN(scales.yTdeeDiff(d.avgTdeeDifference)),
      );
    ui.tdeeDiffLine
      ?.datum(visibleData)
      .transition()
      .duration(dur)
      .attr("d", tdeeDiffLineGen);
  },
};

// --- Scatter Plot Updater ---
export const ScatterPlotUpdater = {
  updateAxes() {
    if (!axes.xScatterAxis || !axes.yScatterAxis) return;
    const dur = CONFIG.transitionDurationMs;
    ui.correlationScatterXAxisGroup
      ?.transition()
      .duration(dur)
      .call(axes.xScatterAxis);
    ui.correlationScatterYAxisGroup
      ?.transition()
      .duration(dur)
      .call(axes.yScatterAxis);
  },
  updateChart(scatterData) {
    const dur = CONFIG.transitionDurationMs;
    if (!ui.scatterDotsGroup || !scales.xScatter || !scales.yScatter) return;
    const validScatterData = (
      Array.isArray(scatterData) ? scatterData : []
    ).filter(
      (d) =>
        d.avgNetCal != null &&
        !isNaN(d.avgNetCal) &&
        d.weeklyRate != null &&
        !isNaN(d.weeklyRate) &&
        !isNaN(scales.xScatter(d.avgNetCal)) &&
        !isNaN(scales.yScatter(d.weeklyRate)),
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
          .style("fill", colors.scatterDotColor || "#34495e")
          .style("opacity", 0)
          .style("cursor", "help")
          .on("mouseover", EventHandlers.scatterMouseOver)
          .on("mouseout", EventHandlers.scatterMouseOut)
          .call((enter) =>
            enter.transition().duration(dur).style("opacity", 0.7),
          ),
      (update) =>
        update
          .on("mouseover", EventHandlers.scatterMouseOver)
          .on("mouseout", EventHandlers.scatterMouseOut)
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
