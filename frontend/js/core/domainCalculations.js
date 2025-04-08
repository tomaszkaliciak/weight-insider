
import { CONFIG } from "../config.js";
import { DataService } from "./dataService.js";

/**
 * Calculates the Y domain for the context chart.
 * @param {Array<object>} data - The processed data array.
 * @param {boolean} useSma - Whether to use SMA data.
 * @param {boolean} useBand - Whether to use the SMA band.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateContextYDomain(data, useSma, useBand) {
  // Determine which data series to use for extent based on visibility
  const dataForExtent = useSma
    ? data.filter((d) => d.sma != null)
    : data.filter((d) => d.value != null);

  // Find min/max considering the band if visible
  let yMin = d3.min(
    dataForExtent,
    (d) =>
      useBand
        ? d.lowerBound ?? d.sma ?? d.value // Fallback: lowerBand -> sma -> value
        : d.sma ?? d.value, // Fallback: sma -> value
  );
  let yMax = d3.max(
    dataForExtent,
    (d) =>
      useBand
        ? d.upperBound ?? d.sma ?? d.value // Fallback: upperBound -> sma -> value
        : d.sma ?? d.value, // Fallback: sma -> value
  );

  if (
    yMin == null ||
    yMax == null ||
    isNaN(yMin) ||
    isNaN(yMax) ||
    dataForExtent.length === 0
  ) {
    console.warn(
      "DomainCalculations: No valid data for context Y domain. Using fallback [60, 80].",
    );
    [yMin, yMax] = [60, 80]; // Fallback domain
  } else if (yMin === yMax) {
    // Handle case where all values are the same
    yMin -= 1;
    yMax += 1;
  } else {
    // Add padding
    const padding = Math.max(0.5, (yMax - yMin) * 0.05); // 5% padding or 0.5kg minimum
    yMin -= padding;
    yMax += padding;
  }

  return [yMin, yMax];
}

/**
 * Calculates the Y domain for the focus chart.
 * @param {Array<object>} data - The data array.
 * @param {object|null} regressionResult - The regression result.
 * @param {object} config - The configuration object.
 * @param {object} state - The application state.
 * @param {Date} bufferStartDate - The start date of the buffer.
 * @param {Date} bufferEndDate - The end date of the buffer.
 * @param {object} trendConfig - The trend config.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateFocusYDomain(
  data,
  regressionResult,
  config,
  state,
  bufferStartDate,
  bufferEndDate,
  trendConfig,
) {
  let yMin = Infinity,
    yMax = -Infinity;

  const updateExtent = (value) => {
    if (value != null && !isNaN(value)) {
      yMin = Math.min(yMin, value);
      yMax = Math.max(yMax, value);
    }
  };

  // Helper to check if a date is within the potentially buffered view
  const isWithinBufferedView = (date) => {
    return date >= bufferStartDate && date <= bufferEndDate;
  };

  // Iterate through the relevant data
  data.forEach((d) => {
    if (!d.date || !isWithinBufferedView(d.date)) return; // Skip if outside buffered view (if dynamic)

    // Weight (Y1) Extent Calculation
    if (state.seriesVisibility.smaLine && d.sma != null) {
      updateExtent(d.sma);
    }
    if (
      state.seriesVisibility.smaBand &&
      d.lowerBound != null &&
      d.upperBound != null
    ) {
      updateExtent(d.lowerBound);
      updateExtent(d.upperBound);
    }
    if (state.seriesVisibility.raw && d.value != null && !d.isOutlier) {
      updateExtent(d.value); // Optionally include non-outlier raw data
    }
  });

  // Include Regression and CI if visible
  if (
    state.seriesVisibility.regression &&
    regressionResult?.pointsWithCI?.length > 0
  ) {
    regressionResult.pointsWithCI.forEach((d) => {
      if (!d.date || !isWithinBufferedView(d.date)) return;
      updateExtent(d.regressionValue);
      if (
        state.seriesVisibility.regressionCI &&
        d.lowerCI != null &&
        d.upperCI != null
      ) {
        updateExtent(d.lowerCI);
        updateExtent(d.upperCI);
      }
    });
  }

  // Include Manual Trendlines if visible
  if (trendConfig.isValid) {
    // Find relevant dates to check trend values (within buffered view)
    let datesToCheck = data
      .map((d) => d.date)
      .filter(isWithinBufferedView);
    // Fallbacks if no data points are strictly within the view
    if (datesToCheck.length === 0 && state.processedData.length > 0) {
      datesToCheck = [
        state.processedData[0].date,
        state.processedData[state.processedData.length - 1].date,
      ].filter(isWithinBufferedView);
    }
    if (datesToCheck.length === 0 && state.processedData.length > 0) {
      if (state.currentXDomain[0] instanceof Date)
        datesToCheck.push(state.currentXDomain[0]);
      if (state.currentXDomain[1] instanceof Date)
        datesToCheck.push(state.currentXDomain[1]);
    }
    // Ensure we check at least the start/end of the buffered view if no other points exist
    if (datesToCheck.length === 0 && bufferStartDate && bufferEndDate) {
      datesToCheck.push(bufferStartDate, bufferEndDate);
    }

    datesToCheck.forEach((date) => {
      if (state.seriesVisibility.trend1) {
        updateExtent(
          DataService.calculateTrendWeight(
            trendConfig.startDate,
            trendConfig.initialWeight,
            trendConfig.weeklyIncrease1,
            date,
          ),
        );
      }
      if (state.seriesVisibility.trend2) {
        updateExtent(
          DataService.calculateTrendWeight(
            trendConfig.startDate,
            trendConfig.initialWeight,
            trendConfig.weeklyIncrease2,
            date,
          ),
        );
      }
    });
  }

  // Include Goal Line if visible
  if (state.seriesVisibility.goal && state.goal.weight != null) {
    updateExtent(state.goal.weight);
    // Also consider the starting point of the goal line (last SMA) if it's in view
    const lastSmaPoint = [...state.processedData]
      .reverse()
      .find((d) => d.sma != null);
    if (lastSmaPoint?.date && isWithinBufferedView(lastSmaPoint.date)) {
      updateExtent(lastSmaPoint.sma);
    }
    // And the end point if a goal date is set and in view
    if (state.goal.date && isWithinBufferedView(state.goal.date)) {
      updateExtent(state.goal.weight);
    }
  }

  // --- Finalize Y1 Domain (Weight) ---
  if (yMin === Infinity || yMax === -Infinity) {
    // Fallback: Use context domain or absolute values
    const contextDomain = state.contextYDomain;
    if (contextDomain && !isNaN(contextDomain[0]) && !isNaN(contextDomain[1])) {
      [yMin, yMax] = contextDomain;
    } else {
      [yMin, yMax] = [60, 80]; // Absolute fallback
      console.warn(
        "DomainManager: Using absolute fallback Y domain [60, 80].",
      );
    }
  } else if (yMin === yMax) {
    // Handle single value case
    yMin -= config.yAxisMinPaddingKg * 2;
    yMax += config.yAxisMinPaddingKg * 2;
  } else {
    // Add padding
    const padding = Math.max(
      config.yAxisMinPaddingKg,
      (yMax - yMin) * config.yAxisPaddingFactor,
    );
    yMin -= padding;
    yMax += padding;
  }

  return [yMin, yMax];
}

/**
 * Calculates the Y domain for the balance chart.
 * @param {Array<object>} data - The data array.
 * @returns {number} The Y domain max.
 */
export function calculateBalanceYDomain(data) {
  const maxAbsBalance = d3.max(data, (d) => Math.abs(d.netBalance ?? 0)) ?? 0; 
  // Ensure a minimum visible range even if balance is always zero or near zero
  return Math.max(500, maxAbsBalance * 1.1);
}

/**
 * Calculates the Y domain for the rate chart.
 * @param {Array<object>} data - The data array.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateRateYDomain(data) {
  const rateExtent = d3.extent(data, (d) => d.smoothedWeeklyRate); 
  let [yRateMin, yRateMax] = rateExtent;

  if (
    yRateMin == null ||
    yRateMax == null ||
    isNaN(yRateMin) ||
    isNaN(yRateMax)
  ) {
    [yRateMin, yRateMax] = [-0.5, 0.5]; // Fallback
  } else if (yRateMin === yRateMax) {
    yRateMin -= 0.1;
    yRateMax += 0.1;
  }
  // Add padding relative to the range, minimum padding 0.05 kg/wk
  const yRatePadding = Math.max(0.05, Math.abs(yRateMax - yRateMin) * 0.1);
  return [yRateMin - yRatePadding, yRateMax + yRatePadding];
}

/**
 * Calculates the Y domain for the TDEE difference chart.
 * @param {Array<object>} data - The data array.
 * @returns {Array<number>} The Y domain [yMin, yMax].
 */
export function calculateTdeeDiffYDomain(data) {
  const diffExtent = d3.extent(data, (d) => d.avgTdeeDifference); 
  let [yDiffMin, yDiffMax] = diffExtent;

  if (
    yDiffMin == null ||
    yDiffMax == null ||
    isNaN(yDiffMin) ||
    isNaN(yDiffMax)
  ) {
    [yDiffMin, yDiffMax] = [-300, 300]; // Fallback
  } else if (yDiffMin === yDiffMax) {
    yDiffMin -= 50;
    yDiffMax += 50;
  }
  // Add padding relative to the range, minimum padding 50 kcal
  const yDiffPadding = Math.max(50, Math.abs(yDiffMax - yDiffMin) * 0.1);
  return [yDiffMin - yDiffPadding, yDiffMax + yDiffPadding];
}

/**
 * Calculates the X and Y domains for the scatter plot.
 * @param {Array<object>} data - The scatter data array.
 * @returns {object} The X and Y domains {xDomain, yDomain}.
 */
export function calculateScatterPlotDomains(data) {
  if (!Array.isArray(data) || data.length === 0) {
    // Set default domains if no data
    return { xDomain: [-500, 500], yDomain: [-0.5, 0.5] };
  }

  const [xMinRaw, xMaxRaw] = d3.extent(data, (d) => d.avgNetCal); 
  const [yMinRaw, yMaxRaw] = d3.extent(data, (d) => d.weeklyRate); 

  // Handle potential null/NaN from extent if data is sparse/invalid
  const xMin = xMinRaw == null || isNaN(xMinRaw) ? 0 : xMinRaw;
  const xMax = xMaxRaw == null || isNaN(xMaxRaw) ? 0 : xMaxRaw;
  const yMin = yMinRaw == null || isNaN(yMinRaw) ? 0 : yMinRaw;
  const yMax = yMaxRaw == null || isNaN(yMaxRaw) ? 0 : yMaxRaw;

  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  // Add padding, ensuring a minimum range
  const xPadding = xRange === 0 ? 500 : Math.max(100, xRange * 0.1);
  const yPadding = yRange === 0 ? 0.5 : Math.max(0.1, yRange * 0.1);

  return {
    xDomain: [xMin - xPadding, xMax + xPadding],
    yDomain: [yMin - yPadding, yMax + yPadding],
  };  
}
