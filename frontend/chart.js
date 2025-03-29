/**
 * Weight Insights - Advanced Chart Module (v2)
 *
 * Incorporates annotations, weekly summary, direct interaction, highlighting,
 * rate of change chart, plateau/trend detection, TDEE reconciliation,
 * calorie guidance, what-if scenarios, and clearer stat scopes.
 *
 * Structure:
 * - Configuration & Constants (CONFIG)
 * - State Management (state)
 * - D3 Selections Cache (selections)
 * - D3 Scales, Axes, Brush, Zoom (scales, axes, brush, zoom)
 * - Color Palette (colors)
 * - Helper Functions (_helpers)
 * - Data Loading & Processing (_data)
 * - Chart Setup Functions (_setup)
 * - Domain & Initial View (_domains)
 * - Chart Update Functions (_update)
 * - Statistics Calculation & DOM Update (_stats)
 * - Insight Generation (_insights)
 * - Event Handlers (_handlers)
 * - Legend & Visibility (_legend)
 * - Annotations Management (_annotations)
 * - Initialization & Public Interface
 */

// Log script parsing start for timing checks
console.log("chart.js (v2): Script parsing started.");
// Initial check for DOM elements (expected to be null if script is in <head> without defer)
console.log("chart.js (v2): Checking DOM at script parse time:", {
  chartContainer: document.getElementById("chart-container"),
});

const WeightTrackerChart = (function () {
  "use strict";

  // --- Dependency Checks ---
  if (typeof d3 === "undefined") {
    console.error("D3.js library not loaded! Chart cannot initialize.");
    return {
      initialize: () => {
        console.error("D3 missing, initialization aborted.");
      },
    };
  }
  if (typeof ss === "undefined") {
    console.warn(
      "simple-statistics library (ss) not loaded! Correlation and Regression features will be unavailable.",
    );
    // Provide dummy functions if ss is missing
    window.ss = {
      sampleCorrelation: () => {
        console.warn("ss.sampleCorrelation unavailable");
        return null;
      },
      linearRegression: () => {
        console.warn("ss.linearRegression unavailable");
        return { m: NaN, b: NaN };
      },
    };
  }

  // ========================================================================
  // Configuration & Constants
  // ========================================================================
  const CONFIG = {
    localStorageKeys: {
      goal: "weightInsightsGoalV2",
      theme: "weightInsightsThemeV2",
      annotations: "weightInsightsAnnotationsV2", // Feature #1
    },
    movingAverageWindow: 7, // For weight SMA
    rateOfChangeSmoothingWindow: 7, // For smoothing daily rate changes (Feature #5)
    tdeeDiffSmoothingWindow: 14, // For smoothing TDEE difference (Feature #8)
    stdDevMultiplier: 1, // Multiplier for SMA band width
    yAxisPaddingFactor: 0.02, // FIX: Reduced Y-axis padding factor from 0.05
    yAxisMinPaddingKg: 0.1, // FIX: Reduced min padding from 0.3
    rollingWindowWeeks: 4,
    KCALS_PER_KG: 7700,
    OUTLIER_STD_DEV_THRESHOLD: 2.5,
    MIN_POINTS_FOR_CORRELATION: 14, // Min days with *both* net cal and rate data within range
    MIN_WEEKS_FOR_CORRELATION: 4, // Min weeks with sufficient data for correlation
    MIN_POINTS_FOR_REGRESSION: 7,
    margins: {
      focus: { top: 10, right: 30, bottom: 30, left: 50 }, // Keep reduced top margin
      context: { top: 10, right: 30, bottom: 30, left: 50 },
      balance: { top: 5, right: 30, bottom: 20, left: 50 },
      rate: { top: 10, right: 30, bottom: 20, left: 50 },
      tdeeDiff: { top: 5, right: 30, bottom: 20, left: 50 },
    },
    debounceResizeMs: 250,
    transitionDurationMs: 300,
    initialViewMonths: 3,
    statusMessageDurationMs: 3000,
    MAX_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.35, // kg/wk for gain phase
    MIN_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.1, // kg/wk for gain phase
    dotRadius: 3.5,
    dotHoverRadius: 5.5,
    rawDotRadius: 2.5,
    highlightRadiusMultiplier: 1.8, // Feature #4
    // Annotation constants (Feature #1)
    annotationMarkerRadius: 4,
    annotationRangeOpacity: 0.1,
    // Plateau Detection constants (Feature #6)
    plateauRateThresholdKgWeek: 0.07, // Max abs weekly rate for plateau (based on smoothed rate)
    plateauMinDurationWeeks: 3,
    // Trend Change Detection constants (Feature #7 - Basic Slope)
    trendChangeWindowDays: 14, // Window before/after to compare slope
    trendChangeMinSlopeDiffKgWeek: 0.15, // Min absolute difference in weekly slope to flag
    // Domain calculation constants
    domainBufferDays: 7, // How many days outside the view to consider for Y domain of trendlines/expected
    // Fallback colors
    fallbackColors: {
      sma: "#3498db",
      band: "rgba(52,152,219,0.08)",
      rawDot: "#bdc3c7",
      dot: "#3498db",
      trend1: "#2ecc71",
      trend2: "#e74c3c",
      regression: "#f39c12",
      goal: "#9b59b6",
      outlier: "#e74c3c",
      deficit: "#2ecc71",
      surplus: "#e74c3c",
      expectedLineColor: "#f1c40f",
      rateLineColor: "#8e44ad", // Feature #5
      tdeeDiffLineColor: "#1abc9c", // Feature #8
      annotationMarker: "#e67e22", // Feature #1
      annotationRange: "rgba(230, 126, 34, 0.1)", // Feature #1
      plateauColor: "rgba(127, 140, 141, 0.15)", // Feature #6
      trendChangeColor: "#e74c3c", // Feature #7
      highlightStroke: "#f1c40f", // Feature #4
    },
  };

  // ========================================================================
  // State Management
  // ========================================================================
  let state = {
    isInitialized: false,
    rawData: [],
    processedData: [],
    weeklySummaryData: [], // Feature #2
    filteredData: [], // Data currently visible in focus chart (based on X domain)
    showRegression: true,
    dimensions: {
      width: 0,
      height: 0,
      contextWidth: 0,
      contextHeight: 0,
      balanceWidth: 0,
      balanceHeight: 0,
      rateWidth: 0, // Feature #5
      rateHeight: 0, // Feature #5
      tdeeDiffWidth: 0, // Feature #8
      tdeeDiffHeight: 0, // Feature #8
    },
    regressionStartDate: null,
    goal: { weight: null, date: null, targetRate: null },
    currentTheme: "light",
    analysisRange: { start: null, end: null, isCustom: false },
    seriesVisibility: {
      raw: true,
      sma: true,
      expected: true,
      regression: true,
      trend1: true,
      trend2: true,
      goal: true,
      annotations: true, // Feature #1
      plateaus: true, // Feature #6
      trendChanges: true, // Feature #7
    },
    statusTimeoutId: null,
    highlightedDate: null, // Feature #4
    annotations: [], // Feature #1
    plateaus: [], // Feature #6 (Stores {startDate, endDate})
    trendChangePoints: [], // Feature #7 (Stores {date, magnitude})
    lastZoomTransform: null, // Feature #3
  };

  // ========================================================================
  // D3 Selections Cache
  // ========================================================================
  const selections = {
    chartContainer: null,
    contextContainer: null,
    balanceChartContainer: null,
    legendContainer: null,
    rateChartContainer: null, // Feature #5
    tdeeDiffContainer: null, // Feature #8
    weeklySummaryContainer: null, // Feature #2
    annotationForm: null, // Feature #1
    annotationDateInput: null, // Feature #1
    annotationTextInput: null, // Feature #1
    annotationTypeInput: null, // Feature #1
    annotationList: null, // Feature #1
    whatIfIntakeInput: null, // Feature #10
    whatIfDurationInput: null, // Feature #10
    whatIfResultDisplay: null, // Feature #10
    whatIfSubmitBtn: null, // Feature #10
    body: null,
    svg: null,
    contextSvg: null,
    balanceSvg: null,
    rateSvg: null, // Feature #5
    tdeeDiffSvg: null, // Feature #8
    focus: null,
    context: null,
    chartArea: null,
    balanceChartArea: null,
    rateChartArea: null, // Feature #5
    tdeeDiffChartArea: null, // Feature #8
    annotationsGroup: null, // Feature #1
    plateauGroup: null, // Feature #6
    trendChangeGroup: null, // Feature #7
    highlightGroup: null, // Feature #4 (To draw highlight markers)
    zoomCaptureRect: null, // Feature #3 - Specific selection for zoom overlay
    smaLine: null,
    bandArea: null,
    regressionLine: null,
    trendLine1: null,
    trendLine2: null,
    goalLine: null,
    expectedLine: null,
    rateLine: null, // Feature #5
    tdeeDiffLine: null, // Feature #8
    contextArea: null,
    contextLine: null,
    balanceZeroLine: null,
    rateZeroLine: null, // Feature #5
    tdeeDiffZeroLine: null, // Feature #8
    rawDotsGroup: null,
    smaDotsGroup: null,
    xAxisGroup: null,
    yAxisGroup: null,
    gridGroup: null,
    contextXAxisGroup: null,
    balanceXAxisGroup: null,
    balanceYAxisGroup: null,
    rateXAxisGroup: null, // Feature #5
    rateYAxisGroup: null, // Feature #5
    tdeeDiffXAxisGroup: null, // Feature #8
    tdeeDiffYAxisGroup: null, // Feature #8
    brushGroup: null,
    tooltip: null,
    statusMessage: null,
    themeToggle: null,
    goalWeightInput: null,
    goalDateInput: null,
    goalTargetRateInput: null,
    regressionToggle: null,
    trendStartDateInput: null,
    trendInitialWeightInput: null,
    trendWeeklyIncrease1Input: null,
    trendWeeklyIncrease2Input: null,
    regressionStartDateLabel: null,
    analysisStartDateInput: null,
    analysisEndDateInput: null,
    updateAnalysisRangeBtn: null,
    resetAnalysisRangeBtn: null,
    analysisRangeDisplay: null,
    analysisResultsHeading: null, // Feature #11
    insightSummaryContainer: null,
    statElements: {}, // Cache for direct node manipulation
    // Stat elements that might be highlight triggers (Feature #4)
    maxWeightDate: null,
    minWeightDate: null,
  };

  // ========================================================================
  // D3 Scales, Axes, Brush, Zoom
  // ========================================================================
  let scales = {
    x: null,
    y: null,
    xContext: null,
    yContext: null,
    xBalance: null,
    yBalance: null,
    xRate: null, // Feature #5
    yRate: null, // Feature #5
    xTdeeDiff: null, // Feature #8
    yTdeeDiff: null, // Feature #8
  };
  let axes = {
    xAxis: null,
    yAxis: null,
    xAxisContext: null,
    yBalanceAxis: null,
    xBalanceAxis: null,
    yRateAxis: null, // Feature #5
    xRateAxis: null, // Feature #5
    yTdeeDiffAxis: null, // Feature #8
    xTdeeDiffAxis: null, // Feature #8
  };
  let brush = null;
  let zoom = null; // Feature #3

  // ========================================================================
  // Color Palette
  // ========================================================================
  let colors = {}; // Populated by _helpers.updateColors

  // ========================================================================
  // Helper Functions (`_helpers`)
  // ========================================================================
  const _helpers = {
    getElementByIdSafe(id) {
      const el = document.getElementById(id);
      // if (!el) {
      //     console.warn(`Helper: Element with ID '${id}' not found.`);
      // }
      return el;
    },
    formatValue(val, decimals = 2) {
      return val !== null && !isNaN(val) ? val.toFixed(decimals) : "N/A";
    },
    formatDate(date) {
      return date instanceof Date && !isNaN(date.getTime())
        ? d3.timeFormat("%Y-%m-%d")(date)
        : "N/A";
    },
    formatDateShort(date) {
      return date instanceof Date && !isNaN(date.getTime())
        ? d3.timeFormat("%d %b '%y")(date)
        : "N/A";
    },
    formatDateLong(date) {
      return date instanceof Date && !isNaN(date.getTime())
        ? d3.timeFormat("%a, %d %b %Y")(date)
        : "N/A";
    },
    updateColors() {
      const style = getComputedStyle(document.documentElement);
      const getColor = (varName, fallback) => {
        const val = style.getPropertyValue(varName)?.trim();
        // if (!val) {
        //     console.warn(`CSS variable ${varName} not found, using fallback ${fallback}`);
        // }
        return val || fallback;
      };
      colors = {
        sma: getColor("--sma-color", CONFIG.fallbackColors.sma),
        band: getColor("--band-color", CONFIG.fallbackColors.band),
        rawDot: getColor("--raw-dot-color", CONFIG.fallbackColors.rawDot),
        dot: getColor("--dot-color", CONFIG.fallbackColors.dot),
        trend1: getColor("--trend1-color", CONFIG.fallbackColors.trend1),
        trend2: getColor("--trend2-color", CONFIG.fallbackColors.trend2),
        regression: getColor(
          "--regression-color",
          CONFIG.fallbackColors.regression,
        ),
        goal: getColor("--goal-line-color", CONFIG.fallbackColors.goal),
        outlier: getColor("--outlier-color", CONFIG.fallbackColors.outlier),
        deficit: getColor("--deficit-color", CONFIG.fallbackColors.deficit),
        surplus: getColor("--surplus-color", CONFIG.fallbackColors.surplus),
        expectedLineColor: getColor(
          "--expected-line-color",
          CONFIG.fallbackColors.expectedLineColor,
        ),
        rateLineColor: getColor(
          "--rate-line-color",
          CONFIG.fallbackColors.rateLineColor,
        ), // Feature #5
        tdeeDiffLineColor: getColor(
          "--tdee-diff-line-color",
          CONFIG.fallbackColors.tdeeDiffLineColor,
        ), // Feature #8
        annotationMarker: getColor(
          "--annotation-marker-color",
          CONFIG.fallbackColors.annotationMarker,
        ), // Feature #1
        annotationRange: getColor(
          "--annotation-range-color",
          CONFIG.fallbackColors.annotationRange,
        ), // Feature #1
        plateauColor: getColor(
          "--plateau-color",
          CONFIG.fallbackColors.plateauColor,
        ), // Feature #6
        trendChangeColor: getColor(
          "--trend-change-color",
          CONFIG.fallbackColors.trendChangeColor,
        ), // Feature #7
        highlightStroke: getColor(
          "--highlight-stroke-color",
          CONFIG.fallbackColors.highlightStroke,
        ), // Feature #4
      };
    },
    showStatusMessage(
      message,
      type = "info",
      duration = CONFIG.statusMessageDurationMs,
    ) {
      if (!selections.statusMessage) return;
      if (state.statusTimeoutId) clearTimeout(state.statusTimeoutId);
      selections.statusMessage
        .text(message)
        .attr("class", `status-message ${type}`)
        .classed("show", true);
      state.statusTimeoutId = setTimeout(() => {
        selections.statusMessage.classed("show", false);
        state.statusTimeoutId = null;
      }, duration);
    },
    getTrendlineConfig() {
      const startDateInput = selections.trendStartDateInput?.property("value");
      const initialWeight = parseFloat(
        selections.trendInitialWeightInput?.property("value"),
      );
      const weeklyIncrease1 = parseFloat(
        selections.trendWeeklyIncrease1Input?.property("value"),
      );
      const weeklyIncrease2 = parseFloat(
        selections.trendWeeklyIncrease2Input?.property("value"),
      );
      let startDate = null;
      if (startDateInput) {
        const parsed = new Date(startDateInput);
        if (!isNaN(parsed.getTime())) {
          parsed.setHours(0, 0, 0, 0);
          startDate = parsed;
        }
      }
      const isValid =
        startDate &&
        !isNaN(initialWeight) &&
        !isNaN(weeklyIncrease1) &&
        !isNaN(weeklyIncrease2);
      return {
        startDate,
        initialWeight,
        weeklyIncrease1,
        weeklyIncrease2,
        isValid,
      };
    },
    getRegressionStartDateFromUI() {
      const inputVal = selections.trendStartDateInput?.property("value");
      if (!inputVal) return null;
      const parsedDate = new Date(inputVal);
      if (isNaN(parsedDate.getTime())) {
        console.warn("Invalid regression start date input.");
        return null;
      }
      parsedDate.setHours(0, 0, 0, 0);
      return parsedDate;
    },
    updateStatElement(
      id,
      value,
      formatFn = _helpers.formatValue,
      decimals = 2,
    ) {
      const el = selections.statElements[id];
      if (el) {
        el.textContent = formatFn(value, decimals);
        // Add/manage event listener for highlighting (Feature #4)
        if (id === "maxWeightDate" || id === "minWeightDate") {
          if (!el.__clickListenerAttached) {
            // Avoid attaching multiple listeners
            el.style.cursor = "pointer";
            el.style.textDecoration = "underline dotted";
            el.addEventListener("click", () => _handlers.statDateClick(value)); // Pass the date value
            el.__clickListenerAttached = true;
          }
          // Update the class for visual feedback
          el.classList.add("highlightable");
        }
      } else if (selections[id] && !selections[id].empty()) {
        // Check if it's a D3 selection (legacy, might be removable)
        selections[id].text(formatFn(value, decimals));
      } else {
        // console.warn(`updateStatElement: Could not find element or stat cache for ID: ${id}`);
      }
    },
    calculateRollingAverage(data, windowSize) {
      if (!data || data.length === 0 || windowSize <= 0) {
        return [];
      }
      const result = [];
      let sum = 0;
      let count = 0;
      const windowData = [];

      for (let i = 0; i < data.length; i++) {
        const value = data[i];
        if (value !== null && !isNaN(value)) {
          windowData.push(value);
          sum += value;
          count++;
        } else {
          // Add null placeholder to keep index alignment if needed, or just skip
          windowData.push(null); // Pushing null helps maintain window size logic
        }

        if (windowData.length > windowSize) {
          const removedValue = windowData.shift(); // Remove oldest value
          if (removedValue !== null && !isNaN(removedValue)) {
            sum -= removedValue;
            count--;
          }
        }

        if (count > 0 && windowData.length >= Math.floor(windowSize / 2)) {
          // Require at least half window of data
          // Only calculate average if there are valid numbers in the window
          result.push(sum / count);
        } else {
          result.push(null); // Not enough valid data in window
        }
      }
      return result;
    },
  };

  // ========================================================================
  // Data Loading & Processing (`_data`)
  // ========================================================================
  const _data = {
    getHardcodedData() {
      // --- PASTE YOUR FULL HARDCODED DATA OBJECTS HERE ---
      const weights = {
        "2025-03-29": 73,
        "2025-03-27": 72.6,
        "2025-03-26": 72.6,
        "2025-03-25": 72.299999999999997,
        "2025-03-24": 71.099999999999994,
        "2025-03-21": 70.700000000000003,
        "2025-03-20": 71.5,
        "2025-03-19": 71.400000000000006,
        "2025-03-18": 71.400000000000006,
        "2025-03-17": 73.099999999999994,
        "2025-03-16": 71.799999999999997,
        "2025-03-15": 71,
        "2025-03-14": 72.200000000000003,
        "2025-03-12": 71.299999999999997,
        "2025-03-11": 71.900000000000006,
        "2025-03-10": 71.400000000000006,
        "2025-03-07": 70.299999999999997,
        "2025-03-06": 70.299999999999997,
        "2025-03-05": 70.700000000000003,
        "2025-03-04": 71,
        "2025-03-03": 70.599999999999994,
        "2025-03-02": 70.599999999999994,
        "2025-03-01": 71.299999999999997,
        "2025-02-28": 70.700000000000003,
        "2025-02-27": 70.700000000000003,
        "2025-02-26": 70.400000000000006,
        "2025-02-24": 70.099999999999994,
        "2025-02-21": 71.200000000000003,
        "2025-02-20": 70.799999999999997,
        "2025-02-19": 70.799999999999997,
        "2025-02-18": 71.400000000000006,
        "2025-02-17": 70.5,
        "2025-02-16": 70.900000000000006,
        "2025-02-15": 69.400000000000006,
        "2025-02-14": 69.700000000000003,
        "2025-02-13": 70,
        "2025-02-12": 70.099999999999994,
        "2025-02-11": 70.900000000000006,
        "2025-02-10": 70.799999999999997,
        "2025-02-09": 71,
        "2025-02-08": 70.200000000000003,
        "2025-02-07": 69.700000000000003,
        "2025-02-05": 69.700000000000003,
        "2025-02-04": 70.099999999999994,
        "2025-02-03": 70.099999999999994,
        "2025-02-02": 70.099999999999994,
        "2025-02-01": 71,
        "2025-01-30": 70.200000000000003,
        "2025-01-29": 70.200000000000003,
        "2025-01-28": 69.900000000000006,
        "2025-01-27": 69.299999999999997,
        "2025-01-26": 69.700000000000003,
        "2025-01-25": 69.5,
        "2025-01-24": 69.700000000000003,
        "2025-01-23": 70.299999999999997,
        "2025-01-22": 70.5,
        "2025-01-21": 70.599999999999994,
        "2025-01-20": 70.599999999999994,
        "2025-01-16": 69.599999999999994,
        "2025-01-15": 69.900000000000006,
        "2025-01-14": 69.400000000000006,
        "2025-01-13": 69.900000000000006,
        "2025-01-12": 69.900000000000006,
        "2025-01-11": 69.200000000000003,
        "2025-01-10": 69.900000000000006,
        "2025-01-09": 70.599999999999994,
        "2025-01-08": 69.799999999999997,
        "2025-01-07": 69.799999999999997,
        "2025-01-06": 69.799999999999997,
        "2025-01-05": 69.700000000000003,
        "2025-01-03": 69.099999999999994,
        "2025-01-02": 69,
        "2025-01-01": 69.700000000000003,
        "2024-12-31": 69.200000000000003,
        "2024-12-30": 68.799999999999997,
        "2024-12-29": 69.299999999999997,
        "2024-12-28": 69.400000000000006,
        "2024-12-27": 69.400000000000006,
        "2024-12-26": 70,
        "2024-12-25": 70,
        "2024-12-24": 70.700000000000003,
        "2024-12-22": 70.700000000000003,
        "2024-12-21": 70.700000000000003,
        "2024-12-20": 70.700000000000003,
        "2024-12-19": 71,
        "2024-12-18": 71.5,
        "2024-12-17": 71.5,
        "2024-12-16": 72,
        "2024-12-15": 73.099999999999994,
        "2024-12-14": 71.900000000000006,
        "2024-12-13": 71.299999999999997,
        "2024-12-12": 71.299999999999997,
        "2024-12-11": 70.799999999999997,
        "2024-12-10": 71.400000000000006,
        "2024-12-09": 71.400000000000006,
        "2024-12-08": 72.099999999999994,
        "2024-12-07": 72.299999999999997,
        "2024-12-06": 71.599999999999994,
        "2024-12-05": 72.299999999999997,
        "2024-12-04": 73,
        "2024-12-03": 73,
        "2024-12-02": 74.200000000000003,
        "2024-11-30": 72.5,
        "2024-11-29": 72.5,
        "2024-11-28": 72.799999999999997,
        "2024-11-27": 73.099999999999994,
        "2024-11-26": 72.700000000000003,
        "2024-11-25": 73.700000000000003,
        "2024-11-24": 74.099999999999994,
        "2024-11-23": 73.799999999999997,
        "2024-11-22": 73.5,
        "2024-11-21": 73.299999999999997,
        "2024-11-20": 73.200000000000003,
        "2024-11-19": 73.799999999999997,
        "2024-11-18": 74.099999999999994,
        "2024-11-17": 73.5,
        "2024-11-16": 74.400000000000006,
        "2024-11-15": 74.799999999999997,
        "2024-11-14": 74.799999999999997,
        "2024-11-13": 74.400000000000006,
        "2024-11-12": 74.599999999999994,
        "2024-11-11": 75.400000000000006,
        "2024-11-10": 75.400000000000006,
      };
      const calorieIntake = {
        "2025-03-29": 3344,
        "2025-03-27": 3303,
        "2025-03-26": 3341,
        "2025-03-25": 3326,
        "2025-03-24": 3243,
        "2025-03-21": 3143,
        "2025-03-20": 3219,
        "2025-03-19": 3258,
        "2025-03-18": 3127,
        "2025-03-17": 3087,
        "2025-03-16": 3079,
        "2025-03-15": 3056,
        "2025-03-14": 3075,
        "2025-03-12": 3008,
        "2025-03-11": 3024,
        "2025-03-10": 3010,
        "2025-03-07": 3030,
        "2025-03-06": 2999,
        "2025-03-05": 2656,
        "2025-03-04": 2939,
        "2025-03-03": 2966,
        "2025-03-02": 2817,
        "2025-03-01": 2651,
        "2025-02-28": 2459,
        "2025-02-27": 2699,
        "2025-02-26": 2912,
        "2025-02-24": 2912,
        "2025-02-21": 2942,
        "2025-02-20": 2961,
        "2025-02-19": 3036,
        "2025-02-18": 2948,
        "2025-02-17": 2940,
        "2025-02-16": 2892,
        "2025-02-15": 2817,
        "2025-02-14": 3105,
        "2025-02-13": 2845,
        "2025-02-12": 2925,
        "2025-02-11": 2826,
        "2025-02-10": 2821,
        "2025-02-09": 2836,
        "2025-02-08": 2876,
        "2025-02-07": 2852,
        "2025-02-05": 3219,
        "2025-02-04": 2800,
        "2025-02-03": 2751,
        "2025-02-02": 2784,
        "2025-02-01": 2784,
        "2025-01-30": 2795,
        "2025-01-29": 2751,
        "2025-01-28": 2734,
        "2025-01-27": 2732,
        "2025-01-26": 2757,
        "2025-01-25": 2644,
        "2025-01-24": 2661,
        "2025-01-23": 2581,
        "2025-01-22": 2688,
        "2025-01-21": 2634,
        "2025-01-20": 2669,
        "2025-01-16": 2673,
        "2025-01-15": 2645,
        "2025-01-14": 2688,
        "2025-01-13": 2693,
        "2025-01-12": 2460,
        "2025-01-11": 2359,
        "2025-01-10": 2367,
        "2025-01-09": 2409,
        "2025-01-08": 2398,
        "2025-01-07": 2305,
        "2025-01-06": 2318,
      };
      const googleFitExpenditure = {
        "2025-03-29": 2770,
        "2025-03-27": 1874,
        "2025-03-26": 2979,
        "2025-03-25": 2485,
        "2025-03-24": 2255,
        "2025-03-21": 2261,
        "2025-03-20": 2031,
        "2025-03-19": 2536,
        "2025-03-18": 2517,
        "2025-03-17": 2378,
        "2025-03-16": 2735,
        "2025-03-15": 2720,
        "2025-03-14": 2155,
        "2025-03-12": 2265,
        "2025-03-11": 1841,
        "2025-03-10": 1923,
        "2025-03-07": 2250,
        "2025-03-06": 2507,
        "2025-03-05": 2144,
        "2025-03-04": 2046,
        "2025-03-03": 2144,
        "2025-03-02": 2189,
        "2025-03-01": 2055,
        "2025-02-28": 2098,
        "2025-02-27": 1822,
        "2025-02-26": 1827,
        "2025-02-24": 1681,
        "2025-02-21": 1864,
        "2025-02-20": 2201,
        "2025-02-19": 2253,
        "2025-02-18": 2356,
        "2025-02-17": 2083,
        "2025-02-16": 2410,
        "2025-02-15": 1962,
        "2025-02-14": 3544,
        "2025-02-13": 2030,
        "2025-02-12": 1881,
        "2025-02-11": 2270,
        "2025-02-10": 2240,
        "2025-02-09": 2417,
        "2025-02-08": 2028,
        "2025-02-07": 2706,
        "2025-02-05": 1719,
        "2025-02-04": 2594,
        "2025-02-03": 1988,
        "2025-02-02": 2432,
        "2025-02-01": 1961,
        "2025-01-30": 2006,
        "2025-01-29": 2492,
        "2025-01-28": 2344,
        "2025-01-27": 2437,
        "2025-01-26": 3093,
        "2025-01-25": 2387,
        "2025-01-24": 2081,
        "2025-01-23": 2567,
        "2025-01-22": 2125,
        "2025-01-21": 2155,
        "2025-01-20": 2272,
        "2025-01-16": 2234,
        "2025-01-15": 2222,
        "2025-01-14": 2616,
        "2025-01-13": 2093,
        "2025-01-12": 2830,
        "2025-01-11": 1834,
        "2025-01-10": 2794,
        "2025-01-09": 2413,
        "2025-01-08": 2145,
        "2025-01-07": 2227,
        "2025-01-06": 2113,
      };
      // --- END OF DATA TO PASTE ---
      return { weights, calorieIntake, googleFitExpenditure };
    },

    load() {
      console.log("Using hardcoded data for chart.");
      const rawDataObjects = this.getHardcodedData();
      if (!rawDataObjects) {
        throw new Error("Failed to retrieve hardcoded data.");
      }
      const weights = rawDataObjects.weights || {};
      const calorieIntake = rawDataObjects.calorieIntake || {};
      const googleFitExpenditure = rawDataObjects.googleFitExpenditure || {};
      const allDates = new Set([
        ...Object.keys(weights),
        ...Object.keys(calorieIntake),
        ...Object.keys(googleFitExpenditure),
      ]);

      let mergedData = [];
      for (const dateStr of allDates) {
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) {
          console.warn(`Skipping invalid date string: ${dateStr}`);
          continue;
        }
        dateObj.setHours(0, 0, 0, 0);

        const intake = calorieIntake[dateStr] ?? null;
        const expenditure = googleFitExpenditure[dateStr] ?? null;
        const netBalance = this.calculateDailyBalance(intake, expenditure);
        const expectedChange = this.calculateExpectedWeightChange(netBalance);

        mergedData.push({
          dateString: dateStr,
          date: dateObj,
          value: weights[dateStr] ?? null,
          notes: undefined,
          calorieIntake: intake,
          googleFitTDEE: expenditure,
          netBalance: netBalance,
          expectedWeightChange: expectedChange,
          sma: null,
          stdDev: null,
          lowerBound: null,
          upperBound: null,
          isOutlier: false,
          // Placeholders for new calculated fields
          dailySmaRate: null, // Feature #5
          smoothedWeeklyRate: null, // Feature #5
          tdeeTrend: null, // Feature #8 (calculated later)
          tdeeDifference: null, // Feature #8
          avgTdeeDifference: null, // Feature #8
        });
      }
      mergedData.sort((a, b) => a.date - b.date);
      state.rawData = mergedData;
      console.log(`Loaded and merged data for ${state.rawData.length} dates.`);
    },

    loadGoal() {
      const storedGoal = localStorage.getItem(CONFIG.localStorageKeys.goal);
      state.goal = { weight: null, date: null, targetRate: null };
      if (storedGoal) {
        try {
          const parsed = JSON.parse(storedGoal);
          state.goal.weight = parsed.weight ? parseFloat(parsed.weight) : null;
          state.goal.date = parsed.date ? new Date(parsed.date) : null;
          state.goal.targetRate = parsed.targetRate
            ? parseFloat(parsed.targetRate)
            : null;
          // Validate parsed values
          if (state.goal.date && isNaN(state.goal.date.getTime()))
            state.goal.date = null;
          if (state.goal.weight && isNaN(state.goal.weight))
            state.goal.weight = null;
          if (state.goal.targetRate && isNaN(state.goal.targetRate))
            state.goal.targetRate = null;
        } catch (e) {
          console.error("Error parsing goal from localStorage", e);
          localStorage.removeItem(CONFIG.localStorageKeys.goal); // Clear corrupted data
          state.goal = { weight: null, date: null, targetRate: null };
        }
      }
      this.updateGoalUI();
    },

    saveGoal() {
      try {
        const goalToStore = {
          weight: state.goal.weight,
          date: state.goal.date
            ? state.goal.date.toISOString().slice(0, 10)
            : null,
          targetRate: state.goal.targetRate,
        };
        localStorage.setItem(
          CONFIG.localStorageKeys.goal,
          JSON.stringify(goalToStore),
        );
        _helpers.showStatusMessage("Goal saved!", "success");
      } catch (e) {
        console.error("Error saving goal", e);
        _helpers.showStatusMessage("Could not save goal.", "error");
      }
    },

    updateGoalUI() {
      if (selections.goalWeightInput)
        selections.goalWeightInput.property("value", state.goal.weight ?? "");
      if (selections.goalDateInput)
        selections.goalDateInput.property(
          "value",
          state.goal.date ? _helpers.formatDate(state.goal.date) : "",
        );
      if (selections.goalTargetRateInput)
        selections.goalTargetRateInput.property(
          "value",
          state.goal.targetRate ?? "",
        );
    },

    processRawData() {
      const data = state.rawData;
      if (!data || data.length === 0) {
        state.processedData = [];
        return;
      }
      const windowSize = CONFIG.movingAverageWindow;
      const stdDevMult = CONFIG.stdDevMultiplier;
      const outlierThreshold = CONFIG.OUTLIER_STD_DEV_THRESHOLD;

      // Pass 1: Calculate SMA and Std Dev
      let tempProcessed = data.map((d, i, arr) => {
        const windowDataPoints = arr.slice(
          Math.max(0, i - windowSize + 1),
          i + 1,
        );
        const validValuesInWindow = windowDataPoints
          .map((p) => p.value)
          .filter((v) => v !== null && !isNaN(v));
        let sma = null,
          stdDev = null;

        // Require at least half the window size worth of *valid* points to calculate SMA
        if (
          validValuesInWindow.length >= Math.floor(windowSize / 2) &&
          validValuesInWindow.length > 0
        ) {
          sma = d3.mean(validValuesInWindow);
          stdDev =
            validValuesInWindow.length > 1
              ? d3.deviation(validValuesInWindow)
              : 0;
        }
        return { ...d, sma, stdDev };
      });

      // Pass 2: Calculate bounds, identify outliers
      tempProcessed = tempProcessed.map((d) => {
        let lowerBound = null,
          upperBound = null,
          isOutlier = false;
        if (d.value !== null && d.sma !== null && d.stdDev !== null) {
          lowerBound = d.sma - stdDevMult * d.stdDev;
          upperBound = d.sma + stdDevMult * d.stdDev;
          // Check for outlier: value exists, sma exists, std dev is meaningful, and value is far from sma
          if (
            d.stdDev > 0.01 &&
            Math.abs(d.value - d.sma) > outlierThreshold * d.stdDev
          ) {
            isOutlier = true;
          }
        }
        return { ...d, lowerBound, upperBound, isOutlier };
      });

      // Pass 3: Calculate Daily SMA Rate (Feature #5) & Trend-Based TDEE (Feature #8)
      tempProcessed = tempProcessed.map((d, i, arr) => {
        let dailySmaRate = null;
        let tdeeTrend = null;

        if (i > 0 && arr[i - 1].sma !== null && d.sma !== null) {
          const prev = arr[i - 1];
          const timeDiffDays =
            (d.date.getTime() - prev.date.getTime()) / 86400000;
          if (timeDiffDays > 0 && timeDiffDays <= windowSize) {
            // Only calculate rate if points are reasonably close
            const smaDiff = d.sma - prev.sma;
            dailySmaRate = smaDiff / timeDiffDays; // kg per day

            // Calculate TDEE based on this daily change and *previous day's* intake (more causal)
            if (prev.calorieIntake !== null && !isNaN(prev.calorieIntake)) {
              const dailyDeficitSurplus = dailySmaRate * CONFIG.KCALS_PER_KG;
              tdeeTrend = prev.calorieIntake - dailyDeficitSurplus;
            }
          }
        }
        return { ...d, dailySmaRate, tdeeTrend };
      });

      // Pass 4: Smooth the daily rate & calculate TDEE Difference (Features #5, #8)
      const dailyRates = tempProcessed.map((d) => d.dailySmaRate);
      const smoothedDailyRates = _helpers.calculateRollingAverage(
        dailyRates,
        CONFIG.rateOfChangeSmoothingWindow,
      );

      const tdeeDifferences = tempProcessed.map((d) =>
        d.tdeeTrend !== null &&
        d.googleFitTDEE !== null &&
        !isNaN(d.tdeeTrend) &&
        !isNaN(d.googleFitTDEE)
          ? d.tdeeTrend - d.googleFitTDEE
          : null,
      );
      const smoothedTdeeDifferences = _helpers.calculateRollingAverage(
        tdeeDifferences,
        CONFIG.tdeeDiffSmoothingWindow,
      );

      state.processedData = tempProcessed.map((d, i) => ({
        ...d,
        smoothedWeeklyRate:
          smoothedDailyRates[i] !== null ? smoothedDailyRates[i] * 7 : null, // Convert smoothed daily rate to weekly
        tdeeDifference: tdeeDifferences[i],
        avgTdeeDifference: smoothedTdeeDifferences[i],
      }));

      console.log(
        `Processed data: Calculated SMA, bounds, outliers, rates, TDEE diffs.`,
      );
    },

    calculateDailyBalance(intake, expenditure) {
      return intake !== null &&
        expenditure !== null &&
        !isNaN(intake) &&
        !isNaN(expenditure)
        ? intake - expenditure
        : null;
    },

    calculateExpectedWeightChange(netBalance) {
      return netBalance === null || isNaN(netBalance)
        ? null
        : netBalance / CONFIG.KCALS_PER_KG;
    },

    calculateLinearRegression(data, startDate) {
      const nonOutlierData = data.filter(
        (d) => !d.isOutlier && d.value !== null && d.date,
      );
      const filteredData = startDate
        ? nonOutlierData.filter((d) => d.date >= startDate)
        : nonOutlierData;

      if (filteredData.length < CONFIG.MIN_POINTS_FOR_REGRESSION) {
        // console.log("Not enough points for regression:", filteredData.length);
        return { slope: null, intercept: null, points: [] };
      }

      const firstDateMs = filteredData[0].date.getTime();
      const dataForRegression = filteredData.map((d) => [
        (d.date.getTime() - firstDateMs) / 86400000, // X: days since start
        d.value, // Y: weight
      ]);

      try {
        if (
          typeof ss === "undefined" ||
          typeof ss.linearRegression !== "function"
        ) {
          console.warn(
            "simple-statistics (ss) or ss.linearRegression not available.",
          );
          return { slope: null, intercept: null, points: [] };
        }
        const regressionLine = ss.linearRegression(dataForRegression);

        if (
          regressionLine &&
          !isNaN(regressionLine.m) &&
          !isNaN(regressionLine.b)
        ) {
          const slope = regressionLine.m; // kg per day
          const intercept = regressionLine.b;
          // Map back to original dates for plotting
          const points = filteredData.map((d) => {
            const xValue = (d.date.getTime() - firstDateMs) / 86400000;
            const regressionValue = slope * xValue + intercept;
            return { date: d.date, regressionValue: regressionValue };
          });
          return { slope, intercept, points };
        } else {
          console.warn(
            "simple-statistics linearRegression returned invalid results:",
            regressionLine,
          );
          return { slope: null, intercept: null, points: [] };
        }
      } catch (e) {
        console.error(
          "Error calculating linear regression with simple-statistics:",
          e,
        );
        return { slope: null, intercept: null, points: [] };
      }
    },

    calculateTrendWeight(startDate, initialWeight, weeklyIncrease, date) {
      if (
        !startDate ||
        initialWeight === null ||
        weeklyIncrease === null ||
        !date ||
        !(startDate instanceof Date) ||
        !(date instanceof Date) ||
        isNaN(startDate.getTime()) ||
        isNaN(date.getTime())
      ) {
        return null;
      }
      const msPerWeek = 7 * 86400000;
      const weeksElapsed = (date.getTime() - startDate.getTime()) / msPerWeek;
      return initialWeight + weeksElapsed * weeklyIncrease;
    },
  };

  // ========================================================================
  // Chart Setup Functions (`_setup`)
  // ========================================================================
  const _setup = {
    dimensions() {
      const getDim = (containerSelection, margins) => {
        if (!containerSelection?.node()) return { width: 0, height: 0 };
        const rect = containerSelection.node().getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0)
          return { width: 0, height: 0 };
        const width = Math.max(50, rect.width - margins.left - margins.right);
        const height = Math.max(20, rect.height - margins.top - margins.bottom);
        return { width, height };
      };

      const focusDim = getDim(selections.chartContainer, CONFIG.margins.focus);
      const contextDim = getDim(
        selections.contextContainer,
        CONFIG.margins.context,
      );
      const balanceDim = getDim(
        selections.balanceChartContainer,
        CONFIG.margins.balance,
      );
      const rateDim = getDim(
        selections.rateChartContainer,
        CONFIG.margins.rate,
      ); // Feature #5
      const tdeeDiffDim = getDim(
        selections.tdeeDiffContainer,
        CONFIG.margins.tdeeDiff,
      ); // Feature #8

      if (
        focusDim.width === 0 ||
        contextDim.width === 0 ||
        balanceDim.width === 0 ||
        rateDim.width === 0 ||
        tdeeDiffDim.width === 0
      ) {
        console.error(
          "Cannot setup dimensions, required container elements not found or have zero size.",
          { focusDim, contextDim, balanceDim, rateDim, tdeeDiffDim },
        );
        return false;
      }

      state.dimensions.width = focusDim.width;
      state.dimensions.height = focusDim.height;
      state.dimensions.contextWidth = contextDim.width;
      state.dimensions.contextHeight = contextDim.height;
      state.dimensions.balanceWidth = balanceDim.width;
      state.dimensions.balanceHeight = balanceDim.height;
      state.dimensions.rateWidth = rateDim.width; // Feature #5
      state.dimensions.rateHeight = rateDim.height; // Feature #5
      state.dimensions.tdeeDiffWidth = tdeeDiffDim.width; // Feature #8
      state.dimensions.tdeeDiffHeight = tdeeDiffDim.height; // Feature #8

      return true;
    },

    svgElements() {
      const {
        width,
        height,
        contextWidth,
        contextHeight,
        balanceWidth,
        balanceHeight,
        rateWidth,
        rateHeight,
        tdeeDiffWidth,
        tdeeDiffHeight,
      } = state.dimensions; // Features #5, #8
      const fm = CONFIG.margins.focus;
      const cm = CONFIG.margins.context;
      const bm = CONFIG.margins.balance;
      const rm = CONFIG.margins.rate; // Feature #5
      const tdm = CONFIG.margins.tdeeDiff; // Feature #8

      // Clear existing SVGs
      selections.chartContainer.selectAll("svg").remove();
      selections.contextContainer.selectAll("svg").remove();
      selections.balanceChartContainer.selectAll("svg").remove();
      selections.rateChartContainer?.selectAll("svg").remove(); // Feature #5
      selections.tdeeDiffContainer?.selectAll("svg").remove(); // Feature #8

      // --- Focus Chart ---
      selections.svg = selections.chartContainer
        .append("svg")
        .attr("width", width + fm.left + fm.right)
        .attr("height", height + fm.top + fm.bottom)
        .attr("aria-hidden", "true"); // Main SVG

      // Defs for clipping
      selections.svg
        .append("defs")
        .append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("width", width)
        .attr("height", height);

      // Zoom capture rectangle (added BEFORE focus group)
      // --- FIX: pointer-events change ---
      selections.zoomCaptureRect = selections.svg
        .append("rect")
        .attr("class", "zoom-capture")
        .attr("width", width)
        .attr("height", height)
        .attr("transform", `translate(${fm.left}, ${fm.top})`)
        .style("pointer-events", "all"); // NOW 'all' so zoom works, CSS rules manage other interactions
      // --- End FIX ---

      // Focus group (main chart content)
      selections.focus = selections.svg
        .append("g")
        .attr("class", "focus")
        .attr("transform", `translate(${fm.left},${fm.top})`);

      // Groups within focus (order matters for layering)
      selections.gridGroup = selections.focus.append("g").attr("class", "grid");
      selections.plateauGroup = selections.focus
        .append("g")
        .attr("class", "plateau-group"); // Feature #6
      selections.annotationsGroup = selections.focus
        .append("g")
        .attr("class", "annotations-group"); // Feature #1
      selections.chartArea = selections.focus
        .append("g")
        .attr("clip-path", "url(#clip)"); // Data clipped here

      // Paths within chart area
      selections.bandArea = selections.chartArea
        .append("path")
        .attr("class", "area band-area");
      selections.smaLine = selections.chartArea
        .append("path")
        .attr("class", "line sma-line");
      selections.trendLine1 = selections.chartArea
        .append("path")
        .attr("class", "trend-line manual-trend-1");
      selections.trendLine2 = selections.chartArea
        .append("path")
        .attr("class", "trend-line manual-trend-2");
      selections.regressionLine = selections.chartArea
        .append("path")
        .attr("class", "trend-line regression-line");
      selections.goalLine = selections.chartArea
        .append("path")
        .attr("class", "trend-line goal-line");
      selections.expectedLine = selections.chartArea
        .append("path")
        .attr("class", "trend-line expected-weight-line");

      // Dot groups within chart area
      selections.rawDotsGroup = selections.chartArea
        .append("g")
        .attr("class", "raw-dots-group");
      selections.smaDotsGroup = selections.chartArea
        .append("g")
        .attr("class", "dots-group"); // Contains interactive dots

      // Overlay markers within chart area
      selections.trendChangeGroup = selections.chartArea
        .append("g")
        .attr("class", "trend-change-group"); // Feature #7
      selections.highlightGroup = selections.chartArea
        .append("g")
        .attr("class", "highlight-group"); // Feature #4

      // Axes for focus chart (outside chartArea)
      selections.xAxisGroup = selections.focus
        .append("g")
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${height})`);
      selections.yAxisGroup = selections.focus
        .append("g")
        .attr("class", "axis axis--y");

      // Y Axis Label (outside focus group, attached to main SVG)
      selections.svg
        .append("text")
        .attr("class", "axis-label y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("x", 0 - (height / 2 + fm.top))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Weight (KG)");

      // --- Context Chart ---
      selections.contextSvg = selections.contextContainer
        .append("svg")
        .attr("width", contextWidth + cm.left + cm.right)
        .attr("height", contextHeight + cm.top + cm.bottom)
        .attr("aria-hidden", "true");
      selections.context = selections.contextSvg
        .append("g")
        .attr("class", "context")
        .attr("transform", `translate(${cm.left},${cm.top})`);
      selections.contextArea = selections.context
        .append("path")
        .attr("class", "area band-area context-area");
      selections.contextLine = selections.context
        .append("path")
        .attr("class", "line sma-line context-line");
      selections.contextXAxisGroup = selections.context
        .append("g")
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${contextHeight})`);

      // --- Balance Chart ---
      selections.balanceSvg = selections.balanceChartContainer
        .append("svg")
        .attr("width", balanceWidth + bm.left + bm.right)
        .attr("height", balanceHeight + bm.top + bm.bottom)
        .attr("aria-hidden", "true");
      selections.balanceChartArea = selections.balanceSvg
        .append("g")
        .attr("class", "balance-chart-area")
        .attr("transform", `translate(${bm.left},${bm.top})`);
      selections.balanceZeroLine = selections.balanceChartArea
        .append("line")
        .attr("class", "balance-zero-line");
      selections.balanceXAxisGroup = selections.balanceSvg
        .append("g")
        .attr("class", "axis balance-axis balance-axis--x")
        .attr("transform", `translate(${bm.left},${bm.top + balanceHeight})`);
      selections.balanceYAxisGroup = selections.balanceSvg
        .append("g")
        .attr("class", "axis balance-axis balance-axis--y")
        .attr("transform", `translate(${bm.left},${bm.top})`);

      // --- Rate of Change Chart (Feature #5) ---
      if (selections.rateChartContainer) {
        selections.rateSvg = selections.rateChartContainer
          .append("svg")
          .attr("width", rateWidth + rm.left + rm.right)
          .attr("height", rateHeight + rm.top + rm.bottom)
          .attr("aria-hidden", "true");
        selections.rateChartArea = selections.rateSvg
          .append("g")
          .attr("class", "rate-chart-area")
          .attr("transform", `translate(${rm.left},${rm.top})`);
        // Add clip path for rate chart
        selections.rateSvg
          .append("defs")
          .append("clipPath")
          .attr("id", "clip-rate")
          .append("rect")
          .attr("width", rateWidth)
          .attr("height", rateHeight);
        selections.rateChartArea.attr("clip-path", "url(#clip-rate)"); // Apply clip path

        selections.rateZeroLine = selections.rateChartArea
          .append("line")
          .attr("class", "rate-zero-line");
        selections.rateLine = selections.rateChartArea
          .append("path")
          .attr("class", "line rate-line");
        selections.rateXAxisGroup = selections.rateSvg
          .append("g")
          .attr("class", "axis rate-axis rate-axis--x")
          .attr("transform", `translate(${rm.left},${rm.top + rateHeight})`);
        selections.rateYAxisGroup = selections.rateSvg
          .append("g")
          .attr("class", "axis rate-axis rate-axis--y")
          .attr("transform", `translate(${rm.left},${rm.top})`);
        // Y Axis Label for Rate Chart
        selections.rateSvg
          .append("text")
          .attr("class", "axis-label y-axis-label-small")
          .attr("transform", "rotate(-90)")
          .attr("y", 6)
          .attr("x", 0 - (rateHeight / 2 + rm.top))
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .text("Rate (kg/wk)");
      }

      // --- TDEE Difference Chart (Feature #8) ---
      if (selections.tdeeDiffContainer) {
        selections.tdeeDiffSvg = selections.tdeeDiffContainer
          .append("svg")
          .attr("width", tdeeDiffWidth + tdm.left + tdm.right)
          .attr("height", tdeeDiffHeight + tdm.top + tdm.bottom)
          .attr("aria-hidden", "true");
        selections.tdeeDiffChartArea = selections.tdeeDiffSvg
          .append("g")
          .attr("class", "tdee-diff-chart-area")
          .attr("transform", `translate(${tdm.left},${tdm.top})`);
        // Add clip path for tdee diff chart
        selections.tdeeDiffSvg
          .append("defs")
          .append("clipPath")
          .attr("id", "clip-tdee-diff")
          .append("rect")
          .attr("width", tdeeDiffWidth)
          .attr("height", tdeeDiffHeight);
        selections.tdeeDiffChartArea.attr("clip-path", "url(#clip-tdee-diff)"); // Apply clip path

        selections.tdeeDiffZeroLine = selections.tdeeDiffChartArea
          .append("line")
          .attr("class", "tdee-diff-zero-line");
        selections.tdeeDiffLine = selections.tdeeDiffChartArea
          .append("path")
          .attr("class", "line tdee-diff-line");
        selections.tdeeDiffXAxisGroup = selections.tdeeDiffSvg
          .append("g")
          .attr("class", "axis tdee-diff-axis tdee-diff-axis--x")
          .attr(
            "transform",
            `translate(${tdm.left},${tdm.top + tdeeDiffHeight})`,
          );
        selections.tdeeDiffYAxisGroup = selections.tdeeDiffSvg
          .append("g")
          .attr("class", "axis tdee-diff-axis tdee-diff-axis--y")
          .attr("transform", `translate(${tdm.left},${tdm.top})`);
        // Y Axis Label for TDEE Diff Chart
        selections.tdeeDiffSvg
          .append("text")
          .attr("class", "axis-label y-axis-label-small")
          .attr("transform", "rotate(-90)")
          .attr("y", 6)
          .attr("x", 0 - (tdeeDiffHeight / 2 + tdm.top))
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .text("TDEE Diff (kcal)");
      }
    },

    scalesAndAxes() {
      const {
        width,
        height,
        contextWidth,
        contextHeight,
        balanceWidth,
        balanceHeight,
        rateWidth,
        rateHeight,
        tdeeDiffWidth,
        tdeeDiffHeight,
      } = state.dimensions;

      // Existing Scales
      scales.x = d3.scaleTime().range([0, width]);
      scales.y = d3.scaleLinear().range([height, 0]);
      scales.xContext = d3.scaleTime().range([0, contextWidth]);
      scales.yContext = d3.scaleLinear().range([contextHeight, 0]);
      scales.xBalance = d3.scaleTime().range([0, balanceWidth]);
      scales.yBalance = d3.scaleLinear().range([balanceHeight, 0]);

      // New Scales (Features #5, #8)
      scales.xRate = d3.scaleTime().range([0, rateWidth]);
      scales.yRate = d3.scaleLinear().range([rateHeight, 0]);
      scales.xTdeeDiff = d3.scaleTime().range([0, tdeeDiffWidth]);
      scales.yTdeeDiff = d3.scaleLinear().range([tdeeDiffHeight, 0]);

      // Existing Axes
      axes.xAxis = d3
        .axisBottom(scales.x)
        .ticks(Math.max(Math.floor(width / 100), 2))
        .tickFormat(_helpers.formatDateShort);
      axes.yAxis = d3
        .axisLeft(scales.y)
        .ticks(Math.max(Math.floor(height / 40), 5))
        .tickFormat((d) => _helpers.formatValue(d, 1));
      axes.xAxisContext = d3
        .axisBottom(scales.xContext)
        .ticks(Math.max(Math.floor(contextWidth / 100), 2))
        .tickFormat(d3.timeFormat("%b'%y"));
      axes.xBalanceAxis = d3
        .axisBottom(scales.xBalance)
        .ticks(Math.max(Math.floor(balanceWidth / 100), 2))
        .tickFormat(_helpers.formatDateShort);
      axes.yBalanceAxis = d3
        .axisLeft(scales.yBalance)
        .ticks(Math.max(Math.floor(balanceHeight / 25), 3))
        .tickSizeOuter(0)
        .tickFormat((d) => (d === 0 ? "0" : d3.format("+,")(d)));

      // New Axes (Features #5, #8)
      axes.xRateAxis = d3
        .axisBottom(scales.xRate)
        .ticks(Math.max(Math.floor(rateWidth / 100), 2))
        .tickFormat(_helpers.formatDateShort);
      axes.yRateAxis = d3
        .axisLeft(scales.yRate)
        .ticks(Math.max(Math.floor(rateHeight / 30), 3))
        .tickSizeOuter(0)
        .tickFormat((d) => _helpers.formatValue(d, 2)); // Format rate to 2 decimals
      axes.xTdeeDiffAxis = d3
        .axisBottom(scales.xTdeeDiff)
        .ticks(Math.max(Math.floor(tdeeDiffWidth / 100), 2))
        .tickFormat(_helpers.formatDateShort);
      axes.yTdeeDiffAxis = d3
        .axisLeft(scales.yTdeeDiff)
        .ticks(Math.max(Math.floor(tdeeDiffHeight / 30), 3))
        .tickSizeOuter(0)
        .tickFormat(d3.format("+,")); // Show sign for diff
    },

    brush() {
      const { contextWidth, contextHeight } = state.dimensions;
      if (!selections.context || selections.context.empty()) {
        console.error(
          "Context group ('g.context') not found, cannot setup brush.",
        );
        return;
      }
      brush = d3
        .brushX()
        .extent([
          [0, 0],
          [contextWidth, contextHeight],
        ])
        .on("brush end", _handlers.brushed); // Trigger update on brush end

      selections.brushGroup = selections.context
        .append("g")
        .attr("class", "brush")
        .call(brush);
    },

    // --- Feature #3: Direct Chart Interaction (Zoom) ---
    zoom() {
      if (
        !selections.svg ||
        selections.svg.empty() ||
        !scales.x ||
        !scales.xContext
      ) {
        console.error("Cannot setup zoom: SVG or X scales not ready.");
        return;
      }
      const { width, height } = state.dimensions;

      zoom = d3
        .zoom()
        .scaleExtent([0.5, 20]) // Example: Allow zooming from half view to 20x
        .extent([
          [0, 0],
          [width, height],
        ]) // Zoomable area relative to the element zoom is attached to (the zoomCaptureRect)
        .translateExtent([
          [scales.xContext.range()[0], -Infinity],
          [scales.xContext.range()[1], Infinity],
        ]) // Panning limits based on full context range
        .on("zoom", _handlers.zoomed); // Attach the zoom handler

      // Apply the zoom behavior TO THE ZOOM CAPTURE RECTANGLE
      // The zoomCaptureRect is visually behind the focus group but captures events for the zoom behavior.
      if (selections.zoomCaptureRect && !selections.zoomCaptureRect.empty()) {
        selections.zoomCaptureRect.call(zoom);
        console.log("Zoom behavior initialized on zoomCaptureRect.");
      } else {
        console.error(
          "Zoom capture rectangle not found, cannot attach zoom behavior.",
        );
      }
    },
    // --- End Feature #3 ---

    runAll() {
      console.log("Setting up chart elements...");
      if (!_setup.dimensions()) return false;
      _setup.svgElements();
      _setup.scalesAndAxes();
      _setup.brush();
      _setup.zoom(); // Setup zoom AFTER scales/elements are created
      console.log("Chart setup complete.");
      return true;
    },
  };

  // ========================================================================
  // Domain & Initial View (`_domains`)
  // ========================================================================
  const _domains = {
    calculateAndSetFocusY(dataForExtent, regressionPoints) {
      const { height } = state.dimensions;
      let yMin = Infinity,
        yMax = -Infinity;

      const updateExtent = (value) => {
        if (value !== null && !isNaN(value)) {
          yMin = Math.min(yMin, value);
          yMax = Math.max(yMax, value);
        }
      };

      dataForExtent.forEach((d) => {
        // Always consider SMA/bounds for domain calculation, even if hidden,
        // so toggling visibility doesn't cause drastic domain jumps.
        if (d.sma !== null) {
          updateExtent(d.sma);
          // Only consider bounds if SMA is visible (or use wider padding otherwise?)
          // Let's stick to considering them always for consistency when toggling
          updateExtent(d.lowerBound);
          updateExtent(d.upperBound);
        }
        // Only include raw values if visible
        if (state.seriesVisibility.raw) {
          updateExtent(d.value);
        }
      });

      if (
        state.seriesVisibility.regression &&
        state.showRegression &&
        regressionPoints
      ) {
        regressionPoints.forEach((d) => updateExtent(d.regressionValue));
      }

      const trendConfig = _helpers.getTrendlineConfig();
      if (trendConfig.isValid) {
        const currentXDomain = scales.x.domain();
        if (currentXDomain && currentXDomain.length === 2) {
          // Consider trend values potentially slightly outside the view
          const startCheck = d3.timeDay.offset(
            currentXDomain[0],
            -CONFIG.domainBufferDays,
          );
          const endCheck = d3.timeDay.offset(
            currentXDomain[1],
            CONFIG.domainBufferDays,
          );
          const trendCheckDates = d3.timeDays(startCheck, endCheck);

          if (state.seriesVisibility.trend1) {
            trendCheckDates.forEach((date) => {
              const trendVal = _data.calculateTrendWeight(
                trendConfig.startDate,
                trendConfig.initialWeight,
                trendConfig.weeklyIncrease1,
                date,
              );
              updateExtent(trendVal);
            });
          }
          if (state.seriesVisibility.trend2) {
            trendCheckDates.forEach((date) => {
              const trendVal = _data.calculateTrendWeight(
                trendConfig.startDate,
                trendConfig.initialWeight,
                trendConfig.weeklyIncrease2,
                date,
              );
              updateExtent(trendVal);
            });
          }
        }
      }

      if (state.seriesVisibility.goal && state.goal.weight !== null) {
        updateExtent(state.goal.weight);
        // Include the start/end points of the goal line if visible and within X buffer
        const lastDataPointWithWeight = [...state.processedData]
          .reverse()
          .find((d) => d.value !== null || d.sma !== null);
        const currentXDomain = scales.x.domain();
        if (
          lastDataPointWithWeight &&
          currentXDomain &&
          lastDataPointWithWeight.date >=
            d3.timeDay.offset(currentXDomain[0], -CONFIG.domainBufferDays) &&
          lastDataPointWithWeight.date <=
            d3.timeDay.offset(currentXDomain[1], CONFIG.domainBufferDays)
        ) {
          updateExtent(
            lastDataPointWithWeight.value ?? lastDataPointWithWeight.sma,
          );
        }
        // Also check goal date if it exists and is within buffer
        if (
          state.goal.date &&
          currentXDomain &&
          state.goal.date >=
            d3.timeDay.offset(currentXDomain[0], -CONFIG.domainBufferDays) &&
          state.goal.date <=
            d3.timeDay.offset(currentXDomain[1], CONFIG.domainBufferDays)
        ) {
          updateExtent(state.goal.weight);
        }
      }

      // --- FIX: Refined Expected Weight Domain Calculation ---
      if (state.seriesVisibility.expected) {
        const currentXDomain = scales.x.domain();
        const bufferDays = CONFIG.domainBufferDays;
        const viewStartDateBuffered = d3.timeDay.offset(
          currentXDomain[0],
          -bufferDays,
        );
        const viewEndDateBuffered = d3.timeDay.offset(
          currentXDomain[1],
          bufferDays,
        );

        if (
          currentXDomain &&
          currentXDomain.length === 2 &&
          state.processedData.length > 0
        ) {
          // Find the absolute first valid anchor point in all data
          let startingWeight = null,
            startingWeightIndex = -1;
          for (let i = 0; i < state.processedData.length; i++) {
            const d = state.processedData[i];
            // Need an initial weight AND a valid change value eventually to start
            if (d.value !== null || d.sma !== null) {
              // Simpler start: first point with any weight
              startingWeight = d.value ?? d.sma;
              startingWeightIndex = i;
              break;
            }
          }

          if (startingWeight !== null && startingWeightIndex !== -1) {
            let cumulativeChangeUpToPoint = 0;
            // Include starting point if it's in the buffered view
            if (
              state.processedData[startingWeightIndex].date >=
                viewStartDateBuffered &&
              state.processedData[startingWeightIndex].date <=
                viewEndDateBuffered
            ) {
              updateExtent(startingWeight);
            }

            // Iterate through ALL processed data to calculate cumulative change accurately *up to* points in view
            for (
              let i = startingWeightIndex + 1;
              i < state.processedData.length;
              i++
            ) {
              const d = state.processedData[i];

              // Accumulate change regardless of whether the point is in view
              if (
                d.expectedWeightChange !== null &&
                !isNaN(d.expectedWeightChange)
              ) {
                cumulativeChangeUpToPoint += d.expectedWeightChange;
              } else {
                // If expected change is null, the line should ideally be discontinuous or hold previous value.
                // For domain calculation, we'll just skip updating based on this point's cumulative value if the change was null.
                // This prevents propagation of 'NaN' or 'null' into the cumulative sum.
                // Continue the loop to accumulate future valid changes.
              }

              // ***ONLY update extent if the CURRENT point 'd' is within the view buffer***
              if (
                d.date >= viewStartDateBuffered &&
                d.date <= viewEndDateBuffered
              ) {
                // Only calculate and update extent if the change component *for this point* was valid
                if (
                  d.expectedWeightChange !== null &&
                  !isNaN(d.expectedWeightChange)
                ) {
                  const expectedValueAtD =
                    startingWeight + cumulativeChangeUpToPoint;
                  updateExtent(expectedValueAtD);
                }
                // If change was null, expectedValueAtD would be based on previous cumulative sum,
                // which might still be relevant if the point is in view. Let's update always if in view.
                const expectedValueAtD =
                  startingWeight + cumulativeChangeUpToPoint;
                updateExtent(expectedValueAtD); // Update extent even if this specific point's change was null, using the last valid cumulative sum.
              }

              // Optimization: Stop if we're way past the view, no need to keep accumulating
              if (
                d.date > viewEndDateBuffered &&
                i > startingWeightIndex + 50
              ) {
                break; // More generous break condition
              }
            }
          }
        }
      }
      // --- END FIX ---

      // Final checks and padding
      if (
        yMin === Infinity ||
        yMax === -Infinity ||
        isNaN(yMin) ||
        isNaN(yMax)
      ) {
        const contextDomain = scales.yContext?.domain();
        if (
          contextDomain &&
          contextDomain.length === 2 &&
          !isNaN(contextDomain[0]) &&
          !isNaN(contextDomain[1])
        ) {
          [yMin, yMax] = contextDomain;
        } else {
          [yMin, yMax] = [60, 80]; // Absolute fallback
        }
        console.warn("Using fallback Y domain for focus chart:", [yMin, yMax]);
      } else if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
      } else {
        // Apply padding based on CONFIG
        const padding = Math.max(
          CONFIG.yAxisMinPaddingKg, // Use updated min padding
          (yMax - yMin) * CONFIG.yAxisPaddingFactor, // Use updated factor
        );
        yMin -= padding;
        yMax += padding;
      }

      scales.y.domain([yMin, yMax]).nice(Math.max(Math.floor(height / 40), 5));
    },

    initialize() {
      const fullDataExtent = d3.extent(state.processedData, (d) => d.date);

      if (!fullDataExtent[0] || !fullDataExtent[1]) {
        console.warn("No valid date range in data. Using fallback domains.");
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const fallbackDomain = [yesterday, today];
        scales.x.domain(fallbackDomain);
        scales.y.domain([60, 80]);
        scales.xContext.domain(fallbackDomain);
        scales.yContext.domain([60, 80]);
        scales.xBalance.domain(fallbackDomain);
        scales.xRate?.domain(fallbackDomain); // Feature #5
        scales.xTdeeDiff?.domain(fallbackDomain); // Feature #8
        if (selections.brushGroup?.node())
          selections.brushGroup.call(brush.move, null);
        state.lastZoomTransform = null; // Feature #3: Reset zoom transform
        return;
      }

      scales.xContext.domain(fullDataExtent);

      // Use SMA bounds for context Y domain if SMA is visible, otherwise use raw values
      const dataForContextY = state.seriesVisibility.sma
        ? state.processedData.filter((d) => d.sma !== null)
        : state.processedData.filter((d) => d.value !== null);
      let yContextMin = d3.min(dataForContextY, (d) =>
        state.seriesVisibility.sma ? d.lowerBound : d.value,
      );
      let yContextMax = d3.max(dataForContextY, (d) =>
        state.seriesVisibility.sma ? d.upperBound : d.value,
      );

      if (
        yContextMin === undefined ||
        yContextMax === undefined ||
        isNaN(yContextMin) ||
        isNaN(yContextMax)
      ) {
        // Fallback if min/max can't be determined (e.g., only one point)
        yContextMin = d3.min(state.processedData, (d) => d.value ?? d.sma);
        yContextMax = d3.max(state.processedData, (d) => d.value ?? d.sma);
        if (
          yContextMin === undefined ||
          yContextMax === undefined ||
          isNaN(yContextMin) ||
          isNaN(yContextMax)
        ) {
          yContextMin = 60;
          yContextMax = 80; // Final fallback
        }
      }
      if (yContextMin === yContextMax) {
        yContextMin -= 1;
        yContextMax += 1;
      }
      const yPaddingFull = Math.max(0.5, (yContextMax - yContextMin) * 0.05);
      scales.yContext
        .domain([yContextMin - yPaddingFull, yContextMax + yPaddingFull])
        .nice();

      // Set initial focus view
      const initialEndDate = fullDataExtent[1];
      const initialStartDateDefault = new Date(initialEndDate);
      initialStartDateDefault.setMonth(
        initialStartDateDefault.getMonth() - CONFIG.initialViewMonths,
      );
      const initialStartDate =
        initialStartDateDefault < fullDataExtent[0]
          ? fullDataExtent[0]
          : initialStartDateDefault;

      scales.x.domain([initialStartDate, initialEndDate]);
      scales.xBalance.domain(scales.x.domain());
      scales.xRate?.domain(scales.x.domain()); // Feature #5
      scales.xTdeeDiff?.domain(scales.x.domain()); // Feature #8

      const initialVisibleData = state.processedData.filter(
        (d) => d.date >= initialStartDate && d.date <= initialEndDate,
      );
      state.regressionStartDate = _helpers.getRegressionStartDateFromUI(); // Get initial regression start date
      const initialRegression = _data.calculateLinearRegression(
        initialVisibleData.filter((d) => !d.isOutlier && d.value !== null),
        state.regressionStartDate,
      );
      _domains.calculateAndSetFocusY(
        initialVisibleData,
        initialRegression.points,
      );

      // Set initial brush and zoom (Feature #3)
      const initialBrushPixels = [
        scales.xContext(initialStartDate),
        scales.xContext(initialEndDate),
      ];
      if (!isNaN(initialBrushPixels[0]) && !isNaN(initialBrushPixels[1])) {
        const k =
          scales.xContext.range()[1] /
          (initialBrushPixels[1] - initialBrushPixels[0]);
        const tx = -initialBrushPixels[0] * k;
        state.lastZoomTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
      } else {
        state.lastZoomTransform = d3.zoomIdentity; // Fallback if calculation fails
        console.warn("Could not calculate initial brush pixels accurately.");
      }

      // Move brush and update zoom state AFTER potential DOM rendering delays
      setTimeout(() => {
        if (
          selections.brushGroup?.node() &&
          brush &&
          !isNaN(initialBrushPixels[0]) &&
          !isNaN(initialBrushPixels[1])
        ) {
          selections.brushGroup.call(brush.move, initialBrushPixels);
        } else {
          console.warn("Could not initialize brush position after timeout.");
          if (selections.brushGroup?.node() && brush) {
            selections.brushGroup.call(brush.move, null); // Clear brush if failed
          }
        }
        // Also set the initial zoom transform on the capture rectangle AFTER brush move
        if (
          selections.zoomCaptureRect &&
          !selections.zoomCaptureRect.empty() &&
          zoom &&
          state.lastZoomTransform
        ) {
          selections.zoomCaptureRect.call(
            zoom.transform,
            state.lastZoomTransform,
          );
        } else {
          console.warn("Could not set initial zoom transform after timeout.");
        }
      }, 0);

      _handlers.updateAnalysisRangeInputsFromCurrentView();
      _handlers.updateAnalysisRangeDisplay();
    },
  };

  // ========================================================================
  // Chart Update Functions (`_update`)
  // ========================================================================
  const _update = {
    domainsAndAxes() {
      const currentXDomain = scales.x.domain();
      if (
        !Array.isArray(currentXDomain) ||
        currentXDomain.length !== 2 ||
        !(currentXDomain[0] instanceof Date) ||
        !(currentXDomain[1] instanceof Date) ||
        isNaN(currentXDomain[0].getTime()) ||
        isNaN(currentXDomain[1].getTime())
      ) {
        console.warn(
          "Invalid X domain detected, skipping Y domain and axis update.",
          currentXDomain,
        );
        return;
      }

      // Filter data first
      const visibleProcessedData = state.processedData.filter(
        (d) => d.date >= currentXDomain[0] && d.date <= currentXDomain[1],
      );
      state.filteredData = visibleProcessedData; // Update filtered data state

      // Recalculate regression for Y domain calculation
      state.regressionStartDate = _helpers.getRegressionStartDateFromUI();
      const visibleNonOutlierValueData = visibleProcessedData.filter(
        (d) => d.value !== null && !d.isOutlier,
      );
      const regression = _data.calculateLinearRegression(
        visibleNonOutlierValueData,
        state.regressionStartDate,
      );

      // Recalculate Y domain for focus chart (Uses reduced padding now and corrected expected logic)
      _domains.calculateAndSetFocusY(visibleProcessedData, regression.points);

      // Sync X domains of secondary charts
      scales.xBalance.domain(currentXDomain);
      if (scales.xRate) scales.xRate.domain(currentXDomain); // Feature #5
      if (scales.xTdeeDiff) scales.xTdeeDiff.domain(currentXDomain); // Feature #8

      const { width, height } = state.dimensions;
      const dur = CONFIG.transitionDurationMs;

      // Update main axes
      selections.xAxisGroup?.transition().duration(dur).call(axes.xAxis);
      selections.yAxisGroup?.transition().duration(dur).call(axes.yAxis);
      selections.gridGroup
        ?.transition()
        .duration(dur)
        .call(
          d3
            .axisLeft(scales.y)
            .tickSize(-width)
            .tickFormat("")
            .ticks(Math.max(Math.floor(height / 40), 5)),
        );
      selections.gridGroup?.selectAll(".domain").remove(); // Remove axis line from grid
      selections.contextXAxisGroup?.call(axes.xAxisContext); // No transition needed

      // Update balance chart axes
      selections.balanceXAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.xBalanceAxis);
      // Balance Y domain updated in _update.balanceChart

      // Update rate chart axes (Feature #5)
      if (
        axes.xRateAxis &&
        axes.yRateAxis &&
        selections.rateXAxisGroup &&
        selections.rateYAxisGroup
      ) {
        selections.rateXAxisGroup
          .transition()
          .duration(dur)
          .call(axes.xRateAxis);
        // Rate Y domain updated in _update.rateOfChangeChart
        selections.rateYAxisGroup.select(".domain").remove();
      }

      // Update TDEE diff chart axes (Feature #8)
      if (
        axes.xTdeeDiffAxis &&
        axes.yTdeeDiffAxis &&
        selections.tdeeDiffXAxisGroup &&
        selections.tdeeDiffYAxisGroup
      ) {
        selections.tdeeDiffXAxisGroup
          .transition()
          .duration(dur)
          .call(axes.xTdeeDiffAxis);
        // TDEE Diff Y domain updated in _update.tdeeDifferenceChart
        selections.tdeeDiffYAxisGroup.select(".domain").remove();
      }
    },

    chartPaths(visibleValidSmaData, regressionPoints) {
      const dur = CONFIG.transitionDurationMs;
      if (!scales.x || !scales.y || !selections.chartArea) return;

      // Area for SMA band
      const areaGenerator = d3
        .area()
        .x((d) => scales.x(d.date))
        .y0((d) => scales.y(d.lowerBound))
        .y1((d) => scales.y(d.upperBound))
        .curve(d3.curveMonotoneX)
        .defined(
          (d) =>
            d.lowerBound !== null && d.upperBound !== null && d.sma !== null,
        ); // Ensure sma is also defined for bounds

      // Line for SMA
      const lineGenerator = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.sma))
        .curve(d3.curveMonotoneX)
        .defined((d) => d.sma !== null);

      // Line for Regression
      const regressionLineGenerator = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.regressionValue))
        .defined(
          (d) => d.regressionValue !== null && !isNaN(d.regressionValue),
        );

      const showSma = state.seriesVisibility.sma;
      const showReg = state.seriesVisibility.regression && state.showRegression;

      // Update SMA band and line
      selections.bandArea
        ?.datum(showSma ? visibleValidSmaData : [])
        .transition()
        .duration(dur)
        .style("display", showSma ? null : "none")
        .attr("d", areaGenerator);
      selections.smaLine
        ?.datum(showSma ? visibleValidSmaData : [])
        .transition()
        .duration(dur)
        .style("display", showSma ? null : "none")
        .attr("d", lineGenerator);

      // Update Regression line
      selections.regressionLine
        ?.datum(showReg ? regressionPoints : [])
        .transition()
        .duration(dur)
        .style("display", showReg ? null : "none")
        .attr("d", regressionLineGenerator);

      // Update other lines
      _update.manualTrendlines();
      _update.goalLine();
      _update.expectedWeightLine(); // Doesn't strictly need filtered data passed
    },

    chartDots(visibleRawWeightData) {
      // Combined raw & SMA dots logic based on visibility
      const dur = CONFIG.transitionDurationMs;
      if (
        !scales.x ||
        !scales.y ||
        !selections.rawDotsGroup ||
        !selections.smaDotsGroup ||
        !selections.highlightGroup
      ) {
        console.error(
          "Missing scales or dot/highlight groups for chartDots update.",
        );
        return;
      }

      const showRaw = state.seriesVisibility.raw;
      const showSmaDots = state.seriesVisibility.sma; // Use smaDotsGroup for interactive points if SMA is visible

      // --- Raw Data Dots (Visual only if raw is toggled on) ---
      selections.rawDotsGroup.style("display", showRaw ? null : "none");
      const rawDots = selections.rawDotsGroup
        .selectAll(".raw-dot")
        .data(
          showRaw ? visibleRawWeightData.filter((d) => d.value !== null) : [],
          (d) => d.date,
        );

      rawDots.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "raw-dot")
            .attr("r", CONFIG.rawDotRadius)
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value))
            .style("opacity", 0)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.4),
            ),
        (update) =>
          update.call((update) =>
            update
              .transition()
              .duration(dur)
              .attr("cx", (d) => scales.x(d.date))
              .attr("cy", (d) => scales.y(d.value))
              .style("opacity", 0.4),
          ),
        (exit) => exit.transition().duration(dur).style("opacity", 0).remove(),
      );

      // --- SMA Data Dots (Interactive dots for tooltips, highlighting - represent the raw values but visibility tied to SMA) ---
      // Data is always the raw weight data, but the group visibility depends on SMA series toggle
      selections.smaDotsGroup.style("display", showSmaDots ? null : "none");
      const smaDotsData = showSmaDots
        ? visibleRawWeightData.filter((d) => d.value !== null)
        : []; // Only create dots if SMA is visible

      const smaDots = selections.smaDotsGroup
        .selectAll(".dot")
        .data(smaDotsData, (d) => d.date); // Key by date

      smaDots.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", (d) => `dot ${d.isOutlier ? "outlier" : ""}`)
            .classed(
              "highlighted",
              (d) =>
                state.highlightedDate &&
                d.date.getTime() === state.highlightedDate.getTime(),
            ) // Feature #4
            .attr("r", CONFIG.dotRadius)
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value)) // Position at the raw value
            .style("opacity", 0)
            .on("mouseover", _handlers.mouseOver) // Attach handlers
            .on("mouseout", _handlers.mouseOut)
            .on("click", (event, d) => _handlers.statDateClick(d.date)) // Feature #4 click
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.7),
            ), // Fade in
        (update) =>
          update
            .attr("class", (d) => `dot ${d.isOutlier ? "outlier" : ""}`) // Update class for outliers
            .classed(
              "highlighted",
              (d) =>
                state.highlightedDate &&
                d.date.getTime() === state.highlightedDate.getTime(),
            ) // Feature #4
            .call((update) =>
              update
                .transition()
                .duration(dur)
                .attr("cx", (d) => scales.x(d.date))
                .attr("cy", (d) => scales.y(d.value))
                .attr("r", (d) =>
                  state.highlightedDate &&
                  d.date.getTime() === state.highlightedDate.getTime()
                    ? CONFIG.dotRadius * 1.2
                    : CONFIG.dotRadius,
                ) // Slightly larger if highlighted
                .style("opacity", (d) =>
                  state.highlightedDate &&
                  d.date.getTime() === state.highlightedDate.getTime()
                    ? 1
                    : 0.7,
                ),
            ), // Ensure opacity
        (exit) => exit.transition().duration(dur).style("opacity", 0).remove(),
      );

      // --- Highlight Marker (Feature #4) ---
      const highlightData = state.highlightedDate
        ? visibleRawWeightData.find(
            (d) => d.date.getTime() === state.highlightedDate.getTime(),
          )
        : null;

      const highlightMarker = selections.highlightGroup
        .selectAll(".highlight-marker")
        .data(highlightData ? [highlightData] : [], (d) => d.date); // Use date as key

      highlightMarker.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "highlight-marker")
            .attr("r", 0) // Start small
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value)) // Use actual value for position
            .style("fill", "none")
            .style("stroke", colors.highlightStroke)
            .style("stroke-width", "2.5px")
            .style("opacity", 0)
            .call((enter) =>
              enter
                .transition()
                .duration(dur * 0.8) // Slightly faster transition
                .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
                .style("opacity", 0.8),
            ),
        (update) =>
          update.call(
            (update) =>
              update
                .transition()
                .duration(dur)
                .attr("cx", (d) => scales.x(d.date))
                .attr("cy", (d) => scales.y(d.value))
                .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier) // Ensure size
                .style("opacity", 0.8), // Ensure opacity
          ),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2) // Faster exit
            .attr("r", 0)
            .style("opacity", 0)
            .remove(),
      );
    },

    contextChart() {
      if (
        !scales.xContext ||
        !scales.yContext ||
        !selections.contextArea ||
        !selections.contextLine
      ) {
        console.error("Missing scales or paths for contextChart update.");
        return;
      }
      // Use all data for the context chart
      const allValidSmaData = state.processedData.filter((d) => d.sma !== null);

      const contextAreaGenerator = d3
        .area()
        .curve(d3.curveMonotoneX)
        .x((d) => scales.xContext(d.date))
        .y0((d) => scales.yContext(d.lowerBound ?? d.sma)) // Fallback to sma if bounds missing
        .y1((d) => scales.yContext(d.upperBound ?? d.sma))
        .defined((d) => d.sma !== null);

      const contextLineGenerator = d3
        .line()
        .curve(d3.curveMonotoneX)
        .x((d) => scales.xContext(d.date))
        .y((d) => scales.yContext(d.sma))
        .defined((d) => d.sma !== null);

      selections.contextArea
        ?.datum(allValidSmaData) // Use optional chaining
        .attr("d", contextAreaGenerator);
      selections.contextLine
        ?.datum(allValidSmaData)
        .attr("d", contextLineGenerator);
    },

    manualTrendlines() {
      if (
        !selections.trendLine1 ||
        !selections.trendLine2 ||
        !scales.x ||
        !scales.y
      )
        return;
      const config = _helpers.getTrendlineConfig();
      const dur = CONFIG.transitionDurationMs;
      const showTrend1 = state.seriesVisibility.trend1;
      const showTrend2 = state.seriesVisibility.trend2;

      if (!config.isValid || (!showTrend1 && !showTrend2)) {
        selections.trendLine1?.style("display", "none").attr("d", null);
        selections.trendLine2?.style("display", "none").attr("d", null);
        return;
      }

      const currentXDomain = scales.x.domain();
      if (
        !currentXDomain ||
        currentXDomain.length !== 2 ||
        !(currentXDomain[0] instanceof Date) ||
        !(currentXDomain[1] instanceof Date) ||
        isNaN(currentXDomain[0].getTime()) ||
        isNaN(currentXDomain[1].getTime())
      ) {
        selections.trendLine1?.style("display", "none").attr("d", null);
        selections.trendLine2?.style("display", "none").attr("d", null);
        return;
      }

      // Calculate trend points slightly beyond the view for smoother panning/zooming
      const buffer = CONFIG.domainBufferDays * 86400000; // Convert days to ms
      const viewStartDate = new Date(currentXDomain[0].getTime() - buffer);
      const viewEndDate = new Date(currentXDomain[1].getTime() + buffer);

      const trendPoints = [viewStartDate, viewEndDate]; // Start and end points define the line

      const trendData1 = showTrend1
        ? trendPoints
            .map((date) => ({
              date: date,
              trendWeight: _data.calculateTrendWeight(
                config.startDate,
                config.initialWeight,
                config.weeklyIncrease1,
                date,
              ),
            }))
            .filter((d) => d.trendWeight !== null && !isNaN(d.trendWeight))
        : [];

      const trendData2 = showTrend2
        ? trendPoints
            .map((date) => ({
              date: date,
              trendWeight: _data.calculateTrendWeight(
                config.startDate,
                config.initialWeight,
                config.weeklyIncrease2,
                date,
              ),
            }))
            .filter((d) => d.trendWeight !== null && !isNaN(d.trendWeight))
        : [];

      const trendLineGenerator = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.trendWeight))
        .defined((d) => d.trendWeight !== null && !isNaN(d.trendWeight));

      selections.trendLine1
        ?.datum(trendData1.length >= 2 ? trendData1 : [])
        .transition()
        .duration(dur)
        .style("display", showTrend1 && trendData1.length >= 2 ? null : "none")
        .attr("d", trendLineGenerator);

      selections.trendLine2
        ?.datum(trendData2.length >= 2 ? trendData2 : [])
        .transition()
        .duration(dur)
        .style("display", showTrend2 && trendData2.length >= 2 ? null : "none")
        .attr("d", trendLineGenerator);
    },

    goalLine() {
      if (!selections.goalLine || !scales.x || !scales.y) return;
      const dur = CONFIG.transitionDurationMs;
      const showGoal = state.seriesVisibility.goal;

      if (!state.goal.weight || !showGoal) {
        selections.goalLine.style("display", "none").attr("d", null);
        return;
      }

      // Find the latest data point (SMA or raw) to start the goal line from
      const lastDataPoint = [...state.processedData]
        .reverse()
        .find((d) => d.value !== null || d.sma !== null);
      if (!lastDataPoint) {
        selections.goalLine.style("display", "none").attr("d", null);
        return;
      }

      const startWeight = lastDataPoint.value ?? lastDataPoint.sma;
      const startDate = lastDataPoint.date;
      let goalDate = state.goal.date;

      // If no goal date, project it forward based on current view or a fixed duration
      if (!goalDate || isNaN(goalDate.getTime())) {
        const currentXDomain = scales.x.domain();
        const fallbackEndDate = new Date(
          currentXDomain[1].getTime() + 60 * 86400000,
        ); // Project 60 days out
        goalDate = fallbackEndDate; // Use a calculated end date
      }

      // Ensure goal date is after start date
      if (goalDate < startDate) {
        selections.goalLine.style("display", "none").attr("d", null);
        return;
      }

      const goalLineData = [
        { date: startDate, value: startWeight },
        { date: goalDate, value: state.goal.weight },
      ];

      const goalLineGenerator = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.value))
        .defined((d) => d.value !== null && !isNaN(d.value));

      selections.goalLine
        .datum(goalLineData)
        .transition()
        .duration(dur)
        .style("display", null)
        .attr("d", goalLineGenerator);
    },

    expectedWeightLine() {
      if (!selections.expectedLine || !scales.x || !scales.y) return;
      const dur = CONFIG.transitionDurationMs;
      const showExpected = state.seriesVisibility.expected;

      if (!showExpected || state.processedData.length === 0) {
        selections.expectedLine.style("display", "none").attr("d", null);
        return;
      }

      // Find the absolute first valid anchor point in all data
      let startingWeight = null,
        startingWeightIndex = -1,
        startingDate = null;
      for (let i = 0; i < state.processedData.length; i++) {
        const d = state.processedData[i];
        // Simpler start condition: First point with a weight value (SMA or raw)
        if (d.value !== null || d.sma !== null) {
          startingWeight = d.value ?? d.sma;
          startingWeightIndex = i;
          startingDate = d.date;
          break;
        }
      }

      if (startingWeight === null || startingWeightIndex === -1) {
        console.warn(
          "Could not find suitable starting point for expected weight line.",
        );
        selections.expectedLine.style("display", "none").attr("d", null);
        return;
      }

      let cumulativeExpectedChange = 0;
      const expectedWeightData = [];
      expectedWeightData.push({
        date: startingDate,
        expectedValue: startingWeight,
      }); // Anchor point

      for (
        let i = startingWeightIndex + 1;
        i < state.processedData.length;
        i++
      ) {
        const currentPoint = state.processedData[i];
        // Only add points if there was an expected change calculated for them AND it's valid
        if (
          currentPoint.expectedWeightChange !== null &&
          !isNaN(currentPoint.expectedWeightChange)
        ) {
          cumulativeExpectedChange += currentPoint.expectedWeightChange;
          expectedWeightData.push({
            date: currentPoint.date,
            expectedValue: startingWeight + cumulativeExpectedChange,
          });
        } else {
          // If change is null/NaN, continue the line flat from the last valid point.
          // Add a point with the same cumulative change as the previous valid one.
          if (expectedWeightData.length > 0) {
            const lastValidExpectedValue =
              expectedWeightData[expectedWeightData.length - 1].expectedValue;
            expectedWeightData.push({
              date: currentPoint.date,
              expectedValue: lastValidExpectedValue, // Use the last known good value
            });
          }
        }
      }

      const expectedLineGenerator = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.expectedValue))
        .defined((d) => d.expectedValue !== null && !isNaN(d.expectedValue));

      selections.expectedLine
        .datum(expectedWeightData)
        .transition()
        .duration(dur)
        .style(
          "display",
          showExpected && expectedWeightData.length > 1 ? null : "none",
        )
        .attr("d", expectedLineGenerator);
    },

    balanceChart(visibleData) {
      const { balanceWidth, balanceHeight } = state.dimensions;
      const dur = CONFIG.transitionDurationMs;
      if (
        !scales.xBalance ||
        !scales.yBalance ||
        !axes.yBalanceAxis ||
        !selections.balanceChartArea ||
        !selections.balanceZeroLine ||
        !selections.balanceYAxisGroup ||
        !visibleData
      ) {
        if (selections.balanceChartArea)
          selections.balanceChartArea.selectAll(".balance-bar").remove();
        return;
      }

      const balanceData = visibleData.filter(
        (d) => d.netBalance !== null && !isNaN(d.netBalance),
      );

      // Update Y domain based on visible data
      if (balanceData.length > 0) {
        const yExtent = d3.extent(balanceData, (d) => d.netBalance);
        const minVal = yExtent[0] ?? 0;
        const maxVal = yExtent[1] ?? 0;
        const range = Math.max(Math.abs(minVal), Math.abs(maxVal)); // Use max absolute value for symmetric padding
        const padding = Math.max(100, range * 0.15);
        const yMin = Math.min(0, minVal) - padding;
        const yMax = Math.max(0, maxVal) + padding;
        scales.yBalance
          .domain([yMin, yMax])
          .nice(Math.max(Math.floor(balanceHeight / 25), 3));
      } else {
        scales.yBalance.domain([-500, 500]).nice(); // Default if no data
      }

      // Update Y axis
      selections.balanceYAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.yBalanceAxis);
      selections.balanceYAxisGroup?.select(".domain").remove();

      // Update zero line
      const yZero = scales.yBalance(0);
      if (!isNaN(yZero) && isFinite(yZero)) {
        selections.balanceZeroLine
          .transition()
          .duration(dur)
          .attr("x1", 0)
          .attr("x2", balanceWidth)
          .attr("y1", yZero)
          .attr("y2", yZero)
          .style("opacity", 0.7);
      } else {
        selections.balanceZeroLine.style("opacity", 0);
      }

      // Calculate dynamic bar width
      let barWidth = 2;
      const xDomain = scales.xBalance.domain();
      if (
        balanceData.length > 1 &&
        xDomain.length === 2 &&
        xDomain[1] > xDomain[0]
      ) {
        const totalVisibleDays =
          (xDomain[1].getTime() - xDomain[0].getTime()) / 86400000;
        if (totalVisibleDays > 0) {
          const widthPerDay = balanceWidth / totalVisibleDays;
          barWidth = Math.max(1, Math.min(15, widthPerDay * 0.7)); // Clamp width
        }
      }

      // Update bars
      const bars = selections.balanceChartArea
        .selectAll(".balance-bar")
        .data(balanceData, (d) => d.date);

      bars.join(
        (enter) =>
          enter
            .append("rect")
            .attr(
              "class",
              (d) => `balance-bar ${d.netBalance >= 0 ? "surplus" : "deficit"}`,
            )
            .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
            .attr("width", barWidth)
            .attr("y", yZero)
            .attr("height", 0)
            .style("opacity", 0)
            .call((enter) =>
              enter
                .transition()
                .duration(dur)
                .attr("y", (d) =>
                  d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
                )
                .attr("height", (d) =>
                  Math.abs(scales.yBalance(d.netBalance) - yZero),
                )
                .style("opacity", 0.8),
            ),
        (update) =>
          update.call((update) =>
            update
              .transition()
              .duration(dur)
              .attr(
                "class",
                (d) =>
                  `balance-bar ${d.netBalance >= 0 ? "surplus" : "deficit"}`,
              )
              .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
              .attr("width", barWidth)
              .attr("y", (d) =>
                d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
              )
              .attr("height", (d) =>
                Math.abs(scales.yBalance(d.netBalance) - yZero),
              )
              .style("opacity", 0.8),
          ),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .attr("height", 0)
            .attr("y", yZero)
            .style("opacity", 0)
            .remove(),
      );
    },

    // --- Feature #1: Update Annotations ---
    annotations(visibleData) {
      // Pass visible data to potentially link annotations
      if (!selections.annotationsGroup || !scales.x || !scales.y) return;
      const dur = CONFIG.transitionDurationMs;
      const showAnnotations = state.seriesVisibility.annotations;

      selections.annotationsGroup.style(
        "display",
        showAnnotations ? null : "none",
      );
      if (!showAnnotations) return;

      const currentXDomain = scales.x.domain();
      const visibleAnnotations = state.annotations.filter((ann) => {
        const annDate = new Date(ann.date); // Use single date for now
        return annDate >= currentXDomain[0] && annDate <= currentXDomain[1];
      });

      const markers = selections.annotationsGroup
        .selectAll(".annotation-marker")
        .data(visibleAnnotations, (d) => d.id); // Use annotation id as key

      markers.join(
        (enter) => {
          const group = enter.append("g").attr("class", "annotation-marker");
          // Simple circle marker for now
          group
            .append("circle")
            .attr("r", CONFIG.annotationMarkerRadius)
            .attr("cx", (d) => scales.x(new Date(d.date)))
            .attr("cy", (d) => {
              // Position near the weight line on that date
              const dataPoint = state.processedData.find(
                (p) => p.date.getTime() === new Date(d.date).getTime(),
              );
              // Find the Y value: SMA preferred, then raw value, fallback to top 10% of chart
              const yValue =
                dataPoint?.sma ??
                dataPoint?.value ??
                scales.y.domain()[1] -
                  (scales.y.domain()[1] - scales.y.domain()[0]) * 0.1;
              return scales.y(yValue);
            })
            .style("fill", colors.annotationMarker)
            .style("stroke", "white")
            .style("stroke-width", 1)
            .style("opacity", 0)
            .transition()
            .duration(dur)
            .style("opacity", 0.8);

          // Add simple line to axis? Or just tooltip
          group
            .on("mouseover", _handlers.annotationMouseOver)
            .on("mouseout", _handlers.annotationMouseOut);

          return group;
        },
        (update) => {
          update
            .select("circle")
            .transition()
            .duration(dur)
            .attr("cx", (d) => scales.x(new Date(d.date)))
            .attr("cy", (d) => {
              const dataPoint = state.processedData.find(
                (p) => p.date.getTime() === new Date(d.date).getTime(),
              );
              const yValue =
                dataPoint?.sma ??
                dataPoint?.value ??
                scales.y.domain()[1] -
                  (scales.y.domain()[1] - scales.y.domain()[0]) * 0.1;
              return scales.y(yValue);
            })
            .style("opacity", 0.8); // Ensure opacity
          return update;
        },
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .remove(),
      );

      // Placeholder for Range annotations (Rects) - more complex
    },

    // --- Feature #6: Update Plateau Regions ---
    plateauRegions() {
      if (!selections.plateauGroup || !scales.x || !scales.y) return;
      const dur = CONFIG.transitionDurationMs;
      const showPlateaus = state.seriesVisibility.plateaus;

      selections.plateauGroup.style("display", showPlateaus ? null : "none");
      if (!showPlateaus) return;

      const currentXDomain = scales.x.domain();
      // Filter plateaus detected on the *full* dataset, to show only those overlapping the current view
      const visiblePlateaus = state.plateaus.filter(
        (p) =>
          p.endDate >= currentXDomain[0] && p.startDate <= currentXDomain[1],
      );

      const plateauRects = selections.plateauGroup
        .selectAll(".plateau-region")
        .data(visiblePlateaus, (d) => d.startDate.getTime()); // Use start date as key

      plateauRects.join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "plateau-region")
            .attr("x", (p) => scales.x(p.startDate))
            .attr("y", 0) // Top of chart area
            .attr("width", (p) =>
              Math.max(0, scales.x(p.endDate) - scales.x(p.startDate)),
            )
            .attr("height", state.dimensions.height)
            .style("fill", colors.plateauColor)
            .style("opacity", 0)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.6),
            ),
        (update) =>
          update.call((update) =>
            update
              .transition()
              .duration(dur)
              .attr("x", (p) => scales.x(p.startDate))
              .attr("width", (p) =>
                Math.max(0, scales.x(p.endDate) - scales.x(p.startDate)),
              )
              .style("opacity", 0.6),
          ),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .remove(),
      );
    },

    // --- Feature #7: Update Trend Change Markers ---
    trendChangeMarkers() {
      if (!selections.trendChangeGroup || !scales.x || !scales.y) return;
      const dur = CONFIG.transitionDurationMs;
      const showChanges = state.seriesVisibility.trendChanges;

      selections.trendChangeGroup.style("display", showChanges ? null : "none");
      if (!showChanges) return;

      const currentXDomain = scales.x.domain();
      // Filter trend changes detected on the *full* dataset
      const visibleChanges = state.trendChangePoints.filter(
        (p) => p.date >= currentXDomain[0] && p.date <= currentXDomain[1],
      );

      const changeMarkers = selections.trendChangeGroup
        .selectAll(".trend-change-marker")
        .data(visibleChanges, (d) => d.date.getTime());

      changeMarkers.join(
        (enter) => {
          const group = enter.append("g").attr("class", "trend-change-marker");
          // Simple triangle marker
          group
            .append("path")
            .attr("d", d3.symbol().type(d3.symbolTriangle).size(36)) // Small triangle
            .attr("transform", (d) => {
              const dataPoint = state.processedData.find(
                (p) => p.date.getTime() === d.date.getTime(),
              );
              // Position slightly above/below the SMA/value line
              const yPosBase = scales.y(
                dataPoint?.sma ?? dataPoint?.value ?? scales.y.domain()[0],
              ); // Position near line, fallback top
              const yOffset = d.magnitude > 0 ? -8 : 8; // Place above for accel, below for decel
              const yPos = yPosBase + yOffset;
              return `translate(${scales.x(d.date)}, ${yPos}) rotate(${d.magnitude > 0 ? 0 : 180})`; // Point up for increase, down for decrease
            })
            .style("fill", colors.trendChangeColor)
            .style("opacity", 0)
            .transition()
            .duration(dur)
            .style("opacity", 0.8);

          group
            .on("mouseover", _handlers.trendChangeMouseOver)
            .on("mouseout", _handlers.trendChangeMouseOut);
          return group;
        },
        (update) => {
          update
            .select("path")
            .transition()
            .duration(dur)
            .attr("transform", (d) => {
              const dataPoint = state.processedData.find(
                (p) => p.date.getTime() === d.date.getTime(),
              );
              const yPosBase = scales.y(
                dataPoint?.sma ?? dataPoint?.value ?? scales.y.domain()[0],
              );
              const yOffset = d.magnitude > 0 ? -8 : 8;
              const yPos = yPosBase + yOffset;
              return `translate(${scales.x(d.date)}, ${yPos}) rotate(${d.magnitude > 0 ? 0 : 180})`;
            })
            .style("opacity", 0.8);
          return update;
        },
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .remove(),
      );
    },

    // --- Feature #5: Update Rate of Change Chart ---
    rateOfChangeChart(visibleData) {
      if (
        !selections.rateLine ||
        !scales.xRate ||
        !scales.yRate ||
        !axes.yRateAxis ||
        !selections.rateChartArea ||
        !selections.rateZeroLine ||
        !selections.rateYAxisGroup ||
        !visibleData
      ) {
        if (selections.rateChartArea)
          selections.rateChartArea.selectAll(".rate-line").attr("d", null); // Clear line
        return;
      }
      const dur = CONFIG.transitionDurationMs;
      const rateData = visibleData.filter(
        (d) => d.smoothedWeeklyRate !== null && !isNaN(d.smoothedWeeklyRate),
      );

      // Update Y domain based on visible smoothed rates
      if (rateData.length > 0) {
        const yRateExtent = d3.extent(rateData, (d) => d.smoothedWeeklyRate);
        const rateRange = Math.max(
          Math.abs(yRateExtent[0]),
          Math.abs(yRateExtent[1]),
        ); // Use max absolute value
        const ratePadding = Math.max(0.05, rateRange * 0.15);
        // Ensure domain includes 0
        const yMin = Math.min(0, yRateExtent[0]) - ratePadding;
        const yMax = Math.max(0, yRateExtent[1]) + ratePadding;
        scales.yRate
          .domain([yMin, yMax])
          .nice(Math.max(Math.floor(state.dimensions.rateHeight / 30), 3));
      } else {
        scales.yRate.domain([-0.5, 0.5]).nice(); // Default if no data
      }

      // Update Y axis
      selections.rateYAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.yRateAxis);

      // Update zero line
      const yRateZero = scales.yRate(0);
      if (!isNaN(yRateZero) && isFinite(yRateZero)) {
        selections.rateZeroLine
          .transition()
          .duration(dur)
          .attr("x1", 0)
          .attr("x2", state.dimensions.rateWidth)
          .attr("y1", yRateZero)
          .attr("y2", yRateZero)
          .style("opacity", 0.7);
      } else {
        selections.rateZeroLine.style("opacity", 0);
      }

      // Update line path
      const rateLineGenerator = d3
        .line()
        .x((d) => scales.xRate(d.date)) // Use xRate scale
        .y((d) => scales.yRate(d.smoothedWeeklyRate)) // Use yRate scale
        .curve(d3.curveMonotoneX)
        .defined(
          (d) => d.smoothedWeeklyRate !== null && !isNaN(d.smoothedWeeklyRate),
        );

      selections.rateLine
        ?.datum(rateData)
        .transition()
        .duration(dur)
        .attr("d", rateLineGenerator);
    },

    // --- Feature #8: Update TDEE Difference Chart ---
    tdeeDifferenceChart(visibleData) {
      if (
        !selections.tdeeDiffLine ||
        !scales.xTdeeDiff ||
        !scales.yTdeeDiff ||
        !axes.yTdeeDiffAxis ||
        !selections.tdeeDiffChartArea ||
        !selections.tdeeDiffZeroLine ||
        !selections.tdeeDiffYAxisGroup ||
        !visibleData
      ) {
        if (selections.tdeeDiffChartArea)
          selections.tdeeDiffChartArea
            .selectAll(".tdee-diff-line")
            .attr("d", null);
        return;
      }
      const dur = CONFIG.transitionDurationMs;
      const tdeeDiffData = visibleData.filter(
        (d) => d.avgTdeeDifference !== null && !isNaN(d.avgTdeeDifference),
      );

      // Update Y domain based on visible smoothed differences
      if (tdeeDiffData.length > 0) {
        const yDiffExtent = d3.extent(tdeeDiffData, (d) => d.avgTdeeDifference);
        const diffRange = Math.max(
          Math.abs(yDiffExtent[0]),
          Math.abs(yDiffExtent[1]),
        ); // Max absolute value
        const diffPadding = Math.max(100, diffRange * 0.15); // Min 100kcal padding
        // Ensure domain includes 0
        const yMin = Math.min(0, yDiffExtent[0]) - diffPadding;
        const yMax = Math.max(0, yDiffExtent[1]) + diffPadding;
        scales.yTdeeDiff
          .domain([yMin, yMax])
          .nice(Math.max(Math.floor(state.dimensions.tdeeDiffHeight / 30), 3));
      } else {
        scales.yTdeeDiff.domain([-500, 500]).nice(); // Default if no data
      }

      // Update Y axis
      selections.tdeeDiffYAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.yTdeeDiffAxis);

      // Update zero line
      const yTdeeDiffZero = scales.yTdeeDiff(0);
      if (!isNaN(yTdeeDiffZero) && isFinite(yTdeeDiffZero)) {
        selections.tdeeDiffZeroLine
          .transition()
          .duration(dur)
          .attr("x1", 0)
          .attr("x2", state.dimensions.tdeeDiffWidth)
          .attr("y1", yTdeeDiffZero)
          .attr("y2", yTdeeDiffZero)
          .style("opacity", 0.7);
      } else {
        selections.tdeeDiffZeroLine.style("opacity", 0);
      }

      // Update line path
      const tdeeDiffLineGenerator = d3
        .line()
        .x((d) => scales.xTdeeDiff(d.date)) // Use xTdeeDiff scale
        .y((d) => scales.yTdeeDiff(d.avgTdeeDifference)) // Use yTdeeDiff scale
        .curve(d3.curveMonotoneX)
        .defined(
          (d) => d.avgTdeeDifference !== null && !isNaN(d.avgTdeeDifference),
        );

      selections.tdeeDiffLine
        ?.datum(tdeeDiffData)
        .transition()
        .duration(dur)
        .attr("d", tdeeDiffLineGenerator);
    },

    // --- Feature #2: Update Weekly Summary ---
    weeklySummary(weeklyData) {
      if (!selections.weeklySummaryContainer) return;

      let table = selections.weeklySummaryContainer.select("table");
      if (table.empty()) {
        // Create table if it doesn't exist
        selections.weeklySummaryContainer.html(`
                <h4>Weekly Summary <small>(Analysis Range)</small></h4>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Week Of</th>
                                <th>Avg Weight (kg)</th>
                                <th>Avg Intake (kcal)</th>
                                <th>Avg Expend (kcal)</th>
                                <th>Avg Net (kcal)</th>
                                <th>SMA Δ (kg/wk)</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
                <p class="empty-msg" style="display: none;">No weekly summary data for this range.</p>
            `);
        table = selections.weeklySummaryContainer.select("table"); // Reselect after creation
      }

      const tbody = table.select("tbody");
      const emptyMsg = selections.weeklySummaryContainer.select(".empty-msg");

      if (!weeklyData || weeklyData.length === 0) {
        tbody.html(""); // Clear table body
        emptyMsg.style("display", null); // Show message
        return;
      } else {
        emptyMsg.style("display", "none"); // Hide message
      }

      const rows = tbody.selectAll("tr").data(weeklyData, (d) => d.weekKey); // Key by week

      rows.join(
        (enter) => {
          const tr = enter.append("tr");
          tr.append("td").text((d) =>
            _helpers.formatDateShort(d.weekStartDate),
          );
          tr.append("td")
            .attr("class", "number")
            .text((d) => _helpers.formatValue(d.avgWeight, 1));
          tr.append("td")
            .attr("class", "number")
            .text((d) => _helpers.formatValue(d.avgIntake, 0));
          tr.append("td")
            .attr("class", "number")
            .text((d) => _helpers.formatValue(d.avgExpenditure, 0));
          tr.append("td")
            .attr("class", "number")
            .text((d) => _helpers.formatValue(d.avgNetCal, 0));
          tr.append("td")
            .attr("class", "number")
            .text((d) => _helpers.formatValue(d.weeklyRate, 2));
          return tr;
        },
        (update) => {
          update
            .select("td:nth-child(1)")
            .text((d) => _helpers.formatDateShort(d.weekStartDate));
          update
            .select("td:nth-child(2)")
            .text((d) => _helpers.formatValue(d.avgWeight, 1));
          update
            .select("td:nth-child(3)")
            .text((d) => _helpers.formatValue(d.avgIntake, 0));
          update
            .select("td:nth-child(4)")
            .text((d) => _helpers.formatValue(d.avgExpenditure, 0));
          update
            .select("td:nth-child(5)")
            .text((d) => _helpers.formatValue(d.avgNetCal, 0));
          update
            .select("td:nth-child(6)")
            .text((d) => _helpers.formatValue(d.weeklyRate, 2));
          return update;
        },
        (exit) => exit.remove(),
      );
    },

    runAll() {
      if (
        !state.isInitialized ||
        !state.processedData ||
        !scales.x ||
        !scales.y
      ) {
        console.warn(
          "Visual update skipped: Chart not initialized or scales/data missing.",
        );
        return;
      }

      // 1. Update Domains and Axes (handles main focus, balance, rate, tdee diff)
      // This recalculates focus Y domain and updates state.filteredData
      _update.domainsAndAxes();

      // 2. Use the filtered data from the updated domain
      const visibleProcessedData = state.filteredData; // Use data filtered in domainsAndAxes
      const visibleValidSmaData = visibleProcessedData.filter(
        (d) => d.sma !== null,
      );
      const visibleRawWeightData = visibleProcessedData.filter(
        (d) => d.value !== null,
      );
      const visibleNonOutlierValueData = visibleRawWeightData.filter(
        (d) => !d.isOutlier,
      );

      // 3. Recalculate Regression for the *visible* non-outlier data
      const regression = _data.calculateLinearRegression(
        visibleNonOutlierValueData,
        state.regressionStartDate,
      );

      // 4. Update Main Chart Visual Elements
      _update.chartPaths(visibleValidSmaData, regression.points);
      _update.chartDots(visibleRawWeightData); // Pass raw data, handles raw/sma dot visibility inside

      // 5. Update Secondary Chart Visuals
      _update.contextChart(); // Uses full dataset
      _update.balanceChart(visibleProcessedData);
      _update.rateOfChangeChart(visibleProcessedData); // Feature #5
      _update.tdeeDifferenceChart(visibleProcessedData); // Feature #8

      // 6. Update Overlays/Markers (using full dataset for detection, filtering visibility inside)
      _update.annotations(visibleProcessedData); // Feature #1 - only shows visible ones
      _update.plateauRegions(); // Feature #6 - only shows visible ones
      _update.trendChangeMarkers(); // Feature #7 - only shows visible ones

      // 7. Update UI Elements related to Analysis Range Display
      if (!state.analysisRange.isCustom) {
        _handlers.updateAnalysisRangeInputsFromCurrentView();
      }
      _handlers.updateAnalysisRangeDisplay(); // Update display text & heading
    },
  };

  // ========================================================================
  // Statistics Calculation & DOM Update (`_stats`)
  // ========================================================================
  const _stats = {
    calculateAverageInRange(data, field, startDate, endDate) {
      if (!data || !startDate || !endDate || startDate > endDate) return null;
      const rangeData = data.filter(
        (d) => d.date >= startDate && d.date <= endDate,
      );
      const relevantValues = rangeData
        .map((d) => d[field])
        .filter((val) => val !== null && !isNaN(val));
      return relevantValues.length > 0 ? d3.mean(relevantValues) : null;
    },

    calculateCountInRange(data, field, startDate, endDate) {
      if (!data || !startDate || !endDate || startDate > endDate)
        return { count: 0, totalDays: 0, percentage: 0 };
      const totalDays =
        Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      if (totalDays <= 0) return { count: 0, totalDays: 0, percentage: 0 };

      const rangeData = data.filter(
        (d) => d.date >= startDate && d.date <= endDate,
      );
      const count = rangeData.filter(
        (d) => d[field] !== null && !isNaN(d[field]),
      ).length;
      const percentage = totalDays > 0 ? (count / totalDays) * 100 : 0;

      return { count, totalDays, percentage };
    },

    calculateRollingWeeklyChange(allSmoothedRateData, analysisEndDate) {
      // Uses the pre-smoothed weekly rate for the stat
      if (
        !allSmoothedRateData ||
        allSmoothedRateData.length === 0 ||
        !analysisEndDate
      ) {
        return null;
      }
      // Find the latest point *at or before* the analysisEndDate that has a smoothed rate
      let lastPointRate = null;
      for (let i = allSmoothedRateData.length - 1; i >= 0; i--) {
        if (
          allSmoothedRateData[i].date <= analysisEndDate &&
          allSmoothedRateData[i].smoothedWeeklyRate !== null &&
          !isNaN(allSmoothedRateData[i].smoothedWeeklyRate)
        ) {
          lastPointRate = allSmoothedRateData[i].smoothedWeeklyRate;
          break;
        }
      }
      return lastPointRate; // Return the smoothed rate at the end date
    },

    calculateVolatility(processedData, startDate, endDate) {
      if (!processedData || !startDate || !endDate || startDate > endDate)
        return null;
      const viewData = processedData.filter(
        (d) => d.date >= startDate && d.date <= endDate,
      );
      // Calculate std dev of raw points around the SMA line (ignoring outliers?) - User choice?
      // Let's include outliers for now to reflect raw volatility.
      const deviations = viewData
        .filter(
          (d) =>
            d.sma !== null &&
            !isNaN(d.sma) &&
            d.value !== null &&
            !isNaN(d.value) /*&& !d.isOutlier*/,
        )
        .map((d) => d.value - d.sma);

      return deviations.length >= 2 ? d3.deviation(deviations) : null;
    },

    calculateTDEEFromTrend(avgIntake, weeklyKgChange) {
      if (
        avgIntake === null ||
        weeklyKgChange === null ||
        isNaN(avgIntake) ||
        isNaN(weeklyKgChange)
      )
        return null;
      const dailyKgChange = weeklyKgChange / 7;
      const dailyDeficitSurplus = dailyKgChange * CONFIG.KCALS_PER_KG;
      return avgIntake - dailyDeficitSurplus; // TDEE = Intake - Deficit OR TDEE = Intake + Surplus
    },

    estimateDeficitSurplusFromTrend(weeklyKgChange) {
      if (weeklyKgChange === null || isNaN(weeklyKgChange)) return null;
      return (weeklyKgChange / 7) * CONFIG.KCALS_PER_KG;
    },

    calculateNetCalRateCorrelation(processedData, startDate, endDate) {
      if (
        !window.ss ||
        typeof ss.sampleCorrelation !== "function" ||
        !startDate ||
        !endDate ||
        startDate > endDate
      )
        return null;

      // Filter data for the analysis range first
      const rangeData = processedData.filter(
        (d) => d.date >= startDate && d.date <= endDate,
      );

      // Check if enough *daily* data points exist within the range
      const daysWithSmaRate = rangeData.filter(
        (d) => d.smoothedWeeklyRate !== null && !isNaN(d.smoothedWeeklyRate),
      ).length;
      const daysWithNetBalance = rangeData.filter(
        (d) => d.netBalance !== null && !isNaN(d.netBalance),
      ).length;
      if (
        daysWithSmaRate < CONFIG.MIN_POINTS_FOR_CORRELATION ||
        daysWithNetBalance < CONFIG.MIN_POINTS_FOR_CORRELATION
      ) {
        state.weeklySummaryData = []; // Clear summary data if not enough daily points
        return null;
      }

      let weeklyStats = [];
      const groupedByWeek = d3.group(rangeData, (d) =>
        d3.timeFormat("%Y-%W")(d3.timeMonday(d.date)),
      );

      groupedByWeek.forEach((weekData, weekKey) => {
        // Calculate averages for the week
        const validNetCals = weekData
          .map((d) => d.netBalance)
          .filter((nc) => nc !== null && !isNaN(nc));
        const validRates = weekData
          .map((d) => d.smoothedWeeklyRate)
          .filter((r) => r !== null && !isNaN(r)); // Use smoothed rate
        const validWeights = weekData
          .map((d) => d.sma ?? d.value)
          .filter((w) => w !== null && !isNaN(w));
        const validExpenditures = weekData
          .map((d) => d.googleFitTDEE)
          .filter((e) => e !== null && !isNaN(e));
        const validIntakes = weekData
          .map((d) => d.calorieIntake)
          .filter((c) => c !== null && !isNaN(c));

        // Require at least 4 days with *both* net cal and rate data for a week to be included in correlation
        const validPointsCount = weekData.filter(
          (d) =>
            d.netBalance !== null &&
            !isNaN(d.netBalance) &&
            d.smoothedWeeklyRate !== null &&
            !isNaN(d.smoothedWeeklyRate),
        ).length;

        if (validPointsCount >= 4) {
          const avgNetCal = d3.mean(validNetCals);
          const avgWeeklyRate = d3.mean(validRates); // Average the smoothed rate over the week
          const avgWeight = d3.mean(validWeights);
          const avgExpenditure = d3.mean(validExpenditures);
          const avgIntake = d3.mean(validIntakes);
          const weekStartDate = d3.timeMonday(weekData[0].date); // Get week start date for reference

          weeklyStats.push({
            weekKey,
            weekStartDate,
            avgNetCal,
            weeklyRate: avgWeeklyRate,
            avgWeight,
            avgExpenditure,
            avgIntake,
          });
        }
      });

      // Sort weekly stats by date for the summary table
      weeklyStats.sort((a, b) => a.weekStartDate - b.weekStartDate);
      state.weeklySummaryData = weeklyStats; // Store the detailed weekly data for the table

      // Check if enough *weeks* meet the criteria for correlation
      if (weeklyStats.length < CONFIG.MIN_WEEKS_FOR_CORRELATION) {
        return null; // Not enough valid weeks
      }

      // Calculate correlation using the weekly averages
      const netCalArray = weeklyStats.map((w) => w.avgNetCal);
      const rateArray = weeklyStats.map((w) => w.weeklyRate);
      try {
        const correlation = ss.sampleCorrelation(netCalArray, rateArray);
        return isNaN(correlation) ? null : correlation;
      } catch (e) {
        console.error("Error calculating correlation:", e);
        return null;
      }
    },

    calculateEstimatedTimeToGoal(currentWeight, goalWeight, weeklyChange) {
      if (
        currentWeight === null ||
        goalWeight === null ||
        weeklyChange === null ||
        isNaN(weeklyChange) ||
        isNaN(currentWeight) ||
        isNaN(goalWeight)
      )
        return "N/A";

      const weightDifference = goalWeight - currentWeight;

      if (Math.abs(weightDifference) < 0.01) return "Goal Achieved!"; // Close enough

      // Check for invalid scenarios
      if (Math.abs(weeklyChange) < 0.01) {
        // Trend is effectively flat
        return Math.abs(weightDifference) < 0.01
          ? "Goal Achieved!"
          : "Trend flat";
      }
      if (
        (weeklyChange > 0 && weightDifference < 0) ||
        (weeklyChange < 0 && weightDifference > 0)
      ) {
        return "Trending away"; // Moving opposite direction
      }

      const weeksNeeded = weightDifference / weeklyChange;

      if (weeksNeeded <= 0) return "N/A"; // Should be caught by "Trending away" but safe check
      if (weeksNeeded < 1) return `~${(weeksNeeded * 7).toFixed(0)} days`;
      if (weeksNeeded < 8)
        return `~${Math.round(weeksNeeded)} week${weeksNeeded >= 1.5 ? "s" : ""}`;

      const monthsNeeded = weeksNeeded / (365.25 / 12 / 7); // Avg weeks per month
      if (monthsNeeded < 18)
        return `~${Math.round(monthsNeeded)} month${monthsNeeded >= 1.5 ? "s" : ""}`;

      return `~${(monthsNeeded / 12).toFixed(1)} years`;
    },

    calculateRequiredRateForGoal(currentWeight, goalWeight, goalDate) {
      if (
        currentWeight === null ||
        goalWeight === null ||
        !goalDate ||
        !(goalDate instanceof Date) ||
        isNaN(goalDate.getTime()) ||
        isNaN(currentWeight) ||
        isNaN(goalWeight)
      )
        return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(goalDate); // Clone goal date
      targetDate.setHours(0, 0, 0, 0);

      if (targetDate <= today) return null; // Target date must be in the future

      const weightDifference = goalWeight - currentWeight;
      const daysRemaining = (targetDate.getTime() - today.getTime()) / 86400000;

      if (daysRemaining <= 0) return null;

      return weightDifference / (daysRemaining / 7); // kg per week
    },

    // --- Feature #6: Plateau Detection ---
    detectPlateaus(processedData) {
      const plateaus = [];
      let plateauStartIndex = -1;
      const minDays = CONFIG.plateauMinDurationWeeks * 7;

      for (let i = 0; i < processedData.length; i++) {
        const d = processedData[i];
        const rate = d.smoothedWeeklyRate; // Use smoothed rate

        if (
          rate !== null &&
          !isNaN(rate) &&
          Math.abs(rate) < CONFIG.plateauRateThresholdKgWeek
        ) {
          if (plateauStartIndex === -1) {
            plateauStartIndex = i; // Start of potential plateau
          }
        } else {
          // End of potential plateau (or point is invalid)
          if (plateauStartIndex !== -1) {
            const plateauEndIndex = i - 1; // Last point that was part of the plateau
            if (plateauEndIndex >= plateauStartIndex) {
              // Ensure end is not before start
              const startDate = processedData[plateauStartIndex].date;
              const endDate = processedData[plateauEndIndex].date;
              const durationDays =
                (endDate.getTime() - startDate.getTime()) / 86400000;

              if (durationDays >= minDays - 1) {
                // Allow slightly less than exact min days (e.g., 20 days for 3 weeks)
                plateaus.push({ startDate, endDate });
              }
            }
          }
          plateauStartIndex = -1; // Reset
        }
      }
      // Check for plateau ending at the last data point
      if (plateauStartIndex !== -1 && processedData.length > 0) {
        const plateauEndIndex = processedData.length - 1;
        if (plateauEndIndex >= plateauStartIndex) {
          const startDate = processedData[plateauStartIndex].date;
          const endDate = processedData[plateauEndIndex].date;
          const durationDays =
            (endDate.getTime() - startDate.getTime()) / 86400000;
          if (durationDays >= minDays - 1) {
            plateaus.push({ startDate, endDate });
          }
        }
      }
      state.plateaus = plateaus; // Store detected plateaus
      // console.log("Detected plateaus:", plateaus);
    },

    // --- Feature #7: Trend Change Detection (Basic Slope Comparison) ---
    detectTrendChanges(processedData) {
      const changes = [];
      const windowDays = CONFIG.trendChangeWindowDays;
      const minSlopeDiff = CONFIG.trendChangeMinSlopeDiffKgWeek / 7; // Convert threshold to daily rate

      if (processedData.length < windowDays * 2) {
        state.trendChangePoints = []; // Clear if not enough data
        return; // Not enough data for comparison
      }

      for (let i = windowDays; i < processedData.length - windowDays; i++) {
        const currentDate = processedData[i].date;

        // Calculate slope before (using SMA)
        const dataBefore = processedData.slice(i - windowDays, i);
        const validBefore = dataBefore.filter(
          (d) => d.sma !== null && !isNaN(d.sma),
        );
        if (validBefore.length < Math.min(5, windowDays)) continue; // Need min points for slope
        const regressionBefore = _data.calculateLinearRegression(
          validBefore,
          null,
        );
        const slopeBefore = regressionBefore.slope; // Daily slope

        // Calculate slope after (using SMA)
        const dataAfter = processedData.slice(i + 1, i + 1 + windowDays);
        const validAfter = dataAfter.filter(
          (d) => d.sma !== null && !isNaN(d.sma),
        );
        if (validAfter.length < Math.min(5, windowDays)) continue;
        const regressionAfter = _data.calculateLinearRegression(
          validAfter,
          null,
        );
        const slopeAfter = regressionAfter.slope; // Daily slope

        if (slopeBefore !== null && slopeAfter !== null) {
          const slopeDiff = slopeAfter - slopeBefore; // Daily difference
          if (Math.abs(slopeDiff) > minSlopeDiff) {
            // Check if this is near an already detected change point to avoid clusters
            const nearExisting = changes.some(
              (c) =>
                Math.abs(c.date.getTime() - currentDate.getTime()) <
                (windowDays * 86400000) / 2,
            ); // Half window buffer
            if (!nearExisting) {
              changes.push({ date: currentDate, magnitude: slopeDiff }); // Store daily magnitude
            }
          }
        }
      }
      state.trendChangePoints = changes;
      // console.log("Detected trend changes:", changes);
    },

    getAll() {
      let calculatedStats = {};
      const analysisRange = _handlers.getAnalysisDateRange();
      const { start: analysisStart, end: analysisEnd } = analysisRange;

      // --- Overall Stats (All Time) ---
      const validWeightDataAll = state.rawData.filter(
        (d) => d.value !== null && !isNaN(d.value),
      );
      if (validWeightDataAll.length > 0) {
        calculatedStats.startingWeight = validWeightDataAll[0].value;
        calculatedStats.currentWeight =
          validWeightDataAll[validWeightDataAll.length - 1].value;
        const maxEntry = d3.max(validWeightDataAll, (d) => d.value);
        calculatedStats.maxWeight = maxEntry;
        calculatedStats.maxWeightDate = validWeightDataAll.find(
          (d) => d.value === maxEntry,
        )?.date;
        const minEntry = d3.min(validWeightDataAll, (d) => d.value);
        calculatedStats.minWeight = minEntry;
        calculatedStats.minWeightDate = validWeightDataAll.find(
          (d) => d.value === minEntry,
        )?.date;
        if (
          calculatedStats.startingWeight !== null &&
          calculatedStats.currentWeight !== null
        ) {
          calculatedStats.totalChange =
            calculatedStats.currentWeight - calculatedStats.startingWeight;
        }
      } else {
        calculatedStats.startingWeight = null;
        calculatedStats.currentWeight = null;
        calculatedStats.maxWeight = null;
        calculatedStats.maxWeightDate = null;
        calculatedStats.minWeight = null;
        calculatedStats.minWeightDate = null;
        calculatedStats.totalChange = null;
      }
      const allValidSmaData = state.processedData.filter(
        (d) => d.sma !== null && !isNaN(d.sma),
      );
      calculatedStats.currentSma =
        allValidSmaData.length > 0
          ? allValidSmaData[allValidSmaData.length - 1].sma
          : null;

      // --- Analysis Range Stats ---
      let analysisRegression = { slope: null }; // Initialize regression object
      state.plateaus = []; // Reset detected plateaus
      state.trendChangePoints = []; // Reset detected trend changes
      state.weeklySummaryData = []; // Reset weekly summary

      if (analysisStart && analysisEnd && analysisStart <= analysisEnd) {
        const analysisProcessedData = state.processedData.filter(
          (d) => d.date >= analysisStart && d.date <= analysisEnd,
        );
        // Detect Plateaus & Trend Changes on the FULL dataset first
        _stats.detectPlateaus(state.processedData);
        _stats.detectTrendChanges(state.processedData);
        // The update functions will filter visibility based on the current view

        // Use the pre-smoothed rate ending at the analysis end date
        // Pass ALL processed data to ensure smoothing uses points outside the range if needed
        calculatedStats.rollingSmaWeeklyChange =
          _stats.calculateRollingWeeklyChange(state.processedData, analysisEnd);

        calculatedStats.volatility = _stats.calculateVolatility(
          state.processedData,
          analysisStart,
          analysisEnd,
        );
        calculatedStats.avgIntake = _stats.calculateAverageInRange(
          state.rawData,
          "calorieIntake",
          analysisStart,
          analysisEnd,
        );
        calculatedStats.avgExpenditure = _stats.calculateAverageInRange(
          state.rawData,
          "googleFitTDEE",
          analysisStart,
          analysisEnd,
        );
        calculatedStats.avgNetBalance = _stats.calculateAverageInRange(
          state.rawData,
          "netBalance",
          analysisStart,
          analysisEnd,
        );
        calculatedStats.avgTDEE_GFit = calculatedStats.avgExpenditure; // Same as avgExpenditure in this range

        // Calculate correlation and update weekly summary state
        calculatedStats.netCalRateCorrelation =
          _stats.calculateNetCalRateCorrelation(
            state.processedData,
            analysisStart,
            analysisEnd,
          );

        calculatedStats.weightDataConsistency = _stats.calculateCountInRange(
          state.rawData,
          "value",
          analysisStart,
          analysisEnd,
        );
        calculatedStats.calorieDataConsistency = _stats.calculateCountInRange(
          state.rawData,
          "calorieIntake",
          analysisStart,
          analysisEnd,
        );

        // Feature #8 TDEE Diff Stat - Average of smoothed diff in range
        calculatedStats.avgTDEE_Difference = _stats.calculateAverageInRange(
          analysisProcessedData,
          "avgTdeeDifference",
          analysisStart,
          analysisEnd,
        );

        // Regression for Analysis Range
        const analysisNonOutlierValueData = state.processedData.filter(
          (d) =>
            d.date >= analysisStart &&
            d.date <= analysisEnd &&
            d.value !== null &&
            !d.isOutlier,
        );
        // Determine start date for regression stat: Use UI date if set and within range, else use analysis range start
        let regressionStartDateForStats = analysisStart;
        if (
          state.regressionStartDate &&
          state.regressionStartDate >= analysisStart &&
          state.regressionStartDate <= analysisEnd
        ) {
          regressionStartDateForStats = state.regressionStartDate;
        }
        analysisRegression = _data.calculateLinearRegression(
          analysisNonOutlierValueData,
          regressionStartDateForStats,
        );
      } else {
        // Set defaults to null or empty if range is invalid
        calculatedStats.rollingSmaWeeklyChange = null;
        calculatedStats.volatility = null;
        calculatedStats.avgIntake = null;
        calculatedStats.avgExpenditure = null;
        calculatedStats.avgNetBalance = null;
        calculatedStats.avgTDEE_GFit = null;
        calculatedStats.netCalRateCorrelation = null;
        calculatedStats.weightDataConsistency = {
          count: 0,
          totalDays: 0,
          percentage: 0,
        };
        calculatedStats.calorieDataConsistency = {
          count: 0,
          totalDays: 0,
          percentage: 0,
        };
        calculatedStats.avgTDEE_Difference = null;
      }

      // --- Trend & TDEE (Based on Analysis Range) ---
      calculatedStats.regressionSlopeWeekly =
        analysisRegression && analysisRegression.slope !== null
          ? analysisRegression.slope * 7
          : null;
      calculatedStats.regressionStartDate = state.regressionStartDate; // UI-selected date for visual line

      // Prioritize regression slope if available AND considered reliable (enough points?)
      // Simple prioritization: use regression if calculated, else rolling SMA rate
      const trendForTDEECalc =
        calculatedStats.regressionSlopeWeekly ??
        calculatedStats.rollingSmaWeeklyChange;

      calculatedStats.avgTDEE_WgtChange = _stats.calculateTDEEFromTrend(
        calculatedStats.avgIntake,
        trendForTDEECalc,
      );
      calculatedStats.estimatedDeficitSurplus =
        _stats.estimateDeficitSurplusFromTrend(trendForTDEECalc);

      // --- Goal Related Stats ---
      calculatedStats.targetWeight = state.goal.weight;
      calculatedStats.targetRate = state.goal.targetRate;
      calculatedStats.targetDate = state.goal.date;
      const referenceWeightForGoal =
        calculatedStats.currentSma ?? calculatedStats.currentWeight; // Use SMA if available

      if (
        referenceWeightForGoal !== null &&
        calculatedStats.targetWeight !== null
      ) {
        calculatedStats.weightToGoal =
          calculatedStats.targetWeight - referenceWeightForGoal;
        const trendForTimeEst = trendForTDEECalc; // Use analysis trend for estimation
        calculatedStats.estimatedTimeToGoal =
          _stats.calculateEstimatedTimeToGoal(
            referenceWeightForGoal,
            calculatedStats.targetWeight,
            trendForTimeEst,
          );

        if (calculatedStats.targetDate) {
          calculatedStats.requiredRateForGoal =
            _stats.calculateRequiredRateForGoal(
              referenceWeightForGoal,
              calculatedStats.targetWeight,
              calculatedStats.targetDate,
            );
          if (calculatedStats.requiredRateForGoal !== null) {
            const baselineTDEE =
              calculatedStats.avgTDEE_WgtChange ?? calculatedStats.avgTDEE_GFit; // Use calculated TDEE if available, else GFit
            if (baselineTDEE !== null && !isNaN(baselineTDEE)) {
              const requiredDailyDeficitSurplus =
                (calculatedStats.requiredRateForGoal / 7) * CONFIG.KCALS_PER_KG;
              calculatedStats.requiredNetCalories = requiredDailyDeficitSurplus;
              // Feature #9: Calorie Target Guidance
              const targetIntake = baselineTDEE + requiredDailyDeficitSurplus;
              calculatedStats.targetIntakeRange = {
                min: Math.round(targetIntake - 100),
                max: Math.round(targetIntake + 100),
              };
            } else {
              calculatedStats.requiredNetCalories = null;
              calculatedStats.targetIntakeRange = null; // Feature #9
            }
          } else {
            calculatedStats.requiredNetCalories = null;
            calculatedStats.targetIntakeRange = null; // Feature #9
          }
        } else {
          calculatedStats.requiredRateForGoal = null;
          calculatedStats.requiredNetCalories = null;
          calculatedStats.targetIntakeRange = null; // Feature #9
        }

        // Compare current rate to target rate
        const currentActualRate = trendForTDEECalc; // Use analysis trend
        if (calculatedStats.targetRate !== null && currentActualRate !== null) {
          const diff = currentActualRate - calculatedStats.targetRate;
          const absDiff = Math.abs(diff);
          let feedback = { text: "N/A", class: "" };
          if (absDiff < 0.03) feedback = { text: "On Target", class: "good" };
          else if (diff > 0)
            feedback = {
              text: `Faster (+${_helpers.formatValue(diff, 2)})`,
              class: "warn",
            };
          else
            feedback = {
              text: `Slower (${_helpers.formatValue(diff, 2)})`,
              class: "warn",
            };
          calculatedStats.targetRateFeedback = feedback;
        } else calculatedStats.targetRateFeedback = { text: "N/A", class: "" };
      } else {
        calculatedStats.weightToGoal = null;
        calculatedStats.estimatedTimeToGoal = "N/A";
        calculatedStats.requiredRateForGoal = null;
        calculatedStats.requiredNetCalories = null;
        calculatedStats.targetIntakeRange = null; // Feature #9
        calculatedStats.targetRateFeedback = { text: "N/A", class: "" };
      }

      return calculatedStats;
    },

    updateDOM(stats) {
      const h = _helpers;
      const fv = h.formatValue;
      const fd = h.formatDate;
      const na = (v) => v; // No-op formatter

      // --- Weight Overview (All Time) ---
      h.updateStatElement("startingWeight", stats.startingWeight, fv, 1);
      h.updateStatElement("currentWeight", stats.currentWeight, fv, 1);
      h.updateStatElement("currentSma", stats.currentSma, fv, 1);
      h.updateStatElement("totalChange", stats.totalChange, fv, 1);
      h.updateStatElement("maxWeight", stats.maxWeight, fv, 1);
      h.updateStatElement("maxWeightDate", stats.maxWeightDate, fd); // Click listener added in helper
      h.updateStatElement("minWeight", stats.minWeight, fv, 1);
      h.updateStatElement("minWeightDate", stats.minWeightDate, fd); // Click listener added in helper

      // --- Analysis & Insights (Analysis Range) ---
      h.updateStatElement("volatilityScore", stats.volatility, fv, 2); // Moved to Analysis Results
      h.updateStatElement(
        "rollingWeeklyChangeSma",
        stats.rollingSmaWeeklyChange,
        fv,
        2,
      ); // Uses smoothed rate now
      h.updateStatElement(
        "regressionSlope",
        stats.regressionSlopeWeekly,
        fv,
        2,
      );
      if (selections.regressionStartDateLabel)
        selections.regressionStartDateLabel.text(
          stats.regressionStartDate
            ? fd(stats.regressionStartDate)
            : "Range Start",
        );
      h.updateStatElement(
        "netcalRateCorrelation",
        stats.netCalRateCorrelation,
        fv,
        2,
      );
      h.updateStatElement(
        "weightConsistency",
        stats.weightDataConsistency?.percentage,
        fv,
        0,
      );
      const wcDetailsEl = selections.statElements["weightConsistencyDetails"];
      if (wcDetailsEl)
        wcDetailsEl.textContent = stats.weightDataConsistency
          ? `(${stats.weightDataConsistency.count}/${stats.weightDataConsistency.totalDays} days)`
          : "(N/A)";
      h.updateStatElement(
        "calorieConsistency",
        stats.calorieDataConsistency?.percentage,
        fv,
        0,
      );
      const ccDetailsEl = selections.statElements["calorieConsistencyDetails"];
      if (ccDetailsEl)
        ccDetailsEl.textContent = stats.calorieDataConsistency
          ? `(${stats.calorieDataConsistency.count}/${stats.calorieDataConsistency.totalDays} days)`
          : "(N/A)";
      h.updateStatElement("avgIntake", stats.avgIntake, fv, 0);
      h.updateStatElement("avgExpenditure", stats.avgExpenditure, fv, 0);
      h.updateStatElement("avgNetBalance", stats.avgNetBalance, fv, 0);
      h.updateStatElement(
        "estimatedDeficitSurplus",
        stats.estimatedDeficitSurplus,
        fv,
        0,
      );
      h.updateStatElement("avgTdeeGfit", stats.avgTDEE_GFit, fv, 0);
      h.updateStatElement("avgTdeeWgtChange", stats.avgTDEE_WgtChange, fv, 0);
      // Feature #8 TDEE Diff Stat
      h.updateStatElement("avgTdeeDifference", stats.avgTDEE_Difference, fv, 0);

      // --- Goal Tracker ---
      h.updateStatElement("targetWeightStat", stats.targetWeight, fv, 1);
      h.updateStatElement("targetRateStat", stats.targetRate, fv, 2);
      h.updateStatElement("weightToGoal", stats.weightToGoal, fv, 1);
      h.updateStatElement("estimatedTimeToGoal", stats.estimatedTimeToGoal, na);
      h.updateStatElement(
        "requiredRateForGoal",
        stats.requiredRateForGoal,
        fv,
        2,
      );
      h.updateStatElement(
        "requiredNetCalories",
        stats.requiredNetCalories,
        fv,
        0,
      );
      // Feature #9: Calorie Target Guidance
      const rangeText = stats.targetIntakeRange
        ? `${stats.targetIntakeRange.min} - ${stats.targetIntakeRange.max}`
        : "N/A";
      h.updateStatElement("suggestedIntakeRange", rangeText, na);

      const feedbackEl = selections.statElements["currentRateFeedback"];
      if (feedbackEl) {
        feedbackEl.textContent = stats.targetRateFeedback?.text ?? "N/A";
        feedbackEl.className = `stat-value feedback ${stats.targetRateFeedback?.class ?? ""}`;
      }

      // Update Insight Summary Section
      _insights.updateSummary(stats);

      // Update Weekly Summary Table (Feature #2) - Pass the calculated weekly data
      _update.weeklySummary(state.weeklySummaryData);
    },

    updateAll() {
      const statsData = _stats.getAll(); // Calculate all stats (includes plateau/trend detection now)
      _stats.updateDOM(statsData);
    },
  };

  // ========================================================================
  // Insight Generation (`_insights`)
  // ========================================================================
  const _insights = {
    getConsistencyInsight(correlation, consistencyWgt, consistencyCal) {
      let insight = "<h4>Consistency Check</h4>";

      // Data logging consistency feedback
      let consistencyMsg = "";
      if (consistencyWgt.percentage < 80 || consistencyCal.percentage < 80) {
        consistencyMsg += `<span class="warn">Low data consistency detected!</span> `;
        if (consistencyWgt.percentage < 80)
          consistencyMsg += `Weight logged only ${consistencyWgt.percentage.toFixed(0)}% of days. `;
        if (consistencyCal.percentage < 80)
          consistencyMsg += `Calories logged only ${consistencyCal.percentage.toFixed(0)}% of days. `;
        consistencyMsg += `Inaccurate stats & correlation likely.`;
      } else if (
        consistencyWgt.percentage < 95 ||
        consistencyCal.percentage < 95
      ) {
        consistencyMsg += `<span class="good">Good data consistency</span> (${consistencyWgt.percentage.toFixed(0)}% Wgt, ${consistencyCal.percentage.toFixed(0)}% Cal).`;
      } else {
        consistencyMsg += `<span class="good">Excellent data consistency</span> (${consistencyWgt.percentage.toFixed(0)}% Wgt, ${consistencyCal.percentage.toFixed(0)}% Cal).`;
      }
      insight += `<p><strong>Logging Frequency:</strong> ${consistencyMsg}</p>`;

      // Correlation feedback
      if (correlation !== null && !isNaN(correlation)) {
        let level = "",
          explanation = "";
        const rVal = _helpers.formatValue(correlation, 2);
        // Correlation interpretation (NEGATIVE correlation expected: higher surplus -> faster gain / slower loss)
        if (correlation <= -0.7) {
          level = `<span class="good">Excellent!</span>`;
          explanation = `Reported net calories strongly align (r=${rVal}) with weight trend.`;
        } else if (correlation <= -0.4) {
          level = `<span class="good">Good.</span>`;
          explanation = `Reported net calories generally align (r=${rVal}) with weight trend.`;
        } else if (correlation < -0.1) {
          level = `<span class="warn">Fair.</span>`;
          explanation = `Weak negative link (r=${rVal}). Consider consistency warning above. Check tracking/activity levels.`;
        } else {
          level = `<span class="bad">Poor/Inconclusive.</span>`;
          explanation = `Expected negative link not observed (r=${rVal}). Consider consistency warning above. Review tracking closely.`;
        }
        insight += `<p><strong>Tracking vs. Trend:</strong> ${level} ${explanation}</p>`;
      } else {
        insight += `<p><strong>Tracking vs. Trend:</strong> Not enough comparable weekly data in range for correlation analysis.</p>`;
      }
      return insight;
    },

    getTDEEInsight(tdeeGfit, tdeeTrend, tdeeDiffAvg) {
      let insight = "<h4>Energy Balance Reality Check</h4>";
      if (
        tdeeGfit !== null &&
        !isNaN(tdeeGfit) &&
        tdeeTrend !== null &&
        !isNaN(tdeeTrend)
      ) {
        const diff = tdeeTrend - tdeeGfit;
        const diffPercent =
          tdeeGfit !== 0
            ? (diff / tdeeGfit) * 100
            : diff > 0
              ? Infinity
              : -Infinity;
        let msg = `Trend TDEE: <strong>${_helpers.formatValue(tdeeTrend, 0)} kcal/d</strong>. `;
        const diffAvgStr =
          tdeeDiffAvg !== null
            ? ` (Avg Diff: ${_helpers.formatValue(tdeeDiffAvg, 0)} kcal)`
            : ""; // Feature #8

        if (Math.abs(diffPercent) < 10) {
          msg += `<span class="good">Aligns well (&lt;10% diff) with GFit avg (~${_helpers.formatValue(tdeeGfit, 0)} kcal/d)${diffAvgStr}.</span>`;
        } else if (diff > 0) {
          msg += `<span class="warn">Notably higher (+${diffPercent.toFixed(0)}%) than GFit avg (~${_helpers.formatValue(tdeeGfit, 0)} kcal/d)${diffAvgStr}. Possibilities: GFit underestimates burn, or intake log low.</span>`;
        } else {
          msg += `<span class="warn">Notably lower (${diffPercent.toFixed(0)}%) than GFit avg (~${_helpers.formatValue(tdeeGfit, 0)} kcal/d)${diffAvgStr}. Possibilities: GFit overestimates burn, or intake log high.</span>`;
        }
        insight += `<p><strong>TDEE Comparison:</strong> ${msg}</p>`;
      } else if (tdeeGfit !== null && !isNaN(tdeeGfit)) {
        insight += `<p><strong>TDEE Comparison:</strong> GFit Avg TDEE ~${_helpers.formatValue(tdeeGfit, 0)} kcal/d. Cannot estimate TDEE from weight trend in range (check data consistency?).</p>`;
      } else if (tdeeTrend !== null && !isNaN(tdeeTrend)) {
        insight += `<p><strong>TDEE Comparison:</strong> Trend TDEE ~${_helpers.formatValue(tdeeTrend, 0)} kcal/d. Missing Google Fit avg TDEE data in range.</p>`;
      } else {
        insight +=
          "<p><strong>TDEE Comparison:</strong> Insufficient data in range to estimate TDEE from trend or GFit.</p>";
      }
      return insight;
    },

    getTrendInsight(currentTrendWeekly, currentWeight, regressionUsed) {
      let insight = "<h4>Current Trend & Gaining Phase</h4>";
      if (currentTrendWeekly !== null && !isNaN(currentTrendWeekly)) {
        let trendDesc = "";
        const trendAbs = Math.abs(currentTrendWeekly);
        const trendPercent =
          currentWeight && currentWeight > 0 && !isNaN(currentWeight)
            ? (currentTrendWeekly / currentWeight) * 100
            : null;
        const trendValStr = `<strong>${_helpers.formatValue(currentTrendWeekly, 2)} kg/wk</strong>`;
        const trendPercentStr =
          trendPercent !== null && !isNaN(trendPercent)
            ? ` (${_helpers.formatValue(trendPercent, 1)}%/wk)`
            : "";

        if (trendAbs < 0.05) {
          trendDesc = `Weight is <span class="stable">stable</span> (${trendValStr}).`;
        } else if (currentTrendWeekly > 0) {
          trendDesc = `Actively <span class="gaining">gaining</span> at ${trendValStr}${trendPercentStr}.`;
          if (currentTrendWeekly > CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK) {
            trendDesc += ` <span class="warn">(Rate exceeds recommended ${CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK}-${CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK} kg/wk range. Likely includes significant fat gain.)</span>`;
          } else if (
            currentTrendWeekly >= CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK
          ) {
            trendDesc += ` <span class="good">(Rate within recommended lean gain range.)</span>`;
          } else {
            trendDesc += ` <span class="warn">(Rate slow for typical lean gain. Ensure adequate surplus?)</span>`;
          }
        } else {
          // Losing weight
          trendDesc = `Actively <span class="losing">losing</span> at ${trendValStr}${trendPercentStr}.`;
          trendDesc += ` <span class="warn">(Adjust intake for gain goals.)</span>`;
        }

        const basis = regressionUsed
          ? "linear regression"
          : `smoothed SMA rate`;
        insight += `<p><strong>Weight Trend:</strong> ${trendDesc} <small>(Based on ${basis} in analysis range)</small></p>`;
      } else {
        insight +=
          "<p><strong>Weight Trend:</strong> Cannot determine trend in selected analysis range (check data consistency?).</p>";
      }
      return insight;
    },

    // --- Feature #6: Plateau Insight ---
    getPlateauInsight(analysisStartDate, analysisEndDate) {
      let insight = "";
      // Filter plateaus detected on the *full* dataset to only show those overlapping the analysis range
      const plateausInRange = state.plateaus.filter(
        (p) => p.endDate >= analysisStartDate && p.startDate <= analysisEndDate,
      );
      if (plateausInRange.length > 0) {
        insight += `<h4>Detected Plateaus</h4>`;
        plateausInRange.forEach((p) => {
          insight += `<p><span class="warn">Potential Plateau:</span> ${_helpers.formatDateShort(p.startDate)} - ${_helpers.formatDateShort(p.endDate)}</p>`;
        });
      }
      return insight;
    },

    // --- Feature #7: Trend Change Insight ---
    getTrendChangeInsight(analysisStartDate, analysisEndDate) {
      let insight = "";
      // Filter trend changes detected on the *full* dataset
      const changesInRange = state.trendChangePoints.filter(
        (p) => p.date >= analysisStartDate && p.date <= analysisEndDate,
      );
      if (changesInRange.length > 0) {
        insight += `<h4>Potential Trend Changes</h4>`;
        changesInRange.forEach((p) => {
          const direction = p.magnitude > 0 ? "acceleration" : "deceleration";
          const rateChange = Math.abs(p.magnitude * 7); // Weekly rate change
          insight += `<p><span class="warn">Significant ${direction}</span> detected around ${_helpers.formatDateShort(p.date)}. (Rate Δ ~${_helpers.formatValue(rateChange, 2)} kg/wk)</p>`; // Added magnitude
        });
      }
      return insight;
    },

    updateSummary(stats) {
      if (!selections.insightSummaryContainer) return;

      const currentTrend =
        stats.regressionSlopeWeekly ?? stats.rollingSmaWeeklyChange;
      const regressionUsedForTrend = stats.regressionSlopeWeekly !== null;
      const analysisRange = _handlers.getAnalysisDateRange();

      let summaryHtml = _insights.getConsistencyInsight(
        stats.netCalRateCorrelation,
        stats.weightDataConsistency,
        stats.calorieDataConsistency,
      );
      summaryHtml += _insights.getTDEEInsight(
        stats.avgTDEE_GFit,
        stats.avgTDEE_WgtChange,
        stats.avgTDEE_Difference,
      );
      summaryHtml += _insights.getTrendInsight(
        currentTrend,
        stats.currentSma ?? stats.currentWeight,
        regressionUsedForTrend,
      );
      summaryHtml += _insights.getPlateauInsight(
        analysisRange.start,
        analysisRange.end,
      );
      summaryHtml += _insights.getTrendChangeInsight(
        analysisRange.start,
        analysisRange.end,
      );

      selections.insightSummaryContainer.html(
        summaryHtml || "<p>Analysis requires more data.</p>",
      );
    },
  };

  // ========================================================================
  // Event Handlers (`_handlers`)
  // ========================================================================
  const _handlers = {
    mouseOver(event, d) {
      if (!selections.tooltip || !d) return;
      const selection = d3.select(event.currentTarget);
      selection.raise(); // Bring dot to front
      selection
        .transition()
        .duration(50)
        .attr("r", CONFIG.dotHoverRadius)
        .style("opacity", 1);

      let tt = `<strong>${_helpers.formatDateLong(d.date)}</strong>Weight: ${_helpers.formatValue(d.value, 1)} KG`; // Use long date format
      if (d.sma !== null) {
        tt += `<br/>SMA (${CONFIG.movingAverageWindow}d): ${_helpers.formatValue(d.sma, 1)} KG`;
      }
      if (d.value !== null && d.sma !== null) {
        const dev = d.value - d.sma;
        tt += `<br/>Deviation: <span class="${dev >= 0 ? "positive" : "negative"}">${dev >= 0 ? "+" : ""}${_helpers.formatValue(dev, 1)} KG</span>`;
      }
      if (d.isOutlier) {
        tt += `<br/><span class="note outlier-note">Potential Outlier</span>`;
      }
      // Add other data if available
      if (
        d.calorieIntake !== null ||
        d.googleFitTDEE !== null ||
        d.netBalance !== null ||
        d.expectedWeightChange !== null ||
        d.smoothedWeeklyRate !== null ||
        d.avgTdeeDifference !== null
      ) {
        tt += `<hr class="tooltip-hr">`;
        if (d.calorieIntake !== null)
          tt += `Intake: ${_helpers.formatValue(d.calorieIntake, 0)} kcal<br/>`;
        if (d.googleFitTDEE !== null)
          tt += `Expend (GFit): ${_helpers.formatValue(d.googleFitTDEE, 0)} kcal<br/>`;
        if (d.netBalance !== null)
          tt += `Net Balance: ${_helpers.formatValue(d.netBalance, 0)} kcal<br/>`;
        if (d.smoothedWeeklyRate !== null)
          tt += `Smoothed Rate: ${_helpers.formatValue(d.smoothedWeeklyRate, 2)} kg/wk<br/>`; // Feature #5
        if (d.avgTdeeDifference !== null)
          tt += `Avg TDEE Diff: ${_helpers.formatValue(d.avgTdeeDifference, 0)} kcal`; // Feature #8
        // if (d.expectedWeightChange !== null) tt += `Est. Wgt Δ (Day): ${_helpers.formatValue(d.expectedWeightChange * 1000, 0)} g`;
      }
      // Add Annotation text if available (Feature #1)
      const annotation = state.annotations.find(
        (a) => new Date(a.date).getTime() === d.date.getTime(),
      );
      if (annotation) {
        tt += `<hr class="tooltip-hr"><span class="note annotation-note">${annotation.text}</span>`;
      }

      selections.tooltip
        .html(tt)
        // Position tooltip carefully relative to the page, not the SVG element
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 28}px`)
        .transition()
        .duration(100)
        .style("opacity", 0.95);
    },

    mouseOut(event, d) {
      if (!selections.tooltip || !d) return; // Added check for 'd'
      const isHighlighted =
        state.highlightedDate &&
        d?.date.getTime() === state.highlightedDate.getTime();
      d3.select(event.currentTarget)
        .transition()
        .duration(150)
        // Restore radius, check if it's currently highlighted
        .attr("r", isHighlighted ? CONFIG.dotRadius * 1.2 : CONFIG.dotRadius)
        // Reset opacity based on highlight status
        .style("opacity", isHighlighted ? 1 : 0.7);
      selections.tooltip.transition().duration(300).style("opacity", 0);
    },

    // --- Feature #1: Annotation Tooltip ---
    annotationMouseOver(event, d) {
      if (!selections.tooltip || !d) return;
      d3.select(event.currentTarget)
        .select("circle")
        .transition()
        .duration(50)
        .attr("r", CONFIG.annotationMarkerRadius * 1.5);

      let tt = `<strong>Annotation: ${_helpers.formatDateLong(new Date(d.date))}</strong>`;
      tt += `<span class="note annotation-note">${d.text}</span>`;

      selections.tooltip
        .html(tt)
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 28}px`)
        .transition()
        .duration(100)
        .style("opacity", 0.95);
    },
    annotationMouseOut(event, d) {
      if (!selections.tooltip) return;
      d3.select(event.currentTarget)
        .select("circle")
        .transition()
        .duration(150)
        .attr("r", CONFIG.annotationMarkerRadius);
      selections.tooltip.transition().duration(300).style("opacity", 0);
    },

    // --- Feature #7: Trend Change Tooltip ---
    trendChangeMouseOver(event, d) {
      if (!selections.tooltip || !d) return;
      d3.select(event.currentTarget)
        .select("path")
        .transition()
        .duration(50)
        .style("opacity", 1);

      const direction = d.magnitude > 0 ? "acceleration" : "deceleration";
      const rateChange = Math.abs(d.magnitude * 7); // Weekly rate change

      let tt = `<strong>Trend Change: ${_helpers.formatDateLong(d.date)}</strong>`;
      tt += `<span class="note warn">Significant ${direction} detected.<br/>Approx. weekly rate change: ${_helpers.formatValue(rateChange, 2)} kg/wk</span>`;

      selections.tooltip
        .html(tt)
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 28}px`)
        .transition()
        .duration(100)
        .style("opacity", 0.95);
    },
    trendChangeMouseOut(event, d) {
      if (!selections.tooltip) return;
      d3.select(event.currentTarget)
        .select("path")
        .transition()
        .duration(150)
        .style("opacity", 0.8);
      selections.tooltip.transition().duration(300).style("opacity", 0);
    },

    brushed(event) {
      // Only react to user interactions ("end" event), not programmatic moves or zoom-triggered moves
      if (
        !event.sourceEvent ||
        (event.sourceEvent &&
          (event.sourceEvent.type === "brush" ||
            event.sourceEvent.type === "zoom"))
      ) {
        // If zoom triggered the brush move, update scales silently but don't redraw here (zoom handler does it)
        if (event.sourceEvent && event.sourceEvent.type === "zoom") {
          const selection = event.selection;
          if (scales.x && scales.xContext) {
            const newXDomain = selection
              ? selection.map(scales.xContext.invert)
              : scales.xContext.domain();
            scales.x.domain(newXDomain);
            // Sync other X scales silently
            scales.xBalance?.domain(newXDomain);
            scales.xRate?.domain(newXDomain);
            scales.xTdeeDiff?.domain(newXDomain);
          }
        }
        return;
      }

      const selection = event.selection;
      if (scales.x && scales.xContext) {
        const newXDomain = selection
          ? selection.map(scales.xContext.invert)
          : scales.xContext.domain();
        scales.x.domain(newXDomain);

        // Feature #3: Update zoom transform to match brush
        if (
          zoom &&
          selections.zoomCaptureRect &&
          !selections.zoomCaptureRect.empty()
        ) {
          const [startPixel, endPixel] = selection
            ? selection
            : scales.xContext.range();
          const k =
            endPixel - startPixel > 0
              ? scales.xContext.range()[1] / (endPixel - startPixel)
              : 1; // Avoid division by zero
          const tx = -startPixel * k;
          const newTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
          state.lastZoomTransform = newTransform;
          // Apply transform without triggering zoom event
          selections.zoomCaptureRect.call(zoom.transform, newTransform);
        }

        state.analysisRange.isCustom = false; // Brushing resets analysis to chart view
        state.highlightedDate = null; // Clear highlight on brush/zoom
        _update.runAll();
        _stats.updateAll();
      }
    },

    // --- Feature #3: Zoom Handler ---
    zoomed(event) {
      // Only react to user zoom/pan gestures
      if (
        !event.sourceEvent ||
        (event.sourceEvent && event.sourceEvent.type === "brush")
      ) {
        return; // Ignore brush-triggered zoom updates
      }
      const transform = event.transform;
      state.lastZoomTransform = transform; // Store the latest transform

      // Update the main X scale based on the zoom transform applied to the context scale
      if (scales.x && scales.xContext) {
        const newXDomain = transform.rescaleX(scales.xContext).domain();
        scales.x.domain(newXDomain);

        // Update the brush selection to match the new zoomed domain
        if (selections.brushGroup?.node() && brush) {
          const newBrushPixels = [
            scales.xContext(newXDomain[0]),
            scales.xContext(newXDomain[1]),
          ];
          // Move the brush programmatically WITHOUT triggering the 'brushed' handler's redraw logic again
          // Pass a custom sourceEvent to indicate it's from zoom
          selections.brushGroup.call(brush.move, newBrushPixels, event); // Pass event as source
        }
      }

      state.analysisRange.isCustom = false; // Zooming resets analysis to chart view
      state.highlightedDate = null; // Clear highlight on brush/zoom
      _update.runAll(); // Redraw everything based on the new domain
      _stats.updateAll(); // Update stats for the new view
    },

    resize: (() => {
      let timeoutId = null;
      return () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          console.log("Resize detected, re-rendering chart...");
          state.highlightedDate = null; // Clear highlight on resize
          if (_setup.runAll()) {
            // Recreates SVGs, scales, axes, brush, zoom
            if (state.isInitialized && state.processedData?.length > 0) {
              _domains.initialize(); // Re-initialize domains, initial brush/zoom based on new dimensions
              _update.runAll();
              _stats.updateAll();
              _legend.build();
              _annotations.renderList(); // Re-render annotation list if dimensions change
            } else if (state.isInitialized) {
              // Handle case where chart is initialized but no data yet
              _update.domainsAndAxes(); // Redraw axes for new size
              _update.contextChart();
              _update.balanceChart([]);
              _update.rateOfChangeChart([]);
              _update.tdeeDifferenceChart([]);
              _update.weeklySummary([]);
              _stats.updateAll(); // Update stats display (will show N/A)
              _legend.build(); // Rebuild legend
              _annotations.renderList();
            }
          } else {
            console.error("Chart redraw on resize failed during setup phase.");
          }
        }, CONFIG.debounceResizeMs);
      };
    })(),

    themeToggle() {
      _setTheme(state.currentTheme === "light" ? "dark" : "light");
    },

    goalSubmit(event) {
      event.preventDefault();
      const goalWeightVal = selections.goalWeightInput?.property("value");
      const goalDateVal = selections.goalDateInput?.property("value");
      const targetRateVal = selections.goalTargetRateInput?.property("value");
      let isValid = true;
      let tempGoal = { weight: null, date: null, targetRate: null };

      if (goalWeightVal) {
        const pW = parseFloat(goalWeightVal);
        if (!isNaN(pW) && pW > 0) tempGoal.weight = pW;
        else {
          _helpers.showStatusMessage("Invalid goal weight.", "error");
          isValid = false;
        }
      }
      if (goalDateVal) {
        const pD = new Date(goalDateVal);
        if (!isNaN(pD.getTime())) {
          pD.setHours(0, 0, 0, 0); // Normalize date
          tempGoal.date = pD;
        } else {
          _helpers.showStatusMessage("Invalid goal date.", "error");
          isValid = false;
        }
      }
      if (targetRateVal) {
        const pR = parseFloat(targetRateVal);
        if (!isNaN(pR)) tempGoal.targetRate = pR;
        else {
          _helpers.showStatusMessage("Invalid target rate.", "error");
          isValid = false;
        }
      }

      if (isValid) {
        state.goal = tempGoal;
        _data.saveGoal();
        _update.runAll(); // Redraw might affect goal line or domain
        _stats.updateAll(); // Recalculate goal stats
        _legend.build(); // Update legend if goal line appears/disappears
      }
    },

    trendlineChange() {
      state.highlightedDate = null; // Clear highlight if params change
      _update.runAll(); // Redraw trend lines and potentially Y domain
      _stats.updateAll(); // Recalculate stats based on new regression start date if changed
    },

    regressionToggle(event) {
      _legend.toggleSeriesVisibility("regression", event.target.checked);
    },

    analysisRangeUpdate() {
      const startVal = selections.analysisStartDateInput?.property("value");
      const endVal = selections.analysisEndDateInput?.property("value");
      const startDate = startVal ? new Date(startVal) : null;
      const endDate = endVal ? new Date(endVal) : null;

      let isValid = true;
      let errorMsg = "";

      if (!startDate || isNaN(startDate.getTime())) {
        isValid = false;
        errorMsg = "Invalid start date.";
      }
      if (!endDate || isNaN(endDate.getTime())) {
        isValid = false;
        errorMsg = errorMsg
          ? "Invalid start and end dates."
          : "Invalid end date.";
      }
      if (isValid && startDate > endDate) {
        isValid = false;
        errorMsg = "Start date cannot be after end date.";
      }

      if (isValid) {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        state.analysisRange.start = startDate;
        state.analysisRange.end = endDate;
        state.analysisRange.isCustom = true;
        state.highlightedDate = null; // Clear highlight on range change
        _handlers.updateAnalysisRangeDisplay(); // Update UI display
        _stats.updateAll(); // Update stats based on new custom range
        // _update.weeklySummary(state.weeklySummaryData); // Update weekly summary table (done within stats update)
        // _update.plateauRegions(); // Redraw plateaus (done within stats update)
        // _update.trendChangeMarkers(); // Redraw trend changes (done within stats update)
        _helpers.showStatusMessage("Analysis range updated.", "info", 1500);
      } else {
        _helpers.showStatusMessage(errorMsg, "error");
      }
    },

    analysisRangeReset() {
      state.analysisRange.isCustom = false;
      state.analysisRange.start = null; // Will be derived from chart view now
      state.analysisRange.end = null;
      state.highlightedDate = null; // Clear highlight
      _handlers.updateAnalysisRangeInputsFromCurrentView();
      _handlers.updateAnalysisRangeDisplay();
      _stats.updateAll(); // Update stats based on current chart view
      // _update.weeklySummary(state.weeklySummaryData); // Done in stats update
      // _update.plateauRegions(); // Done in stats update
      // _update.trendChangeMarkers(); // Done in stats update
      _helpers.showStatusMessage(
        "Analysis range reset to chart view.",
        "info",
        1500,
      );
    },

    // --- Feature #4: Stat Date Click Handler ---
    statDateClick(date) {
      if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        state.highlightedDate = null; // Clear if invalid date provided
      } else {
        const normalizedDate = new Date(date);
        normalizedDate.setHours(0, 0, 0, 0); // Ensure time part is zeroed
        state.highlightedDate = normalizedDate; // Set the date to highlight
      }
      // console.log("Highlighting date:", state.highlightedDate);
      _update.chartDots(); // Trigger redraw of dots to show/hide highlight marker
    },

    // --- Feature #10: What-If Handler ---
    whatIfSubmit(event) {
      event?.preventDefault(); // Prevent form submission if triggered by form
      const intakeVal = selections.whatIfIntakeInput?.property("value");
      const durationVal = selections.whatIfDurationInput?.property("value");
      const displayEl = selections.whatIfResultDisplay;

      if (!displayEl) return;

      const intake = intakeVal ? parseInt(intakeVal, 10) : null;
      const duration = durationVal ? parseInt(durationVal, 10) : 30; // Default 30 days

      if (
        intake === null ||
        isNaN(intake) ||
        intake <= 0 ||
        isNaN(duration) ||
        duration <= 0
      ) {
        displayEl
          .text("Please enter a valid positive daily intake.")
          .classed("error", true);
        return;
      }

      // Get current best TDEE estimate from stats
      const stats = _stats.getAll(); // Recalculate stats to get latest TDEE
      const tdee = stats.avgTDEE_WgtChange ?? stats.avgTDEE_GFit; // Prioritize trend TDEE

      if (tdee === null || isNaN(tdee)) {
        displayEl
          .text(
            "Cannot project: TDEE estimation unavailable for the current analysis range.",
          )
          .classed("error", true);
        return;
      }

      const dailyNet = intake - tdee;
      const dailyWeightChange = dailyNet / CONFIG.KCALS_PER_KG;
      const totalWeightChange = dailyWeightChange * duration;
      const currentWeight = stats.currentSma ?? stats.currentWeight; // Use SMA if available
      const projectedWeight =
        currentWeight !== null ? currentWeight + totalWeightChange : null;

      let resultText = `Projection based on Est. TDEE of ${_helpers.formatValue(tdee, 0)} kcal: `;
      resultText += `Net ${_helpers.formatValue(dailyNet, 0)} kcal/day → ~${_helpers.formatValue(dailyWeightChange * 1000, 0)} g/day. `;
      resultText += `After ${duration} days: ~${_helpers.formatValue(totalWeightChange, 1)} kg change.`;
      if (projectedWeight !== null) {
        resultText += ` Est. weight: ${_helpers.formatValue(projectedWeight, 1)} kg.`;
      }

      displayEl.text(resultText).classed("error", false);
    },

    getAnalysisDateRange() {
      // If custom range is set and valid, use it
      if (
        state.analysisRange.isCustom &&
        state.analysisRange.start instanceof Date &&
        !isNaN(state.analysisRange.start) &&
        state.analysisRange.end instanceof Date &&
        !isNaN(state.analysisRange.end) &&
        state.analysisRange.start <= state.analysisRange.end
      ) {
        return {
          start: state.analysisRange.start,
          end: state.analysisRange.end,
        };
      }
      // Otherwise, use the current chart view domain
      const chartDomain = scales.x?.domain();
      if (
        chartDomain?.length === 2 &&
        chartDomain[0] instanceof Date &&
        chartDomain[1] instanceof Date
      ) {
        return { start: chartDomain[0], end: chartDomain[1] };
      }
      // Absolute fallback (shouldn't normally be needed if data exists)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return { start: yesterday, end: today };
    },

    updateAnalysisRangeInputsFromCurrentView() {
      if (
        scales.x &&
        selections.analysisStartDateInput &&
        selections.analysisEndDateInput
      ) {
        const currentDomain = scales.x.domain();
        if (
          currentDomain?.length === 2 &&
          currentDomain[0] instanceof Date &&
          currentDomain[1] instanceof Date
        ) {
          const startStr = _helpers.formatDate(currentDomain[0]);
          const endStr = _helpers.formatDate(currentDomain[1]);
          selections.analysisStartDateInput.property(
            "value",
            startStr === "N/A" ? "" : startStr,
          );
          selections.analysisEndDateInput.property(
            "value",
            endStr === "N/A" ? "" : endStr,
          );
        } else {
          selections.analysisStartDateInput.property("value", "");
          selections.analysisEndDateInput.property("value", "");
        }
      }
    },

    updateAnalysisRangeDisplay() {
      // Updates display text AND heading (Feature #11)
      const range = _handlers.getAnalysisDateRange();
      const startStr = _helpers.formatDateShort(range.start);
      const endStr = _helpers.formatDateShort(range.end);
      const rangeText = state.analysisRange.isCustom
        ? `${startStr} to ${endStr}`
        : "Current Chart View";

      if (selections.analysisRangeDisplay) {
        selections.analysisRangeDisplay.text(rangeText);
      }
      // Update heading of the analysis results card (Feature #11)
      if (selections.analysisResultsHeading) {
        selections.analysisResultsHeading
          .select("small")
          .text(`(${rangeText})`);
      }
    },

    setupAll() {
      window.addEventListener("resize", _handlers.resize);
      if (selections.themeToggle)
        selections.themeToggle.on("click", _handlers.themeToggle);

      const goalForm = _helpers.getElementByIdSafe("goal-setting-form");
      if (goalForm) goalForm.addEventListener("submit", _handlers.goalSubmit);

      const trendInputs = [
        selections.trendStartDateInput,
        selections.trendInitialWeightInput,
        selections.trendWeeklyIncrease1Input,
        selections.trendWeeklyIncrease2Input,
      ];
      trendInputs.forEach((input) => {
        if (input?.node())
          input.node().addEventListener("input", _handlers.trendlineChange);
      });

      if (selections.regressionToggle?.node())
        selections.regressionToggle
          .node()
          .addEventListener("change", _handlers.regressionToggle);

      if (selections.updateAnalysisRangeBtn)
        selections.updateAnalysisRangeBtn.on(
          "click",
          _handlers.analysisRangeUpdate,
        );
      if (selections.resetAnalysisRangeBtn)
        selections.resetAnalysisRangeBtn.on(
          "click",
          _handlers.analysisRangeReset,
        );

      // Feature #1: Annotation form handler
      if (selections.annotationForm)
        selections.annotationForm.on("submit", _annotations.handleSubmit);

      // Feature #10: What-If handler
      if (selections.whatIfSubmitBtn)
        selections.whatIfSubmitBtn.on("click", _handlers.whatIfSubmit);
      // Also trigger on Enter key in inputs
      if (selections.whatIfIntakeInput)
        selections.whatIfIntakeInput.on("keydown", (event) => {
          if (event.key === "Enter") _handlers.whatIfSubmit(event);
        });
      if (selections.whatIfDurationInput)
        selections.whatIfDurationInput.on("keydown", (event) => {
          if (event.key === "Enter") _handlers.whatIfSubmit(event);
        });

      // Feature #4: Clear highlight on background click (SVG or zoom rect)
      // Attach to SVG, check target
      selections.svg?.on("click", (event) => {
        // Check if the click target is the zoom rect OR the SVG background itself,
        // and NOT something interactive like a dot or marker.
        const targetNode = event.target;
        const isInteractive =
          d3.select(targetNode).classed("dot") ||
          d3.select(targetNode).classed("annotation-marker") || // Assuming markers have this class
          d3.select(targetNode).classed("trend-change-marker") || // Assuming markers have this class
          d3.select(targetNode.parentNode).classed("annotation-marker") || // Check parent group
          d3.select(targetNode.parentNode).classed("trend-change-marker"); // Check parent group

        if (
          !isInteractive &&
          (targetNode === selections.zoomCaptureRect?.node() ||
            targetNode === selections.svg?.node())
        ) {
          if (state.highlightedDate) {
            state.highlightedDate = null;
            _update.chartDots(); // Redraw to remove highlight marker and style
          }
        }
      });

      console.log("Event handlers set up.");
    },
  };

  // ========================================================================
  // Legend & Visibility (`_legend`)
  // ========================================================================
  const _legend = {
    toggleSeriesVisibility(seriesId, isVisible) {
      if (state.seriesVisibility.hasOwnProperty(seriesId)) {
        state.seriesVisibility[seriesId] = isVisible;
        if (seriesId === "regression") {
          state.showRegression = isVisible;
          if (selections.regressionToggle)
            selections.regressionToggle.property("checked", isVisible);
        }
        state.highlightedDate = null; // Clear highlight when toggling series
        _update.runAll(); // Redraw visuals (will re-calculate Y domain)
        _stats.updateAll(); // Recalculate stats (domain might change)
        _legend.updateAppearance(seriesId, isVisible);
      } else {
        console.warn(`Attempted to toggle unknown series: ${seriesId}`);
      }
    },

    updateAppearance(seriesId, isVisible) {
      if (selections.legendContainer)
        selections.legendContainer
          .selectAll(`.legend-item[data-id='${seriesId}']`)
          .classed("hidden", !isVisible);
    },

    build() {
      if (!selections.legendContainer?.node()) {
        console.warn("Legend container not found.");
        return;
      }
      selections.legendContainer.html(""); // Clear existing legend items

      if (Object.keys(colors).length === 0 || !state.processedData?.length) {
        selections.legendContainer.append("span").text("No data for legend.");
        return;
      }

      const legendItemsConfig = [
        {
          id: "raw",
          label: "Raw Data",
          type: "dot",
          color: colors.rawDot,
          styleClass: "raw-dot",
        },
        {
          id: "sma",
          label: `Weight (${CONFIG.movingAverageWindow}d SMA & Band)`,
          type: "area+line",
          color: colors.sma,
          areaColor: colors.band,
          styleClass: "sma-line",
        },
        {
          id: "expected",
          label: "Expected Wgt (Net Cal)",
          type: "line",
          color: colors.expectedLineColor,
          styleClass: "expected-weight-line",
          dash: "2, 3",
        },
        {
          id: "regression",
          label: "Lin. Regression",
          type: "line",
          color: colors.regression,
          styleClass: "regression-line",
          dash: "",
        },
        {
          id: "trend1",
          label: "Manual Trend 1",
          type: "line",
          color: colors.trend1,
          styleClass: "manual-trend-1",
          dash: "4, 4",
        },
        {
          id: "trend2",
          label: "Manual Trend 2",
          type: "line",
          color: colors.trend2,
          styleClass: "manual-trend-2",
          dash: "4, 4",
        },
        ...(state.goal.weight !== null
          ? [
              {
                id: "goal",
                label: "Goal Path",
                type: "line",
                color: colors.goal,
                styleClass: "goal-line",
                dash: "6, 3",
              },
            ]
          : []),
        {
          id: "annotations",
          label: "Annotations",
          type: "marker",
          color: colors.annotationMarker,
          styleClass: "annotation-marker",
        }, // Feature #1
        {
          id: "plateaus",
          label: "Plateaus",
          type: "area",
          color: colors.plateauColor,
          styleClass: "plateau-region",
        }, // Feature #6
        {
          id: "trendChanges",
          label: "Trend Δ",
          type: "marker",
          color: colors.trendChangeColor,
          styleClass: "trend-change-marker",
        }, // Feature #7
      ];

      legendItemsConfig.forEach((item) => {
        const isVisible = state.seriesVisibility[item.id] ?? true;
        const itemDiv = selections.legendContainer
          .append("div")
          .attr("class", `legend-item ${item.styleClass}`)
          .attr("data-id", item.id)
          .classed("hidden", !isVisible)
          .on("click", () =>
            _legend.toggleSeriesVisibility(item.id, !isVisible),
          );

        const swatch = itemDiv
          .append("span")
          .attr("class", `legend-swatch ${item.type}`);

        if (item.type === "dot") {
          swatch
            .style("background-color", item.color)
            .style("border-radius", "50%");
        } else if (item.type === "marker") {
          swatch
            .style("background-color", item.color)
            .style("border-radius", "50%");
        } else if (item.type === "area") {
          swatch.style("background-color", item.color).style("opacity", 0.6);
        } else if (item.type === "line") {
          swatch.style("background-color", item.color);
          if (item.dash) {
            const dashArray = item.dash.split(",").map(Number);
            if (
              dashArray.length === 2 &&
              dashArray[0] > 0 &&
              dashArray[1] >= 0
            ) {
              const total = dashArray[0] + dashArray[1];
              const solidPercent = (dashArray[0] / total) * 100;
              swatch
                .style(
                  "background-image",
                  `linear-gradient(to right, ${item.color} ${solidPercent}%, transparent ${solidPercent}%)`,
                )
                .style("background-size", `${total}px 100%`)
                .style("background-color", "transparent"); // Clear solid color if using gradient
            }
          }
        } else if (item.type === "area+line") {
          swatch
            .style("background-color", item.areaColor || colors.band)
            .style("border", `2px solid ${item.color}`)
            .style("height", "10px"); // Adjust height for visual balance
        }

        itemDiv.append("span").attr("class", "legend-text").text(item.label);
      });
    },
  };

  // ========================================================================
  // Annotations Management (`_annotations`) Feature #1
  // ========================================================================
  const _annotations = {
    load() {
      try {
        const stored = localStorage.getItem(
          CONFIG.localStorageKeys.annotations,
        );
        state.annotations = stored ? JSON.parse(stored) : [];
        // Basic validation/parsing
        state.annotations = state.annotations.filter(
          (a) => a && a.date && a.text && a.id,
        ); // Filter out invalid entries
        state.annotations.forEach((a) => {
          if (
            !(new Date(a.date) instanceof Date) ||
            isNaN(new Date(a.date).getTime())
          ) {
            console.warn(
              "Invalid date found in stored annotation, removing:",
              a,
            );
            // Ideally remove this specific invalid annotation, requires filtering logic change
          }
          a.date = new Date(a.date).toISOString().slice(0, 10); // Normalize date format
        });
        state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date)); // Ensure sorted
      } catch (e) {
        console.error("Error loading annotations:", e);
        localStorage.removeItem(CONFIG.localStorageKeys.annotations); // Clear corrupted data
        state.annotations = [];
      }
      this.renderList(); // Update UI list
    },
    save() {
      try {
        localStorage.setItem(
          CONFIG.localStorageKeys.annotations,
          JSON.stringify(state.annotations),
        );
      } catch (e) {
        console.error("Error saving annotations:", e);
        _helpers.showStatusMessage("Could not save annotations.", "error");
      }
    },
    add(dateStr, text, type = "point") {
      const date = new Date(dateStr);
      if (isNaN(date.getTime()) || !text || text.trim() === "") {
        _helpers.showStatusMessage(
          "Invalid date or empty text for annotation.",
          "error",
        );
        return;
      }
      date.setHours(0, 0, 0, 0); // Normalize date

      const newAnnotation = {
        id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Simple unique ID
        date: date.toISOString().slice(0, 10), // Store as YYYY-MM-DD string
        text: text.trim(),
        type: type, // 'point' or 'range' (range not fully implemented visually)
      };
      state.annotations.push(newAnnotation);
      state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date)); // Keep sorted
      this.save();
      this.renderList();
      _update.annotations(state.filteredData); // Redraw annotations on chart
      _helpers.showStatusMessage("Annotation added.", "success", 1500);
    },
    remove(id) {
      state.annotations = state.annotations.filter((ann) => ann.id !== id);
      this.save();
      this.renderList();
      _update.annotations(state.filteredData); // Redraw annotations on chart
      _helpers.showStatusMessage("Annotation removed.", "info", 1500);
    },
    handleSubmit(event) {
      event.preventDefault();
      const dateVal = selections.annotationDateInput?.property("value");
      const textVal = selections.annotationTextInput?.property("value");
      // const typeVal = selections.annotationTypeInput?.property('value'); // Add if using types

      _annotations.add(dateVal, textVal);

      // Clear form
      if (selections.annotationDateInput)
        selections.annotationDateInput.property("value", "");
      if (selections.annotationTextInput)
        selections.annotationTextInput.property("value", "");
    },
    renderList() {
      if (!selections.annotationList) return;
      selections.annotationList.html(""); // Clear list

      if (state.annotations.length === 0) {
        selections.annotationList
          .append("li")
          .text("No annotations added yet.")
          .classed("empty-msg", true);
        return;
      }

      state.annotations.forEach((ann) => {
        const li = selections.annotationList.append("li");
        li.append("span")
          .attr("class", "annotation-date")
          .text(_helpers.formatDateShort(new Date(ann.date)) + ":");
        li.append("span").attr("class", "annotation-text").text(ann.text);
        li.append("button")
          .attr("class", "remove-annotation")
          .attr("title", "Remove annotation")
          .html("&times;") // Use × symbol
          .on("click", () => _annotations.remove(ann.id));
      });
    },
  };

  // ========================================================================
  // Initialization & Public Interface
  // ========================================================================
  function _cacheSelectors() {
    const idsToCache = [
      // Containers
      "chart-container",
      "context-chart-container",
      "balance-chart-container",
      "legend-container",
      "rate-of-change-container",
      "tdee-reconciliation-container",
      "weekly-summary-container",
      // Sidebar Cards & Headings
      "controls-section",
      "analysis-settings-card",
      "all-time-stats-card",
      "analysis-results-card",
      "analysis-results-heading",
      "goal-tracker-card",
      // Tooltip & Status
      "tooltip",
      "status-message",
      "theme-toggle",
      // Controls
      "toggleRegression",
      "trendStartDate",
      "trendInitialWeight",
      "trendWeeklyIncrease",
      "trendWeeklyIncrease_2",
      // Analysis Settings
      "analysisStartDate",
      "analysisEndDate",
      "updateAnalysisRange",
      "resetAnalysisRange",
      "analysis-range-display",
      "regression-start-date-label",
      // Goal Tracker Form & Stats
      "goalWeight",
      "goalDate",
      "goalTargetRate",
      "goal-setting-form",
      "target-weight-stat",
      "target-rate-stat",
      "weight-to-goal",
      "current-rate-feedback",
      "estimated-time-to-goal",
      "required-rate-for-goal",
      "required-net-calories",
      "suggested-intake-range", // Feature #9
      // All-Time Stats
      "starting-weight",
      "current-weight",
      "current-sma",
      "total-change",
      "max-weight",
      "max-weight-date",
      "min-weight",
      "min-weight-date",
      // Analysis Results Stats
      "volatility-score",
      "avg-intake",
      "avg-expenditure",
      "avg-net-balance",
      "estimated-deficit-surplus",
      "avg-tdee-gfit",
      "avg-tdee-wgt-change",
      "rolling-weekly-change-sma",
      "regression-slope",
      "netcal-rate-correlation",
      "weight-consistency",
      "weight-consistency-details",
      "calorie-consistency",
      "calorie-consistency-details",
      "avg-tdee-difference", // Feature #8
      // Insights
      "insight-summary",
      // Annotations (Feature #1)
      "annotations-section",
      "annotation-form",
      "annotation-date",
      "annotation-text",
      "annotation-list", //'annotation-type',
      // What-If (Feature #10)
      "what-if-controls",
      "what-if-intake",
      "what-if-duration",
      "what-if-submit",
      "what-if-result",
    ];

    selections.body = d3.select("body");
    console.log("_cacheSelectors (v2): Starting selection process.");

    // Mapping for complex ID -> camelCase key changes
    const keyMap = {
      "context-chart-container": "contextContainer",
      "balance-chart-container": "balanceChartContainer",
      "rate-of-change-container": "rateChartContainer", // Feature #5
      "tdee-reconciliation-container": "tdeeDiffContainer", // Feature #8
      "weekly-summary-container": "weeklySummaryContainer", // Feature #2
      "legend-container": "legendContainer",
      "chart-container": "chartContainer",
      goalWeight: "goalWeightInput",
      goalDate: "goalDateInput",
      goalTargetRate: "goalTargetRateInput",
      toggleRegression: "regressionToggle",
      trendStartDate: "trendStartDateInput",
      trendInitialWeight: "trendInitialWeightInput",
      trendWeeklyIncrease: "trendWeeklyIncrease1Input",
      trendWeeklyIncrease_2: "trendWeeklyIncrease2Input",
      "regression-start-date-label": "regressionStartDateLabel",
      analysisStartDate: "analysisStartDateInput",
      analysisEndDate: "analysisEndDateInput",
      updateAnalysisRange: "updateAnalysisRangeBtn",
      resetAnalysisRange: "resetAnalysisRangeBtn",
      "analysis-range-display": "analysisRangeDisplay",
      "analysis-results-heading": "analysisResultsHeading", // Feature #11
      "insight-summary": "insightSummaryContainer",
      "annotation-form": "annotationForm", // Feature #1
      "annotation-date": "annotationDateInput", // Feature #1
      "annotation-text": "annotationTextInput", // Feature #1
      //'annotation-type': 'annotationTypeInput', // Feature #1
      "annotation-list": "annotationList", // Feature #1
      "what-if-intake": "whatIfIntakeInput", // Feature #10
      "what-if-duration": "whatIfDurationInput", // Feature #10
      "what-if-submit": "whatIfSubmitBtn", // Feature #10
      "what-if-result": "whatIfResultDisplay", // Feature #10
    };

    idsToCache.forEach((id) => {
      // Convert kebab-case to camelCase unless mapped
      const camelCaseKey =
        keyMap[id] || id.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());

      let elementNode = null;
      let d3Selection = null;
      try {
        // Use querySelector for potentially more complex selectors if needed, though ID is fine
        elementNode = document.querySelector(`#${id}`);
        d3Selection = elementNode ? d3.select(elementNode) : d3.select(null);
      } catch (e) {
        console.error(`Error selecting #${id}:`, e);
        d3Selection = d3.select(null);
      }

      if (d3Selection && !d3Selection.empty()) {
        selections[camelCaseKey] = d3Selection;
        const nodeClasses = d3Selection.attr("class") || "";
        // Cache direct node references for stat elements for faster updates
        if (
          nodeClasses.includes("stat-value") ||
          nodeClasses.includes("stat-date") ||
          nodeClasses.includes("stat-details") ||
          nodeClasses.includes("feedback")
        ) {
          selections.statElements[camelCaseKey] = d3Selection.node();
        }
        // Also store the D3 selection for date elements for potential future use
        if (id === "max-weight-date" || id === "min-weight-date") {
          // selections[camelCaseKey] is already set above
        }
      } else {
        selections[camelCaseKey] = null; // Store null if not found
        // Reduce console noise: Only warn for critical elements later
        // if (!elementNode) console.warn(`_cacheSelectors: Could not find element #${id}. JS key: ${camelCaseKey}`);
        // else console.warn(`_cacheSelectors: Found node for #${id} but d3.select failed. JS key: ${camelCaseKey}`);
      }
    });

    // Critical check
    const critical = {
      chartContainer: selections.chartContainer,
      contextContainer: selections.contextContainer,
      balanceChartContainer: selections.balanceChartContainer,
      legendContainer: selections.legendContainer,
      // Add new required chart containers if they are critical for basic operation
      rateChartContainer: selections.rateChartContainer, // F5
      tdeeDiffContainer: selections.tdeeDiffContainer, // F8
      tooltip: selections.tooltip, // Tooltip is critical
    };
    const missing = Object.entries(critical).filter(
      ([key, selection]) => !selection || selection.empty(),
    );
    if (missing.length > 0) {
      const missingKeys = missing.map(([key]) => key).join(", ");
      const missingHtmlIds = missing
        .map(([key]) => {
          // Try to find the original ID from the map or by reversing kebab->camel
          const originalId =
            Object.keys(keyMap).find((k) => keyMap[k] === key) ||
            key.replace(/([A-Z])/g, "-$1").toLowerCase();
          return `#${originalId}`;
        })
        .join(", ");
      console.error(
        `Missing critical D3 selection(s): ${missingKeys} (Expected HTML IDs: ${missingHtmlIds})`,
      );
      throw new Error(
        `Failed to cache essential D3 selections. Check HTML for: ${missingHtmlIds}`,
      );
    }

    // Set initial regression toggle state
    if (selections.regressionToggle?.node()) {
      state.showRegression = selections.regressionToggle.property("checked");
      state.seriesVisibility.regression = state.showRegression;
    } else {
      console.warn(
        "Regression toggle (#toggleRegression) not found. Defaulting to show.",
      );
      state.showRegression = true;
      state.seriesVisibility.regression = true;
    }
    console.log("_cacheSelectors (v2): Finished selection process.");
  }

  function _loadTheme() {
    const savedTheme =
      localStorage.getItem(CONFIG.localStorageKeys.theme) || "light";
    _setTheme(savedTheme);
  }

  function _setTheme(theme) {
    state.currentTheme = theme;
    selections.body?.classed("dark-theme", theme === "dark");
    if (selections.themeToggle) {
      selections.themeToggle
        .text(theme === "dark" ? "☀️" : "🌙")
        .attr(
          "aria-label",
          `Switch to ${theme === "dark" ? "Light" : "Dark"} Theme`,
        );
    }
    localStorage.setItem(CONFIG.localStorageKeys.theme, theme);
    _helpers.updateColors(); // Update color cache
    if (state.isInitialized) {
      _legend.build(); // Rebuild legend with new colors
      _update.runAll(); // Redraw chart with new theme styles/colors
      // Stats don't need recalculating on theme change
    }
  }

  function initialize() {
    console.log("Initializing Weight Insights - Advanced (v2)...");
    try {
      if (typeof d3 === "undefined" || typeof d3.select !== "function") {
        throw new Error("D3 library is invalid or not loaded correctly.");
      }
      _cacheSelectors();
      _loadTheme();
      _data.load();
      _data.loadGoal();
      _annotations.load(); // Feature #1: Load annotations
      _data.processRawData(); // Includes SMA, rate, TDEE diff calcs

      if (!_setup.runAll()) {
        // Includes setup for new charts, zoom
        throw new Error("Chart setup failed.");
      }
      _handlers.setupAll(); // Includes handlers for annotations, what-if

      if (state.processedData?.length > 0) {
        _domains.initialize(); // Sets initial view, brush, zoom
      } else {
        console.warn("No processed data available. Chart will be empty.");
        if (selections.insightSummaryContainer)
          selections.insightSummaryContainer.html("<p>No data loaded.</p>");
        // Still setup axes etc for empty state
        _update.domainsAndAxes();
        _update.contextChart();
        _update.balanceChart([]);
        _update.rateOfChangeChart?.([]); // F5, F8
        _update.tdeeDifferenceChart?.([]);
        _update.weeklySummary([]); // F2
      }

      _legend.build(); // Includes new legend items
      _annotations.renderList(); // Feature #1: Initial list render

      state.isInitialized = true;
      _update.runAll(); // Initial draw of everything
      _stats.updateAll(); // Initial calculation and DOM update for stats

      console.log("Initialization complete (v2).");
    } catch (error) {
      console.error("CRITICAL INITIALIZATION ERROR (v2):", error);
      if (selections.chartContainer && !selections.chartContainer.empty()) {
        selections.chartContainer.html(
          `<div class="init-error"><h2>Chart Initialization Failed</h2><p>${error.message}</p><p>Check console for details.</p></div>`,
        );
      }
      // Attempt to hide other potentially broken elements
      d3.selectAll(".dashboard-container > *:not(.chart-section), .sidebar > *")
        .style("opacity", 0.2)
        .style("pointer-events", "none");
      if (selections.chartContainer)
        selections.chartContainer
          .style("opacity", 1)
          .style("pointer-events", "auto"); // Ensure error is visible
    }
  }

  // Return Public Interface
  return {
    initialize: initialize,
  };
})(); // End of IIFE

// --- Run Initialization ---
console.log("chart.js (v2): Setting up DOMContentLoaded listener.");
document.addEventListener("DOMContentLoaded", () => {
  console.log("chart.js (v2): DOMContentLoaded fired.");
  // Use setTimeout to ensure the browser has finished layout/parsing,
  // especially if scripts are loaded async/defer or placed in the head.
  setTimeout(() => {
    console.log("chart.js (v2): setTimeout(0) callback executing.");
    if (
      typeof WeightTrackerChart !== "undefined" &&
      WeightTrackerChart.initialize
    ) {
      console.log("chart.js (v2): Calling WeightTrackerChart.initialize().");
      WeightTrackerChart.initialize();
    } else {
      console.error(
        "chart.js (v2): ERROR - WeightTrackerChart or initialize is not defined!",
      );
    }
  }, 0);
});
console.log("chart.js (v2): Script parsing finished.");
