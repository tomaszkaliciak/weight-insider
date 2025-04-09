// eventHandlers.js
// Handles user interactions like mouse hovers, clicks, zoom, brush, form submissions, etc.
// Primarily updates application state and triggers high-level updates.

import { state } from "../state.js";
import { ui } from "../ui/uiCache.js";
import {
  scales,
  axes,
  brushes,
  zoom,
  initializeChartSetup,
} from "../ui/chartSetup.js";
import { CONFIG } from "../config.js";
import { Utils } from "../core/utils.js";
import { DomainManager } from "../core/domainManager.js";
import { MasterUpdater } from "../ui/masterUpdater.js";
import { StatsManager } from "../core/statsManager.js";
import { DataService } from "../core/dataService.js";
import { GoalManager } from "../core/goalManager.js";
import { AnnotationManager } from "../core/annotationManager.js";
import { AnnotationListRenderer } from "../ui/renderers/annotationListRenderer.js";
import { LegendManager } from "../ui/legendManager.js";
import { ThemeManager } from "../core/themeManager.js";
import { EventBus } from "../core/eventBus.js";

export const EventHandlers = {
  _isZooming: false, // Internal flag to prevent re-entry during zoom
  _isBrushing: false, // Internal flag to prevent re-entry during brush

  // --- Tooltip Helper Functions ---
  _showTooltip(htmlContent, event) {
    if (!ui.tooltip || ui.tooltip.empty()) return;
    if (state.tooltipTimeoutId) clearTimeout(state.tooltipTimeoutId);
    state.tooltipTimeoutId = null;

    const show = () => {
      const margin = 15;
      const tooltipNode = ui.tooltip.node();
      if (!tooltipNode) return;
      let tooltipX = event.pageX + margin;
      let tooltipY = event.pageY - margin - tooltipNode.offsetHeight;
      const bodyWidth = document.body.clientWidth;
      const bodyHeight = document.body.clientHeight; // Or window.innerHeight
      if (tooltipX + tooltipNode.offsetWidth > bodyWidth - margin) {
        tooltipX = event.pageX - margin - tooltipNode.offsetWidth; // Flip to left
      }
      if (tooltipY < margin) {
        tooltipY = event.pageY + margin; // Flip below cursor
      }
      // Ensure it doesn't go off bottom - may need adjustment based on layout
      // if (tooltipY + tooltipNode.offsetHeight > bodyHeight - margin) {
      //    tooltipY = bodyHeight - margin - tooltipNode.offsetHeight;
      // }

      ui.tooltip
        .html(htmlContent)
        .style("left", `${tooltipX}px`)
        .style("top", `${tooltipY}px`)
        // Use transition for opacity, but set position immediately
        .style("opacity", 0.95); // Make it visible
    };

    // Show immediately if tooltip is already visible, otherwise use delay
    if (parseFloat(ui.tooltip.style("opacity")) > 0) {
      show(); // Update content/position immediately
    } else {
      // Use a short delay to show, avoids flickering during fast mouse movements
      state.tooltipTimeoutId = setTimeout(show, CONFIG.tooltipDelayMs);
    }
  },

  _hideTooltip() {
    if (!ui.tooltip || ui.tooltip.empty()) return;
    // Clear any pending show timeout
    if (state.tooltipTimeoutId) clearTimeout(state.tooltipTimeoutId);
    state.tooltipTimeoutId = null;

    // Only hide if not pinned
    if (!state.pinnedTooltipData) {
      // Use a delay before hiding to allow moving mouse between close points
      state.tooltipTimeoutId = setTimeout(() => {
        if (!state.pinnedTooltipData) {
          // Double check pin status before hiding
          ui.tooltip.style("opacity", 0).style("left", "-1000px"); // Move offscreen too
        }
      }, CONFIG.tooltipDelayMs);
    }
  },

  // --- Main Chart Hover ---
  dotMouseOver(event, d) {
    if (!ui.tooltip || !d || !d.date) return;
    // 1. Update State
    state.activeHoverData = d;

    // 2. Direct UI Feedback (hovered element)
    d3.select(event.currentTarget)
      .raise()
      .transition()
      .duration(50)
      .attr("r", CONFIG.dotHoverRadius)
      .style("opacity", 1);

    // 3. Direct UI Feedback (tooltip)
    let tt = `<strong>${Utils.formatDateLong(d.date)}</strong>`;
    tt += `<div style="margin-top: 4px;">Weight: ${Utils.formatValue(d.value, 1)} KG</div>`;
    if (d.sma != null)
      tt += `<div>SMA (${CONFIG.movingAverageWindow}d): ${Utils.formatValue(d.sma, 1)} KG</div>`;

    if (d.value != null && d.sma != null) {
      const dev = d.value - d.sma;
      tt += `<div>Deviation: <span class="${dev >= 0 ? "positive" : "negative"}">${dev >= 0 ? "+" : ""}${Utils.formatValue(dev, 1)} KG</span></div>`;
    }
    if (d.isOutlier)
      tt += `<div class="note outlier-note" style="margin-top: 4px;">Potential Outlier</div>`;

    // Add secondary chart data
    const secondaryDataLines = [];
    if (d.netBalance != null)
      secondaryDataLines.push(
        `Balance: ${Utils.formatValue(d.netBalance, 0)} kcal`,
      );
    if (d.smoothedWeeklyRate != null)
      secondaryDataLines.push(
        `Smoothed Rate: ${Utils.formatValue(d.smoothedWeeklyRate, 2)} kg/wk`,
      );
    if (d.avgTdeeDifference != null)
      secondaryDataLines.push(
        `Avg TDEE Diff: ${Utils.formatValue(d.avgTdeeDifference, 0)} kcal`,
      );
    if (d.adaptiveTDEE != null)
      secondaryDataLines.push(
        `Adaptive TDEE: ${Utils.formatValue(d.adaptiveTDEE, 0)} kcal`,
      ); // Optional

    if (secondaryDataLines.length > 0) {
      tt += `<hr class="tooltip-hr">${secondaryDataLines.join("<br>")}`;
    }

    // Add annotation text if present
    const annotation = AnnotationManager.findAnnotationByDate(d.date); // Use imported manager
    if (annotation) {
      tt += `<hr class="tooltip-hr"><div class="note annotation-note">${annotation.text}</div>`;
    }

    // Add pinning instruction
    const isPinned = state.pinnedTooltipData?.id === d.date.getTime();
    tt += `<hr class="tooltip-hr"><div class="note pinned-note">${isPinned ? "Click dot to unpin." : "Click dot to pin tooltip."}</div>`;

    EventHandlers._showTooltip(tt, event); // Use internal helper

    // 4. Trigger High-Level Update (will handle crosshair via MasterUpdater)
    MasterUpdater.updateAllCharts();
  },

  dotMouseOut(event, d) {
    if (!ui.tooltip || !d || !d.date) return;
    // 1. Update State
    state.activeHoverData = null; // Clear active hover

    // 2. Direct UI Feedback (tooltip)
    EventHandlers._hideTooltip(); // Use internal helper

    // 3. Direct UI Feedback (hovered element)
    const isHighlighted =
      state.highlightedDate &&
      d.date.getTime() === state.highlightedDate.getTime();
    const targetRadius = isHighlighted
      ? CONFIG.dotRadius * 1.2 // Keep highlight slightly larger
      : CONFIG.dotRadius;
    const targetOpacity = isHighlighted ? 1 : 0.7;

    d3.select(event.currentTarget)
      .transition()
      .duration(150)
      .attr("r", targetRadius)
      .style("opacity", targetOpacity);

    // 4. Trigger High-Level Update (will hide crosshair via MasterUpdater)
    MasterUpdater.updateAllCharts();
  },

  dotClick(event, d) {
    if (!d || !d.date) return;
    event.stopPropagation(); // Prevent background click handler
    const dataId = d.date.getTime();

    // 1. Update State (pinning)
    let needsTooltipUpdate = false;
    if (state.pinnedTooltipData?.id === dataId) {
      // Unpin
      state.pinnedTooltipData = null;
      needsTooltipUpdate = true;
    } else {
      // Pin
      state.pinnedTooltipData = {
        id: dataId,
        data: d,
        pageX: event.pageX, // Store original position for pinned display
        pageY: event.pageY,
      };
      needsTooltipUpdate = true;
    }

    // 2. Direct UI Feedback (pinned display & tooltip visibility)
    if (needsTooltipUpdate) {
      if (state.pinnedTooltipData) {
        // Re-trigger mouseover logic ONLY for tooltip content/display if pinning
        // Need to ensure the tooltip content is correct for the newly pinned item
        EventHandlers.dotMouseOver(event, d);
        // Ensure tooltip stays visible (clear hide timeout)
        if (state.tooltipTimeoutId) clearTimeout(state.tooltipTimeoutId);
        state.tooltipTimeoutId = null;
        if (ui.tooltip) ui.tooltip.style("opacity", 0.95);
      } else {
        // Hide tooltip if unpinning
        EventHandlers._hideTooltip();
      }
    }
  },

  // --- Other Hovers (Keep direct element feedback + tooltip) ---
  balanceMouseOver(event, d) {
    if (!d || !d.date) return;
    const tt = `<strong>${Utils.formatDateLong(d.date)}</strong><br>Balance: ${Utils.formatValue(d.netBalance, 0)} kcal`;
    EventHandlers._showTooltip(tt, event);
    d3.select(event.currentTarget).style("opacity", 1); // Highlight bar
  },
  balanceMouseOut(event, d) {
    EventHandlers._hideTooltip();
    d3.select(event.currentTarget).style("opacity", 0.8); // Restore opacity
  },
  scatterMouseOver(event, d) {
    if (!d || !d.weekStartDate) return;
    const tt = `<strong>Week: ${Utils.formatDateShort(d.weekStartDate)}</strong><br>Avg Net: ${Utils.formatValue(d.avgNetCal, 0)} kcal/d<br>Rate: ${Utils.formatValue(d.weeklyRate, 2)} kg/wk`;
    EventHandlers._showTooltip(tt, event);
    d3.select(event.currentTarget)
      .raise() // Bring to front
      .transition()
      .duration(50)
      .attr("r", 6)
      .style("opacity", 1)
      .style("stroke", "var(--text-primary)") // Use CSS var
      .style("stroke-width", 1.5);
  },
  scatterMouseOut(event, d) {
    EventHandlers._hideTooltip();
    d3.select(event.currentTarget)
      .transition()
      .duration(150)
      .attr("r", 4)
      .style("opacity", 0.7)
      .style("stroke", "none"); // Remove stroke
  },
  annotationMouseOver(event, d) {
    if (!ui.tooltip || !d) return;
    d3.select(event.currentTarget)
      .select("circle")
      .transition()
      .duration(50)
      .attr("r", CONFIG.annotationMarkerRadius * 1.5); // Enlarge marker
    const tt = `<strong>Annotation (${Utils.formatDateShort(new Date(d.date))})</strong><br>${d.text}`;
    EventHandlers._showTooltip(tt, event);
  },
  annotationMouseOut(event, d) {
    d3.select(event.currentTarget)
      .select("circle")
      .transition()
      .duration(150)
      .attr("r", CONFIG.annotationMarkerRadius); // Restore size
    EventHandlers._hideTooltip();
  },
  trendChangeMouseOver(event, d) {
    if (!ui.tooltip || !d) return;
    d3.select(event.currentTarget)
      .select("path")
      .transition()
      .duration(50)
      .attr("transform", "scale(1.5)"); // Scale symbol
    const direction = d.magnitude > 0 ? "acceleration" : "deceleration";
    const rateChange = Math.abs(d.magnitude * 7); // Convert daily diff to weekly
    const tt = `<strong>Trend Change (${Utils.formatDateShort(d.date)})</strong><br>Significant ${direction} detected.<br>Rate Δ ≈ ${Utils.formatValue(rateChange, 2)} kg/wk`;
    EventHandlers._showTooltip(tt, event);
  },
  trendChangeMouseOut(event, d) {
    d3.select(event.currentTarget)
      .select("path")
      .transition()
      .duration(150)
      .attr("transform", "scale(1)"); // Restore scale
    EventHandlers._hideTooltip();
  },

  // --- Brush and Zoom Handlers (Mostly manage state and trigger updates) ---
  contextBrushed(event) {
    if (
      !event ||
      !event.sourceEvent ||
      event.sourceEvent.type === "zoom" ||
      EventHandlers._isBrushing
    )
      return;
    if (!event.selection && event.type !== "end") return;

    EventHandlers._isBrushing = true;

    state.pinnedTooltipData = null;
    state.highlightedDate = null;
    state.interactiveRegressionRange = { start: null, end: null };

    const selection = event.selection;
    if (!scales.xContext || !scales.x || !zoom) {
      console.warn("Context brush: scales or zoom not ready.");
      EventHandlers._isBrushing = false;
      return;
    }

    const newXDomain = selection
      ? selection.map(scales.xContext.invert)
      : scales.xContext.domain();
    scales.x.domain(newXDomain);

    if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
      const [x0Pixel, x1Pixel] = selection || scales.xContext.range();
      const { width: focusW } = EventHandlers._getChartDimensions("focus");
      if (
        isNaN(x0Pixel) ||
        isNaN(x1Pixel) ||
        !focusW ||
        x1Pixel - x0Pixel <= 0
      ) {
        EventHandlers._isBrushing = false;
        return;
      }
      const k = focusW / (x1Pixel - x0Pixel);
      const tx = -x0Pixel * k;
      const newTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
      state.lastZoomTransform = newTransform;

      ui.zoomCaptureRect.on("zoom", null);
      ui.zoomCaptureRect.call(zoom.transform, newTransform);
      ui.zoomCaptureRect.on("zoom", EventHandlers.zoomed);
    }

    MasterUpdater.updateAllCharts();
    StatsManager.update();
    LegendManager.build();

    setTimeout(() => {
      EventHandlers._isBrushing = false;
    }, 50);
  },

  zoomed(event) {
    if (
      !event ||
      !event.sourceEvent ||
      event.sourceEvent.type === "brush" ||
      EventHandlers._isZooming
    )
      return;

    EventHandlers._isZooming = true;

    state.pinnedTooltipData = null;
    state.highlightedDate = null;
    state.interactiveRegressionRange = { start: null, end: null };
    state.lastZoomTransform = event.transform;

    if (!scales.xContext || !scales.x || !brushes.context) {
      console.warn("Zoom handler: scales or context brush not ready.");
      EventHandlers._isZooming = false;
      return;
    }

    const newXDomain = state.lastZoomTransform
      .rescaleX(scales.xContext)
      .domain();
    scales.x.domain(newXDomain);

    if (ui.brushGroup?.node()) {
      const newBrushSelection = newXDomain.map(scales.xContext);
      ui.brushGroup.on("brush.handler", null).on("end.handler", null);
      if (newBrushSelection.every((v) => !isNaN(v))) {
        ui.brushGroup.call(brushes.context.move, newBrushSelection);
      }
      ui.brushGroup.on(
        "brush.handler end.handler",
        EventHandlers.contextBrushed,
      );
    }

    MasterUpdater.updateAllCharts();
    StatsManager.update();
    LegendManager.build();

    setTimeout(() => {
      EventHandlers._isZooming = false;
    }, 50);
  },

  regressionBrushed(event) {
    if (!event || event.type !== "end" || !event.sourceEvent) return;

    const selection = event.selection;
    let rangeUpdated = false;

    if (selection && selection[0] !== selection[1]) {
      if (!scales.x) return;
      const startDate = scales.x.invert(selection[0]);
      const endDate = scales.x.invert(selection[1]);

      if (
        !(startDate instanceof Date) ||
        !(endDate instanceof Date) ||
        isNaN(startDate) ||
        isNaN(endDate)
      )
        return;

      const currentRange = state.interactiveRegressionRange;
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();
      const currentStartTime = currentRange.start?.getTime();
      const currentEndTime = currentRange.end?.getTime();
      const toleranceMs = 86400000 / 2;

      if (
        currentStartTime === undefined ||
        Math.abs(currentStartTime - startTime) > toleranceMs ||
        currentEndTime === undefined ||
        Math.abs(currentEndTime - endTime) > toleranceMs
      ) {
        state.interactiveRegressionRange = { start: startDate, end: endDate };
        Utils.showStatusMessage("Regression range updated.", "info", 1000);
        rangeUpdated = true;
      }
    } else {
      if (
        state.interactiveRegressionRange.start ||
        state.interactiveRegressionRange.end
      ) {
        state.interactiveRegressionRange = { start: null, end: null };
        Utils.showStatusMessage(
          "Regression range reset to default.",
          "info",
          1000,
        );
        rangeUpdated = true;
      }
    }

    if (rangeUpdated) {
      state.pinnedTooltipData = null;
      MasterUpdater.updateAllCharts();
      StatsManager.update();
      LegendManager.build();
    }
    MasterUpdater.updateAllCharts(); // Always ensure brush display syncs visually
  },

  // --- Resize Handler ---
  handleResize: Utils.debounce(() => {
    console.log("EventHandlers: Resize detected, re-rendering chart...");
    state.highlightedDate = null;
    state.pinnedTooltipData = null;
    state.interactiveRegressionRange = { start: null, end: null };

    if (initializeChartSetup()) {
      // Relies on import
      if (state.isInitialized && state.processedData?.length > 0) {
        DomainManager.initializeDomains(state.processedData);
        EventHandlers.restoreViewAfterResize();
        MasterUpdater.updateAllCharts();
        StatsManager.update();
        LegendManager.build();
        AnnotationListRenderer.render();
      } else if (state.isInitialized) {
        console.warn(
          "EventHandlers: Resize handler - No data to display after setup.",
        );
        MasterUpdater.updateAllCharts();
        StatsManager.update();
        LegendManager.build();
        AnnotationListRenderer.render();
      }
    } else {
      console.error(
        "EventHandlers: Chart redraw on resize failed during setup phase.",
      );
    }
  }, CONFIG.debounceResizeMs),

  restoreViewAfterResize() {
    if (
      zoom &&
      ui.zoomCaptureRect &&
      !ui.zoomCaptureRect.empty() &&
      state.lastZoomTransform &&
      scales.xContext
    ) {
      ui.zoomCaptureRect.on("zoom", null);
      ui.zoomCaptureRect.call(zoom.transform, state.lastZoomTransform);
      ui.zoomCaptureRect.on("zoom", EventHandlers.zoomed);

      if (brushes.context && ui.brushGroup && !ui.brushGroup.empty()) {
        const currentFocusDomain = state.lastZoomTransform
          .rescaleX(scales.xContext)
          .domain();
        if (currentFocusDomain.every((d) => d instanceof Date && !isNaN(d))) {
          const brushSelection = currentFocusDomain.map(scales.xContext);
          ui.brushGroup.on("brush.handler", null).on("end.handler", null);
          if (brushSelection.every((v) => !isNaN(v))) {
            ui.brushGroup.call(brushes.context.move, brushSelection);
          }
          ui.brushGroup.on(
            "brush.handler end.handler",
            EventHandlers.contextBrushed,
          );
        }
      }
    } else {
      console.warn("EventHandlers: Cannot restore view after resize.");
    }
  },

  // --- Control Handlers ---
  handleThemeToggle() {
    ThemeManager.toggleTheme();
  },

  handleGoalSubmit(event) {
    event.preventDefault();
    const weightVal = ui.goalWeightInput?.property("value");
    const dateVal = ui.goalDateInput?.property("value");
    const rateVal = ui.goalTargetRateInput?.property("value");

    let weight = weightVal ? parseFloat(weightVal) : null;
    let date = dateVal ? new Date(dateVal) : null;
    let rate = rateVal ? parseFloat(rateVal) : null;

    if (weight != null && isNaN(weight)) weight = null;
    if (date instanceof Date && isNaN(date.getTime())) date = null;
    if (rate != null && isNaN(rate)) rate = null;
    state.goal = { weight, date, targetRate: rate };

    GoalManager.save();
    StatsManager.update();
    MasterUpdater.updateAllCharts();
    LegendManager.build();
  },

  handleTrendlineChange() {
    const newRegStartDate = DataService.getRegressionStartDateFromUI();
    const currentRegStartDate = state.regressionStartDate;
    const datesDiffer =
      (!currentRegStartDate && newRegStartDate) ||
      (currentRegStartDate && !newRegStartDate) ||
      (currentRegStartDate &&
        newRegStartDate &&
        currentRegStartDate.getTime() !== newRegStartDate.getTime());

    if (datesDiffer) {
      state.regressionStartDate = newRegStartDate;
      StatsManager.update();
      LegendManager.build();
    }
    MasterUpdater.updateAllCharts();
  },

  handleAnalysisRangeUpdate() {
    const startVal = ui.analysisStartDateInput?.property("value");
    const endVal = ui.analysisEndDateInput?.property("value");
    const startDate = startVal ? new Date(startVal) : null;
    const endDate = endVal ? new Date(endVal) : null;

    if (
      startDate instanceof Date &&
      !isNaN(startDate) &&
      endDate instanceof Date &&
      !isNaN(endDate) &&
      startDate <= endDate
    ) {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      state.analysisRange = { start: startDate, end: endDate };
      state.pinnedTooltipData = null;
      state.highlightedDate = null;
      state.interactiveRegressionRange = { start: null, end: null };

      scales.x.domain([startDate, endDate]);
      EventHandlers.syncBrushAndZoomToFocus();

      MasterUpdater.updateAllCharts();
      StatsManager.update();
      LegendManager.build();
      Utils.showStatusMessage("Analysis range updated.", "info", 1500);
    } else {
      Utils.showStatusMessage("Invalid date range selected.", "error");
    }
  },

  syncBrushAndZoomToFocus() {
    if (!scales.x || !scales.xContext || !brushes.context || !zoom) return;
    const { width: focusW } = EventHandlers._getChartDimensions("focus");
    if (!focusW) return;

    const currentFocusDomain = scales.x.domain();
    if (!currentFocusDomain.every((d) => d instanceof Date && !isNaN(d)))
      return;

    if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
      const [x0Pixel, x1Pixel] = currentFocusDomain.map(scales.xContext);
      if (isNaN(x0Pixel) || isNaN(x1Pixel)) return;
      const pixelDiff = x1Pixel - x0Pixel;
      if (pixelDiff <= 0) return;

      const k = focusW / pixelDiff;
      const tx = -x0Pixel * k;
      const newTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
      state.lastZoomTransform = newTransform;

      ui.zoomCaptureRect.on("zoom", null);
      ui.zoomCaptureRect.call(zoom.transform, newTransform);
      ui.zoomCaptureRect.on("zoom", EventHandlers.zoomed);
    }

    if (ui.brushGroup?.node()) {
      const newBrushSelection = currentFocusDomain.map(scales.xContext);
      if (newBrushSelection.every((v) => !isNaN(v))) {
        ui.brushGroup.on("brush.handler", null).on("end.handler", null);
        ui.brushGroup.call(brushes.context.move, newBrushSelection);
        ui.brushGroup.on(
          "brush.handler end.handler",
          EventHandlers.contextBrushed,
        );
      }
    }
  },

  // --- Stat Click Handler ---
  statDateClickWrapper(event) {
    if (event.currentTarget && event.currentTarget.__highlightDate) {
      EventHandlers.statDateClick(event.currentTarget.__highlightDate);
    }
  },

  statDateClick(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return;

    const dateMs = date.getTime();
    let closestPoint = null;
    let minDiff = Infinity;

    state.processedData.forEach((p) => {
      if (p.date instanceof Date && !isNaN(p.date)) {
        const diff = Math.abs(p.date.getTime() - dateMs);
        if (diff < minDiff) {
          minDiff = diff;
          closestPoint = p;
        }
      }
    });

    if (!closestPoint) return;

    if (state.highlightedDate?.getTime() === closestPoint.date.getTime()) {
      state.highlightedDate = null;
      state.pinnedTooltipData = null;
    } else {
      state.highlightedDate = closestPoint.date;
    }

    if (!scales.x || !scales.xContext || !zoom || !brushes.context) return;
    const { width: focusW } = EventHandlers._getChartDimensions("focus");
    if (!focusW) return;

    const xDomain = scales.x.domain();
    if (!xDomain.every((d) => d instanceof Date && !isNaN(d))) return;

    const viewWidthMs = xDomain[1].getTime() - xDomain[0].getTime();
    const halfViewMs = viewWidthMs / 2;
    const targetStartTime = closestPoint.date.getTime() - halfViewMs;
    const targetEndTime = targetStartTime + viewWidthMs;
    const [minDate, maxDate] = scales.xContext.domain();
    if (
      !(minDate instanceof Date) ||
      !(maxDate instanceof Date) ||
      isNaN(minDate) ||
      isNaN(maxDate)
    )
      return;
    const minTime = minDate.getTime();
    const maxTime = maxDate.getTime();

    let clampedStartTime = Math.max(minTime, targetStartTime);
    let clampedEndTime = clampedStartTime + viewWidthMs;
    if (clampedEndTime > maxTime) {
      clampedEndTime = maxTime;
      clampedStartTime = clampedEndTime - viewWidthMs;
      clampedStartTime = Math.max(minTime, clampedStartTime);
    }
    if (clampedEndTime < clampedStartTime) clampedEndTime = clampedStartTime;

    const finalDomain = [new Date(clampedStartTime), new Date(clampedEndTime)];
    scales.x.domain(finalDomain);

    EventHandlers.syncBrushAndZoomToFocus();

    MasterUpdater.updateAllCharts();
    StatsManager.update();
    LegendManager.build();
    EventHandlers._hideTooltip();
  },

  // --- What-If Handler ---
  handleWhatIfSubmit(event) {
    event.preventDefault();
    if (
      !ui.whatIfIntakeInput ||
      !ui.whatIfDurationInput ||
      !ui.whatIfResultDisplay
    )
      return;

    const futureIntake = parseFloat(ui.whatIfIntakeInput.property("value"));
    const durationDays = parseInt(ui.whatIfDurationInput.property("value"), 10);
    const resultDisplay = ui.whatIfResultDisplay;

    resultDisplay.classed("error", false).text("Calculating...");

    if (isNaN(futureIntake) || isNaN(durationDays) || durationDays <= 0) {
      resultDisplay
        .classed("error", true)
        .text("Please enter valid intake and duration > 0.");
      return;
    }

    const currentStats = StatsManager.calculateAllStats();
    const tdeeEstimate =
      currentStats.avgTDEE_Adaptive ??
      currentStats.avgTDEE_WgtChange ??
      currentStats.avgExpenditureGFit;
    const tdeeSource =
      tdeeEstimate === currentStats.avgTDEE_Adaptive
        ? "Adaptive"
        : tdeeEstimate === currentStats.avgTDEE_WgtChange
          ? "Trend"
          : "GFit";

    if (tdeeEstimate == null || isNaN(tdeeEstimate)) {
      resultDisplay
        .classed("error", true)
        .text(`Cannot project: TDEE estimate unavailable.`);
      return;
    }

    const dailyNetBalance = futureIntake - tdeeEstimate;
    const dailyWeightChangeKg = dailyNetBalance / CONFIG.KCALS_PER_KG;
    const totalWeightChangeKg = dailyWeightChangeKg * durationDays;
    const startWeight = currentStats.currentSma ?? currentStats.currentWeight;

    if (startWeight == null || isNaN(startWeight)) {
      resultDisplay
        .classed("error", true)
        .text("Cannot project: Current weight unknown.");
      return;
    }

    const projectedWeight = startWeight + totalWeightChangeKg;
    const fv = Utils.formatValue;
    resultDisplay.html(
      `Based on ${tdeeSource} TDEE ≈ ${fv(tdeeEstimate, 0)} kcal:<br>
       Est. change: ${fv(totalWeightChangeKg, 1)} kg in ${durationDays} days.<br>
       Projected Weight: <strong>${fv(projectedWeight, 1)} kg</strong>.`,
    );
  },

  // --- Background Click Handler ---
  handleBackgroundClick(event) {
    const targetNode = event.target;
    const isInteractiveDot = d3.select(targetNode).classed("dot");
    const isAnnotation =
      d3.select(targetNode.closest(".annotation-marker-group")).size() > 0;
    const isTrendMarker =
      d3.select(targetNode.closest(".trend-change-marker-group")).size() > 0;
    const isLegendItem =
      d3.select(targetNode.closest(".legend-item")).size() > 0;
    const isBrushElement =
      d3.select(targetNode).classed("handle") ||
      d3.select(targetNode).classed("selection") ||
      d3.select(targetNode).classed("overlay");
    const isStatDate = d3.select(targetNode).classed("highlightable");
    const isBackground =
      targetNode === ui.zoomCaptureRect?.node() ||
      targetNode === ui.svg?.node() ||
      targetNode === ui.focus?.node() ||
      targetNode === ui.chartArea?.node();

    if (
      isBackground &&
      !isInteractiveDot &&
      !isAnnotation &&
      !isTrendMarker &&
      !isLegendItem &&
      !isBrushElement &&
      !isStatDate
    ) {
      let stateChanged = false;
      if (state.highlightedDate) {
        state.highlightedDate = null;
        stateChanged = true;
      }
      if (state.pinnedTooltipData) {
        state.pinnedTooltipData = null;
        EventHandlers._hideTooltip();
      }
      if (
        state.interactiveRegressionRange.start ||
        state.interactiveRegressionRange.end
      ) {
        state.interactiveRegressionRange = { start: null, end: null };
        stateChanged = true;
        if (
          brushes.regression &&
          ui.regressionBrushGroup &&
          !ui.regressionBrushGroup.empty()
        ) {
          ui.regressionBrushGroup.on(".brush", null).on(".end", null);
          ui.regressionBrushGroup.call(brushes.regression.move, null);
          ui.regressionBrushGroup.on(
            "end.handler",
            EventHandlers.regressionBrushed,
          );
        }
      }
      if (stateChanged) {
        MasterUpdater.updateAllCharts();
        StatsManager.update();
        LegendManager.build();
      }
    }
  },

  // --- Helper to get current analysis range ---
  getAnalysisDateRange() {
    const chartDomain = scales.x?.domain();
    if (
      chartDomain?.length === 2 &&
      chartDomain[0] instanceof Date &&
      chartDomain[1] instanceof Date &&
      !isNaN(chartDomain[0]) &&
      !isNaN(chartDomain[1])
    ) {
      const start = new Date(chartDomain[0]);
      start.setHours(0, 0, 0, 0);
      const end = new Date(chartDomain[1]);
      end.setHours(23, 59, 59, 999);
      return { start: start, end: end };
    }
    console.warn(
      "EventHandlers: Could not determine analysis range. Using fallback.",
    );
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return { start: yesterday, end: today };
  },

  // --- Helper to get effective range for regression calculation ---
  getEffectiveRegressionRange() {
    if (
      state.interactiveRegressionRange.start instanceof Date &&
      !isNaN(state.interactiveRegressionRange.start) &&
      state.interactiveRegressionRange.end instanceof Date &&
      !isNaN(state.interactiveRegressionRange.end)
    ) {
      return { ...state.interactiveRegressionRange };
    }
    const analysisRange = this.getAnalysisDateRange();
    if (
      !(analysisRange.start instanceof Date) ||
      !(analysisRange.end instanceof Date)
    ) {
      console.warn("EventHandlers: Invalid analysis range for regression.");
      return { start: null, end: null };
    }
    const uiRegressionStart = state.regressionStartDate;
    const start =
      uiRegressionStart instanceof Date &&
      !isNaN(uiRegressionStart) &&
      uiRegressionStart >= analysisRange.start &&
      uiRegressionStart <= analysisRange.end
        ? uiRegressionStart
        : analysisRange.start;
    return { start: start, end: analysisRange.end };
  },

  // --- Helper to get current chart dimensions ---
  _getChartDimensions(chartKey) {
    let width = 0,
      height = 0;
    try {
      if (chartKey === "focus" && scales.x && scales.y) {
        const xRange = scales.x.range();
        const yRange = scales.y.range();
        width = Math.abs(xRange[1] - xRange[0]);
        height = Math.abs(yRange[0] - yRange[1]);
      }
    } catch (e) {
      console.warn(
        `EventHandlers: Error getting dimensions for ${chartKey}`,
        e,
      );
    }
    return { width, height };
  },

  // --- Card Collapse Toggle Handler ---
  handleCardToggle(buttonElement) {
    // Accept the button element directly
    if (!buttonElement) return;
    const cardSection = buttonElement.closest(".card.collapsible");
    if (!cardSection) return;
    const isCollapsed = cardSection.classList.toggle("collapsed");
    buttonElement.setAttribute("aria-expanded", !isCollapsed); // Update ARIA on button

    // Optional: Save state to localStorage
    const cardId = cardSection.id;
    if (cardId) {
      try {
        const states = JSON.parse(
          localStorage.getItem("cardCollapseStates") || "{}",
        );
        states[cardId] = isCollapsed;
        localStorage.setItem("cardCollapseStates", JSON.stringify(states));
      } catch (e) {
        console.error("Failed to save card collapse state", e);
      }
    }
  },

  setupAll() {
    console.log("EventHandlers: Setting up event listeners...");

    // Window
    window.addEventListener("resize", EventHandlers.handleResize);

    // Controls
    ui.themeToggle?.on("click", EventHandlers.handleThemeToggle);

    d3.select("#goal-setting-form").on(
      "submit",
      EventHandlers.handleGoalSubmit,
    );
    ui.annotationForm?.on("submit", (event) =>
      AnnotationManager.handleSubmit(event),
    );
    ui.updateAnalysisRangeBtn?.on(
      "click",
      EventHandlers.handleAnalysisRangeUpdate,
    );
    ui.whatIfSubmitBtn?.on("click", EventHandlers.handleWhatIfSubmit);
    ui.whatIfIntakeInput?.on("keydown", (event) => {
      if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
    });
    ui.whatIfDurationInput?.on("keydown", (event) => {
      if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
    });

    // Trendline Inputs
    const trendInputs = [
      ui.trendStartDateInput,
      ui.trendInitialWeightInput,
      ui.trendWeeklyIncrease1Input,
      ui.trendWeeklyIncrease2Input,
    ];
    trendInputs.forEach((input) =>
      input?.on("input", EventHandlers.handleTrendlineChange),
    );

    // Chart Interactions
    ui.svg?.on("click", EventHandlers.handleBackgroundClick); // Click on SVG background

    // Attach Brush/Zoom handlers
    if (brushes.context && ui.brushGroup) {
      ui.brushGroup.on(
        "brush.handler end.handler",
        EventHandlers.contextBrushed,
      );
    }
    if (zoom && ui.zoomCaptureRect) {
      ui.zoomCaptureRect.on("zoom", EventHandlers.zoomed);
    }
    if (brushes.regression && ui.regressionBrushGroup) {
      ui.regressionBrushGroup.on(
        "end.handler",
        EventHandlers.regressionBrushed,
      );
    }

    // --- Card Collapse Listener (Using Event Delegation) ---
    d3.select("body").on("click.cardToggle", (event) => {
      // Use event parameter
      const toggleButton = event.target.closest(".card-toggle-btn");
      const heading = event.target.closest("h2"); // Check if click was on or inside H2

      // Prioritize the button click
      if (toggleButton && toggleButton.closest(".card.collapsible")) {
        // event.preventDefault(); // Uncomment if needed
        EventHandlers.handleCardToggle(toggleButton); // Pass the button element
      }
      // Handle clicking the H2 (but NOT the button inside it)
      else if (
        heading &&
        !toggleButton &&
        heading.closest(".card.collapsible")
      ) {
        const cardSection = heading.closest(".card.collapsible");
        const btn = cardSection?.querySelector(".card-toggle-btn");
        if (btn) {
          event.preventDefault(); // PREVENT potential text selection on H2 click
          EventHandlers.handleCardToggle(btn); // Pass the button element
        }
      }
    });

    // Note: Dot/Marker/Balance/Scatter handlers attached dynamically in chartUpdaters.
    // Note: Stat date click listeners attached dynamically in StatsManager.

    console.log("EventHandlers: Setup complete.");
  },
}; // End EventHandlers object
