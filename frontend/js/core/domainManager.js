import { scales } from "../ui/chartSetup.js";
import { state } from "../state.js";
import { CONFIG } from "../config.js";
import { DataService } from "./dataService.js";
import { EventHandlers } from "../interactions/eventHandlers.js";
import {
  calculateContextYDomain,
  calculateFocusYDomain,
  calculateBalanceYDomain,
  calculateRateYDomain,
  calculateTdeeDiffYDomain,
  calculateScatterPlotDomains,
} from "./domainCalculations.js";
import { Utils } from "./utils.js";

export const DomainManager = {
  /**
   * Sets the initial X domains for focus and context charts, and secondary charts.
   * @param {Array<object>} processedData - The fully processed data array.
   * @returns {Array<Date>} The initial domain for the focus chart [startDate, endDate].
   */
  setXDomains(processedData) {
    const fullDataExtent = d3.extent(processedData, (d) => d.date);

    let initialXDomain = [];
    if (!fullDataExtent[0] || !fullDataExtent[1]) {
      console.warn(
        "DomainManager: No valid date range found in data. Using fallback.",
      );
      const today = new Date();
      const past = d3.timeMonth.offset(today, -CONFIG.initialViewMonths);
      fullDataExtent[0] = past;
      fullDataExtent[1] = today;
      initialXDomain = [past, today];
    } else {
      // Calculate default initial view (e.g., last N months)
      const initialEndDate = fullDataExtent[1];
      const initialStartDateDefault = d3.timeMonth.offset(
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

    const [yMin, yMax] = calculateContextYDomain(
      processedData,
      state.seriesVisibility.smaLine,
      state.seriesVisibility.smaBand,
    );
    state.contextYDomain = [yMin, yMax];
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

    // Define buffer dates only if dynamic Y is enabled
    const currentXDomain = scales.x.domain();
    state.currentXDomain = currentXDomain;
    const bufferStartDate =
      currentXDomain[0] instanceof Date
        ? d3.timeDay.offset(currentXDomain[0], -CONFIG.domainBufferDays)
        : null;
    const bufferEndDate =
      currentXDomain[1] instanceof Date
        ? d3.timeDay.offset(currentXDomain[1], CONFIG.domainBufferDays)
        : null;

    const trendConfig = DataService.getTrendlineConfigFromUI();

    const [yMin, yMax] = calculateFocusYDomain(
      dataForCalculation,
      regressionResult,
      CONFIG,
      state,
      bufferStartDate,
      bufferEndDate,
      trendConfig,
    );

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
      const yBalanceDomainMax = calculateBalanceYDomain(visibleData);
      scales.yBalance.domain([-yBalanceDomainMax, yBalanceDomainMax]).nice();
    }

    // Rate of Change Chart
    if (scales.yRate) {
      const [yRateMin, yRateMax] = calculateRateYDomain(visibleData);
      scales.yRate.domain([yRateMin, yRateMax]).nice();
    }

    // TDEE Difference Chart
    if (scales.yTdeeDiff) {
      const [yDiffMin, yDiffMax] = calculateTdeeDiffYDomain(visibleData);
      scales.yTdeeDiff.domain([yDiffMin, yDiffMax]).nice();
    }
  },

  /**
   * Sets the X and Y domains for the correlation scatter plot.
   * @param {Array<object>} scatterData - Array of weekly summary stats {avgNetCal, weeklyRate}.
   */
  setScatterPlotDomains(scatterData) {
    if (!scales.xScatter || !scales.yScatter) return;

    const { xDomain, yDomain } = calculateScatterPlotDomains(scatterData);

    scales.xScatter.domain(xDomain).nice();
    scales.yScatter.domain(yDomain).nice();
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

  setEmptyDomains() {
    DomainManager.setXDomains([]);
    DomainManager.setContextYDomain([]);
    DomainManager.setFocusYDomains([], null);
    DomainManager.setSecondaryYDomains([]);
    DomainManager.setScatterPlotDomains([]);
  },
};
