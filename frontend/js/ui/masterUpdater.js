// js/ui/masterUpdater.js
// Orchestrates updates to all chart visuals based on state changes.

import { StateManager } from "../core/stateManager.js";
import { scales, brushes, zoom, initializeChartSetup } from "./chartSetup.js";
import { ui } from "./uiCache.js";
import { Utils } from "../core/utils.js";
import { DomainManager } from "../core/domainManager.js";
import {
  FocusChartUpdater,
  ContextChartUpdater,
  BalanceChartUpdater,
  RateChartUpdater,
  TDEEDiffChartUpdater,
  ScatterPlotUpdater,
} from "./chartUpdaters.js";
import { CONFIG } from "../config.js";
import { EventHandlers } from "../interactions/eventHandlers.js";
import * as Selectors from "../core/selectors.js";
import { DataService } from "../core/dataService.js"; // <<< ADD THIS IMPORT >>>

/**
 * Gets the calculated width and height for a specific chart's drawing area.
 * Reads directly from the scales object.
 * @param {'focus'|'balance'|'rate'|'tdeeDiff'|'scatter'|'context'} chartKey - The key for the chart.
 * @returns {{width: number, height: number}}
 */
function _getChartDimensionsFromScales(chartKey) {
    let width = 0, height = 0;
    try {
        let xScale, yScale;
        switch(chartKey) {
            case 'focus':    xScale = scales.x; yScale = scales.y; break;
            case 'context':  xScale = scales.xContext; yScale = scales.yContext; break;
            case 'balance':  xScale = scales.xBalance; yScale = scales.yBalance; break;
            case 'rate':     xScale = scales.xRate; yScale = scales.yRate; break;
            case 'tdeeDiff': xScale = scales.xTdeeDiff; yScale = scales.yTdeeDiff; break;
            case 'scatter':  xScale = scales.xScatter; yScale = scales.yScatter; break;
            default: return { width: 0, height: 0 };
        }
        // Check if scales and their ranges exist before accessing them
        if (xScale?.range && yScale?.range) {
            const xRange = xScale.range();
            const yRange = yScale.range();
            if (xRange && xRange.length === 2 && yRange && yRange.length === 2) {
                 width = Math.abs(xRange[1] - xRange[0]);
                 height = Math.abs(yRange[0] - yRange[1]);
            }
        }
    } catch (e) { console.warn(`MasterUpdater Helper: Error getting dimensions for ${chartKey}`, e); }
    width = Math.max(0, width); height = Math.max(0, height);
    return { width, height };
}

/** Updates the analysis range date input fields to match the current FOCUS CHART view */
function _updateAnalysisRangeInputsFromFocusScale() {
    const focusXDomain = scales.x?.domain(); // Read from scales
    if (focusXDomain && focusXDomain.length === 2 &&
        focusXDomain[0] instanceof Date && !isNaN(focusXDomain[0]) &&
        focusXDomain[1] instanceof Date && !isNaN(focusXDomain[1])) {
        const startDateStr = Utils.formatDate(focusXDomain[0]);
        const endDateStr = Utils.formatDate(focusXDomain[1]);
        ui.analysisStartDateInput?.property("value", startDateStr);
        ui.analysisEndDateInput?.property("value", endDateStr);
    } else {
        ui.analysisStartDateInput?.property("value", "");
        ui.analysisEndDateInput?.property("value", "");
    }
}


// --- MasterUpdater Object ---
export const MasterUpdater = {
    _isUpdating: false, // Re-entry guard flag
    _pendingUpdate: false, // Flag to coalesce rapid updates

    /**
     * Updates all chart visuals based on the current state.
     * Reads data using selectors and calls ChartUpdaters.
     * @param {object} [options={}] - Options object.
     * @param {boolean} [options.isInteractive=false] - Flag indicating if update is during interaction (zoom/brush).
     */
    updateAllCharts(options = {}) {
        if (MasterUpdater._isUpdating) {
            // console.warn("MasterUpdater: Skipping update - already updating.");
            MasterUpdater._pendingUpdate = true; // Mark that an update is needed after current one finishes
            return;
        }
        MasterUpdater._isUpdating = true;
        MasterUpdater._pendingUpdate = false; // Clear pending flag as we are starting an update

        // Use requestAnimationFrame for smoother rendering, especially during interactions
        requestAnimationFrame(() => {
            try {
                const stateSnapshot = StateManager.getState(); // Get current state once

                // --- Initialization Guard ---
                if (!Selectors.selectIsInitialized(stateSnapshot) || !scales.x?.domain() || !scales.y?.domain()) {
                    console.warn("MasterUpdater: Skipping update - not initialized or scales lack valid domains.");
                    MasterUpdater._isUpdating = false; // Reset flag
                    if(MasterUpdater._pendingUpdate) {
                        console.log("[MasterUpdater] Retrying pending update after init guard fail.");
                         setTimeout(() => MasterUpdater.updateAllCharts(options), 0);
                    }
                    return;
                }

                // --- Domain Updates (if not during interaction) ---
                if (!options.isInteractive) {
                     // DomainManager reads the state itself now
                     DomainManager.updateDomainsOnInteraction();
                }

                // --- Get Necessary Data Using Selectors ---
                const filteredData = Selectors.selectFilteredData(stateSnapshot);
                const processedData = Selectors.selectProcessedData(stateSnapshot);
                const regressionResult = stateSnapshot.regressionResult; // Use state's regression result
                const activeHoverData = Selectors.selectActiveHoverData(stateSnapshot);
                const highlightedDate = Selectors.selectHighlightedDate(stateSnapshot);
                const pinnedTooltipData = Selectors.selectPinnedTooltipData(stateSnapshot);
                const annotations = Selectors.selectAnnotations(stateSnapshot);
                const plateaus = Selectors.selectPlateaus(stateSnapshot);
                const trendChangePoints = Selectors.selectTrendChangePoints(stateSnapshot);
                const goal = Selectors.selectGoal(stateSnapshot);
                const goalAchievedDate = Selectors.selectGoalAchievedDate(stateSnapshot);
                const trendConfig = Selectors.selectTrendConfig(stateSnapshot);
                const visibility = Selectors.selectSeriesVisibility(stateSnapshot);
                // Scatter plot data is handled by its own subscription/updater

                // Prepare specific data subsets needed by updaters
                const visibleValidSmaData = filteredData.filter((d) => d.sma != null);
                const visibleValidEmaData = filteredData.filter((d) => d.ema != null);
                const visibleRawWeightData = filteredData.filter((d) => d.value != null);

                // --- Calculate Trend Line and Goal Line Data ---
                let goalLineData = [];
                 if (visibility.goal && goal.weight != null && processedData.length > 0) {
                     // Find last valid SMA point in the *entire* dataset to start the goal line
                     const lastSmaPoint = [...processedData].reverse().find(d => d.sma != null);
                     if (lastSmaPoint?.date && lastSmaPoint.sma != null) {
                         const startDate = lastSmaPoint.date;
                         const startWeight = lastSmaPoint.sma;
                         // End date is goal date or the end of the *context* x-axis if no goal date
                         const contextXDomain = scales.xContext?.domain();
                         const endDateRaw = goal.date ? goal.date : (contextXDomain?.[1] || startDate); // Fallback to start date if context missing
                         if (endDateRaw instanceof Date && !isNaN(endDateRaw) && endDateRaw >= startDate) {
                             goalLineData = [{ date: startDate, weight: startWeight }, { date: endDateRaw, weight: goal.weight }];
                         }
                     }
                 }

                let trendLine1Data = [];
                let trendLine2Data = [];
                if (trendConfig.isValid && processedData.length > 0) {
                    const currentXDomain = scales.x?.domain(); // Use focus chart's domain
                    if (currentXDomain && currentXDomain[0] && currentXDomain[1]) {
                        // Generate points slightly beyond the visible range for smoother panning/zooming
                        const bufferDays = 7; // Add a buffer
                        const viewStartDate = d3.timeDay.offset(currentXDomain[0], -bufferDays);
                        const viewEndDate = d3.timeDay.offset(currentXDomain[1], bufferDays);

                        // Generate points across the visible range + buffer
                        // Using processedData ensures we have points even if filteredData is sparse at edges
                        const pointsInRange = processedData.filter(d => d.date >= viewStartDate && d.date <= viewEndDate);

                        // Helper to calculate trend points for a given rate
                        const calculateTrendPoints = (rate) => {
                            const points = pointsInRange.map(d => ({
                                date: d.date,
                                weight: DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, rate, d.date)
                            })).filter(p => p.weight != null);
                            // Add explicit start/end points for the buffered view range
                            const trendStart = DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, rate, viewStartDate);
                            const trendEnd = DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, rate, viewEndDate);
                            if (trendStart != null) points.unshift({ date: viewStartDate, weight: trendStart });
                            if (trendEnd != null) points.push({ date: viewEndDate, weight: trendEnd });
                            // Remove duplicates and sort
                            const uniquePoints = Array.from(new Map(points.map(p => [p.date.getTime(), p])).values());
                            uniquePoints.sort((a, b) => a.date - b.date);
                            return uniquePoints;
                        };

                        if (trendConfig.weeklyIncrease1 != null) {
                             trendLine1Data = calculateTrendPoints(trendConfig.weeklyIncrease1);
                        }
                         if (trendConfig.weeklyIncrease2 != null) {
                             trendLine2Data = calculateTrendPoints(trendConfig.weeklyIncrease2);
                         }
                    }
                }


                // --- Dimension Recalculation & SVG Resizing ---
                const { width: focusWidth, height: focusHeight } = _getChartDimensionsFromScales("focus");
                const { width: contextWidth, height: contextHeight } = _getChartDimensionsFromScales("context");
                if (focusWidth <= 0 || focusHeight <= 0) {
                     console.error("[MasterUpdater] Invalid focus dimensions. Aborting.", focusWidth, focusHeight);
                     MasterUpdater._isUpdating = false; if(MasterUpdater._pendingUpdate) MasterUpdater.updateAllCharts(options); return;
                }
                // SVG resizing logic (remains the same)
                 if (ui.svg) { /* ... */
                    ui.svg.attr("width", focusWidth + CONFIG.margins.focus.left + CONFIG.margins.focus.right).attr("height", focusHeight + CONFIG.margins.focus.top + CONFIG.margins.focus.bottom);
                    ui.svg.select("#clip-focus rect").attr("width", focusWidth).attr("height", focusHeight);
                    ui.zoomCaptureRect?.attr("width", focusWidth).attr("height", focusHeight);
                    zoom?.extent([[0, 0], [focusWidth, focusHeight]]);
                    brushes.regression?.extent([[0, 0], [focusWidth, focusHeight]]);
                    if (ui.regressionBrushGroup && !ui.regressionBrushGroup.empty() && brushes.regression) { ui.regressionBrushGroup.call(brushes.regression); }
                }
                if (ui.contextSvg && contextWidth > 0 && contextHeight > 0) { /* ... */
                     ui.contextSvg.attr("width", contextWidth + CONFIG.margins.context.left + CONFIG.margins.context.right).attr("height", contextHeight + CONFIG.margins.context.top + CONFIG.margins.context.bottom);
                    brushes.context?.extent([[0, 0], [contextWidth, contextHeight]]);
                    if (ui.brushGroup && !ui.brushGroup.empty() && brushes.context) { ui.brushGroup.call(brushes.context); }
                }


                // --- Update Visual Components ---

                // Update Axes
                FocusChartUpdater.updateAxes(focusWidth, focusHeight, options);
                ContextChartUpdater.updateAxes();
                const { width: balWidth } = _getChartDimensionsFromScales("balance");
                const { width: rateWidth } = _getChartDimensionsFromScales("rate");
                const { width: tdeeWidth } = _getChartDimensionsFromScales("tdeeDiff");
                BalanceChartUpdater.updateAxes(balWidth); // Axes only need width for potential grid lines
                RateChartUpdater.updateAxes(rateWidth);
                TDEEDiffChartUpdater.updateAxes(tdeeWidth);

                // --- Set Visibility Styles ---
                // Set display style based on visibility state *before* updating paths/elements
                Object.keys(visibility).forEach(key => {
                    const isVisible = visibility[key];
                    switch (key) {
                        case 'smaLine': ui.smaLine?.style("display", isVisible ? null : "none"); break;
                        case 'emaLine': ui.emaLine?.style("display", isVisible ? null : "none"); break;
                        case 'smaBand': ui.bandArea?.style("display", isVisible ? null : "none"); break;
                        case 'regression': ui.regressionLine?.style("display", isVisible ? null : "none"); break;
                        // case 'regressionCI': ui.regressionCIArea?.style("display", isVisible ? null : "none"); break;
                        case 'trend1': ui.trendLine1?.style("display", isVisible ? null : "none"); break;
                        case 'trend2': ui.trendLine2?.style("display", isVisible ? null : "none"); break;
                        case 'goal':
                            ui.goalLine?.style("display", isVisible ? null : "none");
                            ui.goalZoneRect?.style("display", isVisible ? null : "none");
                            ui.goalAchievedGroup?.style("display", isVisible ? null : "none");
                            break;
                        case 'raw': ui.rawDotsGroup?.style("display", isVisible ? null : "none"); break;
                        case 'annotations': ui.annotationsGroup?.style("display", isVisible ? null : "none"); break;
                        case 'plateaus': ui.plateauGroup?.style("display", isVisible ? null : "none"); break;
                        case 'trendChanges': ui.trendChangeGroup?.style("display", isVisible ? null : "none"); break;
                        case 'rateMA': ui.rateMALine?.style("display", isVisible ? null : "none"); break;
                        // Add other elements if needed
                    }
                });


                // Update the paths/dots/markers etc.
                FocusChartUpdater.updatePaths(
                    visibleValidSmaData,
                    visibleValidEmaData,
                    regressionResult,
                    trendLine1Data, // Pass calculated trend data
                    trendLine2Data, // Pass calculated trend data
                    goalLineData,
                    options
                );
                // Pass options to dot update for transitions
                FocusChartUpdater.updateDots(visibleRawWeightData, pinnedTooltipData, activeHoverData, options);
                FocusChartUpdater.updateHighlightMarker(highlightedDate, visibleRawWeightData);
                FocusChartUpdater.updateCrosshair(activeHoverData, focusWidth, focusHeight);
                // Pass options for transitions
                FocusChartUpdater.updateAnnotations(annotations, processedData, options);
                FocusChartUpdater.updatePlateauRegions(plateaus, focusHeight, options);
                FocusChartUpdater.updateTrendChangeMarkers(trendChangePoints, processedData, options);
                FocusChartUpdater.updateGoalVisuals(goal, goalAchievedDate, focusWidth, focusHeight, options);
                FocusChartUpdater.updateRegressionBrushDisplay(stateSnapshot.interactiveRegressionRange, focusWidth);

                // Update Secondary Charts
                ContextChartUpdater.updateChart(processedData);
                BalanceChartUpdater.updateChart(filteredData, balWidth, options); // Pass options
                RateChartUpdater.updateChart(filteredData, rateWidth, options); // Pass options
                RateChartUpdater.addHoverDots(filteredData); // Hover dots don't typically need transitions
                TDEEDiffChartUpdater.updateChart(filteredData, options); // Pass options
                TDEEDiffChartUpdater.addHoverDots(filteredData);

                // Update Scatter Plot (handled by separate subscription)

                // Sync & UI Helpers
                if (!options.isInteractive) { EventHandlers.syncBrushAndZoomToFocus(); }
                _updateAnalysisRangeInputsFromFocusScale();

            } catch (error) {
                 console.error("MasterUpdater: Error during updateAllCharts animation frame:", error);
                 Utils.showStatusMessage("Error updating chart visuals.", "error");
             }
            finally {
                MasterUpdater._isUpdating = false; // Reset flag
                 // If another update was requested while this one was running, run it now
                 if (MasterUpdater._pendingUpdate) {
                    console.log("[MasterUpdater] Running pending update...");
                    setTimeout(() => MasterUpdater.updateAllCharts(options), 0);
                }
             }
        }); // End requestAnimationFrame
    },

    /**
     * Initializes the MasterUpdater by subscribing to relevant state changes.
     */
    init() {
        // --- Subscribe to the MAIN derived data update event ---
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (/* payload is displayStats object */) => {
            console.log("[MasterUpdater] Received event: state:displayStatsUpdated. Triggering update.");
            // Pass isInteractive: false because this is a state-driven update, not a direct interaction response
            MasterUpdater.updateAllCharts({ isInteractive: false });
        });

        // --- Subscribe ONLY to events NOT directly caused by StatsManager calculation cycle ---
        // These affect visual presentation or interaction states directly.
        const directVisualUpdateEvents = [
            'state:visibilityChanged',
            'state:themeUpdated',
            'state:highlightedDateChanged',
            'state:pinnedTooltipDataChanged',
            'state:activeHoverDataChanged',
            'state:interactiveRegressionRangeChanged',
            'state:trendConfigChanged', // Need to recalc+redraw trend lines immediately
            'state:goalChanged', // Need to redraw goal line/zone/marker immediately
            'state:annotationsChanged', // Redraw annotation markers immediately
        ];

        directVisualUpdateEvents.forEach(eventName => {
             StateManager.subscribeToSpecificEvent(eventName, (payload) => {
                 console.log(`[MasterUpdater] Received direct visual event: ${eventName}. Triggering VISUAL update.`);
                 // Trigger a non-interactive redraw immediately for these events
                 MasterUpdater.updateAllCharts({ isInteractive: false });
             });
        });

        // --- Scatter Plot Update (Keep separate) ---
        StateManager.subscribeToSpecificEvent('state:correlationDataUpdated', (payload) => {
            console.log(`[MasterUpdater] Received event: state:correlationDataUpdated. Triggering scatter plot update.`);
            try {
                const stateSnapshot = StateManager.getState();
                if (payload.data && scales.xScatter && scales.yScatter) {
                    DomainManager._setScatterPlotDomains(stateSnapshot); // Pass state
                    ScatterPlotUpdater.updateAxes();
                    ScatterPlotUpdater.updateChart(payload.data);
                } else { console.warn("[MasterUpdater] Scatter plot update skipped - missing data or scales."); }
            } catch (error) { console.error("[MasterUpdater] Error updating scatter plot:", error); }
        });

        // --- Initial Render Trigger ---
         StateManager.subscribeToSpecificEvent('state:initializationComplete', () => {
             console.log("[MasterUpdater] Received event: state:initializationComplete. Triggering initial render.");
             setTimeout(() => MasterUpdater.updateAllCharts({ isInteractive: false }), 50);
         });

        console.log("[MasterUpdater Init] Simplified subscriptions complete.");
    },
};