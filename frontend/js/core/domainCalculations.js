// js/core/domainCalculations.js
// Functions for calculating chart domains based on data and state.

// CONFIG is needed for padding factors, thresholds, etc.
import { CONFIG } from "../config.js";
// DataService might be needed for trend weight calculation if kept there
import { DataService } from "./dataService.js";
// Selectors are used to extract specific parts from the state snapshot
import * as Selectors from "./selectors.js";

/**
 * Calculates the Y domain for the context chart based on state visibility.
 * @param {Array<object>} processedData - The full processed data array.
 * @param {boolean} isSmaVisible - Whether SMA line is visible.
 * @param {boolean} isBandVisible - Whether SMA band is visible.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateContextYDomain(processedData, isSmaVisible, isBandVisible) {
    // Determine which data series to use for extent based on visibility
    const dataForExtent = isSmaVisible
        ? processedData.filter(d => d.sma != null)
        : processedData.filter(d => d.value != null);

    let yMin = Infinity, yMax = -Infinity;

    dataForExtent.forEach(d => {
        const baseValue = isSmaVisible ? d.sma : d.value;
        if (baseValue != null && isFinite(baseValue)) {
            let lower = baseValue;
            let upper = baseValue;
            if (isBandVisible) {
                // Use band bounds if available and valid, otherwise fallback to baseValue
                lower = (d.lowerBound != null && isFinite(d.lowerBound)) ? d.lowerBound : baseValue;
                upper = (d.upperBound != null && isFinite(d.upperBound)) ? d.upperBound : baseValue;
            }
            yMin = Math.min(yMin, lower);
            yMax = Math.max(yMax, upper);
        }
    });


    if (yMin === Infinity || yMax === -Infinity || dataForExtent.length === 0) {
        console.warn("DomainCalculations: No valid data for context Y domain. Using fallback [60, 80].");
        [yMin, yMax] = [60, 80]; // Fallback domain
    } else if (yMin === yMax) {
        yMin -= 1; yMax += 1; // Handle single value case
    } else {
        const padding = Math.max(0.5, (yMax - yMin) * 0.05); // 5% padding or 0.5kg minimum
        yMin -= padding; yMax += padding;
    }

    return [yMin, yMax];
}

/**
 * Calculates the Y domain for the focus chart based on visible series and other state.
 * @param {Array<object>} filteredData - Data already filtered by the current X domain/view.
 * @param {object|null} regressionResult - The pre-calculated regression result from state { points, pointsWithCI }.
 * @param {object} config - The application configuration object (CONFIG).
 * @param {object} stateSnapshot - A snapshot of the current application state.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateFocusYDomain(
    filteredData,
    regressionResult,
    config,
    stateSnapshot,
    // bufferStartDate, bufferEndDate removed - filtering assumed done upstream
    // trendConfig removed - read directly from stateSnapshot
) {
    let yMin = Infinity, yMax = -Infinity;

    // Use selectors to get necessary info from stateSnapshot
    const visibility = Selectors.selectSeriesVisibility(stateSnapshot);
    const goal = Selectors.selectGoal(stateSnapshot);
    const trendConfig = Selectors.selectTrendConfig(stateSnapshot);
    // const currentXDomain = scales.x?.domain(); // Assuming scales object is available if needed, but likely not needed if data is pre-filtered

    const updateExtent = (value) => {
        if (value != null && isFinite(value)) {
            yMin = Math.min(yMin, value);
            yMax = Math.max(yMax, value);
        }
    };

    // --- Iterate through FILTERED data ---
    // This data should already correspond to the current X-axis view.
    filteredData.forEach((d) => {
        // Weight (Y1) Extent Calculation based on visibility flags
        if (visibility.smaLine && d.sma != null) updateExtent(d.sma);
        if (visibility.smaBand && d.lowerBound != null) updateExtent(d.lowerBound);
        if (visibility.smaBand && d.upperBound != null) updateExtent(d.upperBound);
        if (visibility.raw && d.value != null && !d.isOutlier) updateExtent(d.value); // Include non-outlier raw
        if (visibility.emaLine && d.ema != null) updateExtent(d.ema); // Include EMA

        // Regression values were calculated based on effective range and stored in state.
        // MasterUpdater passes the relevant 'regressionResult' object.
        // We only need to consider points *within the current filteredData view*.
        // Note: Regression line might extend beyond filteredData due to extrapolation logic.
        // We need to handle this. Simplest is to iterate regression points separately.
    });

     // --- Include Regression Line & CI Extent (using result from state) ---
     if (regressionResult) {
        if (visibility.regression && Array.isArray(regressionResult.points)) {
            // Check points that are relevant to the current *filteredData* dates
            // This assumes regressionResult.points contains {date, regressionValue}
            const filteredDatesSet = new Set(filteredData.map(d => d.date?.getTime()));
            regressionResult.points.forEach(p => {
                // Only consider points whose date is within the currently filtered view
                if (p.date instanceof Date && filteredDatesSet.has(p.date.getTime())) {
                    updateExtent(p.regressionValue);
                }
            });
             // Also explicitly check the first/last points of the regression calculation
             // if they fall within the filtered view, as the line might extend.
             // This logic might need refinement depending on how extrapolation is handled.
             if (regressionResult.points.length > 0) {
                 const firstRegPoint = regressionResult.points[0];
                 const lastRegPoint = regressionResult.points[regressionResult.points.length - 1];
                 if (firstRegPoint.date && filteredDatesSet.has(firstRegPoint.date.getTime())) {
                     updateExtent(firstRegPoint.regressionValue);
                 }
                  if (lastRegPoint.date && filteredDatesSet.has(lastRegPoint.date.getTime())) {
                     updateExtent(lastRegPoint.regressionValue);
                 }
             }
        }
    }

    // --- Include Manual Trendlines if visible and valid ---
    if (trendConfig.isValid) {
        // Iterate through filtered data points to check trend values at those specific dates
        filteredData.forEach(d => {
            if (visibility.trend1) {
                updateExtent(DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, trendConfig.weeklyIncrease1, d.date));
            }
            if (visibility.trend2) {
                updateExtent(DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, trendConfig.weeklyIncrease2, d.date));
            }
        });
        // Also check the start/end points of the *filtered view* to catch trend line intersections
        if (filteredData.length > 0) {
             const viewStartDate = filteredData[0].date;
             const viewEndDate = filteredData[filteredData.length - 1].date;
              if (visibility.trend1) {
                  updateExtent(DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, trendConfig.weeklyIncrease1, viewStartDate));
                  updateExtent(DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, trendConfig.weeklyIncrease1, viewEndDate));
              }
               if (visibility.trend2) {
                  updateExtent(DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, trendConfig.weeklyIncrease2, viewStartDate));
                  updateExtent(DataService.calculateTrendWeight(trendConfig.startDate, trendConfig.initialWeight, trendConfig.weeklyIncrease2, viewEndDate));
              }
        }
    }

    // --- Include Goal Line if visible ---
    if (visibility.goal && goal.weight != null) {
        updateExtent(goal.weight); // Always include the goal weight level itself

        // Include start/end points of the goal line segment *if* they fall within the filtered view
        const processedData = Selectors.selectProcessedData(stateSnapshot); // Need full data for last SMA
        const lastSmaPoint = [...processedData].reverse().find(d => d.sma != null);
        const filteredDatesSet = new Set(filteredData.map(d => d.date?.getTime()));

        if (lastSmaPoint?.date && filteredDatesSet.has(lastSmaPoint.date.getTime())) {
            updateExtent(lastSmaPoint.sma);
        }
        if (goal.date instanceof Date && filteredDatesSet.has(goal.date.getTime())) {
             updateExtent(goal.weight); // Already included above, but confirms endpoint check
        }
    }

    // --- Finalize Y Domain ---
    if (yMin === Infinity || yMax === -Infinity) {
        // If no valid data points found in the filtered view, return invalid
        console.warn("DomainCalculations: No valid data for focus Y domain in current filtered view. Returning invalid domain.");
        return [NaN, NaN];
    } else if (yMin === yMax) {
        yMin -= config.yAxisMinPaddingKg * 2; // Use config
        yMax += config.yAxisMinPaddingKg * 2;
    } else {
        const padding = Math.max(config.yAxisMinPaddingKg, (yMax - yMin) * config.yAxisPaddingFactor); // Use config
        yMin -= padding;
        yMax += padding;
    }

    return [yMin, yMax];
}


/**
 * Calculates the Y domain for the balance chart.
 * @param {Array<object>} filteredData - Data filtered to the current view.
 * @returns {Array<number>} The Y domain [yMin, yMax] (note: swapped for scale).
 */
export function calculateBalanceYDomain(filteredData) {
    let yMin = 0, yMax = 0; // Start at 0
    filteredData.forEach(d => {
        if (d.netBalance != null && isFinite(d.netBalance)) {
             yMin = Math.min(yMin, d.netBalance);
             yMax = Math.max(yMax, d.netBalance);
        }
    });

    // Ensure symmetrical padding around zero, or a minimum range
    const range = Math.max(Math.abs(yMin), Math.abs(yMax));
    const paddedRange = Math.max(500, range * 1.15); // Ensure minimum +/- 500 range, 15% padding

    return [-paddedRange, paddedRange]; // Return [min, max]
}

/**
 * Calculates the Y domain for the rate chart.
 * @param {Array<object>} filteredData - Data filtered to the current view.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateRateYDomain(filteredData) {
    let yMin = Infinity, yMax = -Infinity;
    filteredData.forEach(d => {
        // Consider both smoothed rate and MA rate for domain calculation if MA is visible
        // This assumes visibility state would be passed or checked if needed,
        // but often easier to just include both potential values if they exist.
         if (d.smoothedWeeklyRate != null && isFinite(d.smoothedWeeklyRate)) {
             yMin = Math.min(yMin, d.smoothedWeeklyRate);
             yMax = Math.max(yMax, d.smoothedWeeklyRate);
         }
         if (d.rateMovingAverage != null && isFinite(d.rateMovingAverage)) {
             yMin = Math.min(yMin, d.rateMovingAverage);
             yMax = Math.max(yMax, d.rateMovingAverage);
         }
    });

     // Add optimal gain zone boundaries to the extent calculation
     if (isFinite(CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK)) {
         yMin = Math.min(yMin, CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK);
         yMax = Math.max(yMax, CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK);
     }
      if (isFinite(CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK)) {
         yMin = Math.min(yMin, CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK);
         yMax = Math.max(yMax, CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK);
     }

    if (yMin === Infinity || yMax === -Infinity) {
        [yMin, yMax] = [-0.5, 0.5]; // Fallback
    } else if (yMin === yMax) {
        yMin -= 0.1; yMax += 0.1;
    }
    const yRatePadding = Math.max(0.05, Math.abs(yMax - yMin) * 0.1);
    return [yMin - yRatePadding, yMax + yRatePadding];
}

/**
 * Calculates the Y domain for the TDEE difference chart.
 * @param {Array<object>} filteredData - Data filtered to the current view.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateTdeeDiffYDomain(filteredData) {
    let yMin = Infinity, yMax = -Infinity;
    filteredData.forEach(d => {
         if (d.avgTdeeDifference != null && isFinite(d.avgTdeeDifference)) {
             yMin = Math.min(yMin, d.avgTdeeDifference);
             yMax = Math.max(yMax, d.avgTdeeDifference);
         }
    });

    if (yMin === Infinity || yMax === -Infinity) {
        [yMin, yMax] = [-300, 300]; // Fallback
    } else if (yMin === yMax) {
        yMin -= 50; yMax += 50;
    }
    const yDiffPadding = Math.max(50, Math.abs(yMax - yMin) * 0.1);
    return [yMin - yDiffPadding, yMax + yDiffPadding];
}

/**
 * Calculates the X and Y domains for the scatter plot.
 * @param {Array<object>} scatterData - Array of weekly stats {avgNetCal, weeklyRate}.
 * @returns {object} The X and Y domains {xDomain, yDomain}.
 */
export function calculateScatterPlotDomains(scatterData) {
    if (!Array.isArray(scatterData) || scatterData.length === 0) {
        return { xDomain: [-500, 500], yDomain: [-0.5, 0.5] }; // Default
    }
    const [xMinRaw, xMaxRaw] = d3.extent(scatterData, d => d.avgNetCal);
    const [yMinRaw, yMaxRaw] = d3.extent(scatterData, d => d.weeklyRate);

    const xMin = (xMinRaw == null || isNaN(xMinRaw)) ? 0 : xMinRaw;
    const xMax = (xMaxRaw == null || isNaN(xMaxRaw)) ? 0 : xMaxRaw;
    const yMin = (yMinRaw == null || isNaN(yMinRaw)) ? 0 : yMinRaw;
    const yMax = (yMaxRaw == null || isNaN(yMaxRaw)) ? 0 : yMaxRaw;

    const xRange = xMax - xMin; const yRange = yMax - yMin;
    const xPadding = xRange === 0 ? 500 : Math.max(100, xRange * 0.1);
    const yPadding = yRange === 0 ? 0.5 : Math.max(0.1, yRange * 0.1);

    return {
        xDomain: [xMin - xPadding, xMax + xPadding],
        yDomain: [yMin - yPadding, yMax + yPadding]
    };
}