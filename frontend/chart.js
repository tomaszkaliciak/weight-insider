/**
 * Weight Insights - Advanced Chart Module (v3.1 - Refactored)
 *
 * Description:
 * Renders an interactive multi-chart dashboard for weight tracking analysis.
 * Incorporates features like SMA bands, regression analysis (with CI),
 * manual trend lines, goal tracking, calorie balance visualization,
 * rate of change display, TDEE reconciliation, annotations, plateau/trend
 * detection, weekly summaries, correlation analysis, dynamic axes,
 * interactive elements (hover, click-to-pin, highlighting), and more.
 * Fetches data from `data.json`.
 *
 * Structure:
 * - Configuration (CONFIG)
 * - State Management (state)
 * - D3 Selections Cache (ui)
 * - D3 Constructs (scales, axes, brushes, zoom)
 * - Color Management (colors)
 * - Utility Functions (Utils)
 * - Data Service (DataService) - Loading, processing, calculations
 * - UI Setup (UISetup) - Creating DOM/SVG elements
 * - Domain Manager (DomainManager) - Calculating scale domains
 * - Chart Updaters (FocusChartUpdater, ContextChartUpdater, etc.) - Rendering logic
 * - Statistics Manager (StatsManager) - Calculating and displaying stats
 * - Insights Generator (InsightsGenerator) - Creating textual summaries
 * - Event Handlers (EventHandlers) - User interactions
 * - Legend Manager (LegendManager) - Legend rendering and visibility
 * - Annotation Manager (AnnotationManager) - Handling user annotations
 * - Theme Manager (ThemeManager) - Light/Dark mode
 * - Initialization Logic
 * - Public Interface
 */

// Log script parsing start for timing checks
console.log("chart.js (v3.1 Refactored): Script parsing started.");

const WeightTrackerChart = (function () {
  "use strict";

  // --- Dependency Checks ---
  if (typeof d3 === "undefined") {
    console.error("D3.js library not loaded! Chart cannot initialize.");
    // Minimal error display if D3 is missing
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML =
        '<div class="init-error"><h2>Initialization Failed</h2><p>D3.js library is missing. Please ensure it is loaded correctly before this script.</p></div>';
    });
    return { initialize: () => {} }; // Return dummy interface
  }
  if (typeof ss === "undefined") {
    console.warn(
      "simple-statistics library (ss) not loaded! Correlation and Regression features will use basic fallbacks or be unavailable.",
    );
    // Provide dummy functions if ss is missing to prevent errors
    window.ss = {
      sampleCorrelation: () => {
        console.warn("ss.sampleCorrelation unavailable");
        return NaN;
      },
      linearRegression: () => {
        console.warn("ss.linearRegression unavailable");
        return { m: NaN, b: NaN };
      },
      standardDeviation: (arr) => {
        console.warn(
          "ss.standardDeviation unavailable, using basic implementation.",
        );
        const n = arr.length;
        if (n < 2) return 0;
        const meanVal = arr.reduce((a, b) => a + b, 0) / n;
        return Math.sqrt(
          arr.map((x) => Math.pow(x - meanVal, 2)).reduce((a, b) => a + b, 0) /
            (n - 1),
        );
      },
      sum: (arr) => arr.reduce((a, b) => a + b, 0),
      mean: (arr) =>
        arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length,
      tDistributionQuantile: (p, df) => {
        console.warn(
          "ss.tDistributionQuantile unavailable, using placeholder 1.96 for CI",
        );
        return 1.96; // Very rough approximation (like Z for large df)
      },
    };
  }

  // ========================================================================
  // Configuration & Constants
  // ========================================================================
  const CONFIG = Object.freeze({
    // Make CONFIG immutable
    localStorageKeys: {
      goal: "weightInsightsGoalV2",
      theme: "weightInsightsThemeV2",
      annotations: "weightInsightsAnnotationsV2",
      dynamicYAxis: "weightInsightsDynamicYV3",
    },
    // Data Processing & Analysis
    movingAverageWindow: 7,
    rateOfChangeSmoothingWindow: 7,
    tdeeDiffSmoothingWindow: 14,
    adaptiveTDEEWindow: 28,
    stdDevMultiplier: 1.0, // For SMA band width
    KCALS_PER_KG: 7700,
    OUTLIER_STD_DEV_THRESHOLD: 2.5,
    MIN_POINTS_FOR_REGRESSION: 7,
    MIN_WEEKS_FOR_CORRELATION: 4,
    CONFIDENCE_INTERVAL_ALPHA: 0.05, // For 95% CI
    // Plateau & Trend Detection
    plateauRateThresholdKgWeek: 0.07,
    plateauMinDurationWeeks: 3,
    trendChangeWindowDays: 14,
    trendChangeMinSlopeDiffKgWeek: 0.15,
    // Visual Appearance
    margins: {
      focus: { top: 10, right: 50, bottom: 30, left: 50 },
      context: { top: 10, right: 50, bottom: 30, left: 50 },
      balance: { top: 5, right: 50, bottom: 20, left: 50 },
      rate: { top: 10, right: 50, bottom: 20, left: 50 },
      tdeeDiff: { top: 5, right: 50, bottom: 20, left: 50 },
      correlationScatter: { top: 10, right: 30, bottom: 30, left: 50 },
    },
    dotRadius: 3.5,
    dotHoverRadius: 5.5,
    rawDotRadius: 2.5,
    highlightRadiusMultiplier: 1.8,
    annotationMarkerRadius: 4,
    yAxisPaddingFactor: 0.02,
    yAxisMinPaddingKg: 0.1,
    domainBufferDays: 7, // Buffer for dynamic Y-axis calculation
    // Interaction & Timing
    debounceResizeMs: 250,
    transitionDurationMs: 300,
    initialViewMonths: 3,
    statusMessageDurationMs: 3000,
    tooltipShowDelayMs: 100, // Slight delay before showing tooltip
    tooltipHideDelayMs: 300, // Delay before hiding tooltip
    // Goal Guidance & Lean Gain
    MIN_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.1, // Lower bound for optimal lean gain
    MAX_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.35, // Upper bound for optimal lean gain
    // Fallback Colors (referenced if CSS variables fail)
    fallbackColors: {
      sma: "#3498db",
      band: "rgba(52,152,219,0.08)",
      rawDot: "#bdc3c7",
      dot: "#3498db",
      trend1: "#2ecc71",
      trend2: "#e74c3c",
      regression: "#f39c12",
      regressionCI: "rgba(243,156,18, 0.1)",
      goal: "#9b59b6",
      outlier: "#e74c3c",
      deficit: "#2ecc71",
      surplus: "#e74c3c",
      rateLineColor: "#8e44ad",
      tdeeDiffLineColor: "#1abc9c",
      annotationMarker: "#e67e22",
      annotationRange: "rgba(230, 126, 34, 0.1)",
      plateauColor: "rgba(127, 140, 141, 0.15)",
      trendChangeColor: "#e74c3c",
      highlightStroke: "#f1c40f",
      crosshairColor: "#7f8c8d",
      scatterDotColor: "#34495e",
      secondAxisColor: "#27ae60",
      optimalGainZone: "hsla(120, 60%, 50%, 0.1)", // Added fallback
    },
  });

  // ========================================================================
  // State Management
  // ========================================================================
  const state = {
    isInitialized: false,
    rawData: [], // Raw data loaded from source
    processedData: [], // Data after calculations (SMA, rates, TDEE, etc.)
    weeklySummaryData: [], // Aggregated weekly stats
    correlationScatterData: [], // Data points for the scatter plot
    filteredData: [], // Data currently visible in focus chart (X domain)
    annotations: [], // User-added annotations
    plateaus: [], // Detected plateau periods {startDate, endDate}
    trendChangePoints: [], // Detected trend change points {date, magnitude}
    goal: { weight: null, date: null, targetRate: null }, // User goal settings
    analysisRange: { start: null, end: null, isCustom: false }, // Currently analyzed date range
    interactiveRegressionRange: { start: null, end: null }, // Range selected by regression brush
    regressionStartDate: null, // Start date set via UI for regression calculation (if not using interactive brush)
    useDynamicYAxis: false, // Preference for dynamic Y-axis scaling
    currentTheme: "light", // Current UI theme ('light' or 'dark')
    seriesVisibility: {
      // Visibility toggles for different chart series
      raw: true,
      sma: true,
      regression: true,
      regressionCI: true,
      trend1: true,
      trend2: true,
      goal: true,
      annotations: true,
      plateaus: true,
      trendChanges: true,
      bf: false, // Body Fat % visibility (initially off)
    },
    highlightedDate: null, // Date of the currently highlighted data point
    pinnedTooltipData: null, // Data for the pinned tooltip {id, data, pageX, pageY}
    activeHoverData: null, // Data point currently being hovered over
    lastZoomTransform: null, // Stores the last d3.zoom transform
    statusTimeoutId: null, // Timeout ID for the status message
    tooltipTimeoutId: null, // Timeout ID for showing/hiding tooltip
  };

  // ========================================================================
  // D3 Selections Cache (UI Elements)
  // ========================================================================
  const ui = {
    // Container elements
    body: null,
    chartContainer: null,
    contextContainer: null,
    balanceChartContainer: null,
    legendContainer: null,
    rateChartContainer: null,
    tdeeDiffContainer: null,
    weeklySummaryContainer: null,
    correlationScatterContainer: null,
    tooltip: null,
    pinnedTooltipContainer: null,
    statusMessage: null,
    annotationForm: null,
    annotationList: null,
    insightSummaryContainer: null,
    analysisResultsHeading: null,
    // SVG elements & groups (populated during setup)
    svg: null,
    focus: null,
    contextSvg: null,
    context: null,
    balanceSvg: null,
    balanceChartArea: null,
    rateSvg: null,
    rateChartArea: null,
    tdeeDiffSvg: null,
    tdeeDiffChartArea: null,
    correlationScatterSvg: null,
    correlationScatterArea: null,
    chartArea: null, // Clipped area in focus chart
    gridGroup: null,
    plateauGroup: null,
    annotationsGroup: null,
    trendChangeGroup: null,
    highlightGroup: null,
    crosshairGroup: null,
    rawDotsGroup: null,
    smaDotsGroup: null,
    scatterDotsGroup: null,
    regressionBrushGroup: null,
    zoomCaptureRect: null,
    // Paths & Areas (populated during setup)
    smaLine: null,
    bandArea: null,
    regressionLine: null,
    regressionCIArea: null,
    trendLine1: null,
    trendLine2: null,
    goalLine: null,
    rateLine: null,
    tdeeDiffLine: null,
    bfLine: null,
    contextArea: null,
    contextLine: null,
    balanceZeroLine: null,
    rateZeroLine: null,
    tdeeDiffZeroLine: null,
    optimalGainZoneRect: null, // Added
    // Axes groups (populated during setup)
    xAxisGroup: null,
    yAxisGroup: null,
    yAxisGroup2: null,
    contextXAxisGroup: null,
    balanceXAxisGroup: null,
    balanceYAxisGroup: null,
    rateXAxisGroup: null,
    rateYAxisGroup: null,
    tdeeDiffXAxisGroup: null,
    tdeeDiffYAxisGroup: null,
    correlationScatterXAxisGroup: null,
    correlationScatterYAxisGroup: null,
    // Brush group (populated during setup)
    brushGroup: null,
    // Input/Control Elements (Refs to D3 selections)
    themeToggle: null,
    dynamicYAxisToggle: null,
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
    annotationDateInput: null,
    annotationTextInput: null,
    whatIfIntakeInput: null,
    whatIfDurationInput: null,
    whatIfResultDisplay: null,
    whatIfSubmitBtn: null,
    // Statistic Display Elements (Refs to actual DOM nodes for perf)
    statElements: {}, // e.g., statElements.currentWeight = <HTMLElement>
  };

  // ========================================================================
  // D3 Constructs (Scales, Axes, Brushes, Zoom)
  // ========================================================================
  const scales = {
    x: null,
    y: null,
    y2: null,
    xContext: null,
    yContext: null,
    xBalance: null,
    yBalance: null,
    xRate: null,
    yRate: null,
    xTdeeDiff: null,
    yTdeeDiff: null,
    xScatter: null,
    yScatter: null,
  };
  const axes = {
    xAxis: null,
    yAxis: null,
    yAxis2: null,
    xAxisContext: null,
    xBalanceAxis: null,
    yBalanceAxis: null,
    xRateAxis: null,
    yRateAxis: null,
    xTdeeDiffAxis: null,
    yTdeeDiffAxis: null,
    xScatterAxis: null,
    yScatterAxis: null,
  };
  const brushes = {
    context: null, // Main brush on context chart
    regression: null, // Brush on focus chart for interactive range
  };
  let zoom = null; // Zoom behavior for focus chart

  // ========================================================================
  // Color Management
  // ========================================================================
  const colors = {}; // Populated by ThemeManager

  // ========================================================================
  // Utility Functions (`Utils`)
  // ========================================================================
  const Utils = {
    getElementByIdSafe(id) {
      const el = document.getElementById(id);
      return el;
    },

    formatValue(val, decimals = 2) {
      return val != null && !isNaN(val) ? val.toFixed(decimals) : "N/A";
    },

    formatDate(date) {
      return date instanceof Date && !isNaN(date)
        ? d3.timeFormat("%Y-%m-%d")(date)
        : "N/A";
    },

    formatDateShort(date) {
      return date instanceof Date && !isNaN(date)
        ? d3.timeFormat("%d %b '%y")(date)
        : "N/A";
    },

    formatDateLong(date) {
      return date instanceof Date && !isNaN(date)
        ? d3.timeFormat("%a, %d %b %Y")(date)
        : "N/A";
    },

    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    showStatusMessage(
      message,
      type = "info",
      duration = CONFIG.statusMessageDurationMs,
    ) {
      if (!ui.statusMessage || ui.statusMessage.empty()) return;
      if (state.statusTimeoutId) clearTimeout(state.statusTimeoutId);

      ui.statusMessage
        .text(message)
        .attr("class", `status-message ${type}`)
        .classed("show", true);

      state.statusTimeoutId = setTimeout(() => {
        ui.statusMessage.classed("show", false);
        state.statusTimeoutId = null;
      }, duration);
    },

    calculateRollingAverage(data, windowSize) {
      if (!Array.isArray(data) || data.length === 0 || windowSize <= 0) {
        return new Array(data.length).fill(null); // Return array of nulls if invalid input
      }

      const result = [];
      let sum = 0;
      let count = 0;
      const windowData = []; // Holds the actual values in the current window

      for (let i = 0; i < data.length; i++) {
        const value = data[i];

        // Add current value to window if valid
        if (value != null && !isNaN(value)) {
          windowData.push(value);
          sum += value;
          count++;
        } else {
          // Even if null, we need to advance the window
          windowData.push(null); // Use null as placeholder
        }

        // Remove value leaving the window from the left
        if (windowData.length > windowSize) {
          const removedValue = windowData.shift(); // Remove from the beginning
          if (removedValue != null && !isNaN(removedValue)) {
            sum -= removedValue;
            count--;
          }
        }

        // Calculate average if there are valid points in the window
        result.push(count > 0 ? sum / count : null);
      }
      return result;
    },

    calculateRegressionCI(points, regressionParams, alpha) {
      if (
        !points ||
        points.length < 2 ||
        !regressionParams ||
        regressionParams.slope == null ||
        isNaN(regressionParams.slope) ||
        !window.ss || // Check if stats library is available
        typeof ss.standardDeviation !== "function" ||
        typeof ss.sum !== "function" ||
        typeof ss.mean !== "function"
      ) {
        return points.map((p) => ({
          ...p,
          regressionValue: null,
          lowerCI: null,
          upperCI: null,
        }));
      }

      const n = points.length;
      const { slope, intercept } = regressionParams;

      // Ensure points are sorted by date for reliable xValue calculation
      const sortedPoints = [...points].sort((a, b) => a.date - b.date);
      const firstDateMs = sortedPoints[0].date.getTime();
      const dayInMillis = 86400000;

      // Map to objects containing date, original y-value (value), and calculated x-value (days from start)
      const pointData = sortedPoints.map((p) => ({
        date: p.date,
        yValue: p.value, // Original y-value needed for residuals
        xValue: (p.date.getTime() - firstDateMs) / dayInMillis,
      }));

      const xValues = pointData.map((p) => p.xValue);
      const yValues = pointData.map((p) => p.yValue);

      // Predicted y-values (y-hat) based on regression line
      const yHatValues = pointData.map((p) => slope * p.xValue + intercept);

      // Calculate Residuals and Standard Error of Estimate (SEE)
      const residuals = yValues.map((y, i) => y - yHatValues[i]);
      const SSE = ss.sum(residuals.map((r) => r * r));
      const degreesOfFreedom = n - 2;

      if (degreesOfFreedom <= 0) {
        // Not enough data points for meaningful CI
        return points.map((p, i) => ({
          ...p,
          regressionValue: yHatValues[i], // Still provide regression value
          lowerCI: null,
          upperCI: null,
        }));
      }

      const SEE = Math.sqrt(SSE / degreesOfFreedom);

      // Calculate Mean and Sum of Squares for X
      const xMean = ss.mean(xValues);
      const Sxx = ss.sum(xValues.map((x) => (x - xMean) ** 2));

      // Determine T-value for the desired confidence level
      const tValue = ss.tDistributionQuantile
        ? ss.tDistributionQuantile(1 - alpha / 2, degreesOfFreedom)
        : 1.96; // Fallback if unavailable

      // Calculate CI bounds for each point
      return pointData.map((p, i) => {
        const x_i = p.xValue;
        // Standard error for the *mean response* (the regression line itself) at x_i
        const se_mean_response =
          Sxx > 0
            ? SEE * Math.sqrt(1 / n + (x_i - xMean) ** 2 / Sxx)
            : SEE * Math.sqrt(1 / n); // Avoid division by zero if all X are the same

        const marginOfError = tValue * se_mean_response;
        const regressionValue = yHatValues[i];
        const lowerCI = regressionValue - marginOfError;
        const upperCI = regressionValue + marginOfError;

        // Find the original point corresponding to this date to return all original properties
        const originalPoint = points.find(
          (op) => op.date.getTime() === p.date.getTime(),
        );

        return {
          ...originalPoint, // Include original data fields
          regressionValue: regressionValue,
          lowerCI: lowerCI,
          upperCI: upperCI,
        };
      });
    },
  };

  // ========================================================================
  // Data Service (`DataService`)
  // ========================================================================
  const DataService = {
    // --- Fetching & Basic Merging ---
    async fetchData() {
      console.log("DataService: Fetching data from data.json...");
      try {
        const response = await fetch("data.json");
        if (!response.ok) {
          throw new Error(
            `HTTP error! Status: ${response.status} - Failed to fetch data.json`,
          );
        }
        const rawDataObjects = await response.json();
        console.log("DataService: Successfully fetched and parsed data.json");
        return rawDataObjects;
      } catch (error) {
        console.error("DataService: Failed to load or parse data.json:", error);
        Utils.showStatusMessage(
          `Error loading data: ${error.message}. Chart may be incomplete or empty.`,
          "error",
          10000,
        );
        return {
          weights: {},
          calorieIntake: {},
          googleFitExpenditure: {},
          bodyFat: {},
        };
      }
    },

    mergeRawData(rawDataObjects) {
      console.log("DataService: Merging raw data sources...");
      const weights = rawDataObjects.weights || {};
      const calorieIntake = rawDataObjects.calorieIntake || {};
      const googleFitExpenditure = rawDataObjects.googleFitExpenditure || {};
      const bodyFat = rawDataObjects.bodyFat || {};

      const allDates = new Set([
        ...Object.keys(weights),
        ...Object.keys(calorieIntake),
        ...Object.keys(googleFitExpenditure),
        ...Object.keys(bodyFat),
      ]);

      let mergedData = [];
      for (const dateStr of allDates) {
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) {
          console.warn(`DataService: Skipping invalid date string: ${dateStr}`);
          continue;
        }
        dateObj.setHours(0, 0, 0, 0); // Normalize date

        const intake = calorieIntake[dateStr] ?? null;
        const expenditure = googleFitExpenditure[dateStr] ?? null;
        const netBalance = DataService._calculateDailyBalance(
          intake,
          expenditure,
        );

        mergedData.push({
          dateString: dateStr,
          date: dateObj,
          value: weights[dateStr] ?? null,
          bfPercent: bodyFat[dateStr] ?? null,
          notes: undefined, // Placeholder for future use
          calorieIntake: intake,
          googleFitTDEE: expenditure,
          netBalance: netBalance,
          // Fields to be calculated in processing steps:
          sma: null,
          stdDev: null,
          lowerBound: null,
          upperBound: null,
          lbm: null, // Added
          fm: null, // Added
          lbmSma: null, // Added
          fmSma: null, // Added
          isOutlier: false,
          dailySmaRate: null,
          smoothedWeeklyRate: null,
          tdeeTrend: null,
          tdeeDifference: null,
          avgTdeeDifference: null,
          adaptiveTDEE: null,
          regressionValue: null,
          regressionLowerCI: null,
          regressionUpperCI: null,
        });
      }
      mergedData.sort((a, b) => a.date - b.date);
      console.log(
        `DataService: Merged data for ${mergedData.length} unique dates.`,
      );
      return mergedData;
    },

    // --- Data Processing Pipeline ---
    processData(rawData) {
      console.log("DataService: Starting data processing pipeline...");
      if (!Array.isArray(rawData) || rawData.length === 0) {
        console.warn("DataService: No raw data to process.");
        return [];
      }

      let processed = rawData;
      processed = DataService._calculateBodyComposition(processed); // <-- Add this step
      processed = DataService._calculateSMAAndStdDev(processed);
      processed = DataService._identifyOutliers(processed);
      processed = DataService._calculateDailyRatesAndTDEETrend(processed);
      processed = DataService._calculateAdaptiveTDEE(processed);
      processed = DataService._smoothRatesAndTDEEDifference(processed);

      console.log("DataService: Data processing pipeline completed.");
      const validSMACount = processed.filter((d) => d.sma != null).length;
      const validRateCount = processed.filter(
        (d) => d.smoothedWeeklyRate != null,
      ).length;
      const validAdaptiveTDEECount = processed.filter(
        (d) => d.adaptiveTDEE != null,
      ).length;
      console.log(
        `DataService: Processed data stats - SMA: ${validSMACount}, Smoothed Rate: ${validRateCount}, Adaptive TDEE: ${validAdaptiveTDEECount}`,
      );

      return processed;
    },

    // --- Processing Steps (Internal Helpers) ---

    // NEW processing step function
    _calculateBodyComposition(data) {
      return data.map((d) => {
        let lbm = null;
        let fm = null;
        if (
          d.value != null &&
          d.bfPercent != null &&
          !isNaN(d.value) &&
          !isNaN(d.bfPercent) &&
          d.bfPercent >= 0 &&
          d.bfPercent < 100
        ) {
          lbm = d.value * (1 - d.bfPercent / 100);
          fm = d.value * (d.bfPercent / 100);
        }
        return { ...d, lbm, fm };
      });
    },

    // Modify _calculateSMAAndStdDev to also smooth LBM/FM
    _calculateSMAAndStdDev(data) {
      const windowSize = CONFIG.movingAverageWindow;
      const stdDevMult = CONFIG.stdDevMultiplier;

      return data.map((d, i, arr) => {
        const windowDataPoints = arr.slice(
          Math.max(0, i - windowSize + 1),
          i + 1,
        );

        // Original Weight SMA/StdDev
        const validValuesInWindow = windowDataPoints
          .map((p) => p.value)
          .filter((v) => v != null && !isNaN(v));
        let sma = null,
          stdDev = null,
          lowerBound = null,
          upperBound = null;
        if (validValuesInWindow.length > 0) {
          sma = d3.mean(validValuesInWindow);
          stdDev =
            validValuesInWindow.length > 1 &&
            typeof ss?.standardDeviation === "function"
              ? ss.standardDeviation(validValuesInWindow)
              : 0;
          lowerBound =
            sma != null && stdDev != null ? sma - stdDevMult * stdDev : null;
          upperBound =
            sma != null && stdDev != null ? sma + stdDevMult * stdDev : null;
        }

        // --- NEW: LBM/FM SMA Calculation ---
        const validLbmInWindow = windowDataPoints
          .map((p) => p.lbm)
          .filter((v) => v != null && !isNaN(v));
        const lbmSma =
          validLbmInWindow.length > 0 ? d3.mean(validLbmInWindow) : null;

        const validFmInWindow = windowDataPoints
          .map((p) => p.fm)
          .filter((v) => v != null && !isNaN(v));
        const fmSma =
          validFmInWindow.length > 0 ? d3.mean(validFmInWindow) : null;
        // --- End NEW ---

        return {
          ...d,
          sma,
          stdDev,
          lowerBound,
          upperBound,
          lbmSma, // Added
          fmSma, // Added
        };
      });
    },

    _identifyOutliers(data) {
      const threshold = CONFIG.OUTLIER_STD_DEV_THRESHOLD;
      return data.map((d) => {
        let isOutlier = false;
        if (
          d.value != null &&
          d.sma != null &&
          d.stdDev != null &&
          d.stdDev > 0.01
        ) {
          if (Math.abs(d.value - d.sma) > threshold * d.stdDev) {
            isOutlier = true;
          }
        }
        return { ...d, isOutlier };
      });
    },

    _calculateDailyRatesAndTDEETrend(data) {
      return data.map((d, i, arr) => {
        let dailySmaRate = null;
        let tdeeTrend = null;

        if (i > 0) {
          const prev = arr[i - 1];
          if (prev.sma != null && d.sma != null) {
            if (
              d.date instanceof Date &&
              prev.date instanceof Date &&
              !isNaN(d.date) &&
              !isNaN(prev.date)
            ) {
              const timeDiffDays =
                (d.date.getTime() - prev.date.getTime()) / 86400000;

              if (
                timeDiffDays > 0 &&
                timeDiffDays <= CONFIG.movingAverageWindow
              ) {
                const smaDiff = d.sma - prev.sma;
                dailySmaRate = smaDiff / timeDiffDays;

                if (prev.calorieIntake != null && !isNaN(prev.calorieIntake)) {
                  const dailyDeficitSurplusKcals =
                    dailySmaRate * CONFIG.KCALS_PER_KG;
                  tdeeTrend = prev.calorieIntake - dailyDeficitSurplusKcals;
                }
              }
            }
          }
        }
        return { ...d, dailySmaRate, tdeeTrend };
      });
    },

    _calculateAdaptiveTDEE(data) {
      const windowSize = CONFIG.adaptiveTDEEWindow;
      const minDataRatio = 0.7;

      return data.map((d, i, arr) => {
        let adaptiveTDEE = null;

        if (i >= windowSize - 1) {
          const windowData = arr.slice(i - windowSize + 1, i + 1);
          const startPoint = windowData[0];
          const endPoint = d;

          const validIntakes = windowData
            .map((p) => p.calorieIntake)
            .filter((v) => v != null && !isNaN(v));

          if (
            validIntakes.length >= windowSize * minDataRatio &&
            startPoint.sma != null &&
            endPoint.sma != null &&
            startPoint.date instanceof Date &&
            !isNaN(startPoint.date) &&
            endPoint.date instanceof Date &&
            !isNaN(endPoint.date)
          ) {
            const avgIntakeWindow = d3.mean(validIntakes);
            const totalSmaChange = endPoint.sma - startPoint.sma;

            const actualDaysInWindow =
              (endPoint.date.getTime() - startPoint.date.getTime()) / 86400000;

            if (actualDaysInWindow > 0) {
              const avgDailySmaChange = totalSmaChange / actualDaysInWindow;
              const avgDailyDeficitSurplusKcals =
                avgDailySmaChange * CONFIG.KCALS_PER_KG;
              adaptiveTDEE = avgIntakeWindow - avgDailyDeficitSurplusKcals;
            }
          }
        }
        return { ...d, adaptiveTDEE };
      });
    },

    _smoothRatesAndTDEEDifference(data) {
      const dailyRates = data.map((d) => d.dailySmaRate);
      const smoothedDailyRates = Utils.calculateRollingAverage(
        dailyRates,
        CONFIG.rateOfChangeSmoothingWindow,
      );

      const tdeeDifferences = data.map((d) =>
        d.tdeeTrend != null &&
        d.googleFitTDEE != null &&
        !isNaN(d.tdeeTrend) &&
        !isNaN(d.googleFitTDEE)
          ? d.tdeeTrend - d.googleFitTDEE
          : null,
      );
      const smoothedTdeeDifferences = Utils.calculateRollingAverage(
        tdeeDifferences,
        CONFIG.tdeeDiffSmoothingWindow,
      );

      return data.map((d, i) => ({
        ...d,
        smoothedWeeklyRate:
          smoothedDailyRates[i] != null ? smoothedDailyRates[i] * 7 : null,
        tdeeDifference: tdeeDifferences[i], // Raw daily difference
        avgTdeeDifference: smoothedTdeeDifferences[i], // Smoothed difference
      }));
    },

    // --- Calculation Helpers ---
    _calculateDailyBalance(intake, expenditure) {
      return intake != null &&
        expenditure != null &&
        !isNaN(intake) &&
        !isNaN(expenditure)
        ? intake - expenditure
        : null;
    },

    // --- Regression & Trend Calculations ---
    calculateLinearRegression(dataPoints, startDate) {
      const validData = dataPoints.filter(
        (d) =>
          d.value != null &&
          !d.isOutlier &&
          d.date instanceof Date &&
          !isNaN(d.date),
      );
      const filteredData =
        startDate instanceof Date && !isNaN(startDate)
          ? validData.filter((d) => d.date >= startDate)
          : validData;

      if (filteredData.length < CONFIG.MIN_POINTS_FOR_REGRESSION) {
        return { slope: null, intercept: null, points: [], pointsWithCI: [] };
      }

      filteredData.sort((a, b) => a.date - b.date);

      const firstDateMs = filteredData[0].date.getTime();
      const dayInMillis = 86400000;
      const dataForRegression = filteredData.map((d) => [
        (d.date.getTime() - firstDateMs) / dayInMillis,
        d.value,
      ]);

      try {
        if (!window.ss || typeof ss.linearRegression !== "function") {
          throw new Error("simple-statistics linearRegression not available.");
        }
        const regressionLine = ss.linearRegression(dataForRegression);

        if (
          !regressionLine ||
          isNaN(regressionLine.m) ||
          isNaN(regressionLine.b)
        ) {
          throw new Error(
            `simple-statistics linearRegression returned invalid results: m=${regressionLine?.m}, b=${regressionLine?.b}`,
          );
        }

        const slope = regressionLine.m; // Daily change
        const intercept = regressionLine.b; // Estimated weight at firstDateMs

        const pointsForCI = filteredData.map((d) => ({
          ...d,
          value: d.value,
        }));

        const pointsWithCI = Utils.calculateRegressionCI(
          pointsForCI,
          { slope, intercept },
          CONFIG.CONFIDENCE_INTERVAL_ALPHA,
        );

        const plotPoints = pointsWithCI.map((p) => ({
          date: p.date,
          regressionValue: p.regressionValue,
        }));

        return { slope, intercept, points: plotPoints, pointsWithCI };
      } catch (e) {
        console.error("DataService: Error calculating linear regression:", e);
        return { slope: null, intercept: null, points: [], pointsWithCI: [] };
      }
    },

    calculateTrendWeight(startDate, initialWeight, weeklyIncrease, targetDate) {
      if (
        !(startDate instanceof Date) ||
        isNaN(startDate) ||
        initialWeight == null ||
        isNaN(initialWeight) ||
        weeklyIncrease == null ||
        isNaN(weeklyIncrease) ||
        !(targetDate instanceof Date) ||
        isNaN(targetDate)
      ) {
        return null;
      }
      const msPerWeek = 7 * 86400000;
      const weeksElapsed =
        (targetDate.getTime() - startDate.getTime()) / msPerWeek;
      return initialWeight + weeksElapsed * weeklyIncrease;
    },

    // --- Goal Management ---
    loadGoal() {
      const storedGoal = localStorage.getItem(CONFIG.localStorageKeys.goal);
      const defaultGoal = { weight: null, date: null, targetRate: null };
      if (storedGoal) {
        try {
          const parsed = JSON.parse(storedGoal);
          const weight = parsed.weight ? parseFloat(parsed.weight) : null;
          const dateStr = parsed.date?.replace(/\//g, "-");
          const date = dateStr ? new Date(dateStr) : null;
          const targetRate = parsed.targetRate
            ? parseFloat(parsed.targetRate)
            : null;

          state.goal.weight = weight != null && !isNaN(weight) ? weight : null;
          state.goal.date =
            date instanceof Date && !isNaN(date.getTime()) ? date : null;
          state.goal.targetRate =
            targetRate != null && !isNaN(targetRate) ? targetRate : null;
        } catch (e) {
          console.error("DataService: Error parsing goal from localStorage", e);
          localStorage.removeItem(CONFIG.localStorageKeys.goal);
          state.goal = { ...defaultGoal }; // Reset to default
        }
      } else {
        state.goal = { ...defaultGoal }; // Set default if nothing stored
      }
      DataService.updateGoalUI(); // Update UI after loading
    },

    saveGoal() {
      try {
        const goalToStore = {
          weight: state.goal.weight,
          date: state.goal.date
            ? state.goal.date.toISOString().slice(0, 10)
            : null, // Use ISO YYYY-MM-DD
          targetRate: state.goal.targetRate,
        };
        localStorage.setItem(
          CONFIG.localStorageKeys.goal,
          JSON.stringify(goalToStore),
        );
        Utils.showStatusMessage("Goal saved successfully.", "success");
      } catch (e) {
        console.error("DataService: Error saving goal to localStorage", e);
        Utils.showStatusMessage(
          "Could not save goal due to storage error.",
          "error",
        );
      }
    },

    updateGoalUI() {
      ui.goalWeightInput?.property("value", state.goal.weight ?? "");
      ui.goalDateInput?.property(
        "value",
        state.goal.date ? Utils.formatDate(state.goal.date) : "",
      );
      ui.goalTargetRateInput?.property("value", state.goal.targetRate ?? "");
    },

    getTrendlineConfigFromUI() {
      const startDateInput = ui.trendStartDateInput?.property("value");
      const initialWeight = parseFloat(
        ui.trendInitialWeightInput?.property("value"),
      );
      const weeklyIncrease1 = parseFloat(
        ui.trendWeeklyIncrease1Input?.property("value"),
      );
      const weeklyIncrease2 = parseFloat(
        ui.trendWeeklyIncrease2Input?.property("value"),
      );

      let startDate = null;
      if (startDateInput) {
        const parsedDate = new Date(startDateInput);
        if (!isNaN(parsedDate.getTime())) {
          parsedDate.setHours(0, 0, 0, 0);
          startDate = parsedDate;
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
      const inputVal = ui.trendStartDateInput?.property("value");
      if (!inputVal) return null;
      const parsedDate = new Date(inputVal);
      if (isNaN(parsedDate.getTime())) {
        console.warn("DataService: Invalid regression start date input.");
        return null;
      }
      parsedDate.setHours(0, 0, 0, 0);
      return parsedDate;
    },
  };

  // ========================================================================
  // Theme Manager
  // ========================================================================
  const ThemeManager = {
    init() {
      const savedTheme =
        localStorage.getItem(CONFIG.localStorageKeys.theme) || "light";
      ThemeManager.setTheme(savedTheme, false); // Set initial theme without redraw
      ThemeManager.updateColors(); // Populate colors object initially
    },

    setTheme(theme, triggerUpdate = true) {
      state.currentTheme = theme === "dark" ? "dark" : "light"; // Sanitize input
      ui.body?.classed("dark-theme", state.currentTheme === "dark");
      ui.themeToggle?.html(state.currentTheme === "dark" ? "☀️" : "🌙");
      localStorage.setItem(CONFIG.localStorageKeys.theme, state.currentTheme);

      ThemeManager.updateColors(); // Update color cache

      if (state.isInitialized && triggerUpdate) {
        console.log(
          `ThemeManager: Switched to ${theme} theme, triggering updates.`,
        );
        LegendManager.build();
        MasterUpdater.updateAllCharts();
      }
    },

    toggleTheme() {
      ThemeManager.setTheme(state.currentTheme === "light" ? "dark" : "light");
    },

    updateColors() {
      if (!document?.documentElement) {
        console.error(
          "ThemeManager: Cannot update colors, documentElement not found.",
        );
        return;
      }
      const style = getComputedStyle(document.documentElement);
      const getColor = (varName, fallbackKey) => {
        const val = style.getPropertyValue(varName)?.trim();
        if (!val && CONFIG.fallbackColors[fallbackKey]) {
          // console.warn(`ThemeManager: CSS variable ${varName} not found, using fallback ${fallbackKey}`);
          return CONFIG.fallbackColors[fallbackKey];
        }
        return val || CONFIG.fallbackColors[fallbackKey] || "#000000"; // Absolute fallback
      };

      Object.assign(colors, {
        sma: getColor("--sma-color", "sma"),
        band: getColor("--band-color", "band"),
        rawDot: getColor("--raw-dot-color", "rawDot"),
        dot: getColor("--dot-color", "dot"),
        trend1: getColor("--trend1-color", "trend1"),
        trend2: getColor("--trend2-color", "trend2"),
        regression: getColor("--regression-color", "regression"),
        regressionCI: getColor("--regression-ci-color", "regressionCI"),
        goal: getColor("--goal-line-color", "goal"),
        outlier: getColor("--outlier-color", "outlier"),
        deficit: getColor("--deficit-color", "deficit"),
        surplus: getColor("--surplus-color", "surplus"),
        rateLineColor: getColor("--rate-line-color", "rateLineColor"),
        tdeeDiffLineColor: getColor(
          "--tdee-diff-line-color",
          "tdeeDiffLineColor",
        ),
        annotationMarker: getColor(
          "--annotation-marker-color",
          "annotationMarker",
        ),
        annotationRange: getColor(
          "--annotation-range-color",
          "annotationRange",
        ),
        plateauColor: getColor("--plateau-color", "plateauColor"),
        trendChangeColor: getColor("--trend-change-color", "trendChangeColor"),
        highlightStroke: getColor(
          "--highlight-stroke-color",
          "highlightStroke",
        ),
        crosshairColor: getColor("--crosshair-color", "crosshairColor"),
        scatterDotColor: getColor("--scatter-dot-color", "scatterDotColor"),
        secondAxisColor: getColor("--second-axis-color", "secondAxisColor"),
        optimalGainZone: getColor(
          "--optimal-gain-zone-color",
          "optimalGainZone",
        ), // Added
      });
    },
  };

  // ========================================================================
  // UI Setup (`UISetup`)
  // ========================================================================
  const UISetup = {
    _dimensions: {},

    calculateDimensions() {
      const getDim = (containerSelection, margins) => {
        if (!containerSelection || containerSelection.empty())
          return { width: 0, height: 0, valid: false };
        const node = containerSelection.node();
        if (!node) return { width: 0, height: 0, valid: false };

        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;

        const effectiveWidth = rect.width - paddingLeft - paddingRight;
        const effectiveHeight = rect.height - paddingTop - paddingBottom;

        const width = Math.max(
          10,
          effectiveWidth - margins.left - margins.right,
        );
        const height = Math.max(
          10,
          effectiveHeight - margins.top - margins.bottom,
        );

        const valid = width > 10 && height > 10;
        if (!valid) {
          console.warn(
            `UISetup: Invalid dimensions calculated for container node:`,
            node,
            `Rect:`,
            rect,
            `Calculated: w=${width}, h=${height}`,
          );
        }
        return { width, height, valid };
      };

      this._dimensions = {
        focus: getDim(ui.chartContainer, CONFIG.margins.focus),
        context: getDim(ui.contextContainer, CONFIG.margins.context),
        balance: getDim(ui.balanceChartContainer, CONFIG.margins.balance),
        rate: getDim(ui.rateChartContainer, CONFIG.margins.rate),
        tdeeDiff: getDim(ui.tdeeDiffContainer, CONFIG.margins.tdeeDiff),
        scatter: getDim(
          ui.correlationScatterContainer,
          CONFIG.margins.correlationScatter,
        ),
      };

      const requiredDimsValid =
        this._dimensions.focus.valid && this._dimensions.context.valid;
      const optionalDimsValid =
        (!ui.balanceChartContainer ||
          ui.balanceChartContainer.empty() ||
          this._dimensions.balance.valid) &&
        (!ui.rateChartContainer ||
          ui.rateChartContainer.empty() ||
          this._dimensions.rate.valid) &&
        (!ui.tdeeDiffContainer ||
          ui.tdeeDiffContainer.empty() ||
          this._dimensions.tdeeDiff.valid) &&
        (!ui.correlationScatterContainer ||
          ui.correlationScatterContainer.empty() ||
          this._dimensions.scatter.valid);

      if (!requiredDimsValid || !optionalDimsValid) {
        console.error(
          "UISetup: Cannot setup dimensions, one or more required container elements not found or have zero effective size.",
          this._dimensions,
        );
        return false;
      }
      return true;
    },

    createSVGElements() {
      console.log("UISetup: Creating SVG elements...");
      const fm = CONFIG.margins.focus;
      const cm = CONFIG.margins.context;
      const bm = CONFIG.margins.balance;
      const rm = CONFIG.margins.rate;
      const tdm = CONFIG.margins.tdeeDiff;
      const sm = CONFIG.margins.correlationScatter;

      // Clear existing SVGs
      ui.chartContainer?.select("svg").remove();
      ui.contextContainer?.select("svg").remove();
      ui.balanceChartContainer?.select("svg").remove();
      ui.rateChartContainer?.select("svg").remove();
      ui.tdeeDiffContainer?.select("svg").remove();
      ui.correlationScatterContainer?.select("svg").remove();

      // Focus Chart
      if (
        this._dimensions.focus.valid &&
        ui.chartContainer &&
        !ui.chartContainer.empty()
      ) {
        const { width, height } = this._dimensions.focus;
        ui.svg = ui.chartContainer
          .append("svg")
          .attr("width", width + fm.left + fm.right)
          .attr("height", height + fm.top + fm.bottom)
          .attr("aria-label", "Main Weight Chart")
          .attr("role", "img");

        ui.svg
          .append("defs")
          .append("clipPath")
          .attr("id", "clip-focus")
          .append("rect")
          .attr("width", width)
          .attr("height", height);

        ui.zoomCaptureRect = ui.svg
          .append("rect")
          .attr("class", "zoom-capture")
          .attr("width", width)
          .attr("height", height)
          .attr("transform", `translate(${fm.left}, ${fm.top})`)
          .style("fill", "none")
          .style("pointer-events", "all");

        ui.focus = ui.svg
          .append("g")
          .attr("class", "focus")
          .attr("transform", `translate(${fm.left},${fm.top})`);

        ui.gridGroup = ui.focus.append("g").attr("class", "grid y-grid");
        ui.plateauGroup = ui.focus.append("g").attr("class", "plateau-group");
        ui.annotationsGroup = ui.focus
          .append("g")
          .attr("class", "annotations-group");
        ui.chartArea = ui.focus
          .append("g")
          .attr("clip-path", "url(#clip-focus)");

        ui.bandArea = ui.chartArea
          .append("path")
          .attr("class", "area band-area");
        ui.regressionCIArea = ui.chartArea
          .append("path")
          .attr("class", "area regression-ci-area");
        ui.smaLine = ui.chartArea.append("path").attr("class", "line sma-line");
        ui.trendLine1 = ui.chartArea
          .append("path")
          .attr("class", "trend-line manual-trend-1");
        ui.trendLine2 = ui.chartArea
          .append("path")
          .attr("class", "trend-line manual-trend-2");
        ui.regressionLine = ui.chartArea
          .append("path")
          .attr("class", "trend-line regression-line");
        ui.goalLine = ui.chartArea
          .append("path")
          .attr("class", "trend-line goal-line");
        ui.bfLine = ui.chartArea.append("path").attr("class", "line bf-line");

        ui.rawDotsGroup = ui.chartArea
          .append("g")
          .attr("class", "raw-dots-group");
        ui.smaDotsGroup = ui.chartArea.append("g").attr("class", "dots-group");
        ui.trendChangeGroup = ui.chartArea
          .append("g")
          .attr("class", "trend-change-group");
        ui.highlightGroup = ui.chartArea
          .append("g")
          .attr("class", "highlight-group");

        ui.crosshairGroup = ui.focus
          .append("g")
          .attr("class", "crosshair-group")
          .style("pointer-events", "none")
          .style("display", "none");
        ui.crosshairGroup
          .append("line")
          .attr("class", "crosshair crosshair-x")
          .attr("y1", 0)
          .attr("y2", height);
        ui.crosshairGroup
          .append("line")
          .attr("class", "crosshair crosshair-y")
          .attr("x1", 0)
          .attr("x2", width);

        ui.regressionBrushGroup = ui.focus
          .append("g")
          .attr("class", "regression-brush");

        ui.xAxisGroup = ui.focus
          .append("g")
          .attr("class", "axis axis--x")
          .attr("transform", `translate(0,${height})`);
        ui.yAxisGroup = ui.focus.append("g").attr("class", "axis axis--y");
        ui.yAxisGroup2 = ui.focus
          .append("g")
          .attr("class", "axis axis--y2")
          .attr("transform", `translate(${width}, 0)`);

        ui.svg
          .append("text")
          .attr("class", "axis-label y-axis-label")
          .attr("transform", "rotate(-90)")
          .attr("y", 6)
          .attr("x", 0 - (height / 2 + fm.top))
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .text("Weight (KG)");
        ui.svg
          .append("text")
          .attr("class", "axis-label y-axis-label y-axis-label2")
          .attr("transform", "rotate(-90)")
          .attr("y", width + fm.left + fm.right - 20)
          .attr("x", 0 - (height / 2 + fm.top))
          .attr("dy", "-0.5em")
          .style("text-anchor", "middle")
          .text("Body Fat (%)")
          .style("display", state.seriesVisibility.bf ? null : "none");
      }

      // Context Chart
      if (
        this._dimensions.context.valid &&
        ui.contextContainer &&
        !ui.contextContainer.empty()
      ) {
        const { width, height } = this._dimensions.context;
        ui.contextSvg = ui.contextContainer
          .append("svg")
          .attr("width", width + cm.left + cm.right)
          .attr("height", height + cm.top + cm.bottom)
          .attr("aria-hidden", "true");
        ui.context = ui.contextSvg
          .append("g")
          .attr("class", "context")
          .attr("transform", `translate(${cm.left},${cm.top})`);
        ui.contextArea = ui.context
          .append("path")
          .attr("class", "area band-area context-area");
        ui.contextLine = ui.context
          .append("path")
          .attr("class", "line sma-line context-line");
        ui.contextXAxisGroup = ui.context
          .append("g")
          .attr("class", "axis axis--x")
          .attr("transform", `translate(0,${height})`);
      }

      // Balance Chart
      if (
        this._dimensions.balance.valid &&
        ui.balanceChartContainer &&
        !ui.balanceChartContainer.empty()
      ) {
        const { width, height } = this._dimensions.balance;
        ui.balanceSvg = ui.balanceChartContainer
          .append("svg")
          .attr("width", width + bm.left + bm.right)
          .attr("height", height + bm.top + bm.bottom)
          .attr("aria-hidden", "true");
        ui.balanceChartArea = ui.balanceSvg
          .append("g")
          .attr("class", "balance-chart-area")
          .attr("transform", `translate(${bm.left},${bm.top})`);
        ui.balanceZeroLine = ui.balanceChartArea
          .append("line")
          .attr("class", "balance-zero-line")
          .attr("x1", 0)
          .attr("x2", width);
        ui.balanceXAxisGroup = ui.balanceSvg
          .append("g")
          .attr("class", "axis balance-axis balance-axis--x")
          .attr("transform", `translate(${bm.left},${bm.top + height})`);
        ui.balanceYAxisGroup = ui.balanceSvg
          .append("g")
          .attr("class", "axis balance-axis balance-axis--y")
          .attr("transform", `translate(${bm.left},${bm.top})`);
        ui.balanceSvg
          .append("text")
          .attr("class", "axis-label y-axis-label-small")
          .attr("transform", "rotate(-90)")
          .attr("y", 4)
          .attr("x", 0 - (height / 2 + bm.top))
          .attr("dy", "0.75em")
          .style("text-anchor", "middle")
          .text("Balance (kcal)");
      }

      // Rate of Change Chart
      if (
        this._dimensions.rate.valid &&
        ui.rateChartContainer &&
        !ui.rateChartContainer.empty()
      ) {
        const { width, height } = this._dimensions.rate;
        ui.rateSvg = ui.rateChartContainer
          .append("svg")
          .attr("width", width + rm.left + rm.right)
          .attr("height", height + rm.top + rm.bottom)
          .attr("aria-hidden", "true");
        ui.rateSvg
          .append("defs")
          .append("clipPath")
          .attr("id", "clip-rate")
          .append("rect")
          .attr("width", width)
          .attr("height", height);
        ui.rateChartArea = ui.rateSvg
          .append("g")
          .attr("class", "rate-chart-area")
          .attr("transform", `translate(${rm.left},${rm.top})`)
          .attr("clip-path", "url(#clip-rate)");

        // --- NEW: Add Optimal Zone Rect ---
        ui.optimalGainZoneRect = ui.rateChartArea
          .append("rect")
          .attr("class", "optimal-gain-zone")
          .attr("x", 0)
          .attr("width", width)
          .attr("y", 0) // Will be set in update
          .attr("height", 0) // Will be set in update
          .style("display", "none"); // Initially hidden
        // --- End NEW ---

        ui.rateZeroLine = ui.rateChartArea
          .append("line")
          .attr("class", "rate-zero-line")
          .attr("x1", 0)
          .attr("x2", width);
        ui.rateLine = ui.rateChartArea
          .append("path")
          .attr("class", "line rate-line");
        ui.rateXAxisGroup = ui.rateSvg
          .append("g")
          .attr("class", "axis rate-axis rate-axis--x")
          .attr("transform", `translate(${rm.left},${rm.top + height})`);
        ui.rateYAxisGroup = ui.rateSvg
          .append("g")
          .attr("class", "axis rate-axis rate-axis--y")
          .attr("transform", `translate(${rm.left},${rm.top})`);
        ui.rateSvg
          .append("text")
          .attr("class", "axis-label y-axis-label-small")
          .attr("transform", "rotate(-90)")
          .attr("y", 4)
          .attr("x", 0 - (height / 2 + rm.top))
          .attr("dy", "0.75em")
          .style("text-anchor", "middle")
          .text("Rate (kg/wk)");
      }

      // TDEE Difference Chart
      if (
        this._dimensions.tdeeDiff.valid &&
        ui.tdeeDiffContainer &&
        !ui.tdeeDiffContainer.empty()
      ) {
        const { width, height } = this._dimensions.tdeeDiff;
        ui.tdeeDiffSvg = ui.tdeeDiffContainer
          .append("svg")
          .attr("width", width + tdm.left + tdm.right)
          .attr("height", height + tdm.top + tdm.bottom)
          .attr("aria-hidden", "true");
        ui.tdeeDiffSvg
          .append("defs")
          .append("clipPath")
          .attr("id", "clip-tdee-diff")
          .append("rect")
          .attr("width", width)
          .attr("height", height);
        ui.tdeeDiffChartArea = ui.tdeeDiffSvg
          .append("g")
          .attr("class", "tdee-diff-chart-area")
          .attr("transform", `translate(${tdm.left},${tdm.top})`)
          .attr("clip-path", "url(#clip-tdee-diff)");
        ui.tdeeDiffZeroLine = ui.tdeeDiffChartArea
          .append("line")
          .attr("class", "tdee-diff-zero-line")
          .attr("x1", 0)
          .attr("x2", width);
        ui.tdeeDiffLine = ui.tdeeDiffChartArea
          .append("path")
          .attr("class", "line tdee-diff-line");
        ui.tdeeDiffXAxisGroup = ui.tdeeDiffSvg
          .append("g")
          .attr("class", "axis tdee-diff-axis tdee-diff-axis--x")
          .attr("transform", `translate(${tdm.left},${tdm.top + height})`);
        ui.tdeeDiffYAxisGroup = ui.tdeeDiffSvg
          .append("g")
          .attr("class", "axis tdee-diff-axis tdee-diff-axis--y")
          .attr("transform", `translate(${tdm.left},${tdm.top})`);
        ui.tdeeDiffSvg
          .append("text")
          .attr("class", "axis-label y-axis-label-small")
          .attr("transform", "rotate(-90)")
          .attr("y", 4)
          .attr("x", 0 - (height / 2 + tdm.top))
          .attr("dy", "0.75em")
          .style("text-anchor", "middle")
          .text("TDEE Diff (kcal)");
      }

      // Correlation Scatter Plot
      if (
        this._dimensions.scatter.valid &&
        ui.correlationScatterContainer &&
        !ui.correlationScatterContainer.empty()
      ) {
        const { width, height } = this._dimensions.scatter;
        ui.correlationScatterSvg = ui.correlationScatterContainer
          .append("svg")
          .attr("width", width + sm.left + sm.right)
          .attr("height", height + sm.top + sm.bottom)
          .attr("aria-label", "Correlation Scatter Plot")
          .attr("role", "img");
        ui.correlationScatterArea = ui.correlationScatterSvg
          .append("g")
          .attr("class", "correlation-scatter-area")
          .attr("transform", `translate(${sm.left},${sm.top})`);
        ui.correlationScatterXAxisGroup = ui.correlationScatterSvg
          .append("g")
          .attr("class", "axis scatter-axis scatter-axis--x")
          .attr("transform", `translate(${sm.left},${sm.top + height})`);
        ui.correlationScatterYAxisGroup = ui.correlationScatterSvg
          .append("g")
          .attr("class", "axis scatter-axis scatter-axis--y")
          .attr("transform", `translate(${sm.left},${sm.top})`);
        ui.correlationScatterSvg // Optional adjustment here
          .append("text")
          .attr("class", "axis-label scatter-axis-label-x")
          .attr("x", sm.left + width / 2)
          .attr("y", height + sm.top + sm.bottom - 5) // Example adjustment
          .style("text-anchor", "middle")
          .text("Avg Weekly Net Calories (kcal)");
        ui.correlationScatterSvg
          .append("text")
          .attr("class", "axis-label scatter-axis-label-y") // Note: different class but same logic applies
          .attr("transform", "rotate(-90)")
          .attr("y", 4) // MOVED slightly left (was 6)
          .attr("x", 0 - (height / 2 + sm.top))
          .attr("dy", "0.75em") // Adjusted offset closer to axis line (was 1em)
          .style("text-anchor", "middle")
          .text("Weekly Rate (kg/wk)");
        ui.scatterDotsGroup = ui.correlationScatterArea
          .append("g")
          .attr("class", "scatter-dots-group");
      }
      console.log("UISetup: SVG element creation finished.");
    },

    createScales() {
      const focusW = this._dimensions.focus.valid
        ? this._dimensions.focus.width
        : 0;
      const focusH = this._dimensions.focus.valid
        ? this._dimensions.focus.height
        : 0;
      const contextW = this._dimensions.context.valid
        ? this._dimensions.context.width
        : 0;
      const contextH = this._dimensions.context.valid
        ? this._dimensions.context.height
        : 0;
      const balanceW = this._dimensions.balance.valid
        ? this._dimensions.balance.width
        : 0;
      const balanceH = this._dimensions.balance.valid
        ? this._dimensions.balance.height
        : 0;
      const rateW = this._dimensions.rate.valid
        ? this._dimensions.rate.width
        : 0;
      const rateH = this._dimensions.rate.valid
        ? this._dimensions.rate.height
        : 0;
      const tdeeDiffW = this._dimensions.tdeeDiff.valid
        ? this._dimensions.tdeeDiff.width
        : 0;
      const tdeeDiffH = this._dimensions.tdeeDiff.valid
        ? this._dimensions.tdeeDiff.height
        : 0;
      const scatterW = this._dimensions.scatter.valid
        ? this._dimensions.scatter.width
        : 0;
      const scatterH = this._dimensions.scatter.valid
        ? this._dimensions.scatter.height
        : 0;

      scales.x = d3.scaleTime().range([0, focusW]);
      scales.y = d3.scaleLinear().range([focusH, 0]);
      scales.y2 = d3.scaleLinear().range([focusH, 0]); // Second Y Axis
      scales.xContext = d3.scaleTime().range([0, contextW]);
      scales.yContext = d3.scaleLinear().range([contextH, 0]);
      scales.xBalance = d3.scaleTime().range([0, balanceW]);
      scales.yBalance = d3.scaleLinear().range([balanceH, 0]);
      scales.xRate = d3.scaleTime().range([0, rateW]);
      scales.yRate = d3.scaleLinear().range([rateH, 0]);
      scales.xTdeeDiff = d3.scaleTime().range([0, tdeeDiffW]);
      scales.yTdeeDiff = d3.scaleLinear().range([tdeeDiffH, 0]);
      scales.xScatter = d3.scaleLinear().range([0, scatterW]);
      scales.yScatter = d3.scaleLinear().range([scatterH, 0]);
    },

    createAxes() {
      const focusWidth = this._dimensions.focus.valid
        ? this._dimensions.focus.width
        : 0;
      const focusHeight = this._dimensions.focus.valid
        ? this._dimensions.focus.height
        : 0;
      const contextWidth = this._dimensions.context.valid
        ? this._dimensions.context.width
        : 0;
      const balanceWidth = this._dimensions.balance.valid
        ? this._dimensions.balance.width
        : 0;
      const balanceHeight = this._dimensions.balance.valid
        ? this._dimensions.balance.height
        : 0;
      const rateWidth = this._dimensions.rate.valid
        ? this._dimensions.rate.width
        : 0;
      const rateHeight = this._dimensions.rate.valid
        ? this._dimensions.rate.height
        : 0;
      const tdeeDiffWidth = this._dimensions.tdeeDiff.valid
        ? this._dimensions.tdeeDiff.width
        : 0;
      const tdeeDiffHeight = this._dimensions.tdeeDiff.valid
        ? this._dimensions.tdeeDiff.height
        : 0;

      axes.xAxis = d3
        .axisBottom(scales.x)
        .ticks(Math.max(Math.floor(focusWidth / 100), 2))
        .tickSizeOuter(0)
        .tickFormat(Utils.formatDateShort);
      axes.yAxis = d3
        .axisLeft(scales.y)
        .ticks(Math.max(Math.floor(focusHeight / 40), 5))
        .tickSizeOuter(0)
        .tickFormat((d) => Utils.formatValue(d, 1));
      axes.yAxis2 = d3
        .axisRight(scales.y2)
        .ticks(5)
        .tickSizeOuter(0)
        .tickFormat((d) => Utils.formatValue(d, 1) + "%");
      axes.xAxisContext = d3
        .axisBottom(scales.xContext)
        .ticks(Math.max(Math.floor(contextWidth / 100), 2))
        .tickSizeOuter(0)
        .tickFormat(d3.timeFormat("%b '%y"));

      const createSecondaryAxis = (
        scale,
        dimension,
        orientation,
        tickDivisor,
        format,
      ) => {
        const axis =
          orientation === "left" ? d3.axisLeft(scale) : d3.axisBottom(scale);
        axis
          .ticks(Math.max(Math.floor(dimension / tickDivisor), 3))
          .tickSizeOuter(0)
          .tickFormat(format);
        return axis;
      };

      axes.xBalanceAxis = createSecondaryAxis(
        scales.xBalance,
        balanceWidth,
        "bottom",
        180,
        d3.timeFormat("%b %d"),
      );
      axes.yBalanceAxis = createSecondaryAxis(
        scales.yBalance,
        balanceHeight,
        "left",
        25,
        (d) => (d === 0 ? "0" : d3.format("+,")(d)),
      );
      axes.xRateAxis = createSecondaryAxis(
        scales.xRate,
        rateWidth,
        "bottom",
        150,
        d3.timeFormat("%b %d"),
      );
      axes.yRateAxis = createSecondaryAxis(
        scales.yRate,
        rateHeight,
        "left",
        30,
        (d) => Utils.formatValue(d, 2),
      );
      axes.xTdeeDiffAxis = createSecondaryAxis(
        scales.xTdeeDiff,
        tdeeDiffWidth,
        "bottom",
        150,
        d3.timeFormat("%b %d"),
      );
      axes.yTdeeDiffAxis = createSecondaryAxis(
        scales.yTdeeDiff,
        tdeeDiffHeight,
        "left",
        30,
        d3.format("+,.0f"),
      );
      axes.xScatterAxis = d3
        .axisBottom(scales.xScatter)
        .ticks(5)
        .tickFormat(d3.format("+,"));
      axes.yScatterAxis = d3
        .axisLeft(scales.yScatter)
        .ticks(5)
        .tickFormat((d) => d.toFixed(2));
    },

    createBrushes() {
      if (this._dimensions.context.valid && ui.context && !ui.context.empty()) {
        const { width, height } = this._dimensions.context;
        brushes.context = d3
          .brushX()
          .extent([
            [0, 0],
            [width, height],
          ])
          .on("brush end", EventHandlers.contextBrushed);
        ui.brushGroup = ui.context
          .append("g")
          .attr("class", "brush context-brush")
          .call(brushes.context);
      }
      if (
        this._dimensions.focus.valid &&
        ui.regressionBrushGroup &&
        !ui.regressionBrushGroup.empty()
      ) {
        const { width, height } = this._dimensions.focus;
        brushes.regression = d3
          .brushX()
          .extent([
            [0, 0],
            [width, height],
          ])
          .on("end", EventHandlers.regressionBrushed);
        ui.regressionBrushGroup.call(brushes.regression);
        ui.regressionBrushGroup
          .selectAll(".overlay, .selection, .handle")
          .style("display", "none");
      }
    },

    createZoom() {
      if (!this._dimensions.focus.valid || !ui.svg || ui.svg.empty()) {
        console.error(
          "UISetup: Cannot create zoom - focus dimensions invalid or SVG missing.",
        );
        return;
      }
      const { width, height } = UISetup._dimensions.focus;
      const contextRange = scales.xContext?.range() || [0, width];

      zoom = d3
        .zoom()
        .scaleExtent([0.5, 20])
        .extent([
          [0, 0],
          [width, height],
        ])
        .translateExtent([
          [contextRange[0], -Infinity],
          [contextRange[1], Infinity],
        ])
        .on("zoom.handler", EventHandlers.zoomed);

      if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
        ui.zoomCaptureRect.call(zoom).on("dblclick.zoom", null);
        console.log("UISetup: Zoom behavior initialized.");
      } else {
        console.error(
          "UISetup: Zoom capture rectangle not found, cannot attach zoom behavior.",
        );
      }
    },

    runAll() {
      console.log("UISetup: Running all setup steps...");
      if (!UISetup.calculateDimensions()) return false;
      UISetup.createSVGElements();
      UISetup.createScales();
      UISetup.createAxes();
      UISetup.createBrushes();
      UISetup.createZoom();
      console.log("UISetup: Setup complete.");
      return true;
    },
  };

  // ========================================================================
  // Domain Manager (`DomainManager`)
  // ========================================================================
  const DomainManager = {
    setXDomains(processedData) {
      const fullDataExtent = d3.extent(processedData, (d) => d.date);

      if (!fullDataExtent[0] || !fullDataExtent[1]) {
        console.warn(
          "DomainManager: No valid date range found. Using fallback.",
        );
        const today = new Date();
        const past = d3.timeMonth.offset(today, -CONFIG.initialViewMonths);
        fullDataExtent[0] = past;
        fullDataExtent[1] = today;
      }

      scales.xContext.domain(fullDataExtent);

      const initialEndDate = fullDataExtent[1];
      const initialStartDateDefault = d3.timeMonth.offset(
        initialEndDate,
        -CONFIG.initialViewMonths,
      );
      const initialStartDate =
        initialStartDateDefault < fullDataExtent[0]
          ? fullDataExtent[0]
          : initialStartDateDefault;

      const initialXDomain = [initialStartDate, initialEndDate];
      scales.x.domain(initialXDomain);
      scales.xBalance?.domain(initialXDomain);
      scales.xRate?.domain(initialXDomain);
      scales.xTdeeDiff?.domain(initialXDomain);

      return initialXDomain;
    },

    setContextYDomain(processedData) {
      const dataForExtent = state.seriesVisibility.sma
        ? processedData.filter((d) => d.sma != null)
        : processedData.filter((d) => d.value != null);

      let yMin = d3.min(dataForExtent, (d) =>
        state.seriesVisibility.sma ? (d.lowerBound ?? d.sma) : d.value,
      );
      let yMax = d3.max(dataForExtent, (d) =>
        state.seriesVisibility.sma ? (d.upperBound ?? d.sma) : d.value,
      );

      if (yMin == null || yMax == null || isNaN(yMin) || isNaN(yMax)) {
        console.warn(
          "DomainManager: No valid data for context Y domain. Using fallback [60, 80].",
        );
        [yMin, yMax] = [60, 80];
      } else if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
      } else {
        const padding = Math.max(0.5, (yMax - yMin) * 0.05);
        yMin -= padding;
        yMax += padding;
      }
      scales.yContext.domain([yMin, yMax]).nice();
    },

    setFocusYDomains(dataForCalculation, regressionResult) {
      if (!scales.y || !scales.y2 || !scales.x) return;

      const yRange = scales.y.range();
      const height =
        yRange[0] > yRange[1]
          ? yRange[0]
          : UISetup._dimensions.focus.height || 200;
      let yMin = Infinity,
        yMax = -Infinity;
      let y2Min = Infinity,
        y2Max = -Infinity;

      const updateExtent = (value) => {
        if (value != null && !isNaN(value)) {
          yMin = Math.min(yMin, value);
          yMax = Math.max(yMax, value);
        }
      };
      const updateExtentY2 = (value) => {
        if (value != null && !isNaN(value)) {
          y2Min = Math.min(y2Min, value);
          y2Max = Math.max(y2Max, value);
        }
      };

      const currentXDomain = scales.x.domain();
      const bufferStartDate =
        state.useDynamicYAxis && currentXDomain[0] instanceof Date
          ? d3.timeDay.offset(currentXDomain[0], -CONFIG.domainBufferDays)
          : null;
      const bufferEndDate =
        state.useDynamicYAxis && currentXDomain[1] instanceof Date
          ? d3.timeDay.offset(currentXDomain[1], CONFIG.domainBufferDays)
          : null;

      const isWithinBufferedView = (date) => {
        if (!state.useDynamicYAxis || !bufferStartDate || !bufferEndDate)
          return true;
        return date >= bufferStartDate && date <= bufferEndDate;
      };

      const calculationDataArray = Array.isArray(dataForCalculation)
        ? dataForCalculation
        : [];

      calculationDataArray.forEach((d) => {
        if (!d.date || !isWithinBufferedView(d.date)) return;
        if (state.seriesVisibility.sma && d.sma != null) {
          updateExtent(d.lowerBound);
          updateExtent(d.upperBound);
        } else if (state.seriesVisibility.raw && d.value != null) {
          updateExtent(d.value);
        }
        if (state.seriesVisibility.bf && d.bfPercent != null) {
          updateExtentY2(d.bfPercent);
        }
      });

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

      const trendConfig = DataService.getTrendlineConfigFromUI();
      if (trendConfig.isValid) {
        let datesToCheck = calculationDataArray
          .map((d) => d.date)
          .filter(isWithinBufferedView);
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

      if (state.seriesVisibility.goal && state.goal.weight != null) {
        updateExtent(state.goal.weight);
        const lastSmaPoint = [...state.processedData]
          .reverse()
          .find((d) => d.sma != null);
        if (lastSmaPoint?.date && isWithinBufferedView(lastSmaPoint.date)) {
          updateExtent(lastSmaPoint.sma);
        }
        if (state.goal.date && isWithinBufferedView(state.goal.date)) {
          updateExtent(state.goal.weight);
        }
      }

      // Finalize Y1 Domain (Weight)
      if (yMin === Infinity || yMax === -Infinity) {
        const contextDomain = scales.yContext?.domain();
        if (
          contextDomain &&
          !isNaN(contextDomain[0]) &&
          !isNaN(contextDomain[1])
        ) {
          [yMin, yMax] = contextDomain;
        } else {
          [yMin, yMax] = [60, 80];
          console.warn(
            "DomainManager: Using absolute fallback Y domain [60, 80].",
          );
        }
      } else if (yMin === yMax) {
        yMin -= CONFIG.yAxisMinPaddingKg * 2;
        yMax += CONFIG.yAxisMinPaddingKg * 2;
      } else {
        const padding = Math.max(
          CONFIG.yAxisMinPaddingKg,
          (yMax - yMin) * CONFIG.yAxisPaddingFactor,
        );
        yMin -= padding;
        yMax += padding;
      }
      if (!isNaN(yMin) && !isNaN(yMax)) {
        scales.y
          .domain([yMin, yMax])
          .nice(Math.max(Math.floor(height / 40), 5));
      } else {
        console.error("DomainManager: Calculated invalid Y1 domain", [
          yMin,
          yMax,
        ]);
        scales.y.domain([60, 80]).nice();
      }

      // Finalize Y2 Domain (Body Fat %)
      if (state.seriesVisibility.bf) {
        if (y2Min === Infinity || y2Max === -Infinity) {
          [y2Min, y2Max] = [10, 30];
        } else if (y2Min === y2Max) {
          y2Min -= 1;
          y2Max += 1;
        } else {
          const padding = Math.max(0.5, (y2Max - y2Min) * 0.05);
          y2Min -= padding;
          y2Max += padding;
        }
        if (!isNaN(y2Min) && !isNaN(y2Max)) {
          scales.y2.domain([y2Min, y2Max]).nice(5);
        } else {
          console.error("DomainManager: Calculated invalid Y2 domain", [
            y2Min,
            y2Max,
          ]);
          scales.y2.domain([0, 100]).nice();
        }
      } else {
        scales.y2.domain([0, 100]);
      }
    },

    setSecondaryYDomains(visibleData) {
      if (scales.yBalance) {
        const maxAbsBalance =
          d3.max(visibleData, (d) => Math.abs(d.netBalance ?? 0)) ?? 0;
        const yBalanceDomainMax =
          maxAbsBalance > 100 ? maxAbsBalance * 1.1 : 500;
        scales.yBalance.domain([-yBalanceDomainMax, yBalanceDomainMax]).nice();
      }
      if (scales.yRate) {
        const rateExtent = d3.extent(visibleData, (d) => d.smoothedWeeklyRate);
        let [yRateMin, yRateMax] = rateExtent;
        if (
          yRateMin == null ||
          yRateMax == null ||
          isNaN(yRateMin) ||
          isNaN(yRateMax)
        )
          [yRateMin, yRateMax] = [-0.5, 0.5];
        else if (yRateMin === yRateMax) {
          yRateMin -= 0.1;
          yRateMax += 0.1;
        }
        const yRatePadding = Math.max(
          0.05,
          Math.abs(yRateMax - yRateMin) * 0.1,
        );
        scales.yRate
          .domain([yRateMin - yRatePadding, yRateMax + yRatePadding])
          .nice();
      }
      if (scales.yTdeeDiff) {
        const diffExtent = d3.extent(visibleData, (d) => d.avgTdeeDifference);
        let [yDiffMin, yDiffMax] = diffExtent;
        if (
          yDiffMin == null ||
          yDiffMax == null ||
          isNaN(yDiffMin) ||
          isNaN(yDiffMax)
        )
          [yDiffMin, yDiffMax] = [-300, 300];
        else if (yDiffMin === yDiffMax) {
          yDiffMin -= 50;
          yDiffMax += 50;
        }
        const yDiffPadding = Math.max(50, Math.abs(yDiffMax - yDiffMin) * 0.1);
        scales.yTdeeDiff
          .domain([yDiffMin - yDiffPadding, yDiffMax + yDiffPadding])
          .nice();
      }
    },

    setScatterPlotDomains(scatterData) {
      if (!scales.xScatter || !scales.yScatter) return;
      if (!Array.isArray(scatterData) || scatterData.length === 0) {
        scales.xScatter.domain([-500, 500]).nice();
        scales.yScatter.domain([-0.5, 0.5]).nice();
        return;
      }
      const xExtent = d3.extent(scatterData, (d) => d.avgNetCal);
      const yExtent = d3.extent(scatterData, (d) => d.weeklyRate);
      const [xMinRaw, xMaxRaw] = xExtent;
      const [yMinRaw, yMaxRaw] = yExtent;
      const xMin = xMinRaw == null || isNaN(xMinRaw) ? 0 : xMinRaw;
      const xMax = xMaxRaw == null || isNaN(xMaxRaw) ? 0 : xMaxRaw;
      const yMin = yMinRaw == null || isNaN(yMinRaw) ? 0 : yMinRaw;
      const yMax = yMaxRaw == null || isNaN(yMaxRaw) ? 0 : yMaxRaw;
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      const xPadding = xRange === 0 ? 500 : Math.max(100, xRange * 0.1);
      const yPadding = yRange === 0 ? 0.5 : Math.max(0.1, yRange * 0.1);
      scales.xScatter.domain([xMin - xPadding, xMax + xPadding]).nice();
      scales.yScatter.domain([yMin - yPadding, yMax + yPadding]).nice();
    },

    initializeDomains(processedData) {
      console.log("DomainManager: Initializing domains...");
      DomainManager.setContextYDomain(processedData);
      const initialXDomain = DomainManager.setXDomains(processedData);
      const initialVisibleData = processedData.filter(
        (d) => d.date >= initialXDomain[0] && d.date <= initialXDomain[1],
      );
      const initialRegression = DataService.calculateLinearRegression(
        initialVisibleData.filter((d) => !d.isOutlier && d.value != null),
        state.regressionStartDate,
      );
      DomainManager.setFocusYDomains(initialVisibleData, initialRegression);
      DomainManager.setSecondaryYDomains(initialVisibleData);
      const allWeeklyStats = StatsManager.calculateWeeklyStats(
        processedData,
        null,
        null,
      );
      state.correlationScatterData = allWeeklyStats.filter(
        (w) => w.avgNetCal != null && w.weeklyRate != null,
      );
      DomainManager.setScatterPlotDomains(state.correlationScatterData);
      console.log("DomainManager: Domain initialization complete.");
    },

    updateDomainsOnInteraction() {
      const currentXDomain = scales.x.domain();
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
      state.filteredData = state.processedData.filter(
        (d) => d.date >= currentXDomain[0] && d.date <= currentXDomain[1],
      );
      const regressionRange = EventHandlers.getEffectiveRegressionRange();
      let regressionResult = null;
      if (regressionRange.start && regressionRange.end) {
        const regressionData = state.processedData.filter(
          (d) =>
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
        };
      }
      const dataForYCalc = state.useDynamicYAxis
        ? state.filteredData
        : state.processedData;
      DomainManager.setFocusYDomains(dataForYCalc, regressionResult);
      scales.xBalance?.domain(currentXDomain);
      scales.xRate?.domain(currentXDomain);
      scales.xTdeeDiff?.domain(currentXDomain);
      DomainManager.setSecondaryYDomains(state.filteredData);
    },
  };

  // ========================================================================
  // Chart Updaters
  // ========================================================================
  const FocusChartUpdater = {
    updateAxes() {
      if (!UISetup._dimensions?.focus?.valid) return;
      const dur = CONFIG.transitionDurationMs;
      const { width, height } = UISetup._dimensions.focus;
      if (!axes.xAxis || !axes.yAxis || !axes.yAxis2) return;
      ui.xAxisGroup?.transition().duration(dur).call(axes.xAxis);
      ui.yAxisGroup?.transition().duration(dur).call(axes.yAxis);
      const yTicks = axes.yAxis.scale().ticks(axes.yAxis.ticks()[0]);
      ui.gridGroup
        ?.transition()
        .duration(dur)
        .call(
          d3
            .axisLeft(scales.y)
            .tickSize(-width)
            .tickFormat("")
            .tickValues(yTicks),
        );
      ui.gridGroup?.selectAll(".domain").remove();
      const showY2 = state.seriesVisibility.bf;
      ui.yAxisGroup2
        ?.style("display", showY2 ? null : "none")
        .transition()
        .duration(dur)
        .call(axes.yAxis2);
      ui.svg?.select(".y-axis-label2").style("display", showY2 ? null : "none");
    },

    updatePaths(visibleValidSmaData, regressionResult) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.chartArea) return;

      const smaLineGen = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.sma))
        .curve(d3.curveMonotoneX)
        .defined(
          (d) =>
            d.sma != null &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.sma)),
        );
      const smaBandAreaGen = d3
        .area()
        .x((d) => scales.x(d.date))
        .y0((d) => scales.y(d.lowerBound))
        .y1((d) => scales.y(d.upperBound))
        .curve(d3.curveMonotoneX)
        .defined(
          (d) =>
            d.lowerBound != null &&
            d.upperBound != null &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.lowerBound)) &&
            !isNaN(scales.y(d.upperBound)),
        );
      const regressionLineGen = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.regressionValue))
        .defined(
          (d) =>
            d.regressionValue != null &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.regressionValue)),
        );
      const regressionCIAreaGen = d3
        .area()
        .x((d) => scales.x(d.date))
        .y0((d) => scales.y(d.lowerCI))
        .y1((d) => scales.y(d.upperCI))
        .curve(d3.curveMonotoneX)
        .defined(
          (d) =>
            d.lowerCI != null &&
            d.upperCI != null &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.lowerCI)) &&
            !isNaN(scales.y(d.upperCI)),
        );
      const trendLineGen = (startDate, initialWeight, weeklyIncrease) =>
        d3
          .line()
          .x((d) => scales.x(d.date))
          .y((d) => {
            const weight = DataService.calculateTrendWeight(
              startDate,
              initialWeight,
              weeklyIncrease,
              d.date,
            );
            return weight != null && !isNaN(weight) ? scales.y(weight) : NaN;
          })
          .defined((d) => {
            const weight = DataService.calculateTrendWeight(
              startDate,
              initialWeight,
              weeklyIncrease,
              d.date,
            );
            return (
              d.date >= startDate &&
              weight != null &&
              !isNaN(weight) &&
              !isNaN(scales.x(d.date)) &&
              !isNaN(scales.y(weight))
            );
          });
      const goalLineGen = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.weight))
        .defined((d) => !isNaN(scales.x(d.date)) && !isNaN(scales.y(d.weight)));
      const bfLineGen = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y2(d.bfPercent))
        .defined(
          (d) =>
            d.bfPercent != null &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y2(d.bfPercent)),
        );

      // Update Selections
      ui.bandArea
        ?.datum(state.seriesVisibility.sma ? visibleValidSmaData : [])
        .transition()
        .duration(dur)
        .style("display", state.seriesVisibility.sma ? null : "none")
        .attr("d", smaBandAreaGen);
      ui.smaLine
        ?.datum(state.seriesVisibility.sma ? visibleValidSmaData : [])
        .transition()
        .duration(dur)
        .style("display", state.seriesVisibility.sma ? null : "none")
        .attr("d", smaLineGen);

      const showReg = state.seriesVisibility.regression;
      const showRegCI = state.seriesVisibility.regressionCI && showReg;
      const regPoints =
        showReg && regressionResult?.points ? regressionResult.points : [];
      const regCIPoints =
        showRegCI && regressionResult?.pointsWithCI
          ? regressionResult.pointsWithCI
          : [];
      ui.regressionLine
        ?.datum(regPoints.length > 0 ? regPoints : [])
        .transition()
        .duration(dur)
        .style("display", regPoints.length > 0 ? null : "none")
        .attr("d", regressionLineGen);
      ui.regressionCIArea
        ?.datum(regCIPoints.length > 0 ? regCIPoints : [])
        .transition()
        .duration(dur)
        .style("display", regCIPoints.length > 0 ? null : "none")
        .attr("d", regressionCIAreaGen);

      const trendConfig = DataService.getTrendlineConfigFromUI();
      const trendData = trendConfig.isValid
        ? state.processedData.filter((d) => d.date >= trendConfig.startDate)
        : [];
      ui.trendLine1
        ?.datum(
          state.seriesVisibility.trend1 && trendData.length ? trendData : [],
        )
        .transition()
        .duration(dur)
        .style(
          "display",
          state.seriesVisibility.trend1 && trendData.length ? null : "none",
        )
        .attr(
          "d",
          trendLineGen(
            trendConfig.startDate,
            trendConfig.initialWeight,
            trendConfig.weeklyIncrease1,
          ),
        );
      ui.trendLine2
        ?.datum(
          state.seriesVisibility.trend2 && trendData.length ? trendData : [],
        )
        .transition()
        .duration(dur)
        .style(
          "display",
          state.seriesVisibility.trend2 && trendData.length ? null : "none",
        )
        .attr(
          "d",
          trendLineGen(
            trendConfig.startDate,
            trendConfig.initialWeight,
            trendConfig.weeklyIncrease2,
          ),
        );

      let goalLineData = [];
      if (
        state.seriesVisibility.goal &&
        state.goal.weight != null &&
        state.processedData.length > 0
      ) {
        const lastSmaPoint = [...state.processedData]
          .reverse()
          .find((d) => d.sma != null);
        if (lastSmaPoint?.date) {
          const startDate = lastSmaPoint.date;
          const startWeight = lastSmaPoint.sma;
          const endDateRaw = state.goal.date
            ? state.goal.date
            : scales.x?.domain()?.[1];
          if (
            endDateRaw instanceof Date &&
            !isNaN(endDateRaw) &&
            endDateRaw >= startDate
          ) {
            goalLineData = [
              { date: startDate, weight: startWeight },
              { date: endDateRaw, weight: state.goal.weight },
            ];
          }
        }
      }
      ui.goalLine
        ?.datum(goalLineData)
        .transition()
        .duration(dur)
        .style("display", goalLineData.length > 0 ? null : "none")
        .attr("d", goalLineGen);

      ui.bfLine
        ?.datum(state.seriesVisibility.bf ? state.filteredData : [])
        .transition()
        .duration(dur)
        .style("display", state.seriesVisibility.bf ? null : "none")
        .attr("d", bfLineGen);
    },

    updateDots(visibleRawWeightData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.rawDotsGroup || !ui.smaDotsGroup || !scales.x || !scales.y)
        return;

      const showRaw = state.seriesVisibility.raw;
      const showSmaDots = state.seriesVisibility.sma;

      ui.rawDotsGroup?.style("display", showRaw ? null : "none");
      if (showRaw && ui.rawDotsGroup) {
        const rawDotsDataValid = visibleRawWeightData.filter(
          (d) =>
            d.value != null &&
            d.date instanceof Date &&
            !isNaN(d.date) &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.value)),
        );
        const rawDots = ui.rawDotsGroup
          .selectAll(".raw-dot")
          .data(rawDotsDataValid, (d) => d.dateString || d.date);
        rawDots.join(
          (enter) =>
            enter
              .append("circle")
              .attr("class", "raw-dot")
              .attr("r", CONFIG.rawDotRadius)
              .attr("cx", (d) => scales.x(d.date))
              .attr("cy", (d) => scales.y(d.value))
              .style("fill", colors.rawDot)
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
          (exit) =>
            exit.transition().duration(dur).style("opacity", 0).remove(),
        );
      } else {
        ui.rawDotsGroup?.selectAll(".raw-dot").remove();
      }

      ui.smaDotsGroup?.style("display", showSmaDots ? null : "none");
      if (showSmaDots && ui.smaDotsGroup) {
        const smaDotsDataValid = visibleRawWeightData.filter(
          (d) =>
            d.value != null &&
            d.date instanceof Date &&
            !isNaN(d.date) &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.value)),
        );
        const smaDots = ui.smaDotsGroup
          .selectAll(".dot")
          .data(smaDotsDataValid, (d) => d.dateString || d.date);
        smaDots.join(
          (enter) =>
            enter
              .append("circle")
              .attr("class", "dot")
              .classed("outlier", (d) => d.isOutlier)
              .attr("r", CONFIG.dotRadius)
              .attr("cx", (d) => scales.x(d.date))
              .attr("cy", (d) => scales.y(d.value))
              .style("fill", (d) => (d.isOutlier ? colors.outlier : colors.dot))
              .style("opacity", 0)
              .on("mouseover", EventHandlers.dotMouseOver) // Attach main chart hover
              .on("mouseout", EventHandlers.dotMouseOut) // Attach main chart hover out
              .on("click", EventHandlers.dotClick)
              .call((enter) =>
                enter.transition().duration(dur).style("opacity", 0.7),
              ),
          (update) =>
            update
              .classed("outlier", (d) => d.isOutlier)
              .classed(
                "highlighted",
                (d) =>
                  state.highlightedDate &&
                  d.date.getTime() === state.highlightedDate.getTime(),
              )
              .call((update) =>
                update
                  .transition()
                  .duration(dur)
                  .attr("cx", (d) => scales.x(d.date))
                  .attr("cy", (d) => scales.y(d.value))
                  .style("fill", (d) =>
                    d.isOutlier ? colors.outlier : colors.dot,
                  )
                  .attr("r", (d) =>
                    state.highlightedDate &&
                    d.date.getTime() === state.highlightedDate.getTime()
                      ? CONFIG.dotRadius *
                        CONFIG.highlightRadiusMultiplier *
                        0.8
                      : CONFIG.dotRadius,
                  )
                  .style("opacity", (d) =>
                    state.highlightedDate &&
                    d.date.getTime() === state.highlightedDate.getTime()
                      ? 1
                      : 0.7,
                  ),
              ),
          (exit) =>
            exit.transition().duration(dur).style("opacity", 0).remove(),
        );
      } else {
        ui.smaDotsGroup?.selectAll(".dot").remove();
      }
    },

    updateHighlightMarker(visibleRawWeightData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.highlightGroup || !scales.x || !scales.y) return;

      const highlightDataPoint = state.highlightedDate
        ? visibleRawWeightData.find(
            (d) =>
              d.value != null &&
              d.date instanceof Date &&
              d.date.getTime() === state.highlightedDate.getTime() &&
              !isNaN(scales.x(d.date)) &&
              !isNaN(scales.y(d.value)),
          )
        : null;
      const highlightMarker = ui.highlightGroup
        .selectAll(".highlight-marker")
        .data(highlightDataPoint ? [highlightDataPoint] : [], (d) => d.date);

      highlightMarker.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "highlight-marker")
            .attr("r", 0)
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value))
            .style("fill", "none")
            .style("stroke", colors.highlightStroke)
            .style("stroke-width", "2.5px")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .call((enter) =>
              enter
                .transition()
                .duration(dur * 0.8)
                .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
                .style("opacity", 0.8),
            ),
        (update) =>
          update
            .transition()
            .duration(dur)
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value))
            .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
            .style("opacity", 0.8),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .attr("r", 0)
            .style("opacity", 0)
            .remove(),
      );
    },

    updateCrosshair(hoverData) {
      if (!ui.crosshairGroup || !hoverData || !hoverData.date) {
        ui.crosshairGroup?.style("display", "none");
        return;
      }
      if (!scales.x || !scales.y || !UISetup._dimensions?.focus?.valid) return;

      const xPos = scales.x(hoverData.date);
      const yValue = hoverData.value ?? hoverData.sma;
      const yPos = yValue != null ? scales.y(yValue) : null;
      const { width, height } = UISetup._dimensions.focus;

      if (
        yPos != null &&
        isFinite(xPos) &&
        isFinite(yPos) &&
        xPos >= 0 &&
        xPos <= width &&
        yPos >= 0 &&
        yPos <= height
      ) {
        ui.crosshairGroup.style("display", null);
        ui.crosshairGroup
          .select(".crosshair.crosshair-y")
          .attr("transform", `translate(0, ${yPos})`);
        ui.crosshairGroup
          .select(".crosshair.crosshair-x")
          .attr("transform", `translate(${xPos}, 0)`);
      } else {
        ui.crosshairGroup.style("display", "none");
      }
    },

    updateAnnotations(visibleData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.annotationsGroup || !scales.x || !scales.y) return;
      const annotationData = state.seriesVisibility.annotations
        ? state.annotations
        : [];
      const xDomain = scales.x.domain();
      const visibleAnnotations = annotationData.filter((a) => {
        const date = new Date(a.date);
        return (
          !isNaN(date.getTime()) &&
          date >= xDomain[0] &&
          date <= xDomain[1] &&
          a.type === "point"
        );
      });
      const findYValue = (targetDate) => {
        if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
          return null;
        const targetTime = targetDate.getTime();
        const pointData = visibleData.find(
          (d) => d.date instanceof Date && d.date.getTime() === targetTime,
        );
        const yVal = pointData ? (pointData.sma ?? pointData.value) : null;
        return yVal != null && !isNaN(scales.y(yVal)) ? yVal : null;
      };
      const markers = ui.annotationsGroup
        .selectAll(".annotation-marker-group")
        .data(visibleAnnotations, (d) => d.id);
      markers.join(
        (enter) => {
          const group = enter
            .append("g")
            .attr("class", "annotation-marker-group")
            .style("opacity", 0);
          group.attr("transform", (d) => {
            const yValue = findYValue(new Date(d.date));
            return yValue != null
              ? `translate(${scales.x(new Date(d.date))}, ${scales.y(yValue)})`
              : `translate(-1000, -1000)`;
          });
          group
            .append("circle")
            .attr("class", "annotation-marker")
            .attr("r", CONFIG.annotationMarkerRadius)
            .style("fill", colors.annotationMarker)
            .style("stroke", "var(--bg-secondary)")
            .style("stroke-width", 1.5);
          group
            .on("mouseover", EventHandlers.annotationMouseOver)
            .on("mouseout", EventHandlers.annotationMouseOut);
          group.transition().duration(dur).style("opacity", 1);
          return group;
        },
        (update) =>
          update
            .transition()
            .duration(dur)
            .style("opacity", 0.8)
            .attr("transform", (d) => {
              const yValue = findYValue(new Date(d.date));
              return yValue != null
                ? `translate(${scales.x(new Date(d.date))}, ${scales.y(yValue)})`
                : `translate(-1000, -1000)`;
            }),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .attr("transform", `translate(-1000, -1000)`)
            .remove(),
      );
    },

    updatePlateauRegions() {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.plateauGroup || !scales.x || !UISetup._dimensions?.focus?.valid)
        return;
      const plateauData = state.seriesVisibility.plateaus ? state.plateaus : [];
      const xDomain = scales.x.domain();
      const { height } = UISetup._dimensions.focus;
      const visiblePlateaus = plateauData.filter(
        (p) =>
          p.endDate instanceof Date &&
          p.startDate instanceof Date &&
          p.endDate >= xDomain[0] &&
          p.startDate <= xDomain[1],
      );
      const regions = ui.plateauGroup
        .selectAll(".plateau-region")
        .data(visiblePlateaus, (d) => `${d.startDate}-${d.endDate}`);
      regions.join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "plateau-region")
            .attr("x", (d) => scales.x(d.startDate))
            .attr("y", 0)
            .attr("width", (d) => {
              const xStart = scales.x(d.startDate);
              const xEnd = scales.x(d.endDate);
              return !isNaN(xStart) && !isNaN(xEnd)
                ? Math.max(0, xEnd - xStart)
                : 0;
            })
            .attr("height", height)
            .style("fill", colors.plateauColor)
            .style("pointer-events", "none")
            .style("opacity", 0)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.15),
            ),
        (update) =>
          update
            .transition()
            .duration(dur)
            .attr("x", (d) => scales.x(d.startDate))
            .attr("width", (d) => {
              const xStart = scales.x(d.startDate);
              const xEnd = scales.x(d.endDate);
              return !isNaN(xStart) && !isNaN(xEnd)
                ? Math.max(0, xEnd - xStart)
                : 0;
            })
            .attr("height", height)
            .style("opacity", 0.15),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .remove(),
      );
    },

    updateTrendChangeMarkers(processedData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.trendChangeGroup || !scales.x || !scales.y) return;
      const markerData = state.seriesVisibility.trendChanges
        ? state.trendChangePoints
        : [];
      const xDomain = scales.x.domain();
      const findYValue = (targetDate) => {
        if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
          return null;
        const targetTime = targetDate.getTime();
        const pointData = processedData.find(
          (d) => d.date instanceof Date && d.date.getTime() === targetTime,
        );
        const yVal = pointData ? (pointData.sma ?? pointData.value) : null;
        return yVal != null && !isNaN(scales.y(yVal)) ? yVal : null;
      };
      const visibleMarkers = markerData.filter(
        (p) => p.date >= xDomain[0] && p.date <= xDomain[1],
      );
      const markerSize = 4;
      const markerPath = d3
        .symbol()
        .type(d3.symbolTriangle)
        .size(markerSize * markerSize * 1.5);
      const markers = ui.trendChangeGroup
        .selectAll(".trend-change-marker-group")
        .data(visibleMarkers, (d) => d.date);
      markers.join(
        (enter) => {
          const group = enter
            .append("g")
            .attr("class", "trend-change-marker-group")
            .style("opacity", 0);
          group.attr("transform", (d) => {
            const yValue = findYValue(d.date);
            const rotation = d.magnitude > 0 ? 180 : 0;
            return yValue != null
              ? `translate(${scales.x(d.date)}, ${scales.y(yValue)}) rotate(${rotation})`
              : `translate(-1000, -1000)`;
          });
          group
            .append("path")
            .attr("class", "trend-change-marker")
            .attr("d", markerPath)
            .style("fill", colors.trendChangeColor);
          group
            .on("mouseover", EventHandlers.trendChangeMouseOver)
            .on("mouseout", EventHandlers.trendChangeMouseOut);
          group.transition().duration(dur).style("opacity", 0.8);
          return group;
        },
        (update) =>
          update
            .transition()
            .duration(dur)
            .style("opacity", 1)
            .attr("transform", (d) => {
              const yValue = findYValue(d.date);
              const rotation = d.magnitude > 0 ? 180 : 0;
              return yValue != null
                ? `translate(${scales.x(d.date)}, ${scales.y(yValue)}) rotate(${rotation})`
                : `translate(-1000, -1000)`;
            }),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .attr("transform", `translate(-1000, -1000)`)
            .remove(),
      );
    },

    updateRegressionBrushDisplay() {
      if (
        !ui.regressionBrushGroup ||
        !brushes.regression ||
        !scales.x ||
        !UISetup._dimensions?.focus?.valid
      )
        return;
      const range = state.interactiveRegressionRange;
      const { width } = UISetup._dimensions.focus;
      if (range.start instanceof Date && range.end instanceof Date) {
        if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) {
          ui.regressionBrushGroup
            .selectAll(".overlay, .selection, .handle")
            .style("display", "none");
          if (d3.brushSelection(ui.regressionBrushGroup.node())) {
            ui.regressionBrushGroup.call(brushes.regression.move, null);
          }
          return;
        }
        const pixelStart = Math.max(0, Math.min(width, scales.x(range.start)));
        const pixelEnd = Math.max(0, Math.min(width, scales.x(range.end)));
        if (
          pixelEnd > pixelStart &&
          pixelEnd > 0 &&
          pixelStart < width &&
          !isNaN(pixelStart) &&
          !isNaN(pixelEnd)
        ) {
          ui.regressionBrushGroup
            .selectAll(".overlay, .selection, .handle")
            .style("display", null);
          const currentSelection = d3.brushSelection(
            ui.regressionBrushGroup.node(),
          );
          const tolerance = 1;
          if (
            !currentSelection ||
            Math.abs(currentSelection[0] - pixelStart) > tolerance ||
            Math.abs(currentSelection[1] - pixelEnd) > tolerance
          ) {
            ui.regressionBrushGroup.on("end.handler", null);
            ui.regressionBrushGroup.call(brushes.regression.move, [
              pixelStart,
              pixelEnd,
            ]);
            ui.regressionBrushGroup.on(
              "end.handler",
              EventHandlers.regressionBrushed,
            );
          }
        } else {
          ui.regressionBrushGroup
            .selectAll(".overlay, .selection, .handle")
            .style("display", "none");
          if (d3.brushSelection(ui.regressionBrushGroup.node())) {
            ui.regressionBrushGroup.on("end.handler", null);
            ui.regressionBrushGroup.call(brushes.regression.move, null);
            ui.regressionBrushGroup.on(
              "end.handler",
              EventHandlers.regressionBrushed,
            );
          }
        }
      } else {
        ui.regressionBrushGroup
          .selectAll(".overlay, .selection, .handle")
          .style("display", "none");
        if (d3.brushSelection(ui.regressionBrushGroup.node())) {
          ui.regressionBrushGroup.on("end.handler", null);
          ui.regressionBrushGroup.call(brushes.regression.move, null);
          ui.regressionBrushGroup.on(
            "end.handler",
            EventHandlers.regressionBrushed,
          );
        }
      }
    },
  };

  const ContextChartUpdater = {
    updateAxes() {
      if (!axes.xAxisContext) return;
      ui.contextXAxisGroup?.call(axes.xAxisContext);
    },
    updateChart(processedData) {
      if (
        !ui.contextArea ||
        !ui.contextLine ||
        !scales.xContext ||
        !scales.yContext
      )
        return;
      const contextValueAccessor = (d) => d.sma ?? d.value;
      const contextAreaGen = d3
        .area()
        .curve(d3.curveMonotoneX)
        .x((d) => scales.xContext(d.date))
        .y0(scales.yContext.range()[0])
        .y1((d) => scales.yContext(contextValueAccessor(d)))
        .defined(
          (d) =>
            contextValueAccessor(d) != null &&
            !isNaN(scales.xContext(d.date)) &&
            !isNaN(scales.yContext(contextValueAccessor(d))),
        );
      const contextLineGen = d3
        .line()
        .curve(d3.curveMonotoneX)
        .x((d) => scales.xContext(d.date))
        .y((d) => scales.yContext(contextValueAccessor(d)))
        .defined(
          (d) =>
            contextValueAccessor(d) != null &&
            !isNaN(scales.xContext(d.date)) &&
            !isNaN(scales.yContext(contextValueAccessor(d))),
        );
      ui.contextArea?.datum(processedData).attr("d", contextAreaGen);
      ui.contextLine?.datum(processedData).attr("d", contextLineGen);
    },
  };

  const BalanceChartUpdater = {
    updateAxes() {
      if (
        !UISetup._dimensions?.balance?.valid ||
        !axes.xBalanceAxis ||
        !axes.yBalanceAxis
      )
        return;
      const dur = CONFIG.transitionDurationMs;
      ui.balanceYAxisGroup?.transition().duration(dur).call(axes.yBalanceAxis);
      ui.balanceYAxisGroup?.select(".domain").remove();
      ui.balanceXAxisGroup?.transition().duration(dur).call(axes.xBalanceAxis);
    },
    updateChart(visibleData) {
      const dur = CONFIG.transitionDurationMs;
      if (
        !ui.balanceChartArea ||
        !scales.xBalance ||
        !scales.yBalance ||
        !UISetup._dimensions?.balance?.valid
      )
        return;
      const { width } = UISetup._dimensions.balance;
      const yZero = scales.yBalance(0);
      if (isNaN(yZero)) {
        console.error("BalanceChartUpdater: Invalid Y=0 position.");
        return;
      }
      ui.balanceZeroLine
        ?.transition()
        .duration(dur)
        .attr("y1", yZero)
        .attr("y2", yZero);
      const validBarData = visibleData.filter(
        (d) =>
          d.netBalance != null &&
          !isNaN(d.netBalance) &&
          d.date instanceof Date &&
          !isNaN(d.date) &&
          !isNaN(scales.xBalance(d.date)) &&
          !isNaN(scales.yBalance(d.netBalance)),
      );
      const barWidth = Math.max(
        1,
        width / Math.max(1, validBarData.length) - 1,
      );
      const bars = ui.balanceChartArea
        .selectAll(".balance-bar")
        .data(validBarData, (d) => d.dateString || d.date);
      bars.join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "balance-bar")
            .classed("deficit", (d) => d.netBalance < 0)
            .classed("surplus", (d) => d.netBalance >= 0)
            .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
            .attr("y", yZero)
            .attr("width", barWidth)
            .attr("height", 0)
            .style("fill", (d) =>
              d.netBalance >= 0 ? colors.surplus : colors.deficit,
            )
            .on("mouseover", EventHandlers.balanceMouseOver) // ADDED
            .on("mouseout", EventHandlers.balanceMouseOut) // ADDED
            .call((enter) =>
              enter
                .transition()
                .duration(dur)
                .attr("y", (d) =>
                  d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
                )
                .attr("height", (d) =>
                  Math.abs(scales.yBalance(d.netBalance) - yZero),
                ),
            ),
        (update) =>
          update
            .classed("deficit", (d) => d.netBalance < 0)
            .classed("surplus", (d) => d.netBalance >= 0)
            .style("fill", (d) =>
              d.netBalance >= 0 ? colors.surplus : colors.deficit,
            )
            .on("mouseover", EventHandlers.balanceMouseOver) // Re-attach for updates
            .on("mouseout", EventHandlers.balanceMouseOut) // Re-attach for updates
            .call((update) =>
              update
                .transition()
                .duration(dur)
                .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
                .attr("width", barWidth)
                .attr("y", (d) =>
                  d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
                )
                .attr("height", (d) =>
                  Math.abs(scales.yBalance(d.netBalance) - yZero),
                ),
            ),
        (exit) =>
          exit.call((exit) =>
            exit
              .transition()
              .duration(dur / 2)
              .attr("y", yZero)
              .attr("height", 0)
              .remove(),
          ),
      );
    },
  };

  const RateChartUpdater = {
    updateAxes() {
      if (
        !UISetup._dimensions?.rate?.valid ||
        !axes.xRateAxis ||
        !axes.yRateAxis
      )
        return;
      const dur = CONFIG.transitionDurationMs;
      ui.rateYAxisGroup?.transition().duration(dur).call(axes.yRateAxis);
      ui.rateYAxisGroup?.select(".domain").remove();
      ui.rateXAxisGroup?.transition().duration(dur).call(axes.xRateAxis);
    },
    updateChart(visibleData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.rateChartArea || !scales.xRate || !scales.yRate) return;
      const yRateScale = scales.yRate; // Cache scale

      // --- NEW: Update Optimal Zone Rect ---
      const lowerBoundKgWk = CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK;
      const upperBoundKgWk = CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK;

      if (
        ui.optimalGainZoneRect &&
        !ui.optimalGainZoneRect.empty() &&
        yRateScale
      ) {
        const yUpper = yRateScale(upperBoundKgWk);
        const yLower = yRateScale(lowerBoundKgWk);

        // Check if bounds are valid numbers and correctly ordered on screen (yLower >= yUpper)
        if (!isNaN(yUpper) && !isNaN(yLower) && yLower >= yUpper) {
          ui.optimalGainZoneRect
            .transition()
            .duration(dur)
            .attr("y", yUpper)
            .attr("height", yLower - yUpper)
            .style("display", null) // Make sure it's visible
            .style("fill", colors.optimalGainZone); // Ensure color is set
        } else {
          // Hide if scale is invalid or bounds are off-screen/reversed
          ui.optimalGainZoneRect.style("display", "none");
        }
      }
      // --- End NEW ---

      const yZero = yRateScale(0);
      if (isNaN(yZero)) {
        console.error("RateChartUpdater: Invalid Y=0 position.");
        return;
      }
      ui.rateZeroLine
        ?.transition()
        .duration(dur)
        .attr("y1", yZero)
        .attr("y2", yZero);

      const rateLineGen = d3
        .line()
        .x((d) => scales.xRate(d.date))
        .y((d) => scales.yRate(d.smoothedWeeklyRate))
        .defined(
          (d) =>
            d.smoothedWeeklyRate != null &&
            !isNaN(scales.xRate(d.date)) &&
            !isNaN(scales.yRate(d.smoothedWeeklyRate)),
        );
      ui.rateLine
        ?.datum(visibleData)
        .transition()
        .duration(dur)
        .attr("d", rateLineGen);
      // NOTE: Tooltip for Rate/TDEE is handled by main chart hover
    },
  };

  const TDEEDiffChartUpdater = {
    updateAxes() {
      if (
        !UISetup._dimensions?.tdeeDiff?.valid ||
        !axes.xTdeeDiffAxis ||
        !axes.yTdeeDiffAxis
      )
        return;
      const dur = CONFIG.transitionDurationMs;
      ui.tdeeDiffYAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.yTdeeDiffAxis);
      ui.tdeeDiffYAxisGroup?.select(".domain").remove();
      ui.tdeeDiffXAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.xTdeeDiffAxis);
    },
    updateChart(visibleData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.tdeeDiffChartArea || !scales.xTdeeDiff || !scales.yTdeeDiff)
        return;
      const yZero = scales.yTdeeDiff(0);
      if (isNaN(yZero)) {
        console.error("TDEEDiffChartUpdater: Invalid Y=0 position.");
        return;
      }
      ui.tdeeDiffZeroLine
        ?.transition()
        .duration(dur)
        .attr("y1", yZero)
        .attr("y2", yZero);
      const tdeeDiffLineGen = d3
        .line()
        .x((d) => scales.xTdeeDiff(d.date))
        .y((d) => scales.yTdeeDiff(d.avgTdeeDifference))
        .defined(
          (d) =>
            d.avgTdeeDifference != null &&
            !isNaN(scales.xTdeeDiff(d.date)) &&
            !isNaN(scales.yTdeeDiff(d.avgTdeeDifference)),
        );
      ui.tdeeDiffLine
        ?.datum(visibleData)
        .transition()
        .duration(dur)
        .attr("d", tdeeDiffLineGen);
      // NOTE: Tooltip for Rate/TDEE is handled by main chart hover
    },
  };

  const ScatterPlotUpdater = {
    updateAxes() {
      if (
        !UISetup._dimensions?.scatter?.valid ||
        !axes.xScatterAxis ||
        !axes.yScatterAxis
      )
        return;
      const dur = CONFIG.transitionDurationMs;
      ui.correlationScatterXAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.xScatterAxis);
      ui.correlationScatterYAxisGroup
        ?.transition()
        .duration(dur)
        .call(axes.yScatterAxis);
    },
    updateChart(scatterData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.scatterDotsGroup || !scales.xScatter || !scales.yScatter) return;
      const validScatterData = (
        Array.isArray(scatterData) ? scatterData : []
      ).filter(
        (d) =>
          d.avgNetCal != null &&
          !isNaN(d.avgNetCal) &&
          d.weeklyRate != null &&
          !isNaN(d.weeklyRate) &&
          !isNaN(scales.xScatter(d.avgNetCal)) &&
          !isNaN(scales.yScatter(d.weeklyRate)),
      );
      const dots = ui.scatterDotsGroup
        .selectAll(".scatter-dot")
        .data(validScatterData, (d) => d.weekKey);
      dots.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "scatter-dot")
            .attr("cx", (d) => scales.xScatter(d.avgNetCal))
            .attr("cy", (d) => scales.yScatter(d.weeklyRate))
            .attr("r", 4)
            .style("fill", colors.scatterDotColor)
            .style("opacity", 0)
            .on("mouseover", EventHandlers.scatterMouseOver) // ADDED
            .on("mouseout", EventHandlers.scatterMouseOut) // ADDED
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.7),
            ),
        (update) =>
          update
            .on("mouseover", EventHandlers.scatterMouseOver) // Re-attach for updates
            .on("mouseout", EventHandlers.scatterMouseOut) // Re-attach for updates
            .transition()
            .duration(dur)
            .attr("cx", (d) => scales.xScatter(d.avgNetCal))
            .attr("cy", (d) => scales.yScatter(d.weeklyRate))
            .style("opacity", 0.7),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .remove(),
      );
    },
  };

  const WeeklySummaryUpdater = {
    updateTable(weeklyData) {
      const container = ui.weeklySummaryContainer;
      if (!container || container.empty()) return;
      const loadingMsg = container.select(".loading-msg");
      const emptyMsg = container.select(".empty-msg");
      let tableWrapper = container.select(".table-wrapper");
      loadingMsg.remove();
      if (Array.isArray(weeklyData) && weeklyData.length > 0) {
        emptyMsg?.style("display", "none");
        if (tableWrapper.empty()) {
          tableWrapper = container.append("div").attr("class", "table-wrapper");
          const table = tableWrapper
            .append("table")
            .attr("class", "summary-table");
          const thead = table.append("thead");
          table.append("tbody");
          thead
            .append("tr")
            .selectAll("th")
            .data([
              { key: "weekStartDate", label: "Week Start", numeric: false },
              { key: "avgWeight", label: "Avg Wgt (kg)", numeric: true },
              { key: "weeklyRate", label: "Rate (kg/wk)", numeric: true },
              { key: "avgIntake", label: "Avg Intake", numeric: true },
              { key: "avgExpenditure", label: "Avg GFit", numeric: true },
              { key: "avgNetCal", label: "Avg Net", numeric: true },
            ])
            .join("th")
            .attr("class", (d) => (d.numeric ? "numeric" : null))
            .text((d) => d.label);
        }
        const tbody = tableWrapper.select("tbody");
        const fv = Utils.formatValue;
        const fd = Utils.formatDateShort;
        const columns = [
          { key: "weekStartDate", format: fd },
          { key: "avgWeight", format: (d) => fv(d, 1) },
          { key: "weeklyRate", format: (d) => fv(d, 2) },
          { key: "avgIntake", format: (d) => fv(d, 0) },
          { key: "avgExpenditure", format: (d) => fv(d, 0) },
          { key: "avgNetCal", format: (d) => fv(d, 0) },
        ];
        const rows = tbody.selectAll("tr").data(weeklyData, (d) => d.weekKey);
        rows.join(
          (enter) => {
            const tr = enter.append("tr");
            columns.forEach((col) => {
              tr.append("td")
                .attr("class", col.format === fd ? null : "numeric")
                .text((d) => col.format(d[col.key]));
            });
            return tr;
          },
          (update) => {
            update
              .selectAll("td")
              .data((d) =>
                columns.map((col) => ({
                  value: d[col.key],
                  format: col.format,
                  numeric: col.format !== fd,
                })),
              )
              .attr("class", (d) => (d.numeric ? "numeric" : null))
              .text((d) => d.format(d.value));
            return update;
          },
          (exit) => exit.remove(),
        );
      } else {
        tableWrapper.remove();
        if (emptyMsg.empty()) {
          container
            .append("p")
            .attr("class", "empty-msg")
            .text("No weekly data available for the selected analysis range.");
        } else {
          emptyMsg.style("display", null);
        }
      }
    },
  };

  const MasterUpdater = {
    updateAllCharts() {
      if (!state.isInitialized || !scales.x) {
        console.warn(
          "MasterUpdater: Skipping update - chart not initialized or scales missing.",
        );
        return;
      }
      DomainManager.updateDomainsOnInteraction();
      const visibleProcessedData = state.filteredData;
      const visibleValidSmaData = visibleProcessedData.filter(
        (d) => d.sma != null,
      );
      const visibleRawWeightData = visibleProcessedData.filter(
        (d) => d.value != null,
      );
      const regressionRange = EventHandlers.getEffectiveRegressionRange();
      let regressionResult = null;
      if (regressionRange.start && regressionRange.end) {
        const regressionData = state.processedData.filter(
          (d) =>
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
        };
      }
      FocusChartUpdater.updateAxes();
      ContextChartUpdater.updateAxes();
      BalanceChartUpdater.updateAxes();
      RateChartUpdater.updateAxes();
      TDEEDiffChartUpdater.updateAxes();
      ScatterPlotUpdater.updateAxes();
      FocusChartUpdater.updatePaths(visibleValidSmaData, regressionResult);
      FocusChartUpdater.updateDots(visibleRawWeightData);
      FocusChartUpdater.updateHighlightMarker(visibleRawWeightData);
      FocusChartUpdater.updateCrosshair(state.activeHoverData);
      FocusChartUpdater.updateAnnotations(visibleProcessedData);
      FocusChartUpdater.updatePlateauRegions();
      FocusChartUpdater.updateTrendChangeMarkers(visibleProcessedData);
      FocusChartUpdater.updateRegressionBrushDisplay();
      ContextChartUpdater.updateChart(state.processedData);
      BalanceChartUpdater.updateChart(visibleProcessedData);
      RateChartUpdater.updateChart(visibleProcessedData);
      TDEEDiffChartUpdater.updateChart(visibleProcessedData);
      ScatterPlotUpdater.updateChart(state.correlationScatterData);
      if (!state.analysisRange.isCustom) {
        EventHandlers.updateAnalysisRangeInputsFromCurrentView();
      }
      EventHandlers.updateAnalysisRangeDisplay();
    },
  };

  // ========================================================================
  // Statistics Manager (`StatsManager`)
  // ========================================================================
  const StatsManager = {
    _calculateAverageInRange(data, field, startDate, endDate) {
      if (!data || !startDate || !endDate || startDate > endDate) return null;
      const rangeData = data.filter(
        (d) => d.date >= startDate && d.date <= endDate,
      );
      const relevantValues = rangeData
        .map((d) => d[field])
        .filter((val) => val != null && !isNaN(val));
      return relevantValues.length > 0 ? d3.mean(relevantValues) : null;
    },
    _calculateCountInRange(data, field, startDate, endDate) {
      const defaultResult = { count: 0, totalDays: 0, percentage: 0 };
      if (!data || !startDate || !endDate || startDate > endDate)
        return defaultResult;
      const totalDays =
        Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
      if (totalDays <= 0) return defaultResult;
      const rangeData = data.filter(
        (d) => d.date >= startDate && d.date <= endDate,
      );
      const count = rangeData.filter(
        (d) => d[field] != null && !isNaN(d[field]),
      ).length;
      const percentage = (count / totalDays) * 100;
      return { count, totalDays, percentage };
    },
    _calculateCurrentRate(allProcessedData, analysisEndDate) {
      if (
        !allProcessedData ||
        allProcessedData.length === 0 ||
        !analysisEndDate
      )
        return null;
      let lastRate = null;
      for (let i = allProcessedData.length - 1; i >= 0; i--) {
        const d = allProcessedData[i];
        if (
          d.date instanceof Date &&
          d.date <= analysisEndDate &&
          d.smoothedWeeklyRate != null &&
          !isNaN(d.smoothedWeeklyRate)
        ) {
          lastRate = d.smoothedWeeklyRate;
          break;
        }
      }
      return lastRate;
    },
    _calculateVolatility(processedData, startDate, endDate) {
      if (!processedData || !startDate || !endDate || startDate > endDate)
        return null;
      const viewData = processedData.filter(
        (d) => d.date >= startDate && d.date <= endDate,
      );
      const deviations = viewData
        .filter((d) => d.sma != null && d.value != null && !d.isOutlier)
        .map((d) => d.value - d.sma);
      return deviations.length >= 2 &&
        typeof ss?.standardDeviation === "function"
        ? ss.standardDeviation(deviations)
        : null;
    },
    _calculateTDEEFromTrend(avgIntake, weeklyKgChange) {
      if (
        avgIntake == null ||
        weeklyKgChange == null ||
        isNaN(avgIntake) ||
        isNaN(weeklyKgChange)
      )
        return null;
      const dailyKgChange = weeklyKgChange / 7;
      const dailyDeficitSurplus = dailyKgChange * CONFIG.KCALS_PER_KG;
      return avgIntake - dailyDeficitSurplus;
    },
    _estimateDeficitSurplusFromTrend(weeklyKgChange) {
      if (weeklyKgChange == null || isNaN(weeklyKgChange)) return null;
      return (weeklyKgChange / 7) * CONFIG.KCALS_PER_KG;
    },
    calculateWeeklyStats(processedData, startDate, endDate) {
      const rangeData =
        startDate && endDate
          ? processedData.filter(
              (d) =>
                d.date instanceof Date &&
                d.date >= startDate &&
                d.date <= endDate,
            )
          : processedData;
      if (!Array.isArray(rangeData) || rangeData.length === 0) return [];
      let weeklyStats = [];
      const getWeekKey = (date) => d3.timeFormat("%Y-%W")(d3.timeMonday(date));
      const groupedByWeek = d3.group(rangeData, (d) => getWeekKey(d.date));
      groupedByWeek.forEach((weekData, weekKey) => {
        weekData.sort((a, b) => a.date - b.date);
        const validPoints = weekData.filter(
          (d) =>
            d.netBalance != null &&
            !isNaN(d.netBalance) &&
            d.smoothedWeeklyRate != null &&
            !isNaN(d.smoothedWeeklyRate),
        );
        if (validPoints.length >= 3) {
          const avgNetCal = d3.mean(validPoints, (d) => d.netBalance);
          const avgWeeklyRate = d3.mean(
            validPoints,
            (d) => d.smoothedWeeklyRate,
          );
          const avgWeight = d3.mean(weekData, (d) => d.sma ?? d.value);
          const avgExpenditure = d3.mean(weekData, (d) => d.googleFitTDEE);
          const avgIntake = d3.mean(weekData, (d) => d.calorieIntake);
          const weekStartDate = d3.timeMonday(weekData[0].date);
          weeklyStats.push({
            weekKey,
            weekStartDate,
            avgNetCal,
            weeklyRate: avgWeeklyRate,
            avgWeight: avgWeight ?? null,
            avgExpenditure: avgExpenditure ?? null,
            avgIntake: avgIntake ?? null,
          });
        }
      });
      weeklyStats.sort((a, b) => a.weekStartDate - b.weekStartDate);
      return weeklyStats;
    },
    _calculateNetCalRateCorrelation(weeklyStats) {
      if (!window.ss || typeof ss.sampleCorrelation !== "function") return null;
      if (!weeklyStats || weeklyStats.length < CONFIG.MIN_WEEKS_FOR_CORRELATION)
        return null;
      const netCalArray = weeklyStats.map((w) => w.avgNetCal);
      const rateArray = weeklyStats.map((w) => w.weeklyRate);
      try {
        const correlation = ss.sampleCorrelation(netCalArray, rateArray);
        return isNaN(correlation) ? null : correlation;
      } catch (e) {
        console.error("StatsManager: Error calculating correlation:", e);
        return null;
      }
    },
    _calculateEstimatedTimeToGoal(currentWeight, goalWeight, weeklyChange) {
      if (
        currentWeight == null ||
        goalWeight == null ||
        weeklyChange == null ||
        isNaN(weeklyChange) ||
        isNaN(currentWeight) ||
        isNaN(goalWeight)
      )
        return "N/A";
      const weightDifference = goalWeight - currentWeight;
      if (Math.abs(weightDifference) < 0.05) return "Goal Achieved!";
      if (Math.abs(weeklyChange) < 0.01) return "Trend flat";
      if (
        (weeklyChange > 0 && weightDifference < 0) ||
        (weeklyChange < 0 && weightDifference > 0)
      )
        return "Trending away";
      const weeksNeeded = weightDifference / weeklyChange;
      if (weeksNeeded <= 0) return "N/A";
      if (weeksNeeded < 1) return `~${(weeksNeeded * 7).toFixed(0)} days`;
      if (weeksNeeded < 8)
        return `~${Math.round(weeksNeeded)} week${weeksNeeded >= 1.5 ? "s" : ""}`;
      const monthsNeeded = weeksNeeded / (365.25 / 12 / 7);
      if (monthsNeeded < 18)
        return `~${Math.round(monthsNeeded)} month${monthsNeeded >= 1.5 ? "s" : ""}`;
      return `~${(monthsNeeded / 12).toFixed(1)} years`;
    },
    _calculateRequiredRateForGoal(currentWeight, goalWeight, goalDate) {
      if (
        currentWeight == null ||
        goalWeight == null ||
        !(goalDate instanceof Date) ||
        isNaN(goalDate) ||
        isNaN(currentWeight) ||
        isNaN(goalWeight)
      )
        return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(goalDate);
      targetDate.setHours(0, 0, 0, 0);
      if (targetDate <= today) return null;
      const weightDifference = goalWeight - currentWeight;
      const daysRemaining = (targetDate.getTime() - today.getTime()) / 86400000;
      if (daysRemaining <= 0) return null;
      return weightDifference / (daysRemaining / 7);
    },
    _detectPlateaus(processedData) {
      if (!processedData || processedData.length === 0) return [];
      const minDurationDays = CONFIG.plateauMinDurationWeeks * 7;
      const rateThreshold = CONFIG.plateauRateThresholdKgWeek;
      let plateaus = [];
      let currentPlateauStart = null;
      for (let i = 0; i < processedData.length; i++) {
        const d = processedData[i];
        const rate = d.smoothedWeeklyRate;
        const isFlat = rate != null && Math.abs(rate) < rateThreshold;
        if (isFlat && currentPlateauStart === null) {
          currentPlateauStart = d.date;
        } else if (!isFlat && currentPlateauStart !== null) {
          const endDate = processedData[i - 1].date;
          if (
            !(endDate instanceof Date) ||
            !(currentPlateauStart instanceof Date) ||
            isNaN(endDate) ||
            isNaN(currentPlateauStart)
          ) {
            currentPlateauStart = null;
            continue;
          }
          const durationDays =
            (endDate.getTime() - currentPlateauStart.getTime()) / 86400000;
          if (durationDays >= minDurationDays - 1) {
            plateaus.push({ startDate: currentPlateauStart, endDate: endDate });
          }
          currentPlateauStart = null;
        }
      }
      if (currentPlateauStart !== null) {
        const endDate = processedData[processedData.length - 1].date;
        if (
          !(
            !(endDate instanceof Date) ||
            !(currentPlateauStart instanceof Date) ||
            isNaN(endDate) ||
            isNaN(currentPlateauStart)
          )
        ) {
          const durationDays =
            (endDate.getTime() - currentPlateauStart.getTime()) / 86400000;
          if (durationDays >= minDurationDays - 1) {
            plateaus.push({ startDate: currentPlateauStart, endDate: endDate });
          }
        }
      }
      return plateaus;
    },
    _detectTrendChanges(processedData) {
      if (
        !processedData ||
        processedData.length < CONFIG.trendChangeWindowDays * 2
      )
        return [];
      const windowSize = CONFIG.trendChangeWindowDays;
      const minSlopeDiff = CONFIG.trendChangeMinSlopeDiffKgWeek / 7;
      let changes = [];
      const calculateSlope = (dataSegment) => {
        const validPoints = dataSegment.filter((p) => p.sma != null);
        if (validPoints.length < 2) return null;
        const first = validPoints[0];
        const last = validPoints[validPoints.length - 1];
        if (
          !(first.date instanceof Date) ||
          !(last.date instanceof Date) ||
          isNaN(first.date) ||
          isNaN(last.date)
        )
          return null;
        const timeDiffDays =
          (last.date.getTime() - first.date.getTime()) / 86400000;
        if (timeDiffDays <= 0) return null;
        return (last.sma - first.sma) / timeDiffDays;
      };
      for (let i = windowSize; i < processedData.length - windowSize; i++) {
        const currentDate = processedData[i].date;
        if (!(currentDate instanceof Date) || isNaN(currentDate)) continue;
        const beforeData = processedData.slice(i - windowSize, i);
        const afterData = processedData.slice(i + 1, i + 1 + windowSize);
        const slopeBefore = calculateSlope(beforeData);
        const slopeAfter = calculateSlope(afterData);
        if (slopeBefore != null && slopeAfter != null) {
          const slopeDiff = slopeAfter - slopeBefore;
          if (Math.abs(slopeDiff) >= minSlopeDiff) {
            changes.push({ date: currentDate, magnitude: slopeDiff });
          }
        }
      }
      return changes;
    },

    calculateAllStats() {
      const stats = {};
      const analysisRange = EventHandlers.getAnalysisDateRange();
      const { start: analysisStart, end: analysisEnd } = analysisRange;

      const validWeightDataAll = state.rawData.filter(
        (d) => d.value != null && !isNaN(d.value),
      );
      if (validWeightDataAll.length > 0) {
        stats.startingWeight = validWeightDataAll[0].value;
        stats.currentWeight =
          validWeightDataAll[validWeightDataAll.length - 1].value;
        const maxEntryObject = d3.greatest(validWeightDataAll, (d) => d.value);
        stats.maxWeight = maxEntryObject ? maxEntryObject.value : null;
        stats.maxWeightDate = maxEntryObject ? maxEntryObject.date : null;
        const minEntryObject = d3.least(validWeightDataAll, (d) => d.value);
        stats.minWeight = minEntryObject ? minEntryObject.value : null;
        stats.minWeightDate = minEntryObject ? minEntryObject.date : null;
        if (stats.startingWeight != null && stats.currentWeight != null) {
          stats.totalChange = stats.currentWeight - stats.startingWeight;
        } else {
          stats.totalChange = null;
        }
      } else {
        Object.assign(stats, {
          startingWeight: null,
          currentWeight: null,
          maxWeight: null,
          maxWeightDate: null,
          minWeight: null,
          minWeightDate: null,
          totalChange: null,
        });
      }
      const lastSma = [...state.processedData]
        .reverse()
        .find((d) => d.sma != null);
      stats.currentSma = lastSma ? lastSma.sma : stats.currentWeight;

      // --- NEW: LBM/FM Stats ---
      const validLbmSmaData = state.processedData.filter(
        (d) => d.lbmSma != null && !isNaN(d.lbmSma),
      );
      if (validLbmSmaData.length > 0) {
        stats.startingLbm = validLbmSmaData[0].lbmSma;
        stats.currentLbmSma =
          validLbmSmaData[validLbmSmaData.length - 1].lbmSma;
        if (stats.startingLbm != null && stats.currentLbmSma != null) {
          stats.totalLbmChange = stats.currentLbmSma - stats.startingLbm;
        } else {
          stats.totalLbmChange = null;
        }
      } else {
        // Fallback to raw LBM if no SMA data
        const validLbmRawData = state.processedData.filter(
          (d) => d.lbm != null && !isNaN(d.lbm),
        );
        if (validLbmRawData.length > 0) {
          stats.startingLbm = validLbmRawData[0].lbm;
          // Find last non-null raw LBM for current
          stats.currentLbmSma = validLbmRawData[validLbmRawData.length - 1].lbm; // Label uses SMA, but value is raw here
          if (stats.startingLbm != null && stats.currentLbmSma != null) {
            stats.totalLbmChange = stats.currentLbmSma - stats.startingLbm;
          } else {
            stats.totalLbmChange = null;
          }
        } else {
          stats.startingLbm = null;
          stats.currentLbmSma = null;
          stats.totalLbmChange = null;
        }
      }

      const validFmSmaData = state.processedData.filter(
        (d) => d.fmSma != null && !isNaN(d.fmSma),
      );
      if (validFmSmaData.length > 0) {
        const startingFmSma = validFmSmaData[0].fmSma; // Temp var for change calc
        stats.currentFmSma = validFmSmaData[validFmSmaData.length - 1].fmSma;
        if (startingFmSma != null && stats.currentFmSma != null) {
          stats.totalFmChange = stats.currentFmSma - startingFmSma;
        } else {
          stats.totalFmChange = null;
        }
      } else {
        // Fallback to raw FM if no SMA data
        const validFmRawData = state.processedData.filter(
          (d) => d.fm != null && !isNaN(d.fm),
        );
        if (validFmRawData.length > 0) {
          const startingFmRaw = validFmRawData[0].fm;
          stats.currentFmSma = validFmRawData[validFmRawData.length - 1].fm; // Label uses SMA, value is raw here
          if (startingFmRaw != null && stats.currentFmSma != null) {
            stats.totalFmChange = stats.currentFmSma - startingFmRaw;
          } else {
            stats.totalFmChange = null;
          }
        } else {
          stats.currentFmSma = null;
          stats.totalFmChange = null;
        }
      }
      // --- End NEW ---

      if (
        analysisStart instanceof Date &&
        analysisEnd instanceof Date &&
        analysisStart <= analysisEnd
      ) {
        state.plateaus = StatsManager._detectPlateaus(state.processedData);
        state.trendChangePoints = StatsManager._detectTrendChanges(
          state.processedData,
        );
        state.weeklySummaryData = StatsManager.calculateWeeklyStats(
          state.processedData,
          analysisStart,
          analysisEnd,
        );
        state.correlationScatterData = state.weeklySummaryData.filter(
          (w) => w.avgNetCal != null && w.weeklyRate != null,
        );
        stats.netCalRateCorrelation =
          StatsManager._calculateNetCalRateCorrelation(state.weeklySummaryData);
        stats.currentWeeklyRate = StatsManager._calculateCurrentRate(
          state.processedData,
          analysisEnd,
        );
        stats.volatility = StatsManager._calculateVolatility(
          state.processedData,
          analysisStart,
          analysisEnd,
        );
        stats.avgIntake = StatsManager._calculateAverageInRange(
          state.processedData,
          "calorieIntake",
          analysisStart,
          analysisEnd,
        );
        stats.avgExpenditureGFit = StatsManager._calculateAverageInRange(
          state.processedData,
          "googleFitTDEE",
          analysisStart,
          analysisEnd,
        );
        stats.avgNetBalance = StatsManager._calculateAverageInRange(
          state.processedData,
          "netBalance",
          analysisStart,
          analysisEnd,
        );
        stats.avgTDEE_Difference = StatsManager._calculateAverageInRange(
          state.processedData,
          "avgTdeeDifference",
          analysisStart,
          analysisEnd,
        );
        stats.avgTDEE_Adaptive = StatsManager._calculateAverageInRange(
          state.processedData,
          "adaptiveTDEE",
          analysisStart,
          analysisEnd,
        );
        stats.weightDataConsistency = StatsManager._calculateCountInRange(
          state.processedData,
          "value",
          analysisStart,
          analysisEnd,
        );
        stats.calorieDataConsistency = StatsManager._calculateCountInRange(
          state.processedData,
          "calorieIntake",
          analysisStart,
          analysisEnd,
        );
        const regressionRange = EventHandlers.getEffectiveRegressionRange();
        if (
          regressionRange.start instanceof Date &&
          regressionRange.end instanceof Date
        ) {
          const regressionData = state.processedData.filter(
            (d) =>
              d.date instanceof Date &&
              d.date >= regressionRange.start &&
              d.date <= regressionRange.end &&
              d.value != null &&
              !d.isOutlier,
          );
          const analysisRegression = DataService.calculateLinearRegression(
            regressionData,
            regressionRange.start,
          );
          stats.regressionSlopeWeekly =
            analysisRegression.slope != null
              ? analysisRegression.slope * 7
              : null;
          stats.regressionStartDate = regressionRange.start;
          stats.regressionPointsWithCI = analysisRegression.pointsWithCI;
        } else {
          stats.regressionSlopeWeekly = null;
          stats.regressionStartDate = null;
          stats.regressionPointsWithCI = [];
        }
        const trendForTDEECalc =
          stats.regressionSlopeWeekly != null &&
          !isNaN(stats.regressionSlopeWeekly)
            ? stats.regressionSlopeWeekly
            : stats.currentWeeklyRate;
        stats.avgTDEE_WgtChange = StatsManager._calculateTDEEFromTrend(
          stats.avgIntake,
          trendForTDEECalc,
        );
        stats.estimatedDeficitSurplus =
          StatsManager._estimateDeficitSurplusFromTrend(trendForTDEECalc);
      } else {
        Object.assign(stats, {
          netCalRateCorrelation: null,
          currentWeeklyRate: null,
          volatility: null,
          avgIntake: null,
          avgExpenditureGFit: null,
          avgNetBalance: null,
          avgTDEE_Difference: null,
          avgTDEE_Adaptive: null,
          weightDataConsistency: { count: 0, totalDays: 0, percentage: 0 },
          calorieDataConsistency: { count: 0, totalDays: 0, percentage: 0 },
          regressionSlopeWeekly: null,
          regressionStartDate: null,
          regressionPointsWithCI: [],
          avgTDEE_WgtChange: null,
          estimatedDeficitSurplus: null,
        });
        state.weeklySummaryData = [];
        state.correlationScatterData = [];
      }

      stats.targetWeight = state.goal.weight;
      stats.targetRate = state.goal.targetRate;
      stats.targetDate = state.goal.date;
      const referenceWeightForGoal = stats.currentSma ?? stats.currentWeight;
      if (referenceWeightForGoal != null && stats.targetWeight != null) {
        stats.weightToGoal = stats.targetWeight - referenceWeightForGoal;
        const currentTrendForGoal =
          stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
        stats.estimatedTimeToGoal = StatsManager._calculateEstimatedTimeToGoal(
          referenceWeightForGoal,
          stats.targetWeight,
          currentTrendForGoal,
        );
        stats.requiredRateForGoal = stats.targetDate
          ? StatsManager._calculateRequiredRateForGoal(
              referenceWeightForGoal,
              stats.targetWeight,
              stats.targetDate,
            )
          : null;
        if (stats.requiredRateForGoal != null) {
          const baselineTDEE =
            stats.avgTDEE_Adaptive ??
            stats.avgTDEE_WgtChange ??
            stats.avgExpenditureGFit;
          if (baselineTDEE != null && !isNaN(baselineTDEE)) {
            const requiredDailyDeficitSurplus =
              (stats.requiredRateForGoal / 7) * CONFIG.KCALS_PER_KG;
            stats.requiredNetCalories = requiredDailyDeficitSurplus;
            const targetIntake = baselineTDEE + requiredDailyDeficitSurplus;
            stats.suggestedIntakeRange = {
              min: Math.round(targetIntake - 100),
              max: Math.round(targetIntake + 100),
            };
          } else {
            stats.requiredNetCalories = null;
            stats.suggestedIntakeRange = null;
          }
        } else {
          stats.requiredNetCalories = null;
          stats.suggestedIntakeRange = null;
        }
        if (
          stats.targetRate != null &&
          currentTrendForGoal != null &&
          !isNaN(currentTrendForGoal)
        ) {
          const diff = currentTrendForGoal - stats.targetRate;
          const absDiff = Math.abs(diff);
          let feedbackClass = "";
          let feedbackText = "N/A";
          if (absDiff < 0.03) {
            feedbackClass = "good";
            feedbackText = "On Target";
          } else if (diff > 0) {
            feedbackClass = "warn";
            feedbackText = `Faster (+${Utils.formatValue(diff, 2)})`;
          } else {
            feedbackClass = "warn";
            feedbackText = `Slower (${Utils.formatValue(diff, 2)})`;
          }
          stats.targetRateFeedback = {
            text: feedbackText,
            class: feedbackClass,
          };
        } else {
          stats.targetRateFeedback = { text: "N/A", class: "" };
        }
      } else {
        Object.assign(stats, {
          weightToGoal: null,
          estimatedTimeToGoal: "N/A",
          requiredRateForGoal: null,
          requiredNetCalories: null,
          suggestedIntakeRange: null,
          targetRateFeedback: { text: "N/A", class: "" },
        });
      }
      return stats;
    },

    updateStatsDisplay(stats) {
      const fv = Utils.formatValue;
      const fd = Utils.formatDate;
      const fdShort = Utils.formatDateShort;
      const na = (v) => v ?? "N/A";
      const updateElement = (key, value, formatter = na, args) => {
        const element = ui.statElements[key];
        if (element) {
          element.textContent = formatter(value, args);
          if (key === "maxWeightDate" || key === "minWeightDate") {
            if (value instanceof Date && !isNaN(value)) {
              element.classList.add("highlightable");
              element.style.cursor = "pointer";
              element.style.textDecoration = "underline dotted";
              element.removeEventListener(
                "click",
                EventHandlers.statDateClickWrapper,
              );
              element.__highlightDate = value;
              element.addEventListener(
                "click",
                EventHandlers.statDateClickWrapper,
              );
            } else {
              element.classList.remove("highlightable");
              element.style.cursor = "";
              element.style.textDecoration = "";
              element.removeEventListener(
                "click",
                EventHandlers.statDateClickWrapper,
              );
              element.__highlightDate = null;
            }
          }
          if (key === "currentRateFeedback" && stats.targetRateFeedback) {
            element.className = `stat-value feedback ${stats.targetRateFeedback.class || ""}`;
            element.textContent = stats.targetRateFeedback.text;
          }
        }
      };
      updateElement("startingWeight", stats.startingWeight, fv, 1);
      updateElement("currentWeight", stats.currentWeight, fv, 1);
      updateElement("currentSma", stats.currentSma, fv, 1);
      updateElement("totalChange", stats.totalChange, fv, 1);
      updateElement("maxWeight", stats.maxWeight, fv, 1);
      updateElement("maxWeightDate", stats.maxWeightDate, fd);
      updateElement("minWeight", stats.minWeight, fv, 1);
      updateElement("minWeightDate", stats.minWeightDate, fd);

      // --- NEW: Update LBM/FM elements ---
      updateElement("startingLbm", stats.startingLbm, fv, 1);
      updateElement("currentLbmSma", stats.currentLbmSma, fv, 1);
      updateElement("totalLbmChange", stats.totalLbmChange, fv, 1);
      updateElement("currentFmSma", stats.currentFmSma, fv, 1);
      updateElement("totalFmChange", stats.totalFmChange, fv, 1);
      // --- End NEW ---

      updateElement("volatilityScore", stats.volatility, fv, 2);
      updateElement("rollingWeeklyChangeSma", stats.currentWeeklyRate, fv, 2);
      updateElement("regressionSlope", stats.regressionSlopeWeekly, fv, 2);
      if (ui.regressionStartDateLabel)
        ui.regressionStartDateLabel.text(
          stats.regressionStartDate
            ? `(${fdShort(stats.regressionStartDate)})`
            : "(Range Start)",
        );
      updateElement(
        "netcalRateCorrelation",
        stats.netCalRateCorrelation,
        fv,
        2,
      );
      updateElement(
        "weightConsistency",
        stats.weightDataConsistency?.percentage,
        fv,
        0,
      );
      updateElement(
        "weightConsistencyDetails",
        stats.weightDataConsistency,
        (d) => (d ? `(${d.count}/${d.totalDays} days)` : "(N/A)"),
      );
      updateElement(
        "calorieConsistency",
        stats.calorieDataConsistency?.percentage,
        fv,
        0,
      );
      updateElement(
        "calorieConsistencyDetails",
        stats.calorieDataConsistency,
        (d) => (d ? `(${d.count}/${d.totalDays} days)` : "(N/A)"),
      );
      updateElement("avgIntake", stats.avgIntake, fv, 0);
      updateElement("avgExpenditure", stats.avgExpenditureGFit, fv, 0);
      updateElement("avgNetBalance", stats.avgNetBalance, fv, 0);
      updateElement(
        "estimatedDeficitSurplus",
        stats.estimatedDeficitSurplus,
        fv,
        0,
      );
      updateElement("avgTdeeGfit", stats.avgExpenditureGFit, fv, 0);
      updateElement("avgTdeeWgtChange", stats.avgTDEE_WgtChange, fv, 0);
      updateElement("avgTdeeDifference", stats.avgTDEE_Difference, fv, 0);
      updateElement("avgTdeeAdaptive", stats.avgTDEE_Adaptive, fv, 0);
      updateElement("targetWeightStat", stats.targetWeight, fv, 1);
      updateElement("targetRateStat", stats.targetRate, fv, 2);
      updateElement("weightToGoal", stats.weightToGoal, fv, 1);
      updateElement("estimatedTimeToGoal", stats.estimatedTimeToGoal);
      updateElement("requiredRateForGoal", stats.requiredRateForGoal, fv, 2);
      updateElement("requiredNetCalories", stats.requiredNetCalories, fv, 0);
      updateElement("suggestedIntakeRange", stats.suggestedIntakeRange, (r) =>
        r ? `${r.min} - ${r.max}` : "N/A",
      );
      updateElement("currentRateFeedback");
      InsightsGenerator.updateSummary(stats);
      WeeklySummaryUpdater.updateTable(state.weeklySummaryData);
      ScatterPlotUpdater.updateChart(state.correlationScatterData);
      EventHandlers.updatePinnedTooltipDisplay();
    },

    update() {
      try {
        const statsData = StatsManager.calculateAllStats();
        StatsManager.updateStatsDisplay(statsData);
      } catch (error) {
        console.error("StatsManager: Error during statistics update:", error);
        Utils.showStatusMessage("Error updating statistics.", "error");
      }
    },
  }; // End of StatsManager

  // ========================================================================
  // Insights Generator (`InsightsGenerator`)
  // ========================================================================
  const InsightsGenerator = {
    _getConsistencyStatus(consistencyWgt, consistencyCal) {
      const wgtPct = consistencyWgt.percentage;
      const calPct = consistencyCal.percentage;
      if (wgtPct < 80 || calPct < 80) {
        return `<span class="warn">Low data consistency</span> (W:${wgtPct.toFixed(0)}%, C:${calPct.toFixed(0)}%). Estimates may be less reliable.`;
      } else if (wgtPct < 95 || calPct < 95) {
        return `<span class="good">Good consistency</span> (W:${wgtPct.toFixed(0)}%, C:${calPct.toFixed(0)}%).`;
      } else {
        return `<span class="good">Excellent consistency</span> (W:${wgtPct.toFixed(0)}%, C:${calPct.toFixed(0)}%).`;
      }
    },
    _getPrimaryTDEEStatus(tdeeGFit, tdeeTrend, tdeeAdaptive) {
      const fv = Utils.formatValue;
      const estimates = [
        { label: "Adaptive", value: tdeeAdaptive, priority: 1 },
        { label: "Trend", value: tdeeTrend, priority: 2 },
        { label: "GFit Avg", value: tdeeGFit, priority: 3 },
      ]
        .filter((e) => e.value != null && !isNaN(e.value))
        .sort((a, b) => a.priority - b.priority);
      if (estimates.length === 0) {
        return "TDEE Estimate: N/A";
      }
      const primaryTDEE = estimates[0];
      return `Est. TDEE (${primaryTDEE.label}): <strong>${fv(primaryTDEE.value, 0)} kcal/d</strong>`;
    },
    _getTrendStatus(currentTrendWeekly, currentWeight, regressionUsed) {
      const fv = Utils.formatValue;
      if (currentTrendWeekly == null || isNaN(currentTrendWeekly)) {
        return "Trend: N/A";
      }
      const trendAbs = Math.abs(currentTrendWeekly);
      const weightForPct =
        currentWeight ??
        state.processedData.filter((d) => d.value != null).slice(-1)[0]?.value;
      const trendPercent =
        weightForPct && weightForPct > 0
          ? (currentTrendWeekly / weightForPct) * 100
          : null;
      const trendValStr = `<strong>${fv(currentTrendWeekly, 2)} kg/wk</strong>`;
      const trendPercentStr =
        trendPercent != null ? ` (${fv(trendPercent, 1)}%)` : "";
      const basis = regressionUsed ? "Regression" : "Rate";

      if (trendAbs < CONFIG.plateauRateThresholdKgWeek) {
        return `Trend (<span class="stable">Stable</span>): ${trendValStr} <small>(${basis})</small>`;
      } else if (currentTrendWeekly > 0) {
        let status = `Trend (<span class="gaining">Gaining</span>): ${trendValStr}${trendPercentStr} <small>(${basis})</small>`;
        // --- NEW: Optimal Zone Feedback ---
        if (currentTrendWeekly > CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK) {
          status += ` <span class="warn">(Faster than optimal)</span>`;
        } else if (
          currentTrendWeekly < CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK
        ) {
          status += ` <span class="warn">(Slower than optimal)</span>`;
        } else {
          status += ` <span class="good">(Optimal rate)</span>`;
        }
        // --- End NEW ---
        return status;
      } else {
        // Losing weight
        // You could add feedback for loss rate here if desired (e.g., vs. recommended cut rate)
        return `Trend (<span class="losing">Losing</span>): ${trendValStr}${trendPercentStr} <small>(${basis})</small>`;
      }
    },
    _getGoalStatus(stats) {
      if (stats.targetWeight == null) {
        return "Goal: Not set.";
      }
      const fv = Utils.formatValue;
      let status = `Goal: ${fv(stats.targetWeight, 1)} kg. `;
      if (stats.weightToGoal != null) {
        status += `<span class="${stats.weightToGoal > 0 ? "positive" : "negative"}">${fv(Math.abs(stats.weightToGoal), 1)} kg ${stats.weightToGoal >= 0 ? "to gain" : "to lose"}.</span> `;
      }
      if (
        stats.estimatedTimeToGoal &&
        stats.estimatedTimeToGoal !== "N/A" &&
        stats.estimatedTimeToGoal !== "Goal Achieved!" &&
        stats.estimatedTimeToGoal !== "Trending away" &&
        stats.estimatedTimeToGoal !== "Trend flat"
      ) {
        status += ` Est. <span class="good">${stats.estimatedTimeToGoal}.</span>`;
      } else if (stats.estimatedTimeToGoal === "Goal Achieved!") {
        status += `<span class="good">Achieved!</span>`;
      }
      return status;
    },
    _getDetectedFeaturesInsightHTML(analysisStartDate, analysisEndDate) {
      let insight = "";
      if (
        !(analysisStartDate instanceof Date) ||
        !(analysisEndDate instanceof Date)
      )
        return "";

      const plateausInRange = state.plateaus.filter(
        (p) => p.endDate >= analysisStartDate && p.startDate <= analysisEndDate,
      );
      const changesInRange = state.trendChangePoints.filter(
        (p) => p.date >= analysisStartDate && p.date <= analysisEndDate,
      );

      if (plateausInRange.length > 0 || changesInRange.length > 0) {
        insight += `<h4 class="detected-events-heading">Detected Events</h4>`; // Added class

        if (plateausInRange.length > 0) {
          insight += `<p class="detected-plateaus"><span class="warn">Plateau(s):</span> ${plateausInRange.map((p) => `${Utils.formatDateShort(p.startDate)} - ${Utils.formatDateShort(p.endDate)}`).join(", ")}.</p>`; // Added class
        }

        if (changesInRange.length > 0) {
          const changeItemsHtml = changesInRange
            .map((p) => {
              const direction = p.magnitude > 0 ? "accel" : "decel";
              // Calculate and format the rate change per week
              const rateChangeKgWeek = Math.abs(p.magnitude * 7);
              const rateChangeString = `(Rate Δ ≈ ${Utils.formatValue(rateChangeKgWeek, 2)} kg/wk)`;
              // Use different classes for styling based on direction
              const directionClass =
                direction === "accel" ? "trend-accel" : "trend-decel";
              // Combine date, direction, and rate change
              return `<span class="trend-change-item ${directionClass}">${Utils.formatDateShort(p.date)} (${direction}) <small>${rateChangeString}</small></span>`; // Added rateChangeString in small tag
            })
            .join("");

          // Use <details> for long lists
          if (changesInRange.length > 5) {
            // Threshold to use details
            insight += `<details class="trend-change-details">`;
            insight += `<summary><span class="warn">Trend Δ(s):</span> ${changesInRange.length} detected (click to view)</summary>`;
            insight += `<div class="trend-change-list">${changeItemsHtml}</div>`; // Changed p to div for better flex styling
            insight += `</details>`;
          } else {
            // Simpler paragraph for short lists
            insight += `<div class="trend-change-list short-list"><span class="warn">Trend Δ(s):</span> ${changeItemsHtml}</div>`;
          }
        }
      }
      return insight;
    },

    updateSummary(stats) {
      if (!ui.insightSummaryContainer || ui.insightSummaryContainer.empty())
        return;

      const currentTrendWeekly =
        stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
      const regressionUsedForTrend = stats.regressionSlopeWeekly != null;
      const analysisRange = EventHandlers.getAnalysisDateRange();

      let summaryHtml = ""; // Initialize summaryHtml as an empty string

      try {
        const trendStatus = InsightsGenerator._getTrendStatus(
          currentTrendWeekly,
          stats.currentSma,
          regressionUsedForTrend,
        );
        const tdeeStatus = InsightsGenerator._getPrimaryTDEEStatus(
          stats.avgExpenditureGFit,
          stats.avgTDEE_WgtChange,
          stats.avgTDEE_Adaptive,
        );
        const goalStatus = InsightsGenerator._getGoalStatus(stats);
        const consistencyStatus = InsightsGenerator._getConsistencyStatus(
          stats.weightDataConsistency,
          stats.calorieDataConsistency,
        );
        const detectedFeaturesHtml =
          InsightsGenerator._getDetectedFeaturesInsightHTML(
            analysisRange.start,
            analysisRange.end,
          );

        summaryHtml += `<p>${trendStatus}</p>`;
        summaryHtml += `<p>${tdeeStatus}</p>`;
        summaryHtml += `<p>${goalStatus}</p>`;
        summaryHtml += `<p>${consistencyStatus}</p>`;
        summaryHtml += detectedFeaturesHtml; // Append detected features HTML
      } catch (error) {
        console.error(
          "InsightsGenerator: Error generating summary box HTML",
          error,
        );
        summaryHtml =
          "<p class='error'>Error generating summary. Check console.</p>";
      }

      ui.insightSummaryContainer.html(
        summaryHtml ||
          "<p>Analysis requires more data or a different range.</p>", // Fallback text
      );
    },
  }; // End of InsightsGenerator

  // ========================================================================
  // Event Handlers (`EventHandlers`)
  // ========================================================================
  const EventHandlers = {
    _isZooming: false,
    _isBrushing: false,

    // --- Tooltip Helper Functions ---
    _showTooltip(htmlContent, event) {
      if (!ui.tooltip) return;
      if (state.tooltipTimeoutId) clearTimeout(state.tooltipTimeoutId);

      const show = () => {
        const tooltipX = event.pageX + 15;
        const tooltipY = event.pageY - 28;
        ui.tooltip
          .html(htmlContent)
          .style("left", `${tooltipX}px`)
          .style("top", `${tooltipY}px`)
          .style("opacity", 0.95); // Use immediate opacity for faster feel
      };

      // Show immediately if tooltip is already visible, otherwise use delay
      if (parseFloat(ui.tooltip.style("opacity")) > 0) {
        show();
      } else {
        state.tooltipTimeoutId = setTimeout(show, CONFIG.tooltipShowDelayMs);
      }
    },

    _hideTooltip() {
      if (!ui.tooltip) return;
      if (state.tooltipTimeoutId) clearTimeout(state.tooltipTimeoutId);

      // Only hide if not pinned
      if (!state.pinnedTooltipData) {
        state.tooltipTimeoutId = setTimeout(() => {
          ui.tooltip.style("opacity", 0);
        }, CONFIG.tooltipHideDelayMs);
      }
    },

    // --- Main Chart Hover ---
    dotMouseOver(event, d) {
      if (!ui.tooltip || !d || !d.date) return;
      state.activeHoverData = d; // Track hover for crosshair
      d3.select(event.currentTarget)
        .raise()
        .transition()
        .duration(50)
        .attr("r", CONFIG.dotHoverRadius)
        .style("opacity", 1);

      // --- Build Tooltip Content ---
      let tt = `<strong>${Utils.formatDateLong(d.date)}</strong><br/>Weight: ${Utils.formatValue(d.value, 1)} KG`;
      if (d.sma != null)
        tt += `<br/>SMA (${CONFIG.movingAverageWindow}d): ${Utils.formatValue(d.sma, 1)} KG`;
      if (state.seriesVisibility.bf && d.bfPercent != null)
        tt += `<br/>Body Fat: ${Utils.formatValue(d.bfPercent, 1)} %`;
      if (d.value != null && d.sma != null) {
        const dev = d.value - d.sma;
        tt += `<br/>Deviation: <span class="${dev >= 0 ? "positive" : "negative"}">${dev >= 0 ? "+" : ""}${Utils.formatValue(dev, 1)} KG</span>`;
      }
      if (d.isOutlier)
        tt += `<br/><span class="note outlier-note">Potential Outlier</span>`;

      // Add secondary chart data (if available for this date)
      const hasSecondaryData = [
        d.netBalance,
        d.smoothedWeeklyRate,
        d.avgTdeeDifference,
        d.calorieIntake,
        d.googleFitTDEE,
        d.adaptiveTDEE,
      ].some((v) => v != null);

      if (hasSecondaryData) {
        tt += `<hr class="tooltip-hr">`;
        if (d.netBalance != null)
          tt += `Balance: ${Utils.formatValue(d.netBalance, 0)} kcal<br/>`;
        if (d.smoothedWeeklyRate != null)
          tt += `Smoothed Rate: ${Utils.formatValue(d.smoothedWeeklyRate, 2)} kg/wk<br/>`;
        if (d.avgTdeeDifference != null)
          tt += `Avg TDEE Diff: ${Utils.formatValue(d.avgTdeeDifference, 0)} kcal<br/>`;
        // Optionally add Intake/GFit/Adaptive here too if desired
        // if (d.calorieIntake != null) tt += `Intake: ${Utils.formatValue(d.calorieIntake, 0)} kcal<br/>`;
        // if (d.googleFitTDEE != null) tt += `GFit TDEE: ${Utils.formatValue(d.googleFitTDEE, 0)} kcal<br/>`;
        // if (d.adaptiveTDEE != null) tt += `Adaptive TDEE: ${Utils.formatValue(d.adaptiveTDEE, 0)} kcal<br/>`;
      }

      const annotation = AnnotationManager.findAnnotationByDate(d.date);
      if (annotation)
        tt += `<hr class="tooltip-hr"><span class="note annotation-note">${annotation.text}</span>`;
      const isPinned = state.pinnedTooltipData?.id === d.date.getTime();
      tt += `<hr class="tooltip-hr"><span class="note pinned-note">${isPinned ? "Click dot to unpin." : "Click dot to pin tooltip."}</span>`;

      EventHandlers._showTooltip(tt, event);
      FocusChartUpdater.updateCrosshair(d);
    },

    dotMouseOut(event, d) {
      if (!ui.tooltip || !d || !d.date) return;
      state.activeHoverData = null; // Clear active hover
      EventHandlers._hideTooltip(); // Use helper to hide tooltip

      // Reset dot appearance
      const isHighlighted =
        state.highlightedDate &&
        d.date.getTime() === state.highlightedDate.getTime();
      const targetRadius = isHighlighted
        ? CONFIG.dotRadius * 1.2
        : CONFIG.dotRadius;
      const targetOpacity = isHighlighted ? 1 : 0.7;
      d3.select(event.currentTarget)
        .transition()
        .duration(150)
        .attr("r", targetRadius)
        .style("opacity", targetOpacity);

      FocusChartUpdater.updateCrosshair(null); // Hide crosshair
    },

    dotClick(event, d) {
      if (!d || !d.date) return;
      event.stopPropagation();
      const dataId = d.date.getTime();
      if (state.pinnedTooltipData?.id === dataId) {
        state.pinnedTooltipData = null;
        EventHandlers._hideTooltip(); // Explicitly hide if unpinned
      } else {
        state.pinnedTooltipData = {
          id: dataId,
          data: d,
          pageX: event.pageX,
          pageY: event.pageY,
        };
        // Re-trigger mouseover to show tooltip content immediately
        EventHandlers.dotMouseOver(event, d);
        // Ensure tooltip stays visible after mouseover delay might have hidden it
        if (state.tooltipTimeoutId) clearTimeout(state.tooltipTimeoutId);
        ui.tooltip?.style("opacity", 0.95);
      }
      EventHandlers.updatePinnedTooltipDisplay();
    },

    // --- Balance Chart Hover ---
    balanceMouseOver(event, d) {
      if (!d || !d.date) return;
      const tt = `<strong>${Utils.formatDateLong(d.date)}</strong><br/>Balance: ${Utils.formatValue(d.netBalance, 0)} kcal`;
      EventHandlers._showTooltip(tt, event);
      d3.select(this).style("opacity", 1); // Increase opacity of the bar
    },

    balanceMouseOut(event, d) {
      EventHandlers._hideTooltip();
      d3.select(this).style("opacity", 0.8); // Restore default opacity
    },

    // --- Scatter Plot Hover ---
    scatterMouseOver(event, d) {
      if (!d || !d.weekStartDate) return;
      const tt = `<strong>Week: ${Utils.formatDateShort(d.weekStartDate)}</strong><br/>Avg Net: ${Utils.formatValue(d.avgNetCal, 0)} kcal/d<br/>Rate: ${Utils.formatValue(d.weeklyRate, 2)} kg/wk`;
      EventHandlers._showTooltip(tt, event);
      d3.select(this)
        .raise()
        .transition()
        .duration(50)
        .attr("r", 6) // Make dot slightly larger
        .style("opacity", 1)
        .style("stroke", "var(--text-primary)")
        .style("stroke-width", 1.5);
    },

    scatterMouseOut(event, d) {
      EventHandlers._hideTooltip();
      d3.select(this)
        .transition()
        .duration(150)
        .attr("r", 4) // Restore original size
        .style("opacity", 0.7)
        .style("stroke", "none");
    },

    // --- Other Hovers (Annotations, Trend Changes) ---
    annotationMouseOver(event, d) {
      if (!ui.tooltip || !d) return;
      d3.select(event.currentTarget)
        .select("circle")
        .transition()
        .duration(50)
        .attr("r", CONFIG.annotationMarkerRadius * 1.5);
      let tt = `<strong>Annotation (${Utils.formatDateShort(new Date(d.date))})</strong><br/>${d.text}`;
      EventHandlers._showTooltip(tt, event);
    },
    annotationMouseOut(event, d) {
      d3.select(event.currentTarget)
        .select("circle")
        .transition()
        .duration(150)
        .attr("r", CONFIG.annotationMarkerRadius);
      EventHandlers._hideTooltip();
    },
    trendChangeMouseOver(event, d) {
      if (!ui.tooltip || !d) return;
      d3.select(event.currentTarget)
        .select("path")
        .transition()
        .duration(50)
        .attr("transform", "scale(1.5)");
      const direction = d.magnitude > 0 ? "acceleration" : "deceleration";
      const rateChange = Math.abs(d.magnitude * 7);
      let tt = `<strong>Trend Change (${Utils.formatDateShort(d.date)})</strong><br/>Significant ${direction} detected.<br/>Rate Δ ≈ ${Utils.formatValue(rateChange, 2)} kg/wk`;
      EventHandlers._showTooltip(tt, event);
    },
    trendChangeMouseOut(event, d) {
      d3.select(event.currentTarget)
        .select("path")
        .transition()
        .duration(150)
        .attr("transform", "scale(1)");
      EventHandlers._hideTooltip();
    },

    updatePinnedTooltipDisplay() {
      if (!ui.pinnedTooltipContainer) return;
      if (state.pinnedTooltipData) {
        const d = state.pinnedTooltipData.data;
        let pinnedHtml = `<strong>Pinned: ${Utils.formatDateShort(d.date)}</strong><br/>Wgt: ${Utils.formatValue(d.value, 1)}`;
        if (d.sma != null)
          pinnedHtml += ` | SMA: ${Utils.formatValue(d.sma, 1)}`;
        ui.pinnedTooltipContainer.html(pinnedHtml).style("display", "block");
      } else {
        ui.pinnedTooltipContainer.html("").style("display", "none");
      }
    },

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
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.highlightedDate = null;
      state.interactiveRegressionRange = { start: null, end: null };
      const selection = event.selection;
      if (!scales.xContext) {
        EventHandlers._isBrushing = false;
        return;
      }
      const newXDomain = selection
        ? selection.map(scales.xContext.invert)
        : scales.xContext.domain();
      scales.x.domain(newXDomain);
      if (
        zoom &&
        ui.zoomCaptureRect &&
        !ui.zoomCaptureRect.empty() &&
        UISetup._dimensions?.focus?.valid
      ) {
        const [x0Pixel, x1Pixel] = selection || scales.xContext.range();
        const pixelDiff = x1Pixel - x0Pixel;
        if (pixelDiff <= 0) {
          EventHandlers._isBrushing = false;
          return;
        }
        const k = UISetup._dimensions.focus.width / pixelDiff;
        const tx = -x0Pixel * k;
        state.lastZoomTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
        ui.zoomCaptureRect.on("zoom.handler", null);
        ui.zoomCaptureRect.call(zoom.transform, state.lastZoomTransform);
        ui.zoomCaptureRect.on("zoom.handler", EventHandlers.zoomed);
      }
      state.analysisRange.isCustom = false;
      MasterUpdater.updateAllCharts();
      StatsManager.update();
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
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.highlightedDate = null;
      state.interactiveRegressionRange = { start: null, end: null };
      state.lastZoomTransform = event.transform;
      if (!scales.xContext || !scales.x) {
        EventHandlers._isZooming = false;
        return;
      }
      const newXDomain = state.lastZoomTransform
        .rescaleX(scales.xContext)
        .domain();
      scales.x.domain(newXDomain);
      if (ui.brushGroup?.node() && brushes.context) {
        const newBrushSelection = newXDomain.map(scales.xContext);
        ui.brushGroup.on("brush.handler", null);
        ui.brushGroup.on("end.handler", null);
        if (newBrushSelection.every((v) => !isNaN(v))) {
          ui.brushGroup.call(brushes.context.move, newBrushSelection);
        }
        ui.brushGroup.on("brush.handler", EventHandlers.contextBrushed);
        ui.brushGroup.on("end.handler", EventHandlers.contextBrushed);
      }
      state.analysisRange.isCustom = false;
      MasterUpdater.updateAllCharts();
      StatsManager.update();
      setTimeout(() => {
        EventHandlers._isZooming = false;
      }, 50);
    },

    regressionBrushed(event) {
      if (
        !event ||
        !event.sourceEvent ||
        event.sourceEvent.type === "zoom" ||
        event.sourceEvent.type === "brush"
      )
        return;
      if (event.type !== "end") return;
      const selection = event.selection;
      let rangeUpdated = false;
      if (selection && selection[0] !== selection[1]) {
        if (!scales.x) return;
        const startDate = scales.x.invert(selection[0]);
        const endDate = scales.x.invert(selection[1]);
        if (
          !(startDate instanceof Date) ||
          !(endDate instanceof Date) ||
          isNaN(startDate) ||
          isNaN(endDate)
        )
          return;
        const currentRange = state.interactiveRegressionRange;
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();
        const currentStartTime = currentRange.start?.getTime();
        const currentEndTime = currentRange.end?.getTime();
        if (
          currentStartTime === undefined ||
          Math.abs(currentStartTime - startTime) > 86400000 ||
          currentEndTime === undefined ||
          Math.abs(currentEndTime - endTime) > 86400000
        ) {
          state.interactiveRegressionRange = { start: startDate, end: endDate };
          Utils.showStatusMessage("Regression range updated.", "info", 1000);
          rangeUpdated = true;
        }
      } else {
        if (
          state.interactiveRegressionRange.start ||
          state.interactiveRegressionRange.end
        ) {
          state.interactiveRegressionRange = { start: null, end: null };
          Utils.showStatusMessage(
            "Regression range reset to default.",
            "info",
            1000,
          );
          rangeUpdated = true;
        }
      }
      if (rangeUpdated) {
        state.pinnedTooltipData = null;
        EventHandlers.updatePinnedTooltipDisplay();
        MasterUpdater.updateAllCharts();
        StatsManager.update();
      }
      FocusChartUpdater.updateRegressionBrushDisplay();
    },

    handleResize: Utils.debounce(() => {
      console.log("EventHandlers: Resize detected, re-rendering chart...");
      state.highlightedDate = null;
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.interactiveRegressionRange = { start: null, end: null };
      if (UISetup.runAll()) {
        if (state.isInitialized && state.processedData?.length > 0) {
          DomainManager.initializeDomains(state.processedData);
          EventHandlers.restoreViewAfterResize();
          MasterUpdater.updateAllCharts();
          StatsManager.update();
          LegendManager.build();
          AnnotationManager.renderList();
        } else if (state.isInitialized) {
          console.warn(
            "EventHandlers: Resize handler - No data to display after setup.",
          );
          MasterUpdater.updateAllCharts();
          StatsManager.update();
          LegendManager.build();
          AnnotationManager.renderList();
        }
      } else {
        console.error(
          "EventHandlers: Chart redraw on resize failed during setup phase.",
        );
        Utils.showStatusMessage(
          "Chart resize failed. Check console.",
          "error",
          5000,
        );
      }
    }, CONFIG.debounceResizeMs),

    restoreViewAfterResize() {
      if (
        !zoom ||
        !ui.zoomCaptureRect ||
        ui.zoomCaptureRect.empty() ||
        !state.lastZoomTransform ||
        !scales.xContext
      ) {
        console.warn(
          "EventHandlers: Cannot restore view, zoom or scales not ready.",
        );
        return;
      }
      ui.zoomCaptureRect.call(zoom.transform, state.lastZoomTransform);
      if (brushes.context && ui.brushGroup && !ui.brushGroup.empty()) {
        const currentFocusDomain = state.lastZoomTransform
          .rescaleX(scales.xContext)
          .domain();
        if (currentFocusDomain.every((d) => d instanceof Date && !isNaN(d))) {
          const brushSelection = currentFocusDomain.map(scales.xContext);
          ui.brushGroup.on("brush.handler", null);
          ui.brushGroup.on("end.handler", null);
          if (brushSelection.every((v) => !isNaN(v))) {
            ui.brushGroup.call(brushes.context.move, brushSelection);
          }
          ui.brushGroup.on("brush.handler", EventHandlers.contextBrushed);
          ui.brushGroup.on("end.handler", EventHandlers.contextBrushed);
        }
      }
      FocusChartUpdater.updateRegressionBrushDisplay();
    },
    handleThemeToggle() {
      ThemeManager.toggleTheme();
    },
    handleDynamicYAxisToggle(event) {
      state.useDynamicYAxis = event.target.checked;
      localStorage.setItem(
        CONFIG.localStorageKeys.dynamicYAxis,
        state.useDynamicYAxis,
      );
      Utils.showStatusMessage(
        `Dynamic Y-Axis ${state.useDynamicYAxis ? "Enabled" : "Disabled"}.`,
        "info",
        1500,
      );
      MasterUpdater.updateAllCharts();
    },
    handleGoalSubmit(event) {
      event.preventDefault();
      const weightVal = ui.goalWeightInput?.property("value");
      const dateVal = ui.goalDateInput?.property("value");
      const rateVal = ui.goalTargetRateInput?.property("value");
      state.goal.weight = weightVal ? parseFloat(weightVal) : null;
      state.goal.date = dateVal ? new Date(dateVal) : null;
      state.goal.targetRate = rateVal ? parseFloat(rateVal) : null;
      if (state.goal.weight != null && isNaN(state.goal.weight))
        state.goal.weight = null;
      if (state.goal.date instanceof Date && isNaN(state.goal.date))
        state.goal.date = null;
      if (state.goal.targetRate != null && isNaN(state.goal.targetRate))
        state.goal.targetRate = null;
      DataService.saveGoal();
      StatsManager.update();
      MasterUpdater.updateAllCharts();
      LegendManager.build();
    },
    handleTrendlineChange() {
      const newRegStartDate = DataService.getRegressionStartDateFromUI();
      const datesDiffer =
        (!state.regressionStartDate && newRegStartDate) ||
        (state.regressionStartDate && !newRegStartDate) ||
        (state.regressionStartDate &&
          newRegStartDate &&
          state.regressionStartDate.getTime() !== newRegStartDate.getTime());
      if (datesDiffer) {
        state.regressionStartDate = newRegStartDate;
        StatsManager.update();
      }
      MasterUpdater.updateAllCharts();
    },
    handleRegressionToggle(event) {
      const isVisible = event.target.checked;
      state.seriesVisibility.regression = isVisible;
      state.seriesVisibility.regressionCI = isVisible;
      LegendManager.updateAppearance("regression", isVisible);
      LegendManager.updateAppearance("regressionCI", isVisible);
      ui.regressionToggle?.property("checked", isVisible);
      MasterUpdater.updateAllCharts();
      StatsManager.update();
    },
    handleAnalysisRangeUpdate() {
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.interactiveRegressionRange = { start: null, end: null };
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
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        state.analysisRange = {
          start: startDate,
          end: endDate,
          isCustom: true,
        };
        state.highlightedDate = null;
        scales.x.domain([startDate, endDate]);
        EventHandlers.syncBrushAndZoomToFocus();
        EventHandlers.updateAnalysisRangeDisplay();
        StatsManager.update();
        MasterUpdater.updateAllCharts();
        Utils.showStatusMessage("Analysis range updated.", "info", 1500);
      } else {
        Utils.showStatusMessage("Invalid date range selected.", "error");
        EventHandlers.updateAnalysisRangeInputsFromCurrentView();
      }
    },
    handleAnalysisRangeReset() {
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.interactiveRegressionRange = { start: null, end: null };
      state.highlightedDate = null;
      state.analysisRange.isCustom = false;
      if (state.lastZoomTransform && scales.xContext) {
        const domainBeforeCustom = state.lastZoomTransform
          .rescaleX(scales.xContext)
          .domain();
        if (domainBeforeCustom.every((d) => d instanceof Date && !isNaN(d))) {
          scales.x.domain(domainBeforeCustom);
        } else {
          DomainManager.initializeDomains(state.processedData);
        }
      } else {
        DomainManager.initializeDomains(state.processedData);
      }
      EventHandlers.syncBrushAndZoomToFocus();
      EventHandlers.updateAnalysisRangeInputsFromCurrentView();
      EventHandlers.updateAnalysisRangeDisplay();
      StatsManager.update();
      MasterUpdater.updateAllCharts();
      Utils.showStatusMessage(
        "Analysis range reset to chart view.",
        "info",
        1500,
      );
    },
    syncBrushAndZoomToFocus() {
      if (!scales.x || !scales.xContext || !UISetup._dimensions?.focus?.valid)
        return;
      const currentFocusDomain = scales.x.domain();
      if (!currentFocusDomain.every((d) => d instanceof Date && !isNaN(d)))
        return;
      if (zoom && ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
        const [x0Pixel, x1Pixel] = currentFocusDomain.map(scales.xContext);
        if (isNaN(x0Pixel) || isNaN(x1Pixel)) return;
        const pixelDiff = x1Pixel - x0Pixel;
        if (pixelDiff <= 0) return;
        const k = UISetup._dimensions.focus.width / pixelDiff;
        const tx = -x0Pixel * k;
        state.lastZoomTransform = d3.zoomIdentity.translate(tx, 0).scale(k);
        ui.zoomCaptureRect.on("zoom.handler", null);
        ui.zoomCaptureRect.call(zoom.transform, state.lastZoomTransform);
        ui.zoomCaptureRect.on("zoom.handler", EventHandlers.zoomed);
      }
      if (ui.brushGroup?.node() && brushes.context) {
        const newBrushSelection = currentFocusDomain.map(scales.xContext);
        if (newBrushSelection.every((v) => !isNaN(v))) {
          ui.brushGroup.on("brush.handler", null);
          ui.brushGroup.on("end.handler", null);
          ui.brushGroup.call(brushes.context.move, newBrushSelection);
          ui.brushGroup.on("brush.handler", EventHandlers.contextBrushed);
          ui.brushGroup.on("end.handler", EventHandlers.contextBrushed);
        }
      }
      FocusChartUpdater.updateRegressionBrushDisplay();
    },
    statDateClickWrapper(event) {
      if (event.currentTarget && event.currentTarget.__highlightDate) {
        EventHandlers.statDateClick(event.currentTarget.__highlightDate);
      }
    },
    statDateClick(date) {
      if (!(date instanceof Date) || isNaN(date.getTime())) return;
      const dateMs = date.getTime();
      let closestPoint = null;
      let minDiff = Infinity;
      state.processedData.forEach((p) => {
        if (p.date instanceof Date && !isNaN(p.date)) {
          const diff = Math.abs(p.date.getTime() - dateMs);
          if (diff < minDiff) {
            minDiff = diff;
            closestPoint = p;
          }
        }
      });
      if (!closestPoint) return;
      if (state.highlightedDate?.getTime() === closestPoint.date.getTime()) {
        state.highlightedDate = null;
        state.pinnedTooltipData = null;
        EventHandlers.updatePinnedTooltipDisplay();
        EventHandlers._hideTooltip(); // Use helper
      } else {
        state.highlightedDate = closestPoint.date;
        if (!scales.x || !scales.xContext || !UISetup._dimensions?.focus?.valid)
          return;
        const xDomain = scales.x.domain();
        if (!xDomain.every((d) => d instanceof Date && !isNaN(d))) return;
        const viewWidthMs = xDomain[1].getTime() - xDomain[0].getTime();
        const halfViewMs = viewWidthMs / 2;
        const targetStartTime = closestPoint.date.getTime() - halfViewMs;
        const targetEndTime = targetStartTime + viewWidthMs;
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
          clampedStartTime = clampedEndTime - viewWidthMs;
          clampedStartTime = Math.max(minTime, clampedStartTime);
        }
        if (clampedEndTime < clampedStartTime)
          clampedEndTime = clampedStartTime;
        const finalDomain = [
          new Date(clampedStartTime),
          new Date(clampedEndTime),
        ];
        scales.x.domain(finalDomain);
        state.analysisRange.isCustom = false;
        EventHandlers.syncBrushAndZoomToFocus();
      }
      MasterUpdater.updateAllCharts();
      StatsManager.update();
    },
    handleWhatIfSubmit(event) {
      event.preventDefault();
      if (
        !ui.whatIfIntakeInput ||
        !ui.whatIfDurationInput ||
        !ui.whatIfResultDisplay
      )
        return;
      const futureIntake = parseFloat(ui.whatIfIntakeInput.property("value"));
      const durationDays = parseInt(
        ui.whatIfDurationInput.property("value"),
        10,
      );
      const resultDisplay = ui.whatIfResultDisplay;
      resultDisplay.classed("error", false).text("Calculating...");
      if (isNaN(futureIntake) || isNaN(durationDays) || durationDays <= 0) {
        resultDisplay
          .classed("error", true)
          .text("Please enter valid intake and duration > 0.");
        return;
      }
      const currentStats = StatsManager.calculateAllStats();
      const tdeeEstimate =
        currentStats.avgTDEE_Adaptive ??
        currentStats.avgTDEE_WgtChange ??
        currentStats.avgExpenditureGFit;
      const tdeeSource =
        tdeeEstimate === currentStats.avgTDEE_Adaptive
          ? "Adaptive"
          : tdeeEstimate === currentStats.avgTDEE_WgtChange
            ? "Trend"
            : "GFit";
      if (tdeeEstimate == null || isNaN(tdeeEstimate)) {
        resultDisplay
          .classed("error", true)
          .text(
            `Cannot project: TDEE estimate unavailable for the current analysis range.`,
          );
        return;
      }
      const dailyNetBalance = futureIntake - tdeeEstimate;
      const dailyWeightChangeKg = dailyNetBalance / CONFIG.KCALS_PER_KG;
      const totalWeightChangeKg = dailyWeightChangeKg * durationDays;
      const startWeight = currentStats.currentSma ?? currentStats.currentWeight;
      if (startWeight == null || isNaN(startWeight)) {
        resultDisplay
          .classed("error", true)
          .text("Cannot project: Current weight unknown.");
        return;
      }
      const projectedWeight = startWeight + totalWeightChangeKg;
      const fv = Utils.formatValue;
      resultDisplay.html(
        `Based on ${tdeeSource} TDEE ≈ ${fv(tdeeEstimate, 0)} kcal:<br/>Est. change: ${fv(totalWeightChangeKg, 1)} kg in ${durationDays} days.<br/>Projected Weight: <strong>${fv(projectedWeight, 1)} kg</strong>.`,
      );
    },
    handleBackgroundClick(event) {
      const targetNode = event.target;
      const isInteractiveDot = d3.select(targetNode).classed("dot");
      const isAnnotation =
        d3.select(targetNode.closest(".annotation-marker-group")).size() > 0;
      const isTrendMarker =
        d3.select(targetNode.closest(".trend-change-marker-group")).size() > 0;
      const isLegendItem =
        d3.select(targetNode.closest(".legend-item")).size() > 0;
      const isBrushElement =
        d3.select(targetNode).classed("handle") ||
        d3.select(targetNode).classed("selection") ||
        d3.select(targetNode).classed("overlay");
      const isStatDate = d3.select(targetNode).classed("highlightable");
      const isBackground =
        targetNode === ui.zoomCaptureRect?.node() ||
        targetNode === ui.svg?.node() ||
        targetNode === ui.focus?.node() ||
        targetNode === ui.chartArea?.node();
      if (
        isBackground &&
        !isInteractiveDot &&
        !isAnnotation &&
        !isTrendMarker &&
        !isLegendItem &&
        !isBrushElement &&
        !isStatDate
      ) {
        let redrawNeeded = false;
        if (state.highlightedDate) {
          state.highlightedDate = null;
          redrawNeeded = true;
        }
        if (state.pinnedTooltipData) {
          state.pinnedTooltipData = null;
          EventHandlers.updatePinnedTooltipDisplay();
          EventHandlers._hideTooltip(); // Use helper
        }
        if (
          state.interactiveRegressionRange.start ||
          state.interactiveRegressionRange.end
        ) {
          if (
            brushes.regression &&
            ui.regressionBrushGroup &&
            !ui.regressionBrushGroup.empty()
          ) {
            ui.regressionBrushGroup.on("end.handler", null);
            ui.regressionBrushGroup.call(brushes.regression.move, null);
            ui.regressionBrushGroup.on(
              "end.handler",
              EventHandlers.regressionBrushed,
            );
            FocusChartUpdater.updateRegressionBrushDisplay();
            if (
              state.interactiveRegressionRange.start ||
              state.interactiveRegressionRange.end
            ) {
              state.interactiveRegressionRange = { start: null, end: null };
              MasterUpdater.updateAllCharts();
              StatsManager.update();
              redrawNeeded = false;
            }
          }
        }
        if (redrawNeeded) {
          FocusChartUpdater.updateDots(state.filteredData);
          FocusChartUpdater.updateHighlightMarker(state.filteredData);
        }
      }
    },
    getAnalysisDateRange() {
      if (
        state.analysisRange.isCustom &&
        state.analysisRange.start &&
        state.analysisRange.end &&
        state.analysisRange.start instanceof Date &&
        state.analysisRange.end instanceof Date &&
        !isNaN(state.analysisRange.start) &&
        !isNaN(state.analysisRange.end)
      ) {
        return {
          start: state.analysisRange.start,
          end: state.analysisRange.end,
        };
      }
      const chartDomain = scales.x?.domain();
      if (
        chartDomain?.length === 2 &&
        chartDomain[0] instanceof Date &&
        chartDomain[1] instanceof Date &&
        !isNaN(chartDomain[0]) &&
        !isNaN(chartDomain[1])
      ) {
        const start = new Date(chartDomain[0]);
        start.setHours(0, 0, 0, 0);
        const end = new Date(chartDomain[1]);
        end.setHours(23, 59, 59, 999);
        return { start: start, end: end };
      }
      console.warn(
        "EventHandlers: Could not determine analysis range from chart view. Using fallback.",
      );
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      return { start: yesterday, end: today };
    },
    getEffectiveRegressionRange() {
      if (
        state.interactiveRegressionRange.start instanceof Date &&
        !isNaN(state.interactiveRegressionRange.start) &&
        state.interactiveRegressionRange.end instanceof Date &&
        !isNaN(state.interactiveRegressionRange.end)
      ) {
        return { ...state.interactiveRegressionRange };
      }
      const analysisRange = EventHandlers.getAnalysisDateRange();
      if (
        !(analysisRange.start instanceof Date) ||
        !(analysisRange.end instanceof Date)
      ) {
        console.warn("EventHandlers: Invalid analysis range for regression.");
        return { start: null, end: null };
      }
      const uiRegressionStart = state.regressionStartDate;
      const start =
        uiRegressionStart instanceof Date &&
        !isNaN(uiRegressionStart) &&
        uiRegressionStart >= analysisRange.start &&
        uiRegressionStart <= analysisRange.end
          ? uiRegressionStart
          : analysisRange.start;
      return { start: start, end: analysisRange.end };
    },
    updateAnalysisRangeInputsFromCurrentView() {
      const range = EventHandlers.getAnalysisDateRange();
      ui.analysisStartDateInput?.property(
        "value",
        Utils.formatDate(range.start),
      );
      ui.analysisEndDateInput?.property("value", Utils.formatDate(range.end));
    },
    updateAnalysisRangeDisplay() {
      const range = EventHandlers.getAnalysisDateRange();
      const displayStr =
        range.start && range.end
          ? `${Utils.formatDateShort(range.start)} - ${Utils.formatDateShort(range.end)}`
          : "Full Range";
      ui.analysisRangeDisplay?.text(displayStr);
      if (ui.analysisResultsHeading) {
        const headingSmallText = state.analysisRange.isCustom
          ? "(Custom Range)"
          : "(Chart View)";
        ui.analysisResultsHeading.select("small").text(headingSmallText);
      }
    },

    setupAll() {
      console.log("EventHandlers: Setting up event listeners...");
      window.addEventListener("resize", EventHandlers.handleResize);
      ui.themeToggle?.on("click", EventHandlers.handleThemeToggle);
      ui.dynamicYAxisToggle?.on(
        "change",
        EventHandlers.handleDynamicYAxisToggle,
      );
      d3.select("#goal-setting-form").on(
        "submit",
        EventHandlers.handleGoalSubmit,
      );
      ui.annotationForm?.on("submit", AnnotationManager.handleSubmit);
      const trendInputs = [
        ui.trendStartDateInput,
        ui.trendInitialWeightInput,
        ui.trendWeeklyIncrease1Input,
        ui.trendWeeklyIncrease2Input,
      ];
      trendInputs.forEach((input) =>
        input?.on("input", EventHandlers.handleTrendlineChange),
      );
      ui.regressionToggle?.on("change", EventHandlers.handleRegressionToggle);
      ui.updateAnalysisRangeBtn?.on(
        "click",
        EventHandlers.handleAnalysisRangeUpdate,
      );
      ui.resetAnalysisRangeBtn?.on(
        "click",
        EventHandlers.handleAnalysisRangeReset,
      );
      ui.whatIfSubmitBtn?.on("click", EventHandlers.handleWhatIfSubmit);
      ui.whatIfIntakeInput?.on("keydown", (event) => {
        if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
      });
      ui.whatIfDurationInput?.on("keydown", (event) => {
        if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
      });
      ui.svg?.on("click", EventHandlers.handleBackgroundClick);
      if (brushes.context && ui.brushGroup) {
        ui.brushGroup.on(
          "brush.handler end.handler",
          EventHandlers.contextBrushed,
        );
      }
      if (zoom && ui.zoomCaptureRect) {
        ui.zoomCaptureRect.on("zoom.handler", EventHandlers.zoomed);
      }
      if (brushes.regression && ui.regressionBrushGroup) {
        ui.regressionBrushGroup.on(
          "end.handler",
          EventHandlers.regressionBrushed,
        );
      }
      console.log("EventHandlers: Setup complete.");
    },
  }; // End of EventHandlers

  // ========================================================================
  // Legend Manager (`LegendManager`)
  // ========================================================================
  const LegendManager = {
    toggleSeriesVisibility(seriesId, isVisible) {
      if (!state.seriesVisibility.hasOwnProperty(seriesId)) {
        console.warn(
          `LegendManager: Attempted to toggle unknown series: ${seriesId}`,
        );
        return;
      }
      state.seriesVisibility[seriesId] = isVisible;
      if (seriesId === "regression") {
        state.seriesVisibility.regressionCI = isVisible;
        LegendManager.updateAppearance("regressionCI", isVisible);
        ui.regressionToggle?.property("checked", isVisible);
      } else if (seriesId === "bf") {
        ui.svg
          ?.select(".y-axis-label2")
          .style("display", isVisible ? null : "none");
      }
      state.highlightedDate = null;
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      LegendManager.updateAppearance(seriesId, isVisible);
      MasterUpdater.updateAllCharts();
      StatsManager.update();
    },
    updateAppearance(seriesId, isVisible) {
      ui.legendContainer
        ?.selectAll(`.legend-item[data-id='${seriesId}']`)
        .classed("hidden", !isVisible);
    },
    build() {
      if (!ui.legendContainer || ui.legendContainer.empty()) {
        console.warn("LegendManager: Legend container not found.");
        return;
      }
      ui.legendContainer.html("");
      if (Object.keys(colors).length === 0 || !state.processedData?.length) {
        ui.legendContainer
          .append("span")
          .attr("class", "legend-empty-msg")
          .text("Legend unavailable.");
        return;
      }
      const legendItemsConfig = [
        {
          id: "raw",
          label: "Raw Data",
          type: "dot",
          colorKey: "rawDot",
          styleClass: "raw-dot",
        },
        {
          id: "sma",
          label: `Weight (${CONFIG.movingAverageWindow}d SMA & Band)`,
          type: "area+line",
          colorKey: "sma",
          areaColorKey: "band",
          styleClass: "sma-line",
        },
        {
          id: "regression",
          label: "Lin. Regression",
          type: "line",
          colorKey: "regression",
          styleClass: "regression-line",
        },
        {
          id: "regressionCI",
          label: "Regression 95% CI",
          type: "area",
          colorKey: "regressionCI",
          styleClass: "regression-ci-area",
        },
        {
          id: "trend1",
          label: "Manual Trend 1",
          type: "line",
          colorKey: "trend1",
          styleClass: "manual-trend-1",
          dash: "4, 4",
        },
        {
          id: "trend2",
          label: "Manual Trend 2",
          type: "line",
          colorKey: "trend2",
          styleClass: "manual-trend-2",
          dash: "4, 4",
        },
        ...(state.goal.weight != null
          ? [
              {
                id: "goal",
                label: "Goal Path",
                type: "line",
                colorKey: "goal",
                styleClass: "goal-line",
                dash: "6, 3",
              },
            ]
          : []),
        {
          id: "bf",
          label: "Body Fat %",
          type: "line",
          colorKey: "secondAxisColor",
          styleClass: "bf-line",
          dash: "1, 2",
        },
        {
          id: "annotations",
          label: "Annotations",
          type: "marker",
          colorKey: "annotationMarker",
          styleClass: "annotation-marker",
        },
        {
          id: "plateaus",
          label: "Plateaus",
          type: "area",
          colorKey: "plateauColor",
          styleClass: "plateau-region",
        },
        {
          id: "trendChanges",
          label: "Trend Δ",
          type: "marker",
          colorKey: "trendChangeColor",
          styleClass: "trend-change-marker",
        },
      ];
      legendItemsConfig.forEach((item) => {
        if (state.seriesVisibility.hasOwnProperty(item.id)) {
          const isVisible = state.seriesVisibility[item.id];
          const itemColor = colors[item.colorKey] || "#000";
          const areaColor = colors[item.areaColorKey] || "rgba(0,0,0,0.1)";
          const itemDiv = ui.legendContainer
            .append("div")
            .attr("class", `legend-item ${item.styleClass}`)
            .attr("data-id", item.id)
            .classed("hidden", !isVisible)
            .on("click", () =>
              LegendManager.toggleSeriesVisibility(item.id, !isVisible),
            );
          const swatch = itemDiv
            .append("span")
            .attr("class", `legend-swatch type-${item.type}`);
          switch (item.type) {
            case "dot":
            case "marker":
              swatch.style("background-color", itemColor);
              break;
            case "area":
              swatch.style("background-color", itemColor).style("opacity", 0.6);
              break;
            case "line":
              swatch.style("background-color", itemColor);
              if (item.dash) swatch.classed("dashed", true);
              break;
            case "area+line":
              swatch.style("background-color", areaColor);
              swatch.style("border", `1px solid ${itemColor}`);
              break;
          }
          itemDiv.append("span").attr("class", "legend-text").text(item.label);
        }
      });
    },
  };

  // ========================================================================
  // Annotation Manager (`AnnotationManager`)
  // ========================================================================
  const AnnotationManager = {
    load() {
      const stored = localStorage.getItem(CONFIG.localStorageKeys.annotations);
      state.annotations = [];
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            state.annotations = parsed
              .map((a) => ({
                id: a.id ?? Date.now() + Math.random(),
                date: a.date,
                text: a.text || "",
                type: a.type === "range" ? "range" : "point",
              }))
              .filter(
                (a) =>
                  a.date &&
                  typeof a.text === "string" &&
                  /^\d{4}-\d{2}-\d{2}$/.test(a.date),
              );
          }
        } catch (e) {
          console.error(
            "AnnotationManager: Error loading/parsing annotations:",
            e,
          );
        }
      }
      state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date));
      AnnotationManager.renderList();
    },
    save() {
      try {
        const annotationsToSave = state.annotations.map(
          ({ id, date, text, type }) => ({ id, date, text, type }),
        );
        localStorage.setItem(
          CONFIG.localStorageKeys.annotations,
          JSON.stringify(annotationsToSave),
        );
      } catch (e) {
        console.error("AnnotationManager: Error saving annotations:", e);
        Utils.showStatusMessage(
          "Could not save annotations due to storage error.",
          "error",
        );
      }
    },
    add(dateStr, text, type = "point") {
      const date = new Date(dateStr);
      if (isNaN(date.getTime()) || !text || text.trim().length === 0) {
        Utils.showStatusMessage(
          "Annotation requires a valid date and non-empty text.",
          "error",
        );
        return false;
      }
      date.setHours(0, 0, 0, 0);
      const newAnnotation = {
        id: Date.now(),
        date: date.toISOString().slice(0, 10),
        text: text.trim(),
        type: type === "range" ? "range" : "point",
      };
      state.annotations.push(newAnnotation);
      state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date));
      AnnotationManager.save();
      AnnotationManager.renderList();
      FocusChartUpdater.updateAnnotations(state.filteredData);
      Utils.showStatusMessage("Annotation added.", "success", 1500);
      return true;
    },
    remove(id) {
      const initialLength = state.annotations.length;
      state.annotations = state.annotations.filter((a) => a.id !== id);
      if (state.annotations.length < initialLength) {
        AnnotationManager.save();
        AnnotationManager.renderList();
        FocusChartUpdater.updateAnnotations(state.filteredData);
        Utils.showStatusMessage("Annotation removed.", "info", 1500);
      }
    },
    findAnnotationByDate(targetDate) {
      if (!(targetDate instanceof Date) || isNaN(targetDate)) return null;
      const targetTime = new Date(targetDate).setHours(0, 0, 0, 0);
      return state.annotations.find((a) => {
        const annoDate = new Date(a.date);
        return (
          !isNaN(annoDate.getTime()) &&
          annoDate.setHours(0, 0, 0, 0) === targetTime
        );
      });
    },
    handleSubmit(event) {
      event.preventDefault();
      const dateVal = ui.annotationDateInput?.property("value");
      const textVal = ui.annotationTextInput?.property("value");
      if (AnnotationManager.add(dateVal, textVal)) {
        ui.annotationDateInput?.property("value", "");
        ui.annotationTextInput?.property("value", "");
      }
    },
    renderList() {
      const list = ui.annotationList;
      if (!list || list.empty()) return;
      list.html("");
      if (state.annotations.length === 0) {
        list
          .append("li")
          .attr("class", "empty-msg")
          .text("No annotations added yet.");
        return;
      }
      const items = list
        .selectAll("li.annotation-list-item")
        .data(state.annotations, (d) => d.id)
        .join("li")
        .attr("class", "annotation-list-item");
      items
        .append("span")
        .attr("class", "annotation-date")
        .text((d) => Utils.formatDateShort(new Date(d.date)));
      items
        .append("span")
        .attr("class", "annotation-text")
        .text((d) => d.text);
      items
        .append("button")
        .attr("class", "remove-annotation")
        .attr("aria-label", "Remove annotation")
        .html("&times;")
        .on("click", (event, d) => {
          event.stopPropagation();
          AnnotationManager.remove(d.id);
        });
    },
  }; // End of AnnotationManager

  // ========================================================================
  // Initialization & Public Interface
  // ========================================================================
  function _cacheSelectors() {
    console.log("Initialization: Caching UI element selections...");
    ui.body = d3.select("body");
    const elementIdMap = {
      "chart-container": "chartContainer",
      "context-chart-container": "contextContainer",
      "balance-chart-container": "balanceChartContainer",
      "legend-container": "legendContainer",
      "rate-of-change-container": "rateChartContainer",
      "tdee-reconciliation-container": "tdeeDiffContainer",
      "weekly-summary-container": "weeklySummaryContainer",
      "correlation-scatter-container": "correlationScatterContainer",
      tooltip: "tooltip",
      "pinned-tooltip-container": "pinnedTooltipContainer",
      "status-message": "statusMessage",
      "annotation-list": "annotationList",
      "insight-summary": "insightSummaryContainer",
      "analysis-results-heading": "analysisResultsHeading",
      "theme-toggle": "themeToggle",
      "dynamic-y-axis-toggle": "dynamicYAxisToggle",
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
      "annotation-form": "annotationForm",
      "annotation-date": "annotationDateInput",
      "annotation-text": "annotationTextInput",
      "what-if-intake": "whatIfIntakeInput",
      "what-if-duration": "whatIfDurationInput",
      "what-if-submit": "whatIfSubmitBtn",
      "what-if-result": "whatIfResultDisplay",
      // Weight Stats
      "starting-weight": "startingWeight",
      "current-weight": "currentWeight",
      "current-sma": "currentSma",
      "total-change": "totalChange",
      "max-weight": "maxWeight",
      "max-weight-date": "maxWeightDate",
      "min-weight": "minWeight",
      "min-weight-date": "minWeightDate",
      // LBM/FM Stats (NEW)
      "starting-lbm": "startingLbm",
      "current-lbm-sma": "currentLbmSma",
      "total-lbm-change": "totalLbmChange",
      "current-fm-sma": "currentFmSma",
      "total-fm-change": "totalFmChange",
      // Trend/Analysis Stats
      "volatility-score": "volatilityScore",
      "rolling-weekly-change-sma": "rollingWeeklyChangeSma",
      "regression-slope": "regressionSlope",
      "netcal-rate-correlation": "netcalRateCorrelation",
      "weight-consistency": "weightConsistency",
      "weight-consistency-details": "weightConsistencyDetails",
      "calorie-consistency": "calorieConsistency",
      "calorie-consistency-details": "calorieConsistencyDetails",
      "avg-intake": "avgIntake",
      "avg-expenditure": "avgExpenditure",
      "avg-net-balance": "avgNetBalance",
      "estimated-deficit-surplus": "estimatedDeficitSurplus",
      "avg-tdee-gfit": "avgTdeeGfit",
      "avg-tdee-wgt-change": "avgTdeeWgtChange",
      "avg-tdee-difference": "avgTdeeDifference",
      "avg-tdee-adaptive": "avgTdeeAdaptive",
      // Goal Stats
      "target-weight-stat": "targetWeightStat",
      "target-rate-stat": "targetRateStat",
      "weight-to-goal": "weightToGoal",
      "estimated-time-to-goal": "estimatedTimeToGoal",
      "required-rate-for-goal": "requiredRateForGoal",
      "required-net-calories": "requiredNetCalories",
      "suggested-intake-range": "suggestedIntakeRange",
      "current-rate-feedback": "currentRateFeedback",
    };
    let missingCritical = false;
    const criticalIds = [
      "chart-container",
      "context-chart-container",
      "tooltip",
    ];
    ui.statElements = {};
    for (const [id, key] of Object.entries(elementIdMap)) {
      const elementNode = Utils.getElementByIdSafe(id);
      if (elementNode) {
        ui[key] = d3.select(elementNode);
        // Capture references to all stat display DOM elements for performance
        if (
          elementNode.classList.contains("stat-value") ||
          elementNode.classList.contains("stat-date") ||
          elementNode.classList.contains("stat-details") ||
          elementNode.classList.contains("feedback") ||
          elementNode.classList.contains("what-if-result") ||
          elementNode.classList.contains("analysis-range-display") ||
          id === "regression-start-date-label" ||
          id === "starting-lbm" || // Add LBM/FM ids here
          id === "current-lbm-sma" ||
          id === "total-lbm-change" ||
          id === "current-fm-sma" ||
          id === "total-fm-change"
        ) {
          ui.statElements[key] = elementNode;
        }
      } else {
        ui[key] = d3.select(null);
        if (criticalIds.includes(id)) {
          console.error(
            `Initialization Error: Critical UI element #${id} not found.`,
          );
          missingCritical = true;
        }
      }
    }
    if (ui.regressionToggle && !ui.regressionToggle.empty()) {
      state.seriesVisibility.regression =
        ui.regressionToggle.property("checked");
      state.seriesVisibility.regressionCI = state.seriesVisibility.regression;
    } else {
      state.seriesVisibility.regression = true;
      state.seriesVisibility.regressionCI = true;
    }
    state.useDynamicYAxis =
      ui.dynamicYAxisToggle?.property("checked") ??
      localStorage.getItem(CONFIG.localStorageKeys.dynamicYAxis) === "true";
    if (missingCritical) {
      throw new Error(
        "Missing critical UI elements required for chart initialization. Check console for details.",
      );
    }
    console.log("Initialization: UI element caching finished.");
  }

  async function initialize() {
    console.log(
      "Initialization: Starting Weight Insights Chart (v3.1 Refactored)...",
    );
    try {
      _cacheSelectors();
      ThemeManager.init();
      state.regressionStartDate = DataService.getRegressionStartDateFromUI();
      const rawDataObjects = await DataService.fetchData();
      state.rawData = DataService.mergeRawData(rawDataObjects);
      state.processedData = DataService.processData(state.rawData);
      DataService.loadGoal();
      AnnotationManager.load();
      if (!UISetup.runAll()) {
        throw new Error("Chart UI setup failed. Dimensions might be invalid.");
      }
      if (state.processedData?.length > 0) {
        DomainManager.initializeDomains(state.processedData);
        EventHandlers.syncBrushAndZoomToFocus();
      } else {
        console.warn(
          "Initialization: No data available. Chart will be mostly empty.",
        );
        DomainManager.setXDomains([]);
        DomainManager.setContextYDomain([]);
        DomainManager.setFocusYDomains([], null);
        DomainManager.setSecondaryYDomains([]);
        DomainManager.setScatterPlotDomains([]);
      }
      LegendManager.build();
      EventHandlers.setupAll();
      state.isInitialized = true;
      MasterUpdater.updateAllCharts();
      StatsManager.update();
      console.log(
        "Initialization: Chart successfully initialized (v3.1 Refactored).",
      );
    } catch (error) {
      console.error("CRITICAL INITIALIZATION ERROR:", error);
      state.isInitialized = false;
      if (ui.chartContainer && !ui.chartContainer.empty()) {
        ui.chartContainer.html(
          `<div class="init-error"><h2>Chart Initialization Failed</h2><p>Could not render the chart due to an error:</p><pre>${error.message}</pre><p>Please check the browser console for more details.</p></div>`,
        );
      }
      d3.selectAll(
        ".dashboard-container > *:not(#chart-container), .sidebar > *",
      )
        .style("opacity", 0.3)
        .style("pointer-events", "none");
      ui.chartContainer?.style("opacity", 1).style("pointer-events", "auto");
    }
  }

  // --- Public Interface ---
  return { initialize: initialize };
})(); // End of IIFE

// --- Run Initialization on DOMContentLoaded ---
console.log(
  "chart.js (v3.1 Refactored): Setting up DOMContentLoaded listener.",
);
document.addEventListener("DOMContentLoaded", () => {
  console.log("chart.js (v3.1 Refactored): DOMContentLoaded fired.");
  setTimeout(() => {
    console.log(
      "chart.js (v3.1 Refactored): setTimeout(0) callback executing.",
    );
    if (
      typeof WeightTrackerChart !== "undefined" &&
      WeightTrackerChart.initialize
    ) {
      console.log(
        "chart.js (v3.1 Refactored): Calling WeightTrackerChart.initialize().",
      );
      WeightTrackerChart.initialize();
    } else {
      console.error(
        "chart.js (v3.1 Refactored): ERROR - WeightTrackerChart or initialize is not defined!",
      );
      document.body.innerHTML =
        '<div class="init-error"><h2>Initialization Failed</h2><p>The chart script (WeightTrackerChart) did not load or define correctly. Check the console.</p></div>';
    }
  }, 0);
});
console.log("chart.js (v3.1 Refactored): Script parsing finished.");
