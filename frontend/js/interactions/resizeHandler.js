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
    // Standardize restoring view by setting domain first, then syncing interactions
    if (analysisRange?.start && analysisRange?.end) {
        if (scales.x) {
            console.log("[ResizeHandler] Restoring focus domain from pre-resize range:", analysisRange);
            scales.x.domain([analysisRange.start, analysisRange.end]);
            // Use the central sync function to update Zoom transform and Context Brush positions
            // This recalculates the correct transform for the new chart width
            ChartInteractions.syncBrushAndZoomToFocus();
        }
    } else {
        console.warn("[ResizeHandler] restoreViewAfterResize: No valid analysisRange provided to restore.");
    }
}

// Store last measured dimensions
let lastWidth = window.innerWidth;
let lastHeight = window.innerHeight;

// Debounced resize handler
const handleResizeDebounced = Utils.debounce(() => {
    console.log("[ResizeHandler] handleResizeDebounced triggered.");

    // Check if dimensions actually changed significantly to avoid infinite loops
    // or triggering on minor layout shifts (e.g., scrollbars toggling, or chart updates).
    const currentWidth = window.innerWidth;
    const currentHeight = window.innerHeight;

    console.log(`[ResizeHandler] Dimensions changed. Width: ${lastWidth} -> ${currentWidth}, Height: ${lastHeight} -> ${currentHeight}`);
    lastWidth = currentWidth;
    lastHeight = currentHeight;

    // Strategy: Breaking the layout dependency.
    // The chart SVG (with fixed large dimensions from fullscreen) forces the container 
    // and parent section to stay large even after fullscreen exit.
    // We must temporarily "collapse" the chart to allow the DOM to snap back to its 
    // natural grid/flex size, then measure that, then re-expand the chart.

    // 1. Collapse SVGs to allow container to shrink
    const svgSelectors = [
        "#chart-container svg",
        "#context-chart-container svg",
        "#balance-chart-container svg",
        "#rate-of-change-container svg",
        "#tdee-reconciliation-container svg",
        "#correlation-scatter-container svg"
    ];

    // Set explicit small size to release layout constraints
    svgSelectors.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
            el.setAttribute("width", "10");
            el.setAttribute("height", "10");
            el.style.width = "10px";
            el.style.height = "10px";
        }
    });

    // 2. Force Repaint/Reflow (read a layout property)
    // This forces the browser to recalculate the chart-section size based on the now-small children
    document.body.offsetHeight;

    // 3. Normal Update process begins (Measurements will now be correct)
    const preResizeState = StateManager.getState();
    const currentAnalysisRange = Selectors.selectAnalysisRange(preResizeState);

    // Clear potentially stale interaction states
    StateManager.dispatch({ type: "SET_HIGHLIGHTED_DATE", payload: null });
    StateManager.dispatch({ type: "SET_PINNED_TOOLTIP", payload: null });

    // Re-initialize chart dimensions and scales
    if (initializeChartSetup()) {
        const stateSnapshot = StateManager.getState();
        if (
            Selectors.selectIsInitialized(stateSnapshot) &&
            Selectors.selectProcessedData(stateSnapshot).length > 0
        ) {
            // CRITICAL: restore the context domain BEFORE restoring the focus view.
            // initializeChartSetup() recreates scales with default domains [0, 1].
            // restoreViewAfterResize() calls syncBrushAndZoomToFocus(), which relies
            // on scales.xContext.domain() to calculate the correct zoom transform.
            DomainManager.updateContextXDomain(stateSnapshot);

            restoreViewAfterResize(currentAnalysisRange);
            MasterUpdater.updateAllCharts();
        } else if (Selectors.selectIsInitialized(stateSnapshot)) {
            DomainManager.setEmptyDomains();
            MasterUpdater.updateAllCharts();
        }
    } else {
        console.error("[ResizeHandler] Chart redraw on resize failed during setup phase.");
    }
}, CONFIG.debounceResizeMs);


export const ResizeHandler = {
    handleResize: handleResizeDebounced,
    // Expose restoreViewAfterResize as it's called from main.js during init
    restoreViewAfterResize: restoreViewAfterResize,
    init() {
        window.addEventListener("resize", this.handleResize);
        document.addEventListener("fullscreenchange", () => {
            console.log("[ResizeHandler] Fullscreen change detected.");
            // Reset last dimensions to force a resize update even if window size is the same
            lastWidth = 0;
            lastHeight = 0;
            this.handleResize();
        });
    }
};

console.log("ResizeHandler module loaded.");