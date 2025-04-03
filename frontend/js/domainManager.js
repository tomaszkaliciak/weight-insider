// domainManager.js
// Manages the calculation and setting of domains for D3 scales.

// NO D3 import needed here - uses global d3 from script tag
import { scales } from "./chartSetup.js"; // Import the scales object
import { state } from "./state.js";
import { CONFIG } from "./config.js";
import { DataService } from "./dataService.js"; // Needed for trend/goal/weekly stats calculations affecting domain
import { EventHandlers } from "./eventHandlers.js"; // Needed for analysis/regression range

export const DomainManager = {
  /**
   * Sets the initial X domains for focus and context charts, and secondary charts.
   * @param {Array<object>} processedData - The fully processed data array.
   * @returns {Array<Date>} The initial domain for the focus chart [startDate, endDate].
   */
  setXDomains(processedData) {
    const fullDataExtent = d3.extent(processedData, (d) => d.date); // Use global d3

    let initialXDomain = [];
    if (!fullDataExtent[0] || !fullDataExtent[1]) {
      console.warn(
        "DomainManager: No valid date range found in data. Using fallback.",
      );
      const today = new Date();
      const past = d3.timeMonth.offset(today, -CONFIG.initialViewMonths); // Use global d3
      fullDataExtent[0] = past;
      fullDataExtent[1] = today;
      initialXDomain = [past, today];
    } else {
      // Calculate default initial view (e.g., last N months)
      const initialEndDate = fullDataExtent[1];
      const initialStartDateDefault = d3.timeMonth.offset(
        // Use global d3
        initialEndDate,
        -CONFIG.initialViewMonths,
      );
      // Ensure initial start date doesn't go before the actual data start date
      const initialStartDate =
        initialStartDateDefault < fullDataExtent[0]
          ? fullDataExtent[0]
          : initialStartDateDefault;
      initialXDomain = [initialStartDate, initialEndDate];
    }

    // Set domains on the imported scales
    scales.xContext?.domain(fullDataExtent);
    scales.x?.domain(initialXDomain);
    scales.xBalance?.domain(initialXDomain);
    scales.xRate?.domain(initialXDomain);
    scales.xTdeeDiff?.domain(initialXDomain);

    return initialXDomain; // Return the calculated focus domain
  },

  /**
   * Sets the Y domain for the context chart based on visible series.
   * @param {Array<object>} processedData - The fully processed data array.
   */
  setContextYDomain(processedData) {
    if (!scales.yContext) return;

    // Determine which data series to use for extent based on visibility
    const dataForExtent = state.seriesVisibility.smaLine // Use smaLine visibility
      ? processedData.filter((d) => d.sma != null)
      : processedData.filter((d) => d.value != null);

    // Find min/max considering the band if visible
    let yMin = d3.min(
      dataForExtent,
      (
        d, // Use global d3
      ) =>
        state.seriesVisibility.smaBand // Use smaBand visibility
          ? (d.lowerBound ?? d.sma ?? d.value) // Fallback: lowerBand -> sma -> value
          : (d.sma ?? d.value), // Fallback: sma -> value
    );
    let yMax = d3.max(
      dataForExtent,
      (
        d, // Use global d3
      ) =>
        state.seriesVisibility.smaBand // Use smaBand visibility
          ? (d.upperBound ?? d.sma ?? d.value) // Fallback: upperBound -> sma -> value
          : (d.sma ?? d.value), // Fallback: sma -> value
    );

    if (
      yMin == null ||
      yMax == null ||
      isNaN(yMin) ||
      isNaN(yMax) ||
      dataForExtent.length === 0
    ) {
      console.warn(
        "DomainManager: No valid data for context Y domain. Using fallback [60, 80].",
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

    scales.yContext.domain([yMin, yMax]).nice(); // Apply nice() for better ticks
  },

  /**
   * Sets the Y domains for the focus chart (Y1 for weight, Y2 potentially later).
   * Considers visible series, regression, goals, and dynamic Y-axis settings.
   * @param {Array<object>} dataForCalculation - Data filtered by current X view OR all data, depending on dynamicYAxis setting.
   * @param {object|null} regressionResult - Result from DataService.calculateLinearRegression.
   */
  setFocusYDomains(dataForCalculation, regressionResult) {
    if (!scales.y || !scales.x) {
      console.error("DomainManager: Focus scales (x, y) not initialized.");
      return;
    }

    const yRange = scales.y.range(); // Get the pixel range [height, 0]
    const height =
      Array.isArray(yRange) && yRange.length === 2
        ? Math.abs(yRange[0] - yRange[1])
        : 200; // Estimate height

    let yMin = Infinity,
      yMax = -Infinity;
    // y2Min, y2Max removed

    const updateExtent = (value) => {
      if (value != null && !isNaN(value)) {
        yMin = Math.min(yMin, value);
        yMax = Math.max(yMax, value);
      }
    };
    // updateExtentY2 removed

    // Define buffer dates only if dynamic Y is enabled
    const currentXDomain = scales.x.domain();
    const bufferStartDate =
      currentXDomain[0] instanceof Date
        ? d3.timeDay.offset(currentXDomain[0], -CONFIG.domainBufferDays) // Use global d3
        : null;
    const bufferEndDate =
      currentXDomain[1] instanceof Date
        ? d3.timeDay.offset(currentXDomain[1], CONFIG.domainBufferDays) // Use global d3
        : null;

    // Helper to check if a date is within the potentially buffered view
    const isWithinBufferedView = (date) => {
      return date >= bufferStartDate && date <= bufferEndDate;
    };

    const calculationDataArray = Array.isArray(dataForCalculation)
      ? dataForCalculation
      : [];

    // Iterate through the relevant data
    calculationDataArray.forEach((d) => {
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

      // BF% (Y2) Extent Calculation Removed
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
    const trendConfig = DataService.getTrendlineConfigFromUI();
    if (trendConfig.isValid) {
      // Find relevant dates to check trend values (within buffered view)
      let datesToCheck = calculationDataArray
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
        if (currentXDomain[0] instanceof Date)
          datesToCheck.push(currentXDomain[0]);
        if (currentXDomain[1] instanceof Date)
          datesToCheck.push(currentXDomain[1]);
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
      const contextDomain = scales.yContext?.domain();
      if (
        contextDomain &&
        !isNaN(contextDomain[0]) &&
        !isNaN(contextDomain[1])
      ) {
        [yMin, yMax] = contextDomain;
      } else {
        [yMin, yMax] = [60, 80]; // Absolute fallback
        console.warn(
          "DomainManager: Using absolute fallback Y domain [60, 80].",
        );
      }
    } else if (yMin === yMax) {
      // Handle single value case
      yMin -= CONFIG.yAxisMinPaddingKg * 2;
      yMax += CONFIG.yAxisMinPaddingKg * 2;
    } else {
      // Add padding
      const padding = Math.max(
        CONFIG.yAxisMinPaddingKg,
        (yMax - yMin) * CONFIG.yAxisPaddingFactor,
      );
      yMin -= padding;
      yMax += padding;
    }

    // Apply the calculated domain, ensuring validity
    if (!isNaN(yMin) && !isNaN(yMax)) {
      scales.y.domain([yMin, yMax]).nice(Math.max(Math.floor(height / 40), 5)); // Use nice() with tick hint
    } else {
      console.error("DomainManager: Calculated invalid Y1 domain", [
        yMin,
        yMax,
      ]);
      scales.y.domain([60, 80]).nice(); // Fallback
    }

    // --- Finalize Y2 Domain (Body Fat %) - Removed ---
    // Set a default fixed range for y2 if it exists, even if unused
    scales.y2?.domain([0, 100]);
  },

  /**
   * Sets the Y domains for the secondary charts (Balance, Rate, TDEE Diff).
   * @param {Array<object>} visibleData - Data filtered by the current focus X domain.
   */
  setSecondaryYDomains(visibleData) {
    // Balance Chart
    if (scales.yBalance) {
      const maxAbsBalance =
        d3.max(visibleData, (d) => Math.abs(d.netBalance ?? 0)) ?? 0; // Use global d3
      // Ensure a minimum visible range even if balance is always zero or near zero
      const yBalanceDomainMax = Math.max(500, maxAbsBalance * 1.1);
      scales.yBalance.domain([-yBalanceDomainMax, yBalanceDomainMax]).nice();
    }

    // Rate of Change Chart
    if (scales.yRate) {
      const rateExtent = d3.extent(visibleData, (d) => d.smoothedWeeklyRate); // Use global d3
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
      scales.yRate
        .domain([yRateMin - yRatePadding, yRateMax + yRatePadding])
        .nice();
    }

    // TDEE Difference Chart
    if (scales.yTdeeDiff) {
      const diffExtent = d3.extent(visibleData, (d) => d.avgTdeeDifference); // Use global d3
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
      scales.yTdeeDiff
        .domain([yDiffMin - yDiffPadding, yDiffMax + yDiffPadding])
        .nice();
    }
  },

  /**
   * Sets the X and Y domains for the correlation scatter plot.
   * @param {Array<object>} scatterData - Array of weekly summary stats {avgNetCal, weeklyRate}.
   */
  setScatterPlotDomains(scatterData) {
    if (!scales.xScatter || !scales.yScatter) return;

    if (!Array.isArray(scatterData) || scatterData.length === 0) {
      // Set default domains if no data
      scales.xScatter.domain([-500, 500]).nice();
      scales.yScatter.domain([-0.5, 0.5]).nice();
      return;
    }

    const [xMinRaw, xMaxRaw] = d3.extent(scatterData, (d) => d.avgNetCal); // Use global d3
    const [yMinRaw, yMaxRaw] = d3.extent(scatterData, (d) => d.weeklyRate); // Use global d3

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

    scales.xScatter.domain([xMin - xPadding, xMax + xPadding]).nice();
    scales.yScatter.domain([yMin - yPadding, yMax + yPadding]).nice();
  },

  /**
   * Initializes all domains based on the full processed dataset.
   * Should be called once after data is loaded and processed.
   * @param {Array<object>} processedData - The fully processed data array.
   */
  initializeDomains(processedData) {
    console.log("DomainManager: Initializing domains...");
    this.setContextYDomain(processedData);
    const initialXDomain = this.setXDomains(processedData);

    // Calculate initial domains based on the initial view
    const initialVisibleData = processedData.filter(
      (d) =>
        d.date instanceof Date &&
        d.date >= initialXDomain[0] &&
        d.date <= initialXDomain[1],
    );
    // Calculate regression for the initial view (considering regression start date if set)
    const initialRegression = DataService.calculateLinearRegression(
      initialVisibleData.filter((d) => !d.isOutlier && d.value != null),
      state.regressionStartDate, // Use initial regression start date from state
    );

    this.setFocusYDomains(initialVisibleData, initialRegression);
    this.setSecondaryYDomains(initialVisibleData);

    // Calculate scatter plot data based on the *full* dataset initially
    // Call the method from DataService now
    const allWeeklyStats = DataService.calculateWeeklyStats(
      processedData,
      null,
      null,
    );

    // Update state directly here
    state.correlationScatterData = allWeeklyStats.filter(
      (w) => w.avgNetCal != null && w.weeklyRate != null,
    );
    this.setScatterPlotDomains(state.correlationScatterData);

    console.log("DomainManager: Domain initialization complete.");
  },

  /**
   * Updates domains based on user interaction (zoom/brush).
   * Recalculates focus Y and secondary Y domains based on the current X view.
   */
  updateDomainsOnInteraction() {
    const currentXDomain = scales.x?.domain();
    if (
      !currentXDomain ||
      currentXDomain.length !== 2 ||
      !(currentXDomain[0] instanceof Date) ||
      !(currentXDomain[1] instanceof Date)
    ) {
      console.warn(
        "DomainManager: Invalid X domain during interaction update.",
      );
      return;
    }

    // Update filtered data in state
    state.filteredData = state.processedData.filter(
      (d) =>
        d.date instanceof Date &&
        d.date >= currentXDomain[0] &&
        d.date <= currentXDomain[1],
    );

    // Recalculate regression for the current view/range
    const regressionRange = EventHandlers.getEffectiveRegressionRange(); // Get current range
    let regressionResult = null;
    if (regressionRange.start && regressionRange.end) {
      const regressionData = state.processedData.filter(
        (d) =>
          d.date instanceof Date &&
          d.date >= regressionRange.start &&
          d.date <= regressionRange.end &&
          d.value != null &&
          !d.isOutlier,
      );
      regressionResult = DataService.calculateLinearRegression(
        regressionData,
        regressionRange.start,
      );
    } else {
      regressionResult = {
        slope: null,
        intercept: null,
        points: [],
        pointsWithCI: [],
      }; // Default empty result
    }
 
    this.setFocusYDomains(state.filteredData, regressionResult);

    // Update secondary chart X domains to match focus
    scales.xBalance?.domain(currentXDomain);
    scales.xRate?.domain(currentXDomain);
    scales.xTdeeDiff?.domain(currentXDomain);

    // Update secondary chart Y domains based on *visible* data
    this.setSecondaryYDomains(state.filteredData);

    // Note: Scatter plot domain typically doesn't change on zoom/brush of main chart
    // It's usually based on the analysis range set elsewhere.
  },
};
