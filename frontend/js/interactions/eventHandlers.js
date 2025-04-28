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

export const EventHandlers = {
  // Flags to track interaction state (primarily for zoom/brush coordination)
  _isZooming: false,
  _isBrushing: false,
  _isDraggingRegressionBrush: false,

  // --- Debouncing/Throttling for Interaction End ---
  _debouncedInteractionEnd: Utils.debounce(
    () => {
      console.log("[EventHandlers] Debounced Interaction End triggered.");
      const state = StateManager.getState(); // Get current state

      // --- Final State Updates After Interaction ---
      // 1. Set final analysis range based on the *current* scales.x domain
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
          currentRange.start?.getTime() !==
            finalAnalysisRange.start.getTime() ||
          currentRange.end?.getTime() !== finalAnalysisRange.end.getTime()
        ) {
          StateManager.dispatch({
            type: "SET_ANALYSIS_RANGE",
            payload: finalAnalysisRange,
          });
          console.log(
            "[EventHandlers Debounce] Dispatched final SET_ANALYSIS_RANGE:",
            finalAnalysisRange,
          );
        }
      }

      // 2. Clear transient interaction states (like hover)
      if (Selectors.selectActiveHoverData(state)) {
        StateManager.dispatch({ type: "SET_ACTIVE_HOVER_DATA", payload: null });
      }
      // Pin/Highlight are usually cleared by specific actions (click background, click dot again)

      // 3. Trigger recalculation/rerender via StatsManager update
      // This will recalculate derived data based on the final range and trigger MasterUpdater via state changes.
      // Note: We rely on StatsManager having a subscription to 'state:analysisRangeChanged'
      // StatsManager.update(); // This call is removed - state change triggers it

      // Reset interaction flags
      EventHandlers._isZooming = false;
      EventHandlers._isBrushing = false;
      console.log("[EventHandlers] Interaction End debounce finished.");
    },
    300, // Delay in ms after last interaction event (zoom/brush)
  ),

  // --- Tooltip Helpers (Internal - Rely on State for Pinned Status) ---
  _showTooltip(htmlContent, event) {
    if (!ui.tooltip || ui.tooltip.empty()) return;
    // Get current timeout ID from state and clear it
    const currentTimeoutId = Selectors.selectState(
      StateManager.getState(),
    ).tooltipTimeoutId; // Use selector
    if (currentTimeoutId) clearTimeout(currentTimeoutId);
    StateManager.dispatch({ type: "SET_TOOLTIP_TIMEOUT_ID", payload: null });

    const show = () => {
      const margin = 15;
      const tooltipNode = ui.tooltip.node();
      if (!tooltipNode) return;
      let tooltipX = event.pageX + margin;
      let tooltipY = event.pageY - margin - tooltipNode.offsetHeight;
      const bodyWidth = document.body.clientWidth;
      if (tooltipX + tooltipNode.offsetWidth > bodyWidth - margin)
        tooltipX = event.pageX - margin - tooltipNode.offsetWidth;
      if (tooltipY < margin) tooltipY = event.pageY + margin;

      ui.tooltip
        .html(htmlContent)
        .style("left", `${tooltipX}px`)
        .style("top", `${tooltipY}px`)
        .style("opacity", 0.95);
    };

    // Use timeout for initial appearance
    const newTimeoutId = setTimeout(show, CONFIG.tooltipDelayMs);
    StateManager.dispatch({
      type: "SET_TOOLTIP_TIMEOUT_ID",
      payload: newTimeoutId,
    });
  },
  _hideTooltip() {
    if (!ui.tooltip || ui.tooltip.empty()) return;
    const currentTimeoutId = Selectors.selectState(
      StateManager.getState(),
    ).tooltipTimeoutId; // Use selector
    if (currentTimeoutId) clearTimeout(currentTimeoutId);
    StateManager.dispatch({ type: "SET_TOOLTIP_TIMEOUT_ID", payload: null });

    // Check pinned status from state
    if (!Selectors.selectPinnedTooltipData(StateManager.getState())) {
      // Use timeout for hiding delay
      const newTimeoutId = setTimeout(() => {
        if (!Selectors.selectPinnedTooltipData(StateManager.getState())) {
          // Double check pin status
          ui.tooltip.style("opacity", 0).style("left", "-1000px");
        }
        StateManager.dispatch({
          type: "SET_TOOLTIP_TIMEOUT_ID",
          payload: null,
        }); // Clear after execution
      }, CONFIG.tooltipDelayMs);
      StateManager.dispatch({
        type: "SET_TOOLTIP_TIMEOUT_ID",
        payload: newTimeoutId,
      });
    }
  },

  // --- Chart Hover Events ---
  dotMouseOver(event, d) {
    if (!d || !d.date) return;
    StateManager.dispatch({ type: "SET_ACTIVE_HOVER_DATA", payload: d });

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

    // Add secondary data if available (can use d directly)
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
    // if (d.adaptiveTDEE != null) secondaryDataLines.push(`Adaptive TDEE: ${Utils.formatValue(d.adaptiveTDEE, 0)} kcal`);
    if (secondaryDataLines.length > 0)
      tt += `<hr class="tooltip-hr">${secondaryDataLines.join("<br>")}`;

    // Check for annotation (logic moved to AnnotationManager, maybe needs selector?)
    // For now, assume AnnotationManager provides a synchronous way (if needed, less ideal)
    // const annotation = AnnotationManager.findAnnotationByDate(d.date); // Requires state read inside AM
    // Let's assume tooltip content might not show annotations for simplicity, or pass state to AM.find
    // Or, better: Tooltip component subscribes to hover AND annotation state.

    // Add pinning instruction (read state via selector)
    const currentState = StateManager.getState();
    const pinnedData = Selectors.selectPinnedTooltipData(currentState);
    const isPinned = pinnedData?.id === d.date.getTime();
    tt += `<hr class="tooltip-hr"><div class="note pinned-note">${isPinned ? "Click dot to unpin." : "Click dot to pin tooltip."}</div>`;

    EventHandlers._showTooltip(tt, event); // Show tooltip
  },
  dotMouseOut(event, d) {
    if (!d || !d.date) return;
    const currentHoverData = Selectors.selectActiveHoverData(
      StateManager.getState(),
    );
    if (currentHoverData?.date?.getTime() === d.date?.getTime()) {
      StateManager.dispatch({ type: "SET_ACTIVE_HOVER_DATA", payload: null });
    }
    EventHandlers._hideTooltip();
  },
  dotClick(event, d) {
    if (!d || !d.date) return;
    event.stopPropagation();
    const dataId = d.date.getTime();
    const currentPinnedData = Selectors.selectPinnedTooltipData(
      StateManager.getState(),
    ); // Use selector

    let newPinnedData = null;
    if (currentPinnedData?.id !== dataId) {
      newPinnedData = {
        id: dataId,
        data: d,
        pageX: event.pageX,
        pageY: event.pageY,
      };
    }
    StateManager.dispatch({
      type: "SET_PINNED_TOOLTIP",
      payload: newPinnedData,
    });

    // Update tooltip visibility based on pinning state (logic in _show/_hide)
    if (newPinnedData) {
      // Re-trigger tooltip content generation and display
      EventHandlers.dotMouseOver(event, d); // Regenerate content
      // Clear hide timeout explicitly
      const currentTimeoutId = Selectors.selectState(
        StateManager.getState(),
      ).tooltipTimeoutId;
      if (currentTimeoutId) clearTimeout(currentTimeoutId);
      StateManager.dispatch({ type: "SET_TOOLTIP_TIMEOUT_ID", payload: null });
      if (ui.tooltip) ui.tooltip.style("opacity", 0.95); // Ensure visible
    } else {
      EventHandlers._hideTooltip();
    }
  },

  balanceMouseOver(event, d) {
    if (!d || !d.date) return;
    const tt = `<strong>${Utils.formatDateLong(d.date)}</strong><br>Balance: ${Utils.formatValue(d.netBalance, 0)} kcal`;
    EventHandlers._showTooltip(tt, event);
  },
  balanceMouseOut(event, d) {
    EventHandlers._hideTooltip();
  },
  scatterMouseOver(event, d) {
    if (!d || !d.weekStartDate) return;
    const tt = `<strong>Week: ${Utils.formatDateShort(d.weekStartDate)}</strong><br>Avg Net: ${Utils.formatValue(d.avgNetCal, 0)} kcal/d<br>Rate: ${Utils.formatValue(d.weeklyRate, 2)} kg/wk`;
    EventHandlers._showTooltip(tt, event);
  },
  scatterMouseOut(event, d) {
    EventHandlers._hideTooltip();
  },
  annotationMouseOver(event, d) {
    if (!ui.tooltip || !d) return;
    const tt = `<strong>Annotation (${Utils.formatDateShort(new Date(d.date))})</strong><br>${d.text}`;
    EventHandlers._showTooltip(tt, event);
  },
  annotationMouseOut(event, d) {
    EventHandlers._hideTooltip();
  },
  trendChangeMouseOver(event, d) {
    if (!ui.tooltip || !d) return;
    const direction = d.magnitude > 0 ? "acceleration" : "deceleration";
    const rateChange = Math.abs(d.magnitude * 7);
    const tt = `<strong>Trend Change (${Utils.formatDateShort(d.date)})</strong><br>Significant ${direction} detected.<br>Rate Δ ≈ ${Utils.formatValue(rateChange, 2)} kg/wk`;
    EventHandlers._showTooltip(tt, event);
  },
  trendChangeMouseOut(event, d) {
    EventHandlers._hideTooltip();
  },

  // --- Brush and Zoom Handlers ---
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

    const selection = event.selection;
    if (!scales.xContext || !scales.x || !zoom) {
      console.warn("Context brush: scales or zoom not ready.");
      EventHandlers._isBrushing = false;
      return;
    }

    const newXDomain = selection
      ? selection.map(scales.xContext.invert)
      : scales.xContext.domain();

    // --- Directly update scales for immediate visual feedback during brush ---
    // MasterUpdater reads scales, so this keeps things visually consistent *during* the drag
    scales.x.domain(newXDomain);

    // --- Sync zoom transform state during brush ---
    if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
      const [x0Pixel, x1Pixel] = selection || scales.xContext.range();
      const { width: focusW } = EventHandlers._getChartDimensions("focus");
      if (!isNaN(x0Pixel) && !isNaN(x1Pixel) && focusW && x1Pixel > x0Pixel) {
        const k = focusW / (x1Pixel - x0Pixel);
        const tx = -x0Pixel * k;
        const newTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
        StateManager.dispatch({
          type: "SET_LAST_ZOOM_TRANSFORM",
          payload: { k: newTransform.k, x: newTransform.x, y: newTransform.y },
        }); // Store plain object
        // Update zoom behavior's transform visually without triggering event
        ui.zoomCaptureRect.on("zoom", null);
        ui.zoomCaptureRect.call(zoom.transform, newTransform);
        ui.zoomCaptureRect.on("zoom", EventHandlers.zoomed);
      }
    }

    // --- Trigger Lightweight Visual Update During Brush ---
    // Dispatch filtered data update based on the *current* newXDomain
    const allProcessedData = Selectors.selectProcessedData(
      StateManager.getState(),
    );
    const newFilteredData = allProcessedData.filter(
      (d) =>
        d.date instanceof Date &&
        d.date >= newXDomain[0] &&
        d.date <= newXDomain[1],
    );
    StateManager.dispatch({
      type: "SET_FILTERED_DATA",
      payload: newFilteredData,
    });
    // MasterUpdater listens to state:filteredDataChanged and will update visuals (dots, lines etc based on the new filter)
    // It should use options.isInteractive=true to apply faster/no transitions.
    MasterUpdater.updateAllCharts({ isInteractive: true }); // Trigger light update

    if (event.type === "end") {
      console.log("[EventHandlers] Context Brush end.");
      EventHandlers._debouncedInteractionEnd();
    }
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

    StateManager.dispatch({
      type: "SET_LAST_ZOOM_TRANSFORM",
      payload: {
        k: event.transform.k,
        x: event.transform.x,
        y: event.transform.y,
      },
    });

    if (!scales.xContext || !scales.x || !brushes.context) {
      console.warn("Zoom handler: scales or context brush not ready.");
      EventHandlers._isZooming = false;
      return;
    }

    const newXDomain = event.transform.rescaleX(scales.xContext).domain();

    // --- Directly update scales for immediate visual feedback ---
    scales.x.domain(newXDomain);

    // --- Sync context brush visually ---
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

    // --- Trigger Lightweight Visual Update During Zoom ---
    const allProcessedData = Selectors.selectProcessedData(
      StateManager.getState(),
    );
    const newFilteredData = allProcessedData.filter(
      (d) =>
        d.date instanceof Date &&
        d.date >= newXDomain[0] &&
        d.date <= newXDomain[1],
    );
    StateManager.dispatch({
      type: "SET_FILTERED_DATA",
      payload: newFilteredData,
    });
    MasterUpdater.updateAllCharts({ isInteractive: true }); // Trigger light update

    EventHandlers._debouncedInteractionEnd();

    setTimeout(() => {
      EventHandlers._isZooming = false;
    }, 50);
  },

  regressionBrushed(event) {
    if (
      !event ||
      event.type !== "end" ||
      !event.sourceEvent ||
      EventHandlers._isDraggingRegressionBrush
    )
      return;

    EventHandlers._isDraggingRegressionBrush = true;

    const selection = event.selection;
    let newRange = { start: null, end: null };
    let rangeUpdated = false;
    const currentRange = Selectors.selectInteractiveRegressionRange(
      StateManager.getState(),
    );

    if (selection && selection[0] !== selection[1]) {
      if (!scales.x) {
        EventHandlers._isDraggingRegressionBrush = false;
        return;
      }
      const startDate = scales.x.invert(selection[0]);
      const endDate = scales.x.invert(selection[1]);
      if (
        !(startDate instanceof Date) ||
        !(endDate instanceof Date) ||
        isNaN(startDate) ||
        isNaN(endDate)
      ) {
        EventHandlers._isDraggingRegressionBrush = false;
        return;
      }
      newRange = { start: startDate, end: endDate };
      const toleranceMs = 86400000 / 4; // 6 hour tolerance for change detection
      if (
        Math.abs(
          (currentRange.start?.getTime() ?? -Infinity) - startDate.getTime(),
        ) > toleranceMs ||
        Math.abs(
          (currentRange.end?.getTime() ?? -Infinity) - endDate.getTime(),
        ) > toleranceMs
      ) {
        rangeUpdated = true;
      }
    } else {
      // Brush cleared
      if (currentRange.start || currentRange.end) {
        rangeUpdated = true;
      }
    }

    if (rangeUpdated) {
      console.log(
        "[EventHandlers] Regression brush range changed, dispatching update.",
      );
      StateManager.dispatch({
        type: "SET_INTERACTIVE_REGRESSION_RANGE",
        payload: newRange,
      });
      StateManager.dispatch({ type: "SET_PINNED_TOOLTIP", payload: null });
      Utils.showStatusMessage(
        newRange.start
          ? "Regression range updated."
          : "Regression range reset.",
        "info",
        1500,
      );
    } else {
      console.log(
        "[EventHandlers] Regression brush range not changed significantly.",
      );
      // Still might need to update the visual appearance of the brush itself if it was moved slightly then back
      MasterUpdater.updateAllCharts({ isInteractive: false });
    }
    setTimeout(() => {
      EventHandlers._isDraggingRegressionBrush = false;
    }, 50);
  },

  // --- Resize Handler ---
  handleResize: Utils.debounce(() => {
    console.log("EventHandlers: Resize detected, re-rendering chart...");

    const preResizeState = StateManager.getState();
    const currentAnalysisRange = Selectors.selectAnalysisRange(preResizeState);

    StateManager.dispatch({ type: "SET_HIGHLIGHTED_DATE", payload: null });
    StateManager.dispatch({ type: "SET_PINNED_TOOLTIP", payload: null });

    if (initializeChartSetup()) {
      const stateSnapshot = StateManager.getState();
      if (
        Selectors.selectIsInitialized(stateSnapshot) &&
        Selectors.selectProcessedData(stateSnapshot)?.length > 0
      ) {
        // Update the context chart's X domain based on the full dataset
        DomainManager.updateContextXDomain(stateSnapshot);

        // Restore the focus chart's view (domain and zoom)
        EventHandlers.restoreViewAfterResize(currentAnalysisRange);

        // Redraw everything
        MasterUpdater.updateAllCharts(); // Full update after resize adjustments
      } else if (Selectors.selectIsInitialized(stateSnapshot)) {
        console.warn(
          "EventHandlers: Resize handler - No data to display after setup.",
        );
        DomainManager.setEmptyDomains();
        MasterUpdater.updateAllCharts();
      }
    } else {
      console.error(
        "EventHandlers: Chart redraw on resize failed during setup phase.",
      );
    }
  }, CONFIG.debounceResizeMs),

  /**
   * Restores the zoom transform and sets the focus domain based on the pre-resize analysis range.
   * Also syncs the context brush.
   * @param {object} analysisRange - The analysis range {start, end} stored before resize.
   */
  restoreViewAfterResize(analysisRange) { // Signature updated
    const lastZoomTransform = Selectors.selectLastZoomTransform(
      StateManager.getState(),
    );
    if (
      zoom &&
      ui.zoomCaptureRect &&
      !ui.zoomCaptureRect.empty() &&
      lastZoomTransform &&
      scales.xContext
    ) {
      if (
        typeof lastZoomTransform.k === "number" &&
        typeof lastZoomTransform.x === "number" &&
        typeof lastZoomTransform.y === "number"
      ) {
        const reconstructedTransform = d3.zoomIdentity
          .translate(lastZoomTransform.x, lastZoomTransform.y)
          .scale(lastZoomTransform.k);
        ui.zoomCaptureRect.on("zoom", null);
        ui.zoomCaptureRect.call(zoom.transform, reconstructedTransform);
        ui.zoomCaptureRect.on("zoom", EventHandlers.zoomed);

        // --- Set Focus Domain Directly from Stored Analysis Range ---
        if (analysisRange?.start && analysisRange?.end) {
            console.log("Restoring focus domain from pre-resize range:", analysisRange);
            scales.x.domain([analysisRange.start, analysisRange.end]); // Set focus domain directly
        } else {
            console.warn("restoreViewAfterResize: No valid analysisRange provided to restore.");
            // Fallback or error handling might be needed if range is missing
        }

        // --- Sync Context Brush ---
        // Use the restored analysisRange and the (potentially resized) scales.xContext
        if (brushes.context && ui.brushGroup && !ui.brushGroup.empty() && scales.xContext && analysisRange?.start && analysisRange?.end) {
            const brushSelection = [
                scales.xContext(analysisRange.start),
                scales.xContext(analysisRange.end)
            ];
            // Move the brush visually without triggering the 'brush' event
            ui.brushGroup.on("brush.handler", null).on("end.handler", null);
            if (brushSelection.every((v) => !isNaN(v))) {
              ui.brushGroup.call(brushes.context.move, brushSelection);
            }
            // Reattach brush listeners
            ui.brushGroup.on(
              "brush.handler end.handler",
              EventHandlers.contextBrushed,
            );
        }
      }
    }
  },

  handleThemeToggle() {
    import("../core/themeManager.js")
      .then(({ ThemeManager }) => {
        ThemeManager.toggleTheme();
      })
      .catch((err) =>
        console.error("Failed to load ThemeManager for toggle", err),
      );
  },

  handleTrendlineInputChange() {
    // Handles input from any of the 4 trendline controls
    console.log("[EventHandlers] Trendline input changed.");
    const startDateVal = ui.trendStartDateInput?.property("value");
    const initialWeightVal = ui.trendInitialWeightInput?.property("value");
    const weeklyIncrease1Val = ui.trendWeeklyIncrease1Input?.property("value");
    const weeklyIncrease2Val = ui.trendWeeklyIncrease2Input?.property("value");

    StateManager.dispatch({
      type: "UPDATE_TREND_CONFIG",
      payload: {
        startDate: startDateVal ? new Date(startDateVal) : null,
        initialWeight: initialWeightVal,
        weeklyIncrease1: weeklyIncrease1Val,
        weeklyIncrease2: weeklyIncrease2Val,
      },
    });
  },

  handleGoalSubmit(event) {
    event.preventDefault();
    const weightVal = ui.goalWeightInput?.property("value");
    const dateVal = ui.goalDateInput?.property("value");
    const rateVal = ui.goalTargetRateInput?.property("value");

    StateManager.dispatch({
      type: "LOAD_GOAL", // Or a more specific 'UPDATE_GOAL_FROM_FORM'
      payload: {
        weight: weightVal || null, // Send null if empty
        date: dateVal || null, // Send null if empty
        targetRate: rateVal || null, // Send null if empty
      },
    });
    import("../core/goalManager.js")
      .then(({ GoalManager }) => {
        GoalManager.save();
      })
      .catch((err) =>
        console.error("Failed to load GoalManager for save", err),
      );
  },

  _debouncedRangeInputChange: Utils.debounce(() => {
    console.log(
      "[EventHandlers] Debounced range input change handler triggered.",
    );
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
      const newStart = new Date(startDate.setHours(0, 0, 0, 0));
      const newEnd = new Date(endDate.setHours(23, 59, 59, 999));
      const currentRange = Selectors.selectAnalysisRange(
        StateManager.getState(),
      );

      if (
        currentRange.start?.getTime() !== newStart.getTime() ||
        currentRange.end?.getTime() !== newEnd.getTime()
      ) {
        console.log(
          "[EventHandlers Debounce] Dispatching range change from inputs:",
          newStart,
          newEnd,
        );
        StateManager.dispatch({
          type: "SET_ANALYSIS_RANGE",
          payload: { start: newStart, end: newEnd },
        });
        StateManager.dispatch({ type: "SET_PINNED_TOOLTIP", payload: null });
        StateManager.dispatch({ type: "SET_HIGHLIGHTED_DATE", payload: null });
        StateManager.dispatch({
          type: "SET_INTERACTIVE_REGRESSION_RANGE",
          payload: { start: null, end: null },
        });
        if (scales.x) scales.x.domain([newStart, newEnd]);
        EventHandlers.syncBrushAndZoomToFocus();
        Utils.showStatusMessage(
          "Analysis range updated from input.",
          "info",
          1500,
        );
      } else {
        console.log(
          "[EventHandlers Debounce] Range input change detected, but value is same as current state. No dispatch.",
        );
      }
    } else if (startVal || endVal) {
      Utils.showStatusMessage("Invalid date range entered in inputs.", "error");
    }
  }, 400), // Debounce for 400ms

  handleAnalysisRangeUpdate() {
    console.log("[EventHandlers] Apply Range button clicked.");
    EventHandlers._debouncedRangeInputChange.flush();
  },

  handleAnalysisRangeInputChange() {
    console.log("[EventHandlers] Date input change detected.");
    EventHandlers._debouncedRangeInputChange();
  },

  syncBrushAndZoomToFocus() {
    if (!scales.x || !scales.xContext || !brushes.context || !zoom) return;
    const { width: focusW } = EventHandlers._getChartDimensions("focus");
    if (!focusW) return;
    const currentFocusDomain = scales.x.domain();
    if (!currentFocusDomain.every((d) => d instanceof Date && !isNaN(d)))
      return;

    const [x0Pixel, x1Pixel] = currentFocusDomain.map(scales.xContext);
    if (isNaN(x0Pixel) || isNaN(x1Pixel) || x1Pixel - x0Pixel <= 0) return;
    const k = focusW / (x1Pixel - x0Pixel);
    const tx = -x0Pixel * k;
    const newTransform = d3.zoomIdentity.translate(tx, 0).scale(k);

    StateManager.dispatch({
      type: "SET_LAST_ZOOM_TRANSFORM",
      payload: { k: newTransform.k, x: newTransform.x, y: newTransform.y },
    });

    if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
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

  statDateClickWrapper(event) {
    if (event.currentTarget && event.currentTarget.__highlightDate) {
      EventHandlers.statDateClick(event.currentTarget.__highlightDate);
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
        if (diff < minDiff) {
          minDiff = diff;
          closestPoint = p;
        }
      }
    });
    if (!closestPoint) return;

    // Dispatch highlight/pin state changes
    const currentHighlight = Selectors.selectHighlightedDate(stateSnapshot);
    if (currentHighlight?.getTime() === closestPoint.date.getTime()) {
      StateManager.dispatch({ type: "SET_HIGHLIGHTED_DATE", payload: null });
      StateManager.dispatch({ type: "SET_PINNED_TOOLTIP", payload: null });
    } else {
      StateManager.dispatch({
        type: "SET_HIGHLIGHTED_DATE",
        payload: closestPoint.date,
      });
    }

    // Calculate new domain and update scales/dispatch range change
    if (!scales.x || !scales.xContext || !zoom || !brushes.context) return;
    const { width: focusW } = EventHandlers._getChartDimensions("focus");
    if (!focusW) return;
    const xDomain = scales.x.domain();
    if (!xDomain.every((d) => d instanceof Date && !isNaN(d))) return;

    const viewWidthMs = xDomain[1].getTime() - xDomain[0].getTime();
    const halfViewMs = viewWidthMs / 2;
    const targetStartTime = closestPoint.date.getTime() - halfViewMs;
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
      clampedStartTime = Math.max(minTime, clampedEndTime - viewWidthMs);
    }
    if (clampedEndTime < clampedStartTime) clampedEndTime = clampedStartTime; // Avoid inversion

    const finalDomain = [new Date(clampedStartTime), new Date(clampedEndTime)];
    scales.x.domain(finalDomain); // Update scales directly

    // Dispatch analysis range change
    const finalAnalysisRange = {
      start: new Date(new Date(finalDomain[0]).setHours(0, 0, 0, 0)), // Clone
      end: new Date(new Date(finalDomain[1]).setHours(23, 59, 59, 999)), // Clone
    };
    StateManager.dispatch({
      type: "SET_ANALYSIS_RANGE",
      payload: finalAnalysisRange,
    });

    EventHandlers.syncBrushAndZoomToFocus();
    EventHandlers._hideTooltip();
  },

  handleWhatIfSubmit(event) {
    event.preventDefault();
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
    const stateSnapshot = StateManager.getState();
    const currentDisplayStats = Selectors.selectDisplayStats(stateSnapshot);
    const tdeeEstimate =
      currentDisplayStats.avgTDEE_Adaptive ??
      currentDisplayStats.avgTDEE_WgtChange ??
      currentDisplayStats.avgExpenditureGFit;
    const tdeeSource =
      tdeeEstimate === currentDisplayStats.avgTDEE_Adaptive
        ? "Adaptive"
        : tdeeEstimate === currentDisplayStats.avgTDEE_WgtChange
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
    const startWeight =
      currentDisplayStats.currentSma ?? currentDisplayStats.currentWeight;
    if (startWeight == null || isNaN(startWeight)) {
      resultDisplay
        .classed("error", true)
        .text("Cannot project: Current weight unknown.");
      return;
    }
    const projectedWeight = startWeight + totalWeightChangeKg;
    const fv = Utils.formatValue;
    resultDisplay.html(
      `Based on ${tdeeSource} TDEE ≈ ${fv(tdeeEstimate, 0)} kcal:<br> Est. change: ${fv(totalWeightChangeKg, 1)} kg in ${durationDays} days. (${fv((totalWeightChangeKg / durationDays) * 7, 1)} kg/wk)<br> Projected Weight: <strong>${fv(projectedWeight, 1)} kg</strong>.`,
    );
  },
                         
  handleBackgroundClick(event) {
    const targetNode = event.target;
    const isInteractive = targetNode.closest(
      ".raw-dot, .annotation-marker-group, .trend-change-marker-group, .legend-item, .handle, .selection, .overlay, .highlightable",
    );
    const isBackground =
      targetNode === ui.zoomCaptureRect?.node() ||
      targetNode === ui.svg?.node() ||
      targetNode === ui.focus?.node() ||
      targetNode === ui.chartArea?.node();

    if (isBackground && !isInteractive) {
      const currentState = StateManager.getState(); // Read current state
      if (Selectors.selectHighlightedDate(currentState)) {
        StateManager.dispatch({ type: "SET_HIGHLIGHTED_DATE", payload: null });
      }
      if (Selectors.selectPinnedTooltipData(currentState)) {
        StateManager.dispatch({ type: "SET_PINNED_TOOLTIP", payload: null });
        EventHandlers._hideTooltip(); // Still need direct call to hide UI element if pinned
      }
      const currentRegRange =
        Selectors.selectInteractiveRegressionRange(currentState);
      if (currentRegRange.start || currentRegRange.end) {
        StateManager.dispatch({
          type: "SET_INTERACTIVE_REGRESSION_RANGE",
          payload: { start: null, end: null },
        });
        // Sync brush visual immediately
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
    }
  },

  handleCardToggle(buttonElement) {
    if (!buttonElement) return;
    const cardSection = buttonElement.closest(".card.collapsible");
    if (!cardSection) return;
    const isCollapsed = cardSection.classList.toggle("collapsed");
    buttonElement.setAttribute("aria-expanded", !isCollapsed);
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

  // --- Helpers ---
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

  // --- Setup ---
  setupAll() {
    console.log("EventHandlers: Setting up event listeners...");
    window.addEventListener("resize", EventHandlers.handleResize);
    ui.themeToggle?.on("click", EventHandlers.handleThemeToggle);
    d3.select("#goal-setting-form").on(
      "submit",
      EventHandlers.handleGoalSubmit,
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
      EventHandlers.handleAnalysisRangeUpdate,
    );
    ui.analysisStartDateInput?.on(
      "change.range",
      EventHandlers.handleAnalysisRangeInputChange,
    );
    ui.analysisEndDateInput?.on(
      "change.range",
      EventHandlers.handleAnalysisRangeInputChange,
    );
    ui.whatIfSubmitBtn?.on("click", EventHandlers.handleWhatIfSubmit);
    ui.whatIfIntakeInput?.on("keydown", (event) => {
      if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
    });
    ui.whatIfDurationInput?.on("keydown", (event) => {
      if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
    });
    const trendInputs = [
      ui.trendStartDateInput,
      ui.trendInitialWeightInput,
      ui.trendWeeklyIncrease1Input,
      ui.trendWeeklyIncrease2Input,
    ];
    trendInputs.forEach((input) =>
      input?.on("input.trend", EventHandlers.handleTrendlineInputChange),
    );

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

    ui.svg?.on("click", EventHandlers.handleBackgroundClick);

    d3.select("body").on("click.cardToggle", (event) => {
      const toggleButton = event.target.closest(".card-toggle-btn");
      const heading = event.target.closest("h2");
      if (toggleButton && toggleButton.closest(".card.collapsible")) {
        EventHandlers.handleCardToggle(toggleButton);
      } else if (
        heading &&
        !toggleButton &&
        heading.closest(".card.collapsible")
      ) {
        const cardSection = heading.closest(".card.collapsible");
        const btn = cardSection?.querySelector(".card-toggle-btn");
        if (btn) {
          event.preventDefault();
          EventHandlers.handleCardToggle(btn);
        }
      }
    });
    console.log("EventHandlers: Setup complete.");
  },
};
