// js/interactions/chartInteractions.js
// Handles chart-specific user interactions like hover, click, brush, zoom.

import { StateManager, ActionTypes } from "../core/stateManager.js";
import { ui } from "../ui/uiCache.js";
import { scales, brushes, zoom } from "../ui/chartSetup.js";
import { CONFIG } from "../config.js";
import { Utils } from "../core/utils.js";
import { MasterUpdater } from "../ui/masterUpdater.js";
import * as Selectors from "../core/selectors.js";
import { TooltipManager } from "./tooltipManager.js";

// Internal flags (not exported)
let isZooming = false;
let isBrushing = false;
let isDraggingRegressionBrush = false;

// Debounced function for handling the end of brush/zoom interactions
const debouncedInteractionEnd = Utils.debounce(
  () => {
    console.log("[ChartInteractions] Debounced Interaction End triggered.");
    const state = StateManager.getState(); // Get current state

    // --- Final State Updates After Interaction ---
    // 1. Set final analysis range based on the *current* scales.x domain
    console.log("[ChartInteractions] Debounced End: Checking final domain:", scales.x?.domain());
    const finalXDomain = scales.x?.domain();
    if (
      finalXDomain &&
      finalXDomain[0] instanceof Date &&
      finalXDomain[1] instanceof Date
    ) {
      const finalAnalysisRange = {
        start: new Date(new Date(finalXDomain[0]).setHours(0, 0, 0, 0)), // Clone
        end: new Date(new Date(finalXDomain[1]).setHours(23, 59, 59, 999)), // Clone
      };
      // Avoid redundant dispatch if range hasn't actually changed from state
      const currentRange = Selectors.selectAnalysisRange(state);
      if (
        currentRange.start?.getTime() !== finalAnalysisRange.start.getTime() ||
        currentRange.end?.getTime() !== finalAnalysisRange.end.getTime()
      ) {
        StateManager.dispatch({
          type: ActionTypes.SET_ANALYSIS_RANGE, // Use ActionTypes
          payload: finalAnalysisRange,
        });
        console.log(
          "[ChartInteractions Debounce] Dispatched final SET_ANALYSIS_RANGE:",
          finalAnalysisRange,
        );
      }
    }

    // 2. Clear transient interaction states (like hover)
    if (Selectors.selectActiveHoverData(state)) {
      StateManager.dispatch({ type: ActionTypes.SET_ACTIVE_HOVER_DATA, payload: null }); // Use ActionTypes
    }

    // Reset interaction flags
    isZooming = false;
    isBrushing = false;
    console.log("[ChartInteractions] Interaction End debounce finished.");
  },
  300, // Delay in ms after last interaction event (zoom/brush)
);

// Helper to get chart dimensions (consider moving to utils or chartSetup if used elsewhere)
function getChartDimensions(chartKey) {
  let width = 0, height = 0;
  try {
    if (chartKey === 'focus' && scales.x && scales.y) {
      const xRange = scales.x.range();
      const yRange = scales.y.range();
      width = Math.abs(xRange[1] - xRange[0]);
      height = Math.abs(yRange[0] - yRange[1]);
    }
    // Add cases for other charts if needed
  } catch (e) {
    console.warn(`ChartInteractions: Error getting dimensions for ${chartKey}`, e);
  }
  return { width, height };
}


export const ChartInteractions = {
  // --- Chart Hover Events ---
  dotMouseOver(event, d) {
    if (!d || !d.date) return;
    StateManager.dispatch({ type: ActionTypes.SET_ACTIVE_HOVER_DATA, payload: d }); // Use ActionTypes

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

    const secondaryDataLines = [];
    if (d.netBalance != null) secondaryDataLines.push(`Balance: ${Utils.formatValue(d.netBalance, 0)} kcal`);
    if (d.smoothedWeeklyRate != null) secondaryDataLines.push(`Smoothed Rate: ${Utils.formatValue(d.smoothedWeeklyRate, 2)} kg/wk`);
    if (d.avgTdeeDifference != null) secondaryDataLines.push(`Avg TDEE Diff: ${Utils.formatValue(d.avgTdeeDifference, 0)} kcal`);
    if (secondaryDataLines.length > 0) tt += `<hr class="tooltip-hr">${secondaryDataLines.join("<br>")}`;

    const currentState = StateManager.getState();
    const pinnedData = Selectors.selectPinnedTooltipData(currentState);
    const isPinned = pinnedData?.id === d.date.getTime();
    tt += `<hr class="tooltip-hr"><div class="note pinned-note">${isPinned ? "Click dot to unpin." : "Click dot to pin tooltip."}</div>`;

    TooltipManager.show(tt, event);
  },

  dotMouseOut(event, d) {
    if (!d || !d.date) return;
    const currentHoverData = Selectors.selectActiveHoverData(StateManager.getState());
    if (currentHoverData?.date?.getTime() === d.date?.getTime()) {
      StateManager.dispatch({ type: ActionTypes.SET_ACTIVE_HOVER_DATA, payload: null }); // Use ActionTypes
    }
    TooltipManager.hide();
  },

  dotClick(event, d) {
    if (!d || !d.date) return;
    event.stopPropagation();
    const dataId = d.date.getTime();
    const currentPinnedData = Selectors.selectPinnedTooltipData(StateManager.getState());

    let newPinnedData = null;
    if (currentPinnedData?.id !== dataId) {
      newPinnedData = { id: dataId, data: d, pageX: event.pageX, pageY: event.pageY };
    }
    StateManager.dispatch({ type: ActionTypes.SET_PINNED_TOOLTIP, payload: newPinnedData }); // Use ActionTypes

    if (newPinnedData) {
      ChartInteractions.dotMouseOver(event, d); // Regenerate content
      TooltipManager.clearHideTimeout();
      TooltipManager.forceShow();
    } else {
      TooltipManager.hide();
    }
  },

  balanceMouseOver(event, d) {
    if (!d || !d.date) return;
    const tt = `<strong>${Utils.formatDateLong(d.date)}</strong><br>Balance: ${Utils.formatValue(d.netBalance, 0)} kcal`;
    TooltipManager.show(tt, event);
  },
  balanceMouseOut(event, d) {
    TooltipManager.hide();
  },

  scatterMouseOver(event, d) {
    if (!d || !d.weekStartDate) return;
    const tt = `<strong>Week: ${Utils.formatDateShort(d.weekStartDate)}</strong><br>Avg Net: ${Utils.formatValue(d.avgNetCal, 0)} kcal/d<br>Rate: ${Utils.formatValue(d.weeklyRate, 2)} kg/wk`;
    TooltipManager.show(tt, event);
  },
  scatterMouseOut(event, d) {
    TooltipManager.hide();
  },

  annotationMouseOver(event, d) {
    if (!d) return;
    const tt = `<strong>Annotation (${Utils.formatDateShort(new Date(d.date))})</strong><br>${d.text}`;
    TooltipManager.show(tt, event);
  },
  annotationMouseOut(event, d) {
    TooltipManager.hide();
  },

  trendChangeMouseOver(event, d) {
    if (!d) return;
    const direction = d.magnitude > 0 ? "acceleration" : "deceleration";
    const rateChange = Math.abs(d.magnitude * 7);
    const tt = `<strong>Trend Change (${Utils.formatDateShort(d.date)})</strong><br>Significant ${direction} detected.<br>Rate Δ ≈ ${Utils.formatValue(rateChange, 2)} kg/wk`;
    TooltipManager.show(tt, event);
  },
  trendChangeMouseOut(event, d) {
    TooltipManager.hide();
  },

  // --- Goal Line Drag Interaction ---
  setupGoalDrag() {
    if (!ui.goalLineHit || ui.goalLineHit.empty()) return;

    // Import FormHandlers dynamically to avoid circular dependency if needed, 
    // OR direct import if safe (ChartInteractions <-> FormHandlers cycle is risk).
    // Better: Helper function or dispatch custom event.
    // Assuming FormHandlers imported via window or accessible.
    // Since FormHandlers imports ChartInteractions, importing FormHandlers here creates cycle.
    // Solution: Use UI inputs and Button click or window event.
    // OR just use StateManager directly if just updating state?
    // FormHandlers adds validation and persistence logic.
    // I will trigger the specific button click or duplicate logic (safer: button click).

    const dragBehavior = d3.drag()
      .on("start", function (event) {
        d3.select(this).classed("dragging", true);
        d3.select("body").style("cursor", "ns-resize");

        // Capture starting Y based on CURRENT input value (source of truth for line)
        const currentWeight = parseFloat(ui.goalWeightInput.property("value"));
        if (!isNaN(currentWeight) && scales.y) {
          this.startLineY = scales.y(currentWeight);
        } else {
          this.startLineY = event.y;
        }
      })
      .on("drag", function (event) {
        if (!scales.y || this.startLineY == null) return;

        const currentY = event.y;
        const dy = currentY - this.startLineY;

        // Visual Translation
        ui.goalLine.attr("transform", `translate(0, ${dy})`);
        ui.goalLineHit.attr("transform", `translate(0, ${dy})`);

        // Update Input
        const newWeight = scales.y.invert(currentY);
        ui.goalWeightInput.property("value", newWeight.toFixed(1));
      })
      .on("end", function (event) {
        d3.select(this).classed("dragging", false);
        d3.select("body").style("cursor", null);

        // Reset visual transform (State update will redraw correctly)
        ui.goalLine.attr("transform", null);
        ui.goalLineHit.attr("transform", null);

        // Trigger Update
        const form = Utils.getElementByIdSafe("goal-form");
        if (form) {
          form.dispatchEvent(new Event("submit"));
        }
      });

    ui.goalLineHit.call(dragBehavior);
    console.log("ChartInteractions: Goal Drag setup complete.");
  },

  // --- Brush and Zoom Handlers ---
  contextBrushed(event) {
    if (!event || !event.sourceEvent || event.sourceEvent.type === "zoom" || isBrushing) return;
    console.log("[ChartInteractions] contextBrushed called. Type:", event.type, "Selection:", event.selection);
    if (!event.selection && event.type !== "end") return;

    isBrushing = true;

    const selection = event.selection;
    if (!scales.xContext || !scales.x || !zoom) {
      console.warn("Context brush: scales or zoom not ready.");
      isBrushing = false;
      return;
    }

    const newXDomain = selection ? selection.map(scales.xContext.invert) : scales.xContext.domain();
    scales.x.domain(newXDomain); // Update focus scale

    // Sync zoom transform
    if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
      const [x0Pixel, x1Pixel] = selection || scales.xContext.range();
      const { width: focusW } = getChartDimensions("focus");
      if (!isNaN(x0Pixel) && !isNaN(x1Pixel) && focusW && x1Pixel > x0Pixel) {
        const k = focusW / (x1Pixel - x0Pixel);
        const tx = -x0Pixel * k;
        const newTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
        StateManager.dispatch({ type: ActionTypes.SET_LAST_ZOOM_TRANSFORM, payload: { k: newTransform.k, x: newTransform.x, y: newTransform.y } }); // Use ActionTypes
        ui.zoomCaptureRect.on("zoom", null);
        ui.zoomCaptureRect.call(zoom.transform, newTransform);
        ui.zoomCaptureRect.on("zoom", ChartInteractions.zoomed); // Point to exported handler
      }
    }

    // Trigger lightweight update
    const allProcessedData = Selectors.selectProcessedData(StateManager.getState());
    const newFilteredData = allProcessedData.filter(d => d.date instanceof Date && d.date >= newXDomain[0] && d.date <= newXDomain[1]);
    StateManager.dispatch({ type: ActionTypes.SET_FILTERED_DATA, payload: newFilteredData }); // Use ActionTypes
    MasterUpdater.updateAllCharts({ isInteractive: true });

    if (event.type === "end") {
      console.log("[ChartInteractions] Context Brush end. Event:", event);
      debouncedInteractionEnd();
    }
    setTimeout(() => { isBrushing = false; }, 50);
  },

  zoomed(event) {
    if (!event || !event.sourceEvent || event.sourceEvent.type === "brush" || isZooming) return;

    isZooming = true;

    StateManager.dispatch({ type: ActionTypes.SET_LAST_ZOOM_TRANSFORM, payload: { k: event.transform.k, x: event.transform.x, y: event.transform.y } }); // Use ActionTypes

    if (!scales.xContext || !scales.x || !brushes.context) {
      console.warn("Zoom handler: scales or context brush not ready.");
      isZooming = false;
      return;
    }

    const newXDomain = event.transform.rescaleX(scales.xContext).domain();
    scales.x.domain(newXDomain); // Update focus scale

    // Sync context brush
    if (ui.brushGroup?.node()) {
      const newBrushSelection = newXDomain.map(scales.xContext);
      ui.brushGroup.on("brush.handler", null).on("end.handler", null);
      if (newBrushSelection.every((v) => !isNaN(v))) {
        ui.brushGroup.call(brushes.context.move, newBrushSelection);
      }
      ui.brushGroup.on("brush.handler end.handler", ChartInteractions.contextBrushed); // Point to exported handler
    }

    // Trigger lightweight update
    const allProcessedData = Selectors.selectProcessedData(StateManager.getState());
    const newFilteredData = allProcessedData.filter(d => d.date instanceof Date && d.date >= newXDomain[0] && d.date <= newXDomain[1]);
    StateManager.dispatch({ type: ActionTypes.SET_FILTERED_DATA, payload: newFilteredData }); // Use ActionTypes
    MasterUpdater.updateAllCharts({ isInteractive: true });

    debouncedInteractionEnd();

    setTimeout(() => { isZooming = false; }, 50);
  },

  regressionBrushed(event) {
    if (!event || event.type !== "end" || !event.sourceEvent || isDraggingRegressionBrush) return;

    isDraggingRegressionBrush = true;

    const selection = event.selection;
    let newRange = { start: null, end: null };
    let rangeUpdated = false;
    const currentRange = Selectors.selectInteractiveRegressionRange(StateManager.getState());

    if (selection && selection[0] !== selection[1]) {
      if (!scales.x) { isDraggingRegressionBrush = false; return; }
      const startDate = scales.x.invert(selection[0]);
      const endDate = scales.x.invert(selection[1]);
      if (!(startDate instanceof Date) || !(endDate instanceof Date) || isNaN(startDate) || isNaN(endDate)) {
        isDraggingRegressionBrush = false; return;
      }
      newRange = { start: startDate, end: endDate };
      const toleranceMs = 86400000 / 4;
      if (Math.abs((currentRange.start?.getTime() ?? -Infinity) - startDate.getTime()) > toleranceMs ||
        Math.abs((currentRange.end?.getTime() ?? -Infinity) - endDate.getTime()) > toleranceMs) {
        rangeUpdated = true;
      }
    } else {
      if (currentRange.start || currentRange.end) { rangeUpdated = true; }
    }

    if (rangeUpdated) {
      console.log("[ChartInteractions] Regression brush range changed, dispatching update.");
      StateManager.dispatch({ type: ActionTypes.SET_INTERACTIVE_REGRESSION_RANGE, payload: newRange }); // Use ActionTypes
      StateManager.dispatch({ type: ActionTypes.SET_PINNED_TOOLTIP, payload: null }); // Use ActionTypes
      Utils.showStatusMessage(newRange.start ? "Regression range updated." : "Regression range reset.", "info", 1500);
    } else {
      console.log("[ChartInteractions] Regression brush range not changed significantly.");
      MasterUpdater.updateAllCharts({ isInteractive: false });
    }
    setTimeout(() => { isDraggingRegressionBrush = false; }, 50);
  },

  // --- Other Chart Interactions ---
  handleBackgroundClick(event) {
    const targetNode = event.target;
    const isInteractive = targetNode.closest(".raw-dot, .annotation-marker-group, .trend-change-marker-group, .legend-item, .handle, .selection, .overlay, .highlightable");
    const isBackground = targetNode === ui.zoomCaptureRect?.node() || targetNode === ui.svg?.node() || targetNode === ui.focus?.node() || targetNode === ui.chartArea?.node();

    if (isBackground && !isInteractive) {
      const currentState = StateManager.getState();
      if (Selectors.selectHighlightedDate(currentState)) {
        StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: null }); // Use ActionTypes
      }
      if (Selectors.selectPinnedTooltipData(currentState)) {
        StateManager.dispatch({ type: ActionTypes.SET_PINNED_TOOLTIP, payload: null }); // Use ActionTypes
        TooltipManager.hide(); // Use TooltipManager
      }
      const currentRegRange = Selectors.selectInteractiveRegressionRange(currentState);
      if (currentRegRange.start || currentRegRange.end) {
        StateManager.dispatch({ type: ActionTypes.SET_INTERACTIVE_REGRESSION_RANGE, payload: { start: null, end: null } }); // Use ActionTypes
        if (brushes.regression && ui.regressionBrushGroup && !ui.regressionBrushGroup.empty()) {
          ui.regressionBrushGroup.on(".brush", null).on(".end", null);
          ui.regressionBrushGroup.call(brushes.regression.move, null);
          ui.regressionBrushGroup.on("end.handler", ChartInteractions.regressionBrushed); // Point to exported handler
        }
      }
    }
  },

  statDateClickWrapper(event) {
    if (event.currentTarget && event.currentTarget.__highlightDate) {
      ChartInteractions.statDateClick(event.currentTarget.__highlightDate); // Point to exported handler
    }
  },

  statDateClick(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return;
    const dateMs = date.getTime();
    const stateSnapshot = StateManager.getState();
    const processedData = Selectors.selectProcessedData(stateSnapshot);
    if (!processedData || processedData.length === 0) return;

    let closestPoint = null;
    let minDiff = Infinity;
    processedData.forEach((p) => {
      if (p.date instanceof Date && !isNaN(p.date)) {
        const diff = Math.abs(p.date.getTime() - dateMs);
        if (diff < minDiff) { minDiff = diff; closestPoint = p; }
      }
    });
    if (!closestPoint) return;

    const currentHighlight = Selectors.selectHighlightedDate(stateSnapshot);
    if (currentHighlight?.getTime() === closestPoint.date.getTime()) {
      StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: null }); // Use ActionTypes
      StateManager.dispatch({ type: ActionTypes.SET_PINNED_TOOLTIP, payload: null }); // Use ActionTypes
    } else {
      StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: closestPoint.date }); // Use ActionTypes
    }

    if (!scales.x || !scales.xContext || !zoom || !brushes.context) return;
    const { width: focusW } = getChartDimensions("focus");
    if (!focusW) return;
    const xDomain = scales.x.domain();
    if (!xDomain.every((d) => d instanceof Date && !isNaN(d))) return;

    const viewWidthMs = xDomain[1].getTime() - xDomain[0].getTime();
    const halfViewMs = viewWidthMs / 2;
    const targetStartTime = closestPoint.date.getTime() - halfViewMs;
    const [minDate, maxDate] = scales.xContext.domain();
    if (!(minDate instanceof Date) || !(maxDate instanceof Date) || isNaN(minDate) || isNaN(maxDate)) return;
    const minTime = minDate.getTime();
    const maxTime = maxDate.getTime();
    let clampedStartTime = Math.max(minTime, targetStartTime);
    let clampedEndTime = clampedStartTime + viewWidthMs;
    if (clampedEndTime > maxTime) {
      clampedEndTime = maxTime;
      clampedStartTime = Math.max(minTime, clampedEndTime - viewWidthMs);
    }
    if (clampedEndTime < clampedStartTime) clampedEndTime = clampedStartTime;

    const finalDomain = [new Date(clampedStartTime), new Date(clampedEndTime)];
    scales.x.domain(finalDomain);

    const finalAnalysisRange = {
      start: new Date(new Date(finalDomain[0]).setHours(0, 0, 0, 0)),
      end: new Date(new Date(finalDomain[1]).setHours(23, 59, 59, 999)),
    };
    StateManager.dispatch({ type: ActionTypes.SET_ANALYSIS_RANGE, payload: finalAnalysisRange }); // Use ActionTypes

    ChartInteractions.syncBrushAndZoomToFocus(); // Point to exported handler
    TooltipManager.hide(); // Use TooltipManager
  },

  syncBrushAndZoomToFocus() {
    if (!scales.x || !scales.xContext || !brushes.context || !zoom) return;
    const { width: focusW } = getChartDimensions("focus");
    if (!focusW) return;
    const currentFocusDomain = scales.x.domain();
    if (!currentFocusDomain.every((d) => d instanceof Date && !isNaN(d))) return;

    const [x0Pixel, x1Pixel] = currentFocusDomain.map(scales.xContext);
    if (isNaN(x0Pixel) || isNaN(x1Pixel) || x1Pixel - x0Pixel <= 0) return;
    const k = focusW / (x1Pixel - x0Pixel);
    const tx = -x0Pixel * k;
    const newTransform = d3.zoomIdentity.translate(tx, 0).scale(k);

    StateManager.dispatch({ type: ActionTypes.SET_LAST_ZOOM_TRANSFORM, payload: { k: newTransform.k, x: newTransform.x, y: newTransform.y } }); // Use ActionTypes

    if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
      ui.zoomCaptureRect.on("zoom", null);
      ui.zoomCaptureRect.call(zoom.transform, newTransform);
      ui.zoomCaptureRect.on("zoom", ChartInteractions.zoomed); // Point to exported handler
    }
    if (ui.brushGroup?.node()) {
      const newBrushSelection = currentFocusDomain.map(scales.xContext);
      if (newBrushSelection.every((v) => !isNaN(v))) {
        ui.brushGroup.on("brush.handler", null).on("end.handler", null);
        ui.brushGroup.call(brushes.context.move, newBrushSelection);
        ui.brushGroup.on("brush.handler end.handler", ChartInteractions.contextBrushed); // Point to exported handler
      }
    }
  },

};

console.log("ChartInteractions module loaded.");