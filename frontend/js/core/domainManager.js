// js/core/domainManager.js
// Manages the calculation and setting of domains for chart scales.

import * as d3 from 'd3';
import { scales } from "../ui/chartSetup.js";
import { StateManager } from "./stateManager.js";
import { CONFIG } from "../config.js";
import {
  calculateContextYDomain,
  calculateFocusYDomain,
  calculateBalanceYDomain,
  calculateRateYDomain,
  calculateTdeeDiffYDomain,
  calculateScatterPlotDomains,
} from "./domainCalculations.js";
import { Utils } from "./utils.js";
import * as Selectors from "./selectors.js";


export const DomainManager = {
  /**
   * Sets the initial X domains for focus and context charts, and secondary charts.
   * Reads goal state for potential extent adjustment.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   * @returns {Array<Date>} The initial domain for the focus chart [startDate, endDate].
   */
  _setInitialXDomains(stateSnapshot) {
    const processedData = Selectors.selectProcessedData(stateSnapshot);
    const goal = Selectors.selectGoal(stateSnapshot);

    // Determine extent from processed data dates
    let dataStartDate = null;
    let dataEndDate = null;
    if (processedData.length > 0) {
      const dateExtent = d3.extent(processedData, (d) => d.date);
      if (dateExtent[0] instanceof Date && !isNaN(dateExtent[0]))
        dataStartDate = dateExtent[0];
      if (dateExtent[1] instanceof Date && !isNaN(dateExtent[1]))
        dataEndDate = dateExtent[1];
    }

    let contextDomainStart = dataStartDate;
    let contextDomainEnd = dataEndDate;
    let initialFocusStart = null;
    let initialFocusEnd = null;

    if (!contextDomainStart || !contextDomainEnd) {
      console.warn(
        "DomainManager: No valid date range in data. Using fallback.",
      );
      const today = new Date();
      const past = d3.timeMonth.offset(today, -CONFIG.initialViewMonths);
      contextDomainStart = past;
      contextDomainEnd = today;
      initialFocusStart = past;
      initialFocusEnd = today;
    } else {
      // Extend context end date if goal date is later
      if (
        goal.date instanceof Date &&
        !isNaN(goal.date) &&
        goal.date > contextDomainEnd
      ) {
        contextDomainEnd = goal.date;
      }
      // Set initial focus view end date to context end (which includes goal if set)
      initialFocusEnd = contextDomainEnd;
      // Set initial focus view start date N months before DATA end date
      // This ensures we always see recent data, even if goal is far in future
      const defaultFocusStart = d3.timeMonth.offset(
        dataEndDate,
        -CONFIG.initialViewMonths,
      );
      initialFocusStart =
        defaultFocusStart < contextDomainStart
          ? contextDomainStart
          : defaultFocusStart;
    }

    const initialFocusDomain = [initialFocusStart, initialFocusEnd];
    const contextDomain = [contextDomainStart, contextDomainEnd];

    // Set domains on the imported scales
    scales.xContext?.domain(contextDomain);
    scales.x?.domain(initialFocusDomain);
    scales.xBalance?.domain(initialFocusDomain);
    scales.xRate?.domain(initialFocusDomain);
    scales.xTdeeDiff?.domain(initialFocusDomain);

    // Dispatch action to set the initial analysis range based on the focus view
    const initialAnalysisRange = {
      start: new Date(new Date(initialFocusDomain[0]).setHours(0, 0, 0, 0)), // Clone
      end: new Date(new Date(initialFocusDomain[1]).setHours(23, 59, 59, 999)), // Clone
    };
    StateManager.dispatch({
      type: "SET_ANALYSIS_RANGE",
      payload: initialAnalysisRange,
    });

    return initialFocusDomain; // Return the focus domain for potential immediate use
  },

  /**
   * Sets the Y domain for the context chart based on visible series.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   */
  _setContextYDomain(stateSnapshot) {
    if (!scales.yContext) return;
    const processedData = Selectors.selectProcessedData(stateSnapshot);
    const visibility = Selectors.selectSeriesVisibility(stateSnapshot);

    const [yMin, yMax] = calculateContextYDomain(
      processedData,
      visibility.smaLine, // Pass visibility flags
      visibility.smaBand,
    );
    scales.yContext.domain([yMin, yMax]).nice();
  },

  /**
   * Sets the Y domains for the focus chart (Y1 for weight).
   * Relies on derived data (filteredData, regressionResult) being present in the state snapshot.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   */
  _setFocusYDomains(stateSnapshot) {
    if (!scales.y || !scales.x) {
      console.error("DomainManager: Focus scales (x, y) not initialized.");
      return;
    }

    const yRange = scales.y.range();
    const height =
      Array.isArray(yRange) && yRange.length === 2
        ? Math.abs(yRange[0] - yRange[1])
        : 200;
    const currentXDomain = scales.x.domain(); // Get current focus X domain from the scale

    // --- Get pre-calculated/filtered data from the state snapshot ---
    const filteredData = Selectors.selectFilteredData(stateSnapshot); // Use filtered data
    const regressionResult = stateSnapshot.regressionResult; // Use regression result from state
    // Note: We no longer need bufferStartDate/EndDate if filteredData is already correct

    // The calculation function now takes the state snapshot directly
    let [yMin, yMax] = calculateFocusYDomain(
      filteredData, // Pass the already filtered data
      regressionResult, // Pass the result from state
      CONFIG,
      stateSnapshot, // Pass the whole snapshot
      null, // Pass null for buffer dates as filtering is done upstream
      null,
      // Trend config is read internally by calculateFocusYDomain from stateSnapshot
    );

    // Apply the calculated domain, using context domain as fallback if calculation failed
    if (isFinite(yMin) && isFinite(yMax)) {
      scales.y.domain([yMin, yMax]).nice(Math.max(Math.floor(height / 40), 5));
    } else {
      console.warn(
        "DomainManager: Calculated invalid focus Y domain. Using context domain as fallback.",
      );
      const contextDomain = scales.yContext?.domain();
      if (
        Array.isArray(contextDomain) &&
        contextDomain.length === 2 &&
        isFinite(contextDomain[0]) &&
        isFinite(contextDomain[1])
      ) {
        scales.y
          .domain(contextDomain)
          .nice(Math.max(Math.floor(height / 40), 5));
      } else {
        console.error(
          "DomainManager: Context Y domain is also invalid! Using hardcoded fallback [60, 80].",
        );
        scales.y.domain([60, 80]).nice(); // Hardcoded fallback
      }
    }
    scales.y2?.domain([0, 100]); // Keep default for unused Y2
  },

  /**
   * Sets the Y domains for the secondary charts (Balance, Rate, TDEE Diff).
   * Relies on filteredData being present in the state snapshot.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   */
  _setSecondaryYDomains(stateSnapshot) {
    const filteredData = Selectors.selectFilteredData(stateSnapshot); // Use filtered data from state

    if (scales.yBalance) {
      const [yBalanceMax, yBalanceMin] = calculateBalanceYDomain(filteredData); // Max/Min returned order
      scales.yBalance.domain([yBalanceMin, yBalanceMax]).nice();
    }
    if (scales.yRate) {
      const [yRateMin, yRateMax] = calculateRateYDomain(filteredData);
      scales.yRate.domain([yRateMin, yRateMax]).nice();
    }
    if (scales.yTdeeDiff) {
      const [yDiffMin, yDiffMax] = calculateTdeeDiffYDomain(filteredData);
      scales.yTdeeDiff.domain([yDiffMin, yDiffMax]).nice();
    }
  },

  /**
   * Sets the X and Y domains for the correlation scatter plot.
   * Relies on correlationScatterData being present in the state snapshot.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   */
  _setScatterPlotDomains(stateSnapshot) {
    if (!scales.xScatter || !scales.yScatter) return;
    const scatterData = Selectors.selectCorrelationScatterData(stateSnapshot); // Use selector
    const { xDomain, yDomain } = calculateScatterPlotDomains(scatterData);
    scales.xScatter.domain(xDomain).nice();
    scales.yScatter.domain(yDomain).nice();
  },

  /**
   * Calculates and sets the X domain for the context chart based on the full dataset and goal.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   * @private // Still conceptually private, but accessible for resize handler
   */
  updateContextXDomain(stateSnapshot) { // Renamed: Removed leading underscore
    if (!scales.xContext) {
      console.warn("DomainManager: Context X scale not initialized.");
      return;
    }
    const processedData = Selectors.selectProcessedData(stateSnapshot);
    const goal = Selectors.selectGoal(stateSnapshot);

    // Determine extent from processed data dates
    let dataStartDate = null;
    let dataEndDate = null;
    if (processedData.length > 0) {
      const dateExtent = d3.extent(processedData, (d) => d.date);
      if (dateExtent[0] instanceof Date && !isNaN(dateExtent[0]))
        dataStartDate = dateExtent[0];
      if (dateExtent[1] instanceof Date && !isNaN(dateExtent[1]))
        dataEndDate = dateExtent[1];
    }

    let contextDomainStart = dataStartDate;
    let contextDomainEnd = dataEndDate;

    if (!contextDomainStart || !contextDomainEnd) {
      console.warn(
        "DomainManager: No valid date range in data for context. Using fallback.",
      );
      const today = new Date();
      const past = d3.timeMonth.offset(today, -CONFIG.initialViewMonths);
      contextDomainStart = past;
      contextDomainEnd = today;
    } else {
      if (
        goal.date instanceof Date &&
        !isNaN(goal.date) &&
        goal.date > contextDomainEnd
      ) {
        contextDomainEnd = goal.date;
      }
    }

    const contextDomain = [contextDomainStart, contextDomainEnd];
    console.log("DomainManager: Setting context X domain:", contextDomain);
    scales.xContext.domain(contextDomain);
  },

  /**
   * Initializes all domains based on the full processed dataset.
   * Should be called once after data is loaded and processed.
   * Reads state, dispatches actions.
   * @param {object} stateSnapshot - A snapshot of the application state containing processedData.
   */
  initializeDomains(stateSnapshot) {
    console.log("DomainManager: Initializing domains...");
    const processedData = Selectors.selectProcessedData(stateSnapshot);
    if (!processedData || processedData.length === 0) {
      console.warn(
        "DomainManager: No processed data available for initial domain setup.",
      );
      this.setEmptyDomains(); // Set default domains
      return;
    }

    this._setContextYDomain(stateSnapshot); // Reads state.seriesVisibility
    const initialFocusDomain = this._setInitialXDomains(stateSnapshot); // Reads state.goal, dispatches SET_ANALYSIS_RANGE

    // --- Initial Derived Data Calculation (Now handled by StatsManager) ---
    // We now rely on StatsManager having run its initial calculation *after*
    // SET_ANALYSIS_RANGE was dispatched by _setInitialXDomains.
    // The stateSnapshot passed here might be slightly stale regarding derived data,
    // but it's sufficient for setting the initial scale domains.
    // MasterUpdater will use the final, updated derived state for the initial render.

    // Use the most recent state to set other domains
    const finalStateSnapshot = StateManager.getState(); // Get the absolute latest state

    this._setFocusYDomains(finalStateSnapshot);
    this._setSecondaryYDomains(finalStateSnapshot);
    this._setScatterPlotDomains(finalStateSnapshot);

    console.log("DomainManager: Domain initialization complete.");
  },

  /**
   * Updates domains based on user interaction (zoom/brush) or other state changes.
   * Primarily recalculates Y domains based on the current X view and visibility state.
   * Assumes scales.x domain is already updated by the interaction handler.
   */
  updateDomainsOnInteraction() {
    console.log(
      "[DomainManager] Updating domains on interaction/state change.",
    );
    const stateSnapshot = StateManager.getState(); // Get current state

    if (!Selectors.selectIsInitialized(stateSnapshot)) {
      console.warn("DomainManager: Skipping domain update - not initialized.");
      return;
    }

    // --- Update Focus Y Domain ---
    // This now relies on filteredData and regressionResult being correctly updated in the state
    // by StatsManager *before* this function is called by MasterUpdater.
    this._setFocusYDomains(stateSnapshot);

    // --- Update Secondary Chart X Domains to Match Focus ---
    const currentXDomain = scales.x?.domain();
    if (currentXDomain && currentXDomain.length === 2) {
      scales.xBalance?.domain(currentXDomain);
      scales.xRate?.domain(currentXDomain);
      scales.xTdeeDiff?.domain(currentXDomain);
    } else {
      console.warn(
        "DomainManager: Could not update secondary X domains - invalid focus X domain.",
      );
    }

    // --- Update Secondary Y Domains (based on currently filtered data in state) ---
    this._setSecondaryYDomains(stateSnapshot);

    // Note: Scatter plot domain typically doesn't change on zoom/brush of main chart.
    // It updates when the underlying weekly/correlation data changes (handled via subscription).
    console.log("[DomainManager] Finished updating domains.");
  },

  /** Sets all domains to empty/default values */
  setEmptyDomains() {
    console.log("[DomainManager] Setting empty/default domains.");
    const defaultDate = new Date();
    const defaultX = [d3.timeMonth.offset(defaultDate, -1), defaultDate];
    const defaultY = [60, 80];
    scales.x?.domain(defaultX);
    scales.xContext?.domain(defaultX);
    scales.xBalance?.domain(defaultX);
    scales.xRate?.domain(defaultX);
    scales.xTdeeDiff?.domain(defaultX);
    scales.y?.domain(defaultY).nice();
    scales.yContext?.domain(defaultY).nice();
    scales.yBalance?.domain([-500, 500]).nice();
    scales.yRate?.domain([-0.5, 0.5]).nice();
    scales.yTdeeDiff?.domain([-500, 500]).nice();
    scales.xScatter?.domain([-1000, 1000]).nice();
    scales.yScatter?.domain([-1, 1]).nice();
    // No direct state dispatch needed here unless clearing state is desired
  },
};
