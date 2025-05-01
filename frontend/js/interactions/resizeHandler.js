// js/interactions/resizeHandler.js
// Handles window resize events and restoring chart view state.

import { StateManager } from "../core/stateManager.js";
import { ui } from "../ui/uiCache.js"; // Potentially needed if restoreView manipulates UI directly
import { scales, brushes, zoom, initializeChartSetup } from "../ui/chartSetup.js";
import { CONFIG } from "../config.js";
import { Utils } from "../core/utils.js";
import { DomainManager } from "../core/domainManager.js";
import { MasterUpdater } from "../ui/masterUpdater.js";
import * as Selectors from "../core/selectors.js";
import { ChartInteractions } from "./chartInteractions.js"; // Needed for restoreView

/**
 * Restores the zoom transform and sets the focus domain based on the pre-resize analysis range.
 * Also syncs the context brush.
 * (Internal function, called by handleResize)
 * @param {object} analysisRange - The analysis range {start, end} stored before resize.
 */
function restoreViewAfterResize(analysisRange) {
    const lastZoomTransform = Selectors.selectLastZoomTransform(StateManager.getState());
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

            // Temporarily disable zoom listener during programmatic transform
            ui.zoomCaptureRect.on("zoom", null);
            ui.zoomCaptureRect.call(zoom.transform, reconstructedTransform);
            ui.zoomCaptureRect.on("zoom", ChartInteractions.zoomed); // Reattach listener from ChartInteractions

            // --- Set Focus Domain Directly from Stored Analysis Range ---
            if (analysisRange?.start && analysisRange?.end) {
                console.log("[ResizeHandler] Restoring focus domain from pre-resize range:", analysisRange);
                scales.x.domain([analysisRange.start, analysisRange.end]);
            } else {
                console.warn("[ResizeHandler] restoreViewAfterResize: No valid analysisRange provided to restore.");
            }

            // --- Sync Context Brush ---
            if (brushes.context && ui.brushGroup && !ui.brushGroup.empty() && scales.xContext && analysisRange?.start && analysisRange?.end) {
                const brushSelection = [
                    scales.xContext(analysisRange.start),
                    scales.xContext(analysisRange.end)
                ];
                // Temporarily disable brush listener during programmatic move
                ui.brushGroup.on("brush.handler", null).on("end.handler", null);
                if (brushSelection.every((v) => !isNaN(v))) {
                    ui.brushGroup.call(brushes.context.move, brushSelection);
                }
                // Reattach brush listeners
                ui.brushGroup.on("brush.handler end.handler", ChartInteractions.contextBrushed); // Reattach listener from ChartInteractions
            }
        }
    }
}

// Debounced resize handler
const handleResizeDebounced = Utils.debounce(() => {
    console.log("[ResizeHandler] Debounced resize detected, re-rendering chart...");

    const preResizeState = StateManager.getState();
    const currentAnalysisRange = Selectors.selectAnalysisRange(preResizeState);

    // Clear potentially stale interaction states
    StateManager.dispatch({ type: "SET_HIGHLIGHTED_DATE", payload: null });
    StateManager.dispatch({ type: "SET_PINNED_TOOLTIP", payload: null });

    // Re-initialize chart dimensions and scales
    if (initializeChartSetup()) {
        const stateSnapshot = StateManager.getState(); // Get potentially updated state after setup
        if (
            Selectors.selectIsInitialized(stateSnapshot) &&
            Selectors.selectProcessedData(stateSnapshot)?.length > 0
        ) {
            // Update context domain based on full data
            DomainManager.updateContextXDomain(stateSnapshot);

            // Restore the previous view (zoom/pan/domain)
            restoreViewAfterResize(currentAnalysisRange);

            // Trigger a full redraw
            MasterUpdater.updateAllCharts();
        } else if (Selectors.selectIsInitialized(stateSnapshot)) {
            console.warn("[ResizeHandler] No data to display after resize setup.");
            DomainManager.setEmptyDomains(); // Ensure domains are empty if no data
            MasterUpdater.updateAllCharts(); // Redraw empty state
        }
    } else {
        console.error("[ResizeHandler] Chart redraw on resize failed during setup phase.");
    }
}, CONFIG.debounceResizeMs);


export const ResizeHandler = {
    handleResize: handleResizeDebounced,
    // Expose restoreViewAfterResize as it's called from main.js during init
    restoreViewAfterResize: restoreViewAfterResize
};

console.log("ResizeHandler module loaded.");