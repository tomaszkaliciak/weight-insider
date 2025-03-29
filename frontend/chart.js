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
    // Goal Guidance
    MAX_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.35,
    MIN_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.1,
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
      expectedLineColor: "#f1c40f",
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
      expected: true,
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
    expectedLine: null,
    rateLine: null,
    tdeeDiffLine: null,
    bfLine: null,
    contextArea: null,
    contextLine: null,
    balanceZeroLine: null,
    rateZeroLine: null,
    tdeeDiffZeroLine: null,
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
      // Only warn if the element is *expected* to exist for core functionality
      // if (!el && ['chart-container', 'tooltip', /* other critical ids */].includes(id)) {
      //     console.warn(`Utils: Critical element with ID "${id}" not found.`);
      // }
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

    // Debounce function
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

    // Simple rolling average calculation
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

    // Calculates bounds for regression confidence interval
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
        // Return empty structure to prevent downstream errors
        return {
          weights: {},
          calorieIntake: {},
          googleFitExpenditure: {},
          bodyFat: {},
        };
        // Re-throwing would halt initialization completely:
        // throw error;
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
        const expectedChange =
          DataService._calculateExpectedWeightChange(netBalance);

        mergedData.push({
          dateString: dateStr,
          date: dateObj,
          value: weights[dateStr] ?? null,
          bfPercent: bodyFat[dateStr] ?? null,
          notes: undefined, // Placeholder for future use
          calorieIntake: intake,
          googleFitTDEE: expenditure,
          netBalance: netBalance,
          expectedWeightChange: expectedChange,
          // Fields to be calculated in processing steps:
          sma: null,
          stdDev: null,
          lowerBound: null,
          upperBound: null,
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
      processed = DataService._calculateSMAAndStdDev(processed);
      processed = DataService._identifyOutliers(processed);
      processed = DataService._calculateDailyRatesAndTDEETrend(processed);
      processed = DataService._calculateAdaptiveTDEE(processed);
      processed = DataService._smoothRatesAndTDEEDifference(processed);

      console.log("DataService: Data processing pipeline completed.");
      // Log counts of key calculated fields for diagnostics
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
    _calculateSMAAndStdDev(data) {
      const windowSize = CONFIG.movingAverageWindow;
      const stdDevMult = CONFIG.stdDevMultiplier;

      return data.map((d, i, arr) => {
        // Get the window of *previous* data points including current
        const windowDataPoints = arr.slice(
          Math.max(0, i - windowSize + 1),
          i + 1,
        );
        // Extract valid weight values from the window
        const validValuesInWindow = windowDataPoints
          .map((p) => p.value)
          .filter((v) => v != null && !isNaN(v));

        let sma = null;
        let stdDev = null;

        if (validValuesInWindow.length > 0) {
          sma = d3.mean(validValuesInWindow);
          // StdDev requires at least 2 points
          stdDev =
            validValuesInWindow.length > 1 &&
            typeof ss?.standardDeviation === "function"
              ? ss.standardDeviation(validValuesInWindow)
              : 0; // Use 0 if not enough points or ss unavailable
        }

        // Calculate bounds based on SMA and StdDev
        const lowerBound =
          sma != null && stdDev != null ? sma - stdDevMult * stdDev : null;
        const upperBound =
          sma != null && stdDev != null ? sma + stdDevMult * stdDev : null;

        return { ...d, sma, stdDev, lowerBound, upperBound };
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
          d.stdDev > 0.01 // Avoid flagging flat lines as outliers
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
            // Ensure dates are valid before calculating time difference
            if (
              d.date instanceof Date &&
              prev.date instanceof Date &&
              !isNaN(d.date) &&
              !isNaN(prev.date)
            ) {
              const timeDiffDays =
                (d.date.getTime() - prev.date.getTime()) / 86400000;

              // Calculate rate only if time difference is positive and reasonable
              if (
                timeDiffDays > 0 &&
                timeDiffDays <= CONFIG.movingAverageWindow
              ) {
                const smaDiff = d.sma - prev.sma;
                dailySmaRate = smaDiff / timeDiffDays;

                // Calculate TDEE Trend based on *previous* day's intake and the *calculated* rate
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
      const minDataRatio = 0.7; // Minimum ratio of valid intake days required in window

      return data.map((d, i, arr) => {
        let adaptiveTDEE = null;

        if (i >= windowSize - 1) {
          const windowData = arr.slice(i - windowSize + 1, i + 1);
          const startPoint = windowData[0];
          const endPoint = d; // Current point is the end of the window

          const validIntakes = windowData
            .map((p) => p.calorieIntake)
            .filter((v) => v != null && !isNaN(v));

          // Check conditions: enough intake data, valid start/end SMA, valid dates
          if (
            validIntakes.length >= windowSize * minDataRatio &&
            startPoint.sma != null &&
            endPoint.sma != null &&
            startPoint.date instanceof Date &&
            !isNaN(startPoint.date) && // Ensure dates are valid
            endPoint.date instanceof Date &&
            !isNaN(endPoint.date)
          ) {
            const avgIntakeWindow = d3.mean(validIntakes);
            const totalSmaChange = endPoint.sma - startPoint.sma;

            // Calculate time difference carefully, handling potential gaps
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

    _calculateExpectedWeightChange(netBalance) {
      return netBalance == null || isNaN(netBalance)
        ? null
        : netBalance / CONFIG.KCALS_PER_KG;
    },

    // --- Regression & Trend Calculations ---
    calculateLinearRegression(dataPoints, startDate) {
      // Filter data: non-outlier, valid value, within optional start date
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
        // console.log(`Regression: Not enough points (${filteredData.length})`);
        return { slope: null, intercept: null, points: [], pointsWithCI: [] };
      }

      // Ensure data is sorted by date for consistent calculations
      filteredData.sort((a, b) => a.date - b.date);

      const firstDateMs = filteredData[0].date.getTime();
      const dayInMillis = 86400000;
      // Prepare data for simple-statistics: [ [x1, y1], [x2, y2], ... ]
      // X is days since the start date of the filtered range
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

        // Prepare points data needed for CI calculation (includes original value)
        const pointsForCI = filteredData.map((d) => ({
          ...d, // Keep original data point fields
          value: d.value, // Explicitly ensure 'value' is the Y value
        }));

        // Calculate Confidence Intervals using the utility function
        const pointsWithCI = Utils.calculateRegressionCI(
          pointsForCI,
          { slope, intercept },
          CONFIG.CONFIDENCE_INTERVAL_ALPHA,
        );

        // Prepare points array just for plotting the *line* itself
        const plotPoints = pointsWithCI.map((p) => ({
          date: p.date,
          regressionValue: p.regressionValue, // Use the calculated regression value
        }));

        // console.log(`Regression: Slope=${slope.toFixed(4)}, Intercept=${intercept.toFixed(2)}, Points=${plotPoints.length}`);
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
      // Calculate elapsed weeks, allowing for negative values if targetDate is before startDate
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
          // Ensure date string is handled robustly (Safari needs '-' not '/')
          const dateStr = parsed.date?.replace(/\//g, "-");
          const date = dateStr ? new Date(dateStr) : null;
          const targetRate = parsed.targetRate
            ? parseFloat(parsed.targetRate)
            : null;

          // Validate parsed values
          state.goal.weight = weight != null && !isNaN(weight) ? weight : null;
          // Check if date is valid after parsing
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

      // If the chart is already initialized, trigger updates that depend on colors
      if (state.isInitialized && triggerUpdate) {
        console.log(
          `ThemeManager: Switched to ${theme} theme, triggering updates.`,
        );
        LegendManager.build(); // Rebuild legend with new colors
        // Trigger a full redraw to apply new colors to lines, areas, etc.
        // This relies on CSS variables being updated and D3 elements inheriting them.
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
        // Ensure a color value is returned, even if CSS var is invalid/missing and fallback is missing
        return val || CONFIG.fallbackColors[fallbackKey] || "#000000"; // Absolute fallback
      };

      // Populate the global 'colors' object
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
        expectedLineColor: getColor(
          "--expected-line-color",
          "expectedLineColor",
        ),
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
      });
    },
  };

  // ========================================================================
  // UI Setup (`UISetup`) - Creates SVG structure, scales, axes, brushes, zoom
  // ========================================================================
  const UISetup = {
    _dimensions: {}, // Internal cache for dimensions

    // Calculate and cache dimensions for all chart areas
    calculateDimensions() {
      const getDim = (containerSelection, margins) => {
        if (!containerSelection || containerSelection.empty())
          return { width: 0, height: 0, valid: false };
        const node = containerSelection.node();
        if (!node) return { width: 0, height: 0, valid: false };

        const rect = node.getBoundingClientRect();
        // Use clientWidth/Height for content dimensions excluding padding/border if needed
        // but getBoundingClientRect includes border/padding - adjust if box-sizing is border-box
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

        const valid = width > 10 && height > 10; // Check if calculated dimensions are usable
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

      // Check if all *required* charts have valid dimensions
      const requiredDimsValid =
        this._dimensions.focus.valid && this._dimensions.context.valid;
      // Optional charts only need checking if their container exists
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
        return false; // Indicate failure
      }

      return true; // Indicate success
    },

    // Create all SVG elements and main groups
    createSVGElements() {
      console.log("UISetup: Creating SVG elements...");
      const fm = CONFIG.margins.focus;
      const cm = CONFIG.margins.context;
      const bm = CONFIG.margins.balance;
      const rm = CONFIG.margins.rate;
      const tdm = CONFIG.margins.tdeeDiff;
      const sm = CONFIG.margins.correlationScatter;

      // --- Clear existing SVGs ---
      ui.chartContainer?.select("svg").remove();
      ui.contextContainer?.select("svg").remove();
      ui.balanceChartContainer?.select("svg").remove();
      ui.rateChartContainer?.select("svg").remove();
      ui.tdeeDiffContainer?.select("svg").remove();
      ui.correlationScatterContainer?.select("svg").remove();

      // --- Focus Chart ---
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
          .attr("aria-label", "Main Weight Chart") // Accessibility
          .attr("role", "img");

        // Defs for clipping
        ui.svg
          .append("defs")
          .append("clipPath")
          .attr("id", "clip-focus")
          .append("rect")
          .attr("width", width)
          .attr("height", height);

        // Zoom capture rectangle (covers the plot area)
        ui.zoomCaptureRect = ui.svg
          .append("rect")
          .attr("class", "zoom-capture")
          .attr("width", width)
          .attr("height", height)
          .attr("transform", `translate(${fm.left}, ${fm.top})`)
          .style("fill", "none") // Make transparent
          .style("pointer-events", "all"); // Ensure it captures events

        // Main focus group
        ui.focus = ui.svg
          .append("g")
          .attr("class", "focus")
          .attr("transform", `translate(${fm.left},${fm.top})`);

        // Groups within focus (order matters for layering)
        ui.gridGroup = ui.focus.append("g").attr("class", "grid y-grid"); // Grid lines behind data
        ui.plateauGroup = ui.focus.append("g").attr("class", "plateau-group");
        ui.annotationsGroup = ui.focus
          .append("g")
          .attr("class", "annotations-group");
        ui.chartArea = ui.focus
          .append("g")
          .attr("clip-path", "url(#clip-focus)"); // Apply clipping

        // Paths/Areas within chartArea
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
        ui.expectedLine = ui.chartArea
          .append("path")
          .attr("class", "trend-line expected-weight-line");
        ui.bfLine = ui.chartArea.append("path").attr("class", "line bf-line");

        // Dot groups within chartArea
        ui.rawDotsGroup = ui.chartArea
          .append("g")
          .attr("class", "raw-dots-group");
        ui.smaDotsGroup = ui.chartArea.append("g").attr("class", "dots-group");

        // Overlay markers within chartArea
        ui.trendChangeGroup = ui.chartArea
          .append("g")
          .attr("class", "trend-change-group");
        ui.highlightGroup = ui.chartArea
          .append("g")
          .attr("class", "highlight-group");

        // Crosshair group (initially hidden)
        ui.crosshairGroup = ui.focus
          .append("g")
          .attr("class", "crosshair-group")
          .style("pointer-events", "none") // Don't interfere with hover
          .style("display", "none");
        ui.crosshairGroup
          .append("line")
          .attr("class", "crosshair crosshair-x") // Vertical line
          .attr("y1", 0)
          .attr("y2", height);
        ui.crosshairGroup
          .append("line")
          .attr("class", "crosshair crosshair-y") // Horizontal line
          .attr("x1", 0)
          .attr("x2", width);

        // Regression brush group (overlay on focus chart)
        ui.regressionBrushGroup = ui.focus
          .append("g")
          .attr("class", "regression-brush");

        // Axis groups for focus chart
        ui.xAxisGroup = ui.focus
          .append("g")
          .attr("class", "axis axis--x")
          .attr("transform", `translate(0,${height})`);
        ui.yAxisGroup = ui.focus.append("g").attr("class", "axis axis--y");
        ui.yAxisGroup2 = ui.focus
          .append("g")
          .attr("class", "axis axis--y2")
          .attr("transform", `translate(${width}, 0)`);

        // Axis Labels for focus chart
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
          .style("display", state.seriesVisibility.bf ? null : "none"); // Initially hide if BF off
      }

      // --- Context Chart ---
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
          .attr("aria-hidden", "true"); // Decorative element
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
        // Brush group will be added later in setupBrushes()
      }

      // --- Balance Chart ---
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
          .attr("x2", width); // Span width
        ui.balanceXAxisGroup = ui.balanceSvg
          .append("g")
          .attr("class", "axis balance-axis balance-axis--x")
          .attr("transform", `translate(${bm.left},${bm.top + height})`);
        ui.balanceYAxisGroup = ui.balanceSvg
          .append("g")
          .attr("class", "axis balance-axis balance-axis--y")
          .attr("transform", `translate(${bm.left},${bm.top})`);
      }

      // --- Rate of Change Chart ---
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
          .attr("y", 6)
          .attr("x", 0 - (height / 2 + rm.top))
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .text("Rate (kg/wk)");
      }

      // --- TDEE Difference Chart ---
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
          .attr("y", 6)
          .attr("x", 0 - (height / 2 + tdm.top))
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .text("TDEE Diff (kcal)");
      }

      // --- Correlation Scatter Plot ---
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
        ui.correlationScatterSvg // X Axis Label
          .append("text")
          .attr("class", "axis-label scatter-axis-label-x")
          .attr("x", sm.left + width / 2)
          .attr("y", height + sm.top + sm.bottom - 5)
          .style("text-anchor", "middle")
          .text("Avg Weekly Net Calories (kcal)");
        ui.correlationScatterSvg // Y Axis Label
          .append("text")
          .attr("class", "axis-label scatter-axis-label-y")
          .attr("transform", "rotate(-90)")
          .attr("y", 6)
          .attr("x", 0 - (height / 2 + sm.top))
          .attr("dy", "1em")
          .style("text-anchor", "middle")
          .text("Weekly Rate (kg/wk)");
        ui.scatterDotsGroup = ui.correlationScatterArea
          .append("g")
          .attr("class", "scatter-dots-group");
      }
      console.log("UISetup: SVG element creation finished.");
    },

    // Create D3 scale objects
    createScales() {
      // Use validated dimensions, default to 0 if invalid to avoid errors
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

      // Focus Chart Scales
      scales.x = d3.scaleTime().range([0, focusW]);
      scales.y = d3.scaleLinear().range([focusH, 0]);
      scales.y2 = d3.scaleLinear().range([focusH, 0]); // Second Y Axis

      // Context Chart Scales
      scales.xContext = d3.scaleTime().range([0, contextW]);
      scales.yContext = d3.scaleLinear().range([contextH, 0]);

      // Balance Chart Scales
      scales.xBalance = d3.scaleTime().range([0, balanceW]);
      scales.yBalance = d3.scaleLinear().range([balanceH, 0]);

      // Rate Chart Scales
      scales.xRate = d3.scaleTime().range([0, rateW]);
      scales.yRate = d3.scaleLinear().range([rateH, 0]);

      // TDEE Diff Chart Scales
      scales.xTdeeDiff = d3.scaleTime().range([0, tdeeDiffW]);
      scales.yTdeeDiff = d3.scaleLinear().range([tdeeDiffH, 0]);

      // Scatter Plot Scales
      scales.xScatter = d3.scaleLinear().range([0, scatterW]);
      scales.yScatter = d3.scaleLinear().range([scatterH, 0]);
    },

    // Create D3 axis generator objects
    createAxes() {
      // Use validated dimensions, default to 0 if invalid
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

      // Focus Chart Axes
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

      // Context Chart Axis
      axes.xAxisContext = d3
        .axisBottom(scales.xContext)
        .ticks(Math.max(Math.floor(contextWidth / 100), 2))
        .tickSizeOuter(0)
        .tickFormat(d3.timeFormat("%b '%y"));

      // Helper for secondary axes
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

      // Balance Chart Axes
      axes.xBalanceAxis = createSecondaryAxis(
        scales.xBalance,
        balanceWidth,
        "bottom",
        100,
        null,
      );
      axes.yBalanceAxis = createSecondaryAxis(
        scales.yBalance,
        balanceHeight,
        "left",
        25,
        (d) => (d === 0 ? "0" : d3.format("+,")(d)),
      );

      // Rate Chart Axes
      axes.xRateAxis = createSecondaryAxis(
        scales.xRate,
        rateWidth,
        "bottom",
        100,
        null,
      );
      axes.yRateAxis = createSecondaryAxis(
        scales.yRate,
        rateHeight,
        "left",
        30,
        (d) => Utils.formatValue(d, 2),
      );

      // TDEE Diff Chart Axes
      axes.xTdeeDiffAxis = createSecondaryAxis(
        scales.xTdeeDiff,
        tdeeDiffWidth,
        "bottom",
        100,
        null,
      );
      axes.yTdeeDiffAxis = createSecondaryAxis(
        scales.yTdeeDiff,
        tdeeDiffHeight,
        "left",
        30,
        d3.format("+,"),
      );

      // Scatter Plot Axes
      axes.xScatterAxis = d3
        .axisBottom(scales.xScatter)
        .ticks(5)
        .tickFormat(d3.format("+,"));
      axes.yScatterAxis = d3
        .axisLeft(scales.yScatter)
        .ticks(5)
        .tickFormat((d) => d.toFixed(2));
    },

    // Create D3 brush objects
    createBrushes() {
      // Context Brush
      if (this._dimensions.context.valid && ui.context && !ui.context.empty()) {
        const { width, height } = this._dimensions.context;
        brushes.context = d3
          .brushX()
          .extent([
            [0, 0],
            [width, height],
          ])
          .on("brush end", EventHandlers.contextBrushed); // Use specific handler

        // Append brush group to the context SVG area
        ui.brushGroup = ui.context
          .append("g")
          .attr("class", "brush context-brush")
          .call(brushes.context);
      }

      // Regression Brush (on Focus Chart)
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
          .on("end", EventHandlers.regressionBrushed); // Use specific handler

        ui.regressionBrushGroup.call(brushes.regression);
        // Initially hide the regression brush overlay/handles
        ui.regressionBrushGroup
          .selectAll(".overlay, .selection, .handle")
          .style("display", "none");
      }
    },

    // Create D3 zoom behavior
    createZoom() {
      if (!this._dimensions.focus.valid || !ui.svg || ui.svg.empty()) {
        console.error(
          "UISetup: Cannot create zoom - focus dimensions invalid or SVG missing.",
        );
        return;
      }
      const { width, height } = this._dimensions.focus;

      // Ensure context scale range is available for translateExtent
      const contextRange = scales.xContext?.range() || [0, width]; // Fallback range

      zoom = d3
        .zoom()
        .scaleExtent([0.5, 20]) // Zoom limits
        .extent([
          [0, 0],
          [width, height],
        ]) // Viewport extent for zoom actions
        .translateExtent([
          [contextRange[0], -Infinity],
          [contextRange[1], Infinity],
        ]) // Limit horizontal panning
        .on("zoom.handler", EventHandlers.zoomed); // Attach zoom handler with namespace

      // Attach zoom behavior to the capture rectangle
      if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
        ui.zoomCaptureRect.call(zoom).on("dblclick.zoom", null); // Disable double-click zoom reset
        console.log("UISetup: Zoom behavior initialized.");
      } else {
        console.error(
          "UISetup: Zoom capture rectangle not found, cannot attach zoom behavior.",
        );
      }
    },

    // Main setup function to run all steps
    runAll() {
      console.log("UISetup: Running all setup steps...");
      if (!UISetup.calculateDimensions()) return false; // Stop if dimensions fail
      UISetup.createSVGElements();
      UISetup.createScales();
      UISetup.createAxes();
      UISetup.createBrushes();
      UISetup.createZoom();
      console.log("UISetup: Setup complete.");
      return true; // Indicate success
    },
  };

  // ========================================================================
  // Domain Manager (`DomainManager`) - Calculates and sets scale domains
  // ========================================================================
  const DomainManager = {
    // Sets the domains for all time-based X axes (Focus, Context, Balance, Rate, TDEE)
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

      // Context X domain covers the entire data range
      scales.xContext.domain(fullDataExtent);

      // Set initial focus view (last N months, but not before start of data)
      const initialEndDate = fullDataExtent[1];
      const initialStartDateDefault = d3.timeMonth.offset(
        initialEndDate,
        -CONFIG.initialViewMonths,
      );
      const initialStartDate =
        initialStartDateDefault < fullDataExtent[0]
          ? fullDataExtent[0]
          : initialStartDateDefault;

      // Set initial domain for focus and sync other time-based charts
      const initialXDomain = [initialStartDate, initialEndDate];
      scales.x.domain(initialXDomain);
      scales.xBalance?.domain(initialXDomain);
      scales.xRate?.domain(initialXDomain);
      scales.xTdeeDiff?.domain(initialXDomain);

      return initialXDomain; // Return the initial focus domain
    },

    // Calculates and sets the Y domain for the context chart
    setContextYDomain(processedData) {
      // Base domain on visible SMA or Raw data
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
        const padding = Math.max(0.5, (yMax - yMin) * 0.05); // 5% padding, min 0.5kg
        yMin -= padding;
        yMax += padding;
      }
      scales.yContext.domain([yMin, yMax]).nice();
    },

    // Calculates and sets the Y domains for the focus chart (Y1 and Y2)
    setFocusYDomains(dataForCalculation, regressionResult) {
      // Ensure scales are ready
      if (!scales.y || !scales.y2 || !scales.x) return;

      const yRange = scales.y.range();
      const height =
        yRange[0] > yRange[1]
          ? yRange[0]
          : UISetup._dimensions.focus.height || 200; // Get height from range or dimension cache
      let yMin = Infinity,
        yMax = -Infinity;
      let y2Min = Infinity,
        y2Max = -Infinity; // For second Y axis (BF%)

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
      // Define buffer only if dynamic Y axis is enabled and domain is valid
      const bufferStartDate =
        state.useDynamicYAxis && currentXDomain[0] instanceof Date
          ? d3.timeDay.offset(currentXDomain[0], -CONFIG.domainBufferDays)
          : null;
      const bufferEndDate =
        state.useDynamicYAxis && currentXDomain[1] instanceof Date
          ? d3.timeDay.offset(currentXDomain[1], CONFIG.domainBufferDays)
          : null;

      // Helper to check if a date falls within the potentially buffered view
      const isWithinBufferedView = (date) => {
        if (!state.useDynamicYAxis || !bufferStartDate || !bufferEndDate)
          return true; // Static axis considers all data
        return date >= bufferStartDate && date <= bufferEndDate;
      };

      // Ensure dataForCalculation is an array
      const calculationDataArray = Array.isArray(dataForCalculation)
        ? dataForCalculation
        : [];

      // 1. Consider core data points (SMA/Bounds or Raw) within the view
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

      // 2. Consider Regression Line and CI within the view
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

      // 3. Consider Manual Trendlines within the view
      const trendConfig = DataService.getTrendlineConfigFromUI();
      if (trendConfig.isValid) {
        // Determine dates within the view (or fallback if view is outside all data)
        let datesToCheck = calculationDataArray
          .map((d) => d.date)
          .filter(isWithinBufferedView);
        if (datesToCheck.length === 0 && state.processedData.length > 0) {
          // If view is outside data range, check first/last point of full data
          datesToCheck = [
            state.processedData[0].date,
            state.processedData[state.processedData.length - 1].date,
          ].filter(isWithinBufferedView);
        }
        if (datesToCheck.length === 0 && state.processedData.length > 0) {
          // If still no dates, maybe check just the start/end of the view range itself against the trend
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

      // 4. Consider Goal Line within the view
      if (state.seriesVisibility.goal && state.goal.weight != null) {
        // Goal weight value itself is always a potential min/max
        updateExtent(state.goal.weight);
        // Consider the starting point of the goal line if it's within view
        const lastSmaPoint = [...state.processedData]
          .reverse()
          .find((d) => d.sma != null);
        if (lastSmaPoint?.date && isWithinBufferedView(lastSmaPoint.date)) {
          updateExtent(lastSmaPoint.sma);
        }
        // Consider the goal date point if it exists and is within view
        if (state.goal.date && isWithinBufferedView(state.goal.date)) {
          updateExtent(state.goal.weight); // The value at the goal date is the goal weight
        }
      }

      // 5. Consider Expected Weight Line within the view
      if (state.seriesVisibility.expected) {
        const expectedLinePoints = DomainManager._getExpectedWeightPoints();
        expectedLinePoints.forEach((p) => {
          if (p.date && isWithinBufferedView(p.date)) {
            updateExtent(p.weight);
          }
        });
      }

      // --- Finalize Y1 Domain (Weight) ---
      if (yMin === Infinity || yMax === -Infinity) {
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
        yMin -= CONFIG.yAxisMinPaddingKg * 2; // Give more padding if only one value
        yMax += CONFIG.yAxisMinPaddingKg * 2;
      } else {
        const padding = Math.max(
          CONFIG.yAxisMinPaddingKg,
          (yMax - yMin) * CONFIG.yAxisPaddingFactor,
        );
        yMin -= padding;
        yMax += padding;
      }
      // Ensure domain is valid before setting
      if (!isNaN(yMin) && !isNaN(yMax)) {
        scales.y
          .domain([yMin, yMax])
          .nice(Math.max(Math.floor(height / 40), 5));
      } else {
        console.error("DomainManager: Calculated invalid Y1 domain", [
          yMin,
          yMax,
        ]);
        scales.y.domain([60, 80]).nice(); // Fallback if calculation failed
      }

      // --- Finalize Y2 Domain (Body Fat %) ---
      if (state.seriesVisibility.bf) {
        if (y2Min === Infinity || y2Max === -Infinity) {
          [y2Min, y2Max] = [10, 30]; // Example fallback for BF%
        } else if (y2Min === y2Max) {
          y2Min -= 1; // Min 1% padding
          y2Max += 1;
        } else {
          const padding = Math.max(0.5, (y2Max - y2Min) * 0.05); // 5% padding, min 0.5%
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
          scales.y2.domain([0, 100]).nice(); // Fallback
        }
      } else {
        scales.y2.domain([0, 100]); // Default hidden domain
      }
    },

    // Sets Y domains for secondary charts (Balance, Rate, TDEE Diff)
    setSecondaryYDomains(visibleData) {
      // Balance Chart Y Domain (Symmetric around 0)
      if (scales.yBalance) {
        const maxAbsBalance =
          d3.max(visibleData, (d) => Math.abs(d.netBalance ?? 0)) ?? 0;
        const yBalanceDomainMax =
          maxAbsBalance > 100 ? maxAbsBalance * 1.1 : 500; // Add 10% padding or set min
        scales.yBalance.domain([-yBalanceDomainMax, yBalanceDomainMax]).nice();
      }

      // Rate of Change Chart Y Domain
      if (scales.yRate) {
        const rateExtent = d3.extent(visibleData, (d) => d.smoothedWeeklyRate);
        let [yRateMin, yRateMax] = rateExtent;
        if (
          yRateMin == null ||
          yRateMax == null ||
          isNaN(yRateMin) ||
          isNaN(yRateMax)
        )
          [yRateMin, yRateMax] = [-0.5, 0.5]; // Fallback
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

      // TDEE Difference Chart Y Domain
      if (scales.yTdeeDiff) {
        const diffExtent = d3.extent(visibleData, (d) => d.avgTdeeDifference);
        let [yDiffMin, yDiffMax] = diffExtent;
        if (
          yDiffMin == null ||
          yDiffMax == null ||
          isNaN(yDiffMin) ||
          isNaN(yDiffMax)
        )
          [yDiffMin, yDiffMax] = [-300, 300]; // Fallback
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

    // Sets domain for Scatter Plot axes
    setScatterPlotDomains(scatterData) {
      if (!scales.xScatter || !scales.yScatter) return;

      if (!Array.isArray(scatterData) || scatterData.length === 0) {
        scales.xScatter.domain([-500, 500]).nice();
        scales.yScatter.domain([-0.5, 0.5]).nice();
        return;
      }

      const xExtent = d3.extent(scatterData, (d) => d.avgNetCal);
      const yExtent = d3.extent(scatterData, (d) => d.weeklyRate);

      // Ensure extents are valid numbers before calculating padding
      const [xMinRaw, xMaxRaw] = xExtent;
      const [yMinRaw, yMaxRaw] = yExtent;
      const xMin = xMinRaw == null || isNaN(xMinRaw) ? 0 : xMinRaw;
      const xMax = xMaxRaw == null || isNaN(xMaxRaw) ? 0 : xMaxRaw;
      const yMin = yMinRaw == null || isNaN(yMinRaw) ? 0 : yMinRaw;
      const yMax = yMaxRaw == null || isNaN(yMaxRaw) ? 0 : yMaxRaw;

      const xRange = xMax - xMin;
      const yRange = yMax - yMin;

      // Add padding (10%), ensuring a minimum padding if range is zero or data is missing
      const xPadding = xRange === 0 ? 500 : Math.max(100, xRange * 0.1);
      const yPadding = yRange === 0 ? 0.5 : Math.max(0.1, yRange * 0.1);

      scales.xScatter.domain([xMin - xPadding, xMax + xPadding]).nice();
      scales.yScatter.domain([yMin - yPadding, yMax + yPadding]).nice();
    },

    // Helper to calculate points for expected weight line (used in Y domain calc)
    _getExpectedWeightPoints() {
      let lineData = [];
      if (
        Array.isArray(state.processedData) &&
        state.processedData.length > 0
      ) {
        let startingWeight = null;
        let startingWeightIndex = -1;
        // Find first point with SMA or value
        for (let i = 0; i < state.processedData.length; i++) {
          const d = state.processedData[i];
          if (d.sma != null && !isNaN(d.sma)) {
            startingWeight = d.sma;
            startingWeightIndex = i;
            break;
          } else if (d.value != null && !isNaN(d.value)) {
            startingWeight = d.value;
            startingWeightIndex = i;
            break; // Use first raw value if no SMA found yet
          }
        }

        if (startingWeight != null && startingWeightIndex !== -1) {
          let cumulativeChange = 0;
          lineData.push({
            date: state.processedData[startingWeightIndex].date,
            weight: startingWeight,
          });
          for (
            let i = startingWeightIndex + 1;
            i < state.processedData.length;
            i++
          ) {
            const change = state.processedData[i].expectedWeightChange;
            if (change != null && !isNaN(change)) {
              cumulativeChange += change;
            }
            // Only add point if weight is valid
            const expectedWeight = startingWeight + cumulativeChange;
            if (!isNaN(expectedWeight)) {
              lineData.push({
                date: state.processedData[i].date,
                weight: expectedWeight,
              });
            }
          }
        }
      }
      return lineData;
    },

    // Set initial domains for all charts and configure initial view
    initializeDomains(processedData) {
      console.log("DomainManager: Initializing domains...");
      // Set Context Y domain first, as Focus might use it as fallback
      DomainManager.setContextYDomain(processedData);

      // Set X domains and get the initial focus range
      const initialXDomain = DomainManager.setXDomains(processedData);

      // Filter data based on initial focus X domain for initial Y calc
      const initialVisibleData = processedData.filter(
        (d) => d.date >= initialXDomain[0] && d.date <= initialXDomain[1],
      );

      // Calculate initial regression for Y domain setting
      // Use the stored state for regression start date, which was potentially set by UI input handling during init
      const initialRegression = DataService.calculateLinearRegression(
        initialVisibleData.filter((d) => !d.isOutlier && d.value != null),
        state.regressionStartDate, // Use state value
      );

      // Set Focus Y domains (handles dynamic pref internally)
      DomainManager.setFocusYDomains(initialVisibleData, initialRegression);

      // Set domains for secondary charts based on initial visible data
      DomainManager.setSecondaryYDomains(initialVisibleData);

      // Set domains for scatter plot based on *full* dataset's weekly stats
      const allWeeklyStats = StatsManager.calculateWeeklyStats(
        processedData,
        null,
        null,
      ); // Calculate for all data initially
      state.correlationScatterData = allWeeklyStats.filter(
        (w) => w.avgNetCal != null && w.weeklyRate != null,
      );
      DomainManager.setScatterPlotDomains(state.correlationScatterData);

      console.log("DomainManager: Domain initialization complete.");
    },

    // Update domains during interaction (zoom/pan/brush)
    updateDomainsOnInteraction() {
      // 1. Get current X domain from focus chart
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

      // 2. Filter data based on current X domain for calculations
      state.filteredData = state.processedData.filter(
        (d) => d.date >= currentXDomain[0] && d.date <= currentXDomain[1],
      );

      // 3. Recalculate regression based on effective range (interactive or analysis)
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
          regressionRange.start, // Use the effective start date
        );
      } else {
        // Handle case where effective range might be invalid
        regressionResult = {
          slope: null,
          intercept: null,
          points: [],
          pointsWithCI: [],
        };
      }

      // 4. Recalculate Focus Y domains (handles dynamic Y axis logic internally)
      // Pass filtered data if dynamic, full data if static
      const dataForYCalc = state.useDynamicYAxis
        ? state.filteredData
        : state.processedData;
      DomainManager.setFocusYDomains(dataForYCalc, regressionResult);

      // 5. Sync X domains of secondary charts
      scales.xBalance?.domain(currentXDomain);
      scales.xRate?.domain(currentXDomain);
      scales.xTdeeDiff?.domain(currentXDomain);

      // 6. Update Y domains of secondary charts based on *visible* data
      DomainManager.setSecondaryYDomains(state.filteredData);

      // Note: Scatter plot domain typically only updates when analysis range changes,
      // unless you want it to dynamically update with zoom/pan (less common).
    },
  };

  // ========================================================================
  // Chart Updaters (Rendering Logic)
  // ========================================================================

  // --- Focus Chart Updater ---
  const FocusChartUpdater = {
    updateAxes() {
      // Check if dimensions are valid before proceeding
      if (!UISetup._dimensions?.focus?.valid) return;

      const dur = CONFIG.transitionDurationMs;
      const { width, height } = UISetup._dimensions.focus;

      // Ensure axis generators are available
      if (!axes.xAxis || !axes.yAxis || !axes.yAxis2) return;

      // Main X Axis
      ui.xAxisGroup?.transition().duration(dur).call(axes.xAxis);

      // Main Y Axis (Left)
      ui.yAxisGroup?.transition().duration(dur).call(axes.yAxis);

      // Y Grid Lines (aligned with left Y axis)
      // Ensure ticks are available from the primary Y axis generator
      const yTicks = axes.yAxis.scale().ticks(axes.yAxis.ticks()[0]);
      ui.gridGroup?.transition().duration(dur).call(
        d3
          .axisLeft(scales.y) // Use the left scale
          .tickSize(-width) // Extend lines across chart width
          .tickFormat("") // No labels on grid lines
          .tickValues(yTicks), // Use the same tick values as the Y axis
      );
      ui.gridGroup?.selectAll(".domain").remove(); // Remove axis line from grid

      // Second Y Axis (Right - BF%)
      const showY2 = state.seriesVisibility.bf;
      ui.yAxisGroup2
        ?.style("display", showY2 ? null : "none") // Toggle visibility first
        .transition()
        .duration(dur)
        .call(axes.yAxis2);
      ui.svg?.select(".y-axis-label2").style("display", showY2 ? null : "none");
    },

    updatePaths(visibleValidSmaData, regressionResult) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.chartArea) return;

      // --- Generators ---
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
        ); // Add NaN checks

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
        ); // Add NaN checks

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
            // Return a valid pixel value or rely on .defined()
            return weight != null && !isNaN(weight) ? scales.y(weight) : NaN; // Use NaN for undefined points
          })
          .defined((d) => {
            const weight = DataService.calculateTrendWeight(
              startDate,
              initialWeight,
              weeklyIncrease,
              d.date,
            );
            // Check date, weight validity, and scale output validity
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
        .defined((d) => !isNaN(scales.x(d.date)) && !isNaN(scales.y(d.weight))); // Add NaN checks

      const expectedLineGen = d3
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y(d.weight))
        .defined(
          (d) =>
            d.weight != null &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.weight)),
        );

      const bfLineGen = d3 // Body Fat Line Generator
        .line()
        .x((d) => scales.x(d.date))
        .y((d) => scales.y2(d.bfPercent)) // Use the SECOND Y-axis scale
        .defined(
          (d) =>
            d.bfPercent != null &&
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y2(d.bfPercent)),
        ); // Add NaN checks

      // --- Update Selections ---
      // SMA Band and Line
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

      // Regression Line and CI Area
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

      // Manual Trend Lines
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

      // Goal Line
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
          // Check if lastSmaPoint and its date are valid
          const startDate = lastSmaPoint.date;
          const startWeight = lastSmaPoint.sma;
          // If goal date exists, use it, otherwise extend to chart edge
          const endDateRaw = state.goal.date
            ? state.goal.date
            : scales.x?.domain()?.[1];
          // Ensure endDate is valid and after startDate
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

      // Expected Weight Line
      const expectedLinePoints = DomainManager._getExpectedWeightPoints();
      ui.expectedLine
        ?.datum(state.seriesVisibility.expected ? expectedLinePoints : [])
        .transition()
        .duration(dur)
        .style(
          "display",
          state.seriesVisibility.expected && expectedLinePoints.length > 0
            ? null
            : "none",
        )
        .attr("d", expectedLineGen);

      // Body Fat Line
      ui.bfLine
        ?.datum(state.seriesVisibility.bf ? state.filteredData : []) // Use filtered data
        .transition()
        .duration(dur)
        .style("display", state.seriesVisibility.bf ? null : "none")
        .attr("d", bfLineGen);
    },

    updateDots(visibleRawWeightData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.rawDotsGroup || !ui.smaDotsGroup) return;
      // Ensure scales are ready
      if (!scales.x || !scales.y) return;

      const showRaw = state.seriesVisibility.raw;
      const showSmaDots = state.seriesVisibility.sma; // Interactive dots tied to SMA visibility

      // --- Raw Data Dots (Non-interactive background dots) ---
      ui.rawDotsGroup?.style("display", showRaw ? null : "none");
      if (showRaw && ui.rawDotsGroup) {
        const rawDotsDataValid = visibleRawWeightData.filter(
          (d) =>
            d.value != null &&
            d.date instanceof Date &&
            !isNaN(d.date) && // Check date validity
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.value)), // Check scale output validity
        );
        const rawDots = ui.rawDotsGroup
          .selectAll(".raw-dot")
          .data(rawDotsDataValid, (d) => d.dateString || d.date); // Use dateString if available for stability

        rawDots.join(
          (enter) =>
            enter
              .append("circle")
              .attr("class", "raw-dot")
              .attr("r", CONFIG.rawDotRadius)
              .attr("cx", (d) => scales.x(d.date))
              .attr("cy", (d) => scales.y(d.value))
              .style("fill", colors.rawDot) // Explicitly set color
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
        ui.rawDotsGroup?.selectAll(".raw-dot").remove(); // Clear if hidden
      }

      // --- SMA/Interactive Dots ---
      ui.smaDotsGroup?.style("display", showSmaDots ? null : "none");
      if (showSmaDots && ui.smaDotsGroup) {
        // Data for interactive dots: All visible points with a *raw* value and valid scale output
        const smaDotsDataValid = visibleRawWeightData.filter(
          (d) =>
            d.value != null &&
            d.date instanceof Date &&
            !isNaN(d.date) && // Check date validity
            !isNaN(scales.x(d.date)) &&
            !isNaN(scales.y(d.value)), // Check scale output validity
        );

        const smaDots = ui.smaDotsGroup
          .selectAll(".dot")
          .data(smaDotsDataValid, (d) => d.dateString || d.date);

        smaDots.join(
          (enter) =>
            enter
              .append("circle")
              .attr("class", "dot") // Base class
              .classed("outlier", (d) => d.isOutlier)
              .attr("r", CONFIG.dotRadius)
              .attr("cx", (d) => scales.x(d.date))
              .attr("cy", (d) => scales.y(d.value)) // Position based on raw value
              .style("fill", (d) => (d.isOutlier ? colors.outlier : colors.dot)) // Color based on outlier status
              .style("opacity", 0)
              .on("mouseover", EventHandlers.dotMouseOver) // Attach handlers
              .on("mouseout", EventHandlers.dotMouseOut)
              .on("click", EventHandlers.dotClick)
              .call((enter) =>
                enter.transition().duration(dur).style("opacity", 0.7),
              ),
          (update) =>
            update
              .classed("outlier", (d) => d.isOutlier) // Update outlier class
              .classed(
                "highlighted", // Update highlight class
                (d) =>
                  state.highlightedDate &&
                  d.date.getTime() === state.highlightedDate.getTime(),
              )
              .call((update) =>
                update
                  .transition()
                  .duration(dur)
                  .attr("cx", (d) => scales.x(d.date))
                  .attr("cy", (d) => scales.y(d.value)) // Update position
                  .style("fill", (d) =>
                    d.isOutlier ? colors.outlier : colors.dot,
                  ) // Update color
                  .attr(
                    "r",
                    (
                      d, // Update radius based on highlight
                    ) =>
                      state.highlightedDate &&
                      d.date.getTime() === state.highlightedDate.getTime()
                        ? CONFIG.dotRadius *
                          CONFIG.highlightRadiusMultiplier *
                          0.8 // Slightly smaller multiplier than highlight ring
                        : CONFIG.dotRadius,
                  )
                  .style(
                    "opacity",
                    (
                      d, // Update opacity based on highlight
                    ) =>
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
        ui.smaDotsGroup?.selectAll(".dot").remove(); // Clear if hidden
      }
    },

    updateHighlightMarker(visibleRawWeightData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.highlightGroup) return;
      // Ensure scales are ready
      if (!scales.x || !scales.y) return;

      // Find the data point corresponding to the highlighted date
      const highlightDataPoint = state.highlightedDate
        ? visibleRawWeightData.find(
            (d) =>
              d.value != null &&
              d.date instanceof Date &&
              d.date.getTime() === state.highlightedDate.getTime() && // Match date
              !isNaN(scales.x(d.date)) &&
              !isNaN(scales.y(d.value)), // Ensure valid coords
          )
        : null;

      const highlightMarker = ui.highlightGroup
        .selectAll(".highlight-marker")
        .data(highlightDataPoint ? [highlightDataPoint] : [], (d) => d.date); // Use date as key

      highlightMarker.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "highlight-marker")
            .attr("r", 0) // Start radius at 0
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value)) // Position based on raw value
            .style("fill", "none")
            .style("stroke", colors.highlightStroke)
            .style("stroke-width", "2.5px")
            .style("pointer-events", "none") // Ensure marker doesn't block interaction
            .style("opacity", 0)
            .call((enter) =>
              enter
                .transition()
                .duration(dur * 0.8) // Faster appearance
                .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier)
                .style("opacity", 0.8),
            ),
        (update) =>
          update
            .transition()
            .duration(dur) // Smooth transition if date changes while highlighted
            .attr("cx", (d) => scales.x(d.date))
            .attr("cy", (d) => scales.y(d.value))
            .attr("r", CONFIG.dotRadius * CONFIG.highlightRadiusMultiplier) // Ensure correct size
            .style("opacity", 0.8), // Ensure correct opacity
        (exit) =>
          exit
            .transition()
            .duration(dur / 2) // Faster disappearance
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
      // Ensure scales are ready
      if (!scales.x || !scales.y || !UISetup._dimensions?.focus?.valid) return;

      const xPos = scales.x(hoverData.date);
      // Use raw value for crosshair Y position if available, else SMA
      const yValue = hoverData.value ?? hoverData.sma;
      const yPos = yValue != null ? scales.y(yValue) : null;

      const { width, height } = UISetup._dimensions.focus;

      // Check if position is within the chart bounds and valid
      if (
        yPos != null &&
        isFinite(xPos) &&
        isFinite(yPos) &&
        xPos >= 0 &&
        xPos <= width &&
        yPos >= 0 &&
        yPos <= height
      ) {
        ui.crosshairGroup.style("display", null); // Show group
        // Update horizontal line (Y position) - Use transform for potential perf benefit
        ui.crosshairGroup
          .select(".crosshair.crosshair-y")
          .attr("transform", `translate(0, ${yPos})`);
        // Update vertical line (X position)
        ui.crosshairGroup
          .select(".crosshair.crosshair-x")
          .attr("transform", `translate(${xPos}, 0)`);
      } else {
        ui.crosshairGroup.style("display", "none"); // Hide if outside bounds
      }
    },

    updateAnnotations(visibleData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.annotationsGroup || !scales.x || !scales.y) return;

      const annotationData = state.seriesVisibility.annotations
        ? state.annotations
        : [];
      const xDomain = scales.x.domain();

      // Filter for annotations within the current view
      const visibleAnnotations = annotationData.filter((a) => {
        const date = new Date(a.date); // Assume date is stored as YYYY-MM-DD
        // Ensure date is valid before comparison
        return (
          !isNaN(date.getTime()) &&
          date >= xDomain[0] &&
          date <= xDomain[1] &&
          a.type === "point"
        );
      });

      // Function to find the Y value (SMA or raw) for a given date
      const findYValue = (targetDate) => {
        // Ensure targetDate is valid
        if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
          return null;
        const targetTime = targetDate.getTime();
        const pointData = visibleData.find(
          (d) => d.date instanceof Date && d.date.getTime() === targetTime,
        );
        const yVal = pointData ? (pointData.sma ?? pointData.value) : null;
        // Ensure the resulting yValue is valid for the scale
        return yVal != null && !isNaN(scales.y(yVal)) ? yVal : null;
      };

      const markers = ui.annotationsGroup
        .selectAll(".annotation-marker-group") // Select the group
        .data(visibleAnnotations, (d) => d.id);

      markers.join(
        (enter) => {
          const group = enter
            .append("g")
            .attr("class", "annotation-marker-group")
            .style("opacity", 0); // Start transparent

          group.attr("transform", (d) => {
            const yValue = findYValue(new Date(d.date));
            return yValue != null
              ? `translate(${scales.x(new Date(d.date))}, ${scales.y(yValue)})`
              : `translate(-1000, -1000)`; // Position off-screen if Y not found
          });

          // Append the circle inside the group
          group
            .append("circle")
            .attr("class", "annotation-marker")
            .attr("r", CONFIG.annotationMarkerRadius)
            .style("fill", colors.annotationMarker)
            .style("stroke", "var(--bg-secondary)") // Use CSS var for background contrast
            .style("stroke-width", 1.5);

          // Add mouse events to the group for easier hovering
          group
            .on("mouseover", EventHandlers.annotationMouseOver)
            .on("mouseout", EventHandlers.annotationMouseOut);

          // Fade in the group
          group.transition().duration(dur).style("opacity", 1);

          return group;
        },
        (update) =>
          update
            .transition()
            .duration(dur)
            .style("opacity", 1) // Ensure opacity is 1 on update
            .attr("transform", (d) => {
              // Update position smoothly
              const yValue = findYValue(new Date(d.date));
              return yValue != null
                ? `translate(${scales.x(new Date(d.date))}, ${scales.y(yValue)})`
                : `translate(-1000, -1000)`; // Move off-screen if Y not found
            }),
        (exit) =>
          exit
            .transition()
            .duration(dur / 2)
            .style("opacity", 0)
            .attr("transform", `translate(-1000, -1000)`) // Move off-screen before removing
            .remove(),
      );

      // Future: Handle range annotations (e.g., rects) here if implemented
    },

    updatePlateauRegions() {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.plateauGroup || !scales.x || !UISetup._dimensions?.focus?.valid)
        return;

      const plateauData = state.seriesVisibility.plateaus ? state.plateaus : [];
      const xDomain = scales.x.domain();
      const { height } = UISetup._dimensions.focus;

      // Filter for plateaus intersecting the current view
      const visiblePlateaus = plateauData.filter(
        (p) =>
          p.endDate instanceof Date &&
          p.startDate instanceof Date && // Ensure valid dates
          p.endDate >= xDomain[0] &&
          p.startDate <= xDomain[1],
      );

      const regions = ui.plateauGroup
        .selectAll(".plateau-region")
        .data(visiblePlateaus, (d) => `${d.startDate}-${d.endDate}`); // Unique key

      regions.join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "plateau-region")
            .attr("x", (d) => scales.x(d.startDate))
            .attr("y", 0)
            // Calculate width ensuring start/end points are valid on scale
            .attr("width", (d) => {
              const xStart = scales.x(d.startDate);
              const xEnd = scales.x(d.endDate);
              return !isNaN(xStart) && !isNaN(xEnd)
                ? Math.max(0, xEnd - xStart)
                : 0;
            })
            .attr("height", height)
            .style("fill", colors.plateauColor)
            .style("pointer-events", "none") // Don't block interactions
            .style("opacity", 0)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.15),
            ), // Target opacity
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

      // Find Y value (SMA or raw) for a given date in the processed data
      const findYValue = (targetDate) => {
        // Ensure targetDate is valid
        if (!(targetDate instanceof Date) || isNaN(targetDate.getTime()))
          return null;
        const targetTime = targetDate.getTime();
        const pointData = processedData.find(
          (d) => d.date instanceof Date && d.date.getTime() === targetTime,
        );
        const yVal = pointData ? (pointData.sma ?? pointData.value) : null;
        // Ensure the resulting yValue is valid for the scale
        return yVal != null && !isNaN(scales.y(yVal)) ? yVal : null;
      };

      // Filter for markers within the current view
      const visibleMarkers = markerData.filter(
        (p) => p.date >= xDomain[0] && p.date <= xDomain[1],
      );

      // Define the symbol (triangle)
      const markerSize = 6;
      const markerPath = d3
        .symbol()
        .type(d3.symbolTriangle)
        .size(markerSize * markerSize * 1.5); // Adjust size as needed

      const markers = ui.trendChangeGroup
        .selectAll(".trend-change-marker-group") // Select the group
        .data(visibleMarkers, (d) => d.date); // Key by date

      markers.join(
        (enter) => {
          const group = enter
            .append("g")
            .attr("class", "trend-change-marker-group")
            .style("opacity", 0);

          group.attr("transform", (d) => {
            const yValue = findYValue(d.date);
            const rotation = d.magnitude > 0 ? 180 : 0; // Point up for accel, down for decel
            return yValue != null
              ? `translate(${scales.x(d.date)}, ${scales.y(yValue)}) rotate(${rotation})`
              : `translate(-1000, -1000)`; // Hide off-screen
          });

          // Append the path inside the group
          group
            .append("path")
            .attr("class", "trend-change-marker")
            .attr("d", markerPath)
            .style("fill", colors.trendChangeColor);

          // Add mouse events to the group
          group
            .on("mouseover", EventHandlers.trendChangeMouseOver)
            .on("mouseout", EventHandlers.trendChangeMouseOut);

          // Fade in
          group.transition().duration(dur).style("opacity", 1);

          return group;
        },
        (update) =>
          update
            .transition()
            .duration(dur)
            .style("opacity", 1)
            .attr("transform", (d) => {
              // Update position and rotation smoothly
              const yValue = findYValue(d.date);
              const rotation = d.magnitude > 0 ? 180 : 0;
              return yValue != null
                ? `translate(${scales.x(d.date)}, ${scales.y(yValue)}) rotate(${rotation})`
                : `translate(-1000, -1000)`; // Move off-screen
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
      const { width, height } = UISetup._dimensions.focus;

      if (range.start instanceof Date && range.end instanceof Date) {
        // Ensure dates are valid before scaling
        if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) {
          ui.regressionBrushGroup
            .selectAll(".overlay, .selection, .handle")
            .style("display", "none");
          if (d3.brushSelection(ui.regressionBrushGroup.node())) {
            ui.regressionBrushGroup.call(brushes.regression.move, null);
          }
          return;
        }

        // Calculate pixel positions, clamping to the visible range
        const pixelStart = Math.max(0, Math.min(width, scales.x(range.start)));
        const pixelEnd = Math.max(0, Math.min(width, scales.x(range.end)));

        // Only show brush if the range meaningfully overlaps the current view and is valid
        if (
          pixelEnd > pixelStart &&
          pixelEnd > 0 &&
          pixelStart < width &&
          !isNaN(pixelStart) &&
          !isNaN(pixelEnd)
        ) {
          // Show overlay and handles
          ui.regressionBrushGroup
            .selectAll(".overlay, .selection, .handle")
            .style("display", null);

          // Move brush selection silently if it differs from the current visual state
          const currentSelection = d3.brushSelection(
            ui.regressionBrushGroup.node(),
          );
          // Use a tolerance for floating point comparison
          const tolerance = 1; // 1 pixel tolerance
          if (
            !currentSelection ||
            Math.abs(currentSelection[0] - pixelStart) > tolerance ||
            Math.abs(currentSelection[1] - pixelEnd) > tolerance
          ) {
            // Prevent triggering listener during programmatic move
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
          // Range is outside the current view, hide the brush elements
          ui.regressionBrushGroup
            .selectAll(".overlay, .selection, .handle")
            .style("display", "none");
          // Clear the visual selection if it exists
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
        // No interactive range is active, hide brush elements
        ui.regressionBrushGroup
          .selectAll(".overlay, .selection, .handle")
          .style("display", "none");
        // Clear the visual selection if it exists
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

  // --- Context Chart Updater ---
  const ContextChartUpdater = {
    updateAxes() {
      // Ensure axis generator is available
      if (!axes.xAxisContext) return;
      ui.contextXAxisGroup?.call(axes.xAxisContext);
    },

    updateChart(processedData) {
      // Ensure elements and scales are ready
      if (
        !ui.contextArea ||
        !ui.contextLine ||
        !scales.xContext ||
        !scales.yContext
      )
        return;

      // Generator using SMA if available, falling back to raw value
      const contextValueAccessor = (d) => d.sma ?? d.value;

      const contextAreaGen = d3
        .area()
        .curve(d3.curveMonotoneX)
        .x((d) => scales.xContext(d.date))
        .y0(scales.yContext.range()[0]) // Bottom of chart
        .y1((d) => scales.yContext(contextValueAccessor(d)))
        .defined(
          (d) =>
            contextValueAccessor(d) != null &&
            !isNaN(scales.xContext(d.date)) &&
            !isNaN(scales.yContext(contextValueAccessor(d))),
        ); // Add NaN checks

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

      // Apply generators (no transition needed for context usually)
      ui.contextArea?.datum(processedData).attr("d", contextAreaGen);
      ui.contextLine?.datum(processedData).attr("d", contextLineGen);
    },
  };

  // --- Balance Chart Updater ---
  const BalanceChartUpdater = {
    updateAxes() {
      // Check if dimensions/axes are valid
      if (
        !UISetup._dimensions?.balance?.valid ||
        !axes.xBalanceAxis ||
        !axes.yBalanceAxis
      )
        return;

      const dur = CONFIG.transitionDurationMs;
      // Update Y Axis (domain changes)
      ui.balanceYAxisGroup?.transition().duration(dur).call(axes.yBalanceAxis);
      ui.balanceYAxisGroup?.select(".domain").remove(); // Remove Y axis line

      // Update X Axis (domain changes, but labels are hidden)
      ui.balanceXAxisGroup
        ?.transition()
        .duration(dur)
        .call((g) => {
          axes.xBalanceAxis(g);
          g.selectAll("text").remove(); // Ensure labels are removed
        });
    },

    updateChart(visibleData) {
      const dur = CONFIG.transitionDurationMs;
      // Ensure elements and scales are ready
      if (
        !ui.balanceChartArea ||
        !scales.xBalance ||
        !scales.yBalance ||
        !UISetup._dimensions?.balance?.valid
      )
        return;

      const { width } = UISetup._dimensions.balance;
      const yZero = scales.yBalance(0); // Cache zero position

      // Ensure yZero is a valid number
      if (isNaN(yZero)) {
        console.error("BalanceChartUpdater: Invalid Y=0 position.");
        return;
      }

      // Update Zero Line position based on current Y scale
      ui.balanceZeroLine
        ?.transition()
        .duration(dur)
        .attr("y1", yZero)
        .attr("y2", yZero);

      // --- Update Bars ---
      // Filter for valid data points with valid scale outputs
      const validBarData = visibleData.filter(
        (d) =>
          d.netBalance != null &&
          !isNaN(d.netBalance) &&
          d.date instanceof Date &&
          !isNaN(d.date) &&
          !isNaN(scales.xBalance(d.date)) &&
          !isNaN(scales.yBalance(d.netBalance)),
      );

      // Calculate bar width dynamically, ensuring a minimum width
      const barWidth = Math.max(
        1,
        width / Math.max(1, validBarData.length) - 1,
      ); // Avoid division by zero

      const bars = ui.balanceChartArea
        .selectAll(".balance-bar")
        .data(validBarData, (d) => d.dateString || d.date); // Key by date

      bars.join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "balance-bar") // Apply base class
            .classed("deficit", (d) => d.netBalance < 0)
            .classed("surplus", (d) => d.netBalance >= 0)
            .attr("x", (d) => scales.xBalance(d.date) - barWidth / 2)
            .attr("y", yZero) // Start at zero line
            .attr("width", barWidth)
            .attr("height", 0) // Start with zero height
            .style("fill", (d) =>
              d.netBalance >= 0 ? colors.surplus : colors.deficit,
            ) // Use defined colors
            .call(
              (
                enter, // Animate entrance
              ) =>
                enter
                  .transition()
                  .duration(dur)
                  .attr(
                    "y",
                    (
                      d, // Animate Y position
                    ) =>
                      d.netBalance >= 0 ? scales.yBalance(d.netBalance) : yZero,
                  )
                  .attr(
                    "height",
                    (
                      d, // Animate height
                    ) => Math.abs(scales.yBalance(d.netBalance) - yZero),
                  ),
            ),
        (update) =>
          update
            .classed("deficit", (d) => d.netBalance < 0) // Update classes
            .classed("surplus", (d) => d.netBalance >= 0)
            .style("fill", (d) =>
              d.netBalance >= 0 ? colors.surplus : colors.deficit,
            ) // Update color
            .call(
              (
                update, // Animate updates
              ) =>
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
          exit.call(
            (
              exit, // Animate exit
            ) =>
              exit
                .transition()
                .duration(dur / 2) // Faster exit
                .attr("y", yZero)
                .attr("height", 0)
                .remove(),
          ),
      );
    },
  };

  // --- Rate of Change Chart Updater ---
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
      ui.rateXAxisGroup
        ?.transition()
        .duration(dur)
        .call((g) => {
          axes.xRateAxis(g);
          g.selectAll("text").remove();
        });
    },

    updateChart(visibleData) {
      const dur = CONFIG.transitionDurationMs;
      if (!ui.rateChartArea || !scales.xRate || !scales.yRate) return;

      const yZero = scales.yRate(0);
      if (isNaN(yZero)) {
        console.error("RateChartUpdater: Invalid Y=0 position.");
        return;
      }

      // Update Zero Line
      ui.rateZeroLine
        ?.transition()
        .duration(dur)
        .attr("y1", yZero)
        .attr("y2", yZero);

      // Update Rate Line
      const rateLineGen = d3
        .line()
        .x((d) => scales.xRate(d.date))
        .y((d) => scales.yRate(d.smoothedWeeklyRate))
        .defined(
          (d) =>
            d.smoothedWeeklyRate != null &&
            !isNaN(scales.xRate(d.date)) &&
            !isNaN(scales.yRate(d.smoothedWeeklyRate)),
        ); // Add NaN check

      ui.rateLine
        ?.datum(visibleData) // Use only data visible in the main chart
        .transition()
        .duration(dur)
        .attr("d", rateLineGen);
    },
  };

  // --- TDEE Difference Chart Updater ---
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
        .call((g) => {
          axes.xTdeeDiffAxis(g);
          g.selectAll("text").remove();
        });
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

      // Update Zero Line
      ui.tdeeDiffZeroLine
        ?.transition()
        .duration(dur)
        .attr("y1", yZero)
        .attr("y2", yZero);

      // Update TDEE Difference Line
      const tdeeDiffLineGen = d3
        .line()
        .x((d) => scales.xTdeeDiff(d.date))
        .y((d) => scales.yTdeeDiff(d.avgTdeeDifference)) // Plot smoothed difference
        .defined(
          (d) =>
            d.avgTdeeDifference != null &&
            !isNaN(scales.xTdeeDiff(d.date)) &&
            !isNaN(scales.yTdeeDiff(d.avgTdeeDifference)),
        ); // Add NaN check

      ui.tdeeDiffLine
        ?.datum(visibleData) // Use only data visible in the main chart
        .transition()
        .duration(dur)
        .attr("d", tdeeDiffLineGen);
    },
  };

  // --- Correlation Scatter Plot Updater ---
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

      // Ensure scatterData is an array, default to empty if not
      const validScatterData = (
        Array.isArray(scatterData) ? scatterData : []
      ).filter(
        (d) =>
          d.avgNetCal != null &&
          !isNaN(d.avgNetCal) &&
          d.weeklyRate != null &&
          !isNaN(d.weeklyRate) &&
          !isNaN(scales.xScatter(d.avgNetCal)) &&
          !isNaN(scales.yScatter(d.weeklyRate)), // Check scale validity
      );

      const dots = ui.scatterDotsGroup
        .selectAll(".scatter-dot")
        .data(validScatterData, (d) => d.weekKey); // Use weekKey as identifier

      dots.join(
        (enter) =>
          enter
            .append("circle")
            .attr("class", "scatter-dot")
            .attr("cx", (d) => scales.xScatter(d.avgNetCal))
            .attr("cy", (d) => scales.yScatter(d.weeklyRate))
            .attr("r", 4) // Fixed radius
            .style("fill", colors.scatterDotColor)
            .style("opacity", 0)
            .call((enter) =>
              enter.transition().duration(dur).style("opacity", 0.7),
            ),
        (update) =>
          update
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

  // --- Weekly Summary Table Updater ---
  const WeeklySummaryUpdater = {
    updateTable(weeklyData) {
      const container = ui.weeklySummaryContainer;
      if (!container || container.empty()) return;

      const loadingMsg = container.select(".loading-msg");
      const emptyMsg = container.select(".empty-msg");
      let tableWrapper = container.select(".table-wrapper");

      loadingMsg.remove(); // Remove loading indicator if present

      if (Array.isArray(weeklyData) && weeklyData.length > 0) {
        emptyMsg?.style("display", "none"); // Hide empty message

        // Create table structure if it doesn't exist
        if (tableWrapper.empty()) {
          tableWrapper = container.append("div").attr("class", "table-wrapper");
          const table = tableWrapper
            .append("table")
            .attr("class", "summary-table"); // Add class for styling
          const thead = table.append("thead");
          table.append("tbody"); // Add tbody immediately

          thead
            .append("tr")
            .selectAll("th")
            .data([
              { key: "weekStartDate", label: "Week Start", numeric: false },
              { key: "avgWeight", label: "Avg Wgt (kg)", numeric: true },
              { key: "weeklyRate", label: "Rate (kg/wk)", numeric: true },
              { key: "avgIntake", label: "Avg Intake", numeric: true }, // Removed kcal unit for space
              { key: "avgExpenditure", label: "Avg GFit", numeric: true }, // Removed kcal unit
              { key: "avgNetCal", label: "Avg Net", numeric: true }, // Removed kcal unit
            ])
            .join("th")
            .attr("class", (d) => (d.numeric ? "numeric" : null))
            .text((d) => d.label);
        }

        const tbody = tableWrapper.select("tbody");
        const fv = Utils.formatValue;
        const fd = Utils.formatDateShort;

        // Define cell data and formatters
        const columns = [
          { key: "weekStartDate", format: fd },
          { key: "avgWeight", format: (d) => fv(d, 1) },
          { key: "weeklyRate", format: (d) => fv(d, 2) },
          { key: "avgIntake", format: (d) => fv(d, 0) },
          { key: "avgExpenditure", format: (d) => fv(d, 0) },
          { key: "avgNetCal", format: (d) => fv(d, 0) },
        ];

        const rows = tbody.selectAll("tr").data(weeklyData, (d) => d.weekKey); // Key rows by weekKey

        rows.join(
          (enter) => {
            const tr = enter.append("tr");
            columns.forEach((col) => {
              tr.append("td")
                .attr("class", col.format === fd ? null : "numeric") // Numeric class for non-date cols
                .text((d) => col.format(d[col.key]));
            });
            return tr;
          },
          (update) => {
            update
              .selectAll("td")
              // Re-bind data for each cell within the row
              .data((d) =>
                columns.map((col) => ({
                  value: d[col.key],
                  format: col.format,
                  numeric: col.format !== fd,
                })),
              )
              .attr("class", (d) => (d.numeric ? "numeric" : null))
              .text((d) => d.format(d.value)); // Update text content based on cell data
            return update;
          },
          (exit) => exit.remove(),
        );
      } else {
        // No data: remove table, show empty message
        tableWrapper.remove();
        if (emptyMsg.empty()) {
          // Create empty message if needed
          container
            .append("p")
            .attr("class", "empty-msg")
            .text("No weekly data available for the selected analysis range.");
        } else {
          emptyMsg.style("display", null); // Show existing empty message
        }
      }
    },
  };

  // --- Master Updater ---
  // Orchestrates updates across all charts and UI elements
  const MasterUpdater = {
    updateAllCharts() {
      if (!state.isInitialized || !scales.x) {
        console.warn(
          "MasterUpdater: Skipping update - chart not initialized or scales missing.",
        );
        return;
      }

      // 1. Update Domains based on current view/state
      DomainManager.updateDomainsOnInteraction(); // Calculates Y domains, syncs X axes

      // 2. Get Filtered Data (calculated in updateDomainsOnInteraction)
      const visibleProcessedData = state.filteredData;
      const visibleValidSmaData = visibleProcessedData.filter(
        (d) => d.sma != null,
      );
      const visibleRawWeightData = visibleProcessedData.filter(
        (d) => d.value != null,
      );

      // 3. Recalculate Regression for the effective range
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
          regressionRange.start, // Use the effective start date
        );
      } else {
        regressionResult = {
          slope: null,
          intercept: null,
          points: [],
          pointsWithCI: [],
        };
      }

      // 4. Update Axes for all charts
      FocusChartUpdater.updateAxes();
      ContextChartUpdater.updateAxes();
      BalanceChartUpdater.updateAxes();
      RateChartUpdater.updateAxes();
      TDEEDiffChartUpdater.updateAxes();
      ScatterPlotUpdater.updateAxes(); // Domains updated in StatsManager/DomainManager

      // 5. Update Chart Content
      // Focus Chart
      FocusChartUpdater.updatePaths(visibleValidSmaData, regressionResult);
      FocusChartUpdater.updateDots(visibleRawWeightData);
      FocusChartUpdater.updateHighlightMarker(visibleRawWeightData);
      FocusChartUpdater.updateCrosshair(state.activeHoverData); // Update based on hover state
      FocusChartUpdater.updateAnnotations(visibleProcessedData);
      FocusChartUpdater.updatePlateauRegions();
      FocusChartUpdater.updateTrendChangeMarkers(visibleProcessedData); // Pass data to find Y values
      FocusChartUpdater.updateRegressionBrushDisplay(); // Update visual state of brush

      // Other Charts
      ContextChartUpdater.updateChart(state.processedData); // Context uses full data
      BalanceChartUpdater.updateChart(visibleProcessedData);
      RateChartUpdater.updateChart(visibleProcessedData);
      TDEEDiffChartUpdater.updateChart(visibleProcessedData);
      ScatterPlotUpdater.updateChart(state.correlationScatterData); // Scatter uses pre-calculated data

      // 6. Update Analysis Range Display (if not custom)
      if (!state.analysisRange.isCustom) {
        EventHandlers.updateAnalysisRangeInputsFromCurrentView();
      }
      EventHandlers.updateAnalysisRangeDisplay(); // Always update display text
    },
  };

  // ========================================================================
  // Statistics Manager (`StatsManager`) - Includes the fix for d3.greatest/least
  // ========================================================================
  const StatsManager = {
    // --- Calculation Helpers ---
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
      // Find the last data point *at or before* the analysis end date with a valid rate
      let lastRate = null;
      for (let i = allProcessedData.length - 1; i >= 0; i--) {
        const d = allProcessedData[i];
        // Ensure date is valid before comparison
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
      // Calculate deviation of raw value from SMA, excluding outliers
      const deviations = viewData
        .filter((d) => d.sma != null && d.value != null && !d.isOutlier)
        .map((d) => d.value - d.sma);

      // Use simple-statistics if available, otherwise return null
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
      // Group data by week, starting on Monday
      const getWeekKey = (date) => d3.timeFormat("%Y-%W")(d3.timeMonday(date));
      const groupedByWeek = d3.group(rangeData, (d) => getWeekKey(d.date));

      groupedByWeek.forEach((weekData, weekKey) => {
        weekData.sort((a, b) => a.date - b.date); // Ensure chronological order

        // Filter for days within the week that have both net balance and smoothed rate
        const validPoints = weekData.filter(
          (d) =>
            d.netBalance != null &&
            !isNaN(d.netBalance) &&
            d.smoothedWeeklyRate != null &&
            !isNaN(d.smoothedWeeklyRate),
        );

        // Require a minimum number of valid days (e.g., 4) for a reliable weekly average
        if (validPoints.length >= 4) {
          const avgNetCal = d3.mean(validPoints, (d) => d.netBalance);
          const avgWeeklyRate = d3.mean(
            validPoints,
            (d) => d.smoothedWeeklyRate,
          ); // Average of smoothed rates

          // Calculate averages for other metrics using *all* available data in the week
          const avgWeight = d3.mean(weekData, (d) => d.sma ?? d.value);
          const avgExpenditure = d3.mean(weekData, (d) => d.googleFitTDEE);
          const avgIntake = d3.mean(weekData, (d) => d.calorieIntake);
          const weekStartDate = d3.timeMonday(weekData[0].date); // Use first day's Monday

          weeklyStats.push({
            weekKey,
            weekStartDate,
            avgNetCal,
            weeklyRate: avgWeeklyRate,
            avgWeight: avgWeight ?? null, // Ensure null if no data
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
      if (
        !weeklyStats ||
        weeklyStats.length < CONFIG.MIN_WEEKS_FOR_CORRELATION
      ) {
        return null; // Not enough valid weeks
      }

      // Extract arrays, ensuring corresponding indices have valid data (already filtered in calculateWeeklyStats)
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
      if (Math.abs(weightDifference) < 0.05) return "Goal Achieved!"; // Increased threshold slightly

      // Handle zero or counter-productive trend
      if (Math.abs(weeklyChange) < 0.01) return "Trend flat";
      if (
        (weeklyChange > 0 && weightDifference < 0) ||
        (weeklyChange < 0 && weightDifference > 0)
      )
        return "Trending away";

      const weeksNeeded = weightDifference / weeklyChange;
      if (weeksNeeded <= 0) return "N/A"; // Should be covered by 'Trending away' but belt-and-suspenders

      // Format the time estimate
      if (weeksNeeded < 1) return `~${(weeksNeeded * 7).toFixed(0)} days`;
      if (weeksNeeded < 8)
        return `~${Math.round(weeksNeeded)} week${weeksNeeded >= 1.5 ? "s" : ""}`;
      const monthsNeeded = weeksNeeded / (365.25 / 12 / 7); // Avg weeks per month
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

      if (targetDate <= today) return null; // Goal date must be in the future

      const weightDifference = goalWeight - currentWeight;
      const daysRemaining = (targetDate.getTime() - today.getTime()) / 86400000;

      // Avoid division by zero if goal is today
      if (daysRemaining <= 0) return null;

      return weightDifference / (daysRemaining / 7); // kg per week
    },

    _detectPlateaus(processedData) {
      if (!processedData || processedData.length === 0) return [];

      const minDurationDays = CONFIG.plateauMinDurationWeeks * 7;
      const rateThreshold = CONFIG.plateauRateThresholdKgWeek;
      let plateaus = [];
      let currentPlateauStart = null;
      let currentPlateauStartIndex = -1;

      for (let i = 0; i < processedData.length; i++) {
        const d = processedData[i];
        const rate = d.smoothedWeeklyRate; // Use smoothed rate for stability

        // Check if rate is within plateau threshold
        const isFlat = rate != null && Math.abs(rate) < rateThreshold;

        if (isFlat && currentPlateauStart === null) {
          // Start of a potential plateau
          currentPlateauStart = d.date;
          currentPlateauStartIndex = i;
        } else if (!isFlat && currentPlateauStart !== null) {
          // End of a potential plateau
          const endDate = processedData[i - 1].date; // Previous day was the last day of plateau
          // Ensure dates are valid before calculating duration
          if (
            !(endDate instanceof Date) ||
            !(currentPlateauStart instanceof Date) ||
            isNaN(endDate) ||
            isNaN(currentPlateauStart)
          ) {
            currentPlateauStart = null; // Reset if dates invalid
            continue;
          }
          const durationDays =
            (endDate.getTime() - currentPlateauStart.getTime()) / 86400000;

          if (durationDays >= minDurationDays - 1) {
            // Allow slightly less than exact duration (e.g. 20 days for 3 weeks)
            plateaus.push({ startDate: currentPlateauStart, endDate: endDate });
          }
          // Reset plateau tracking
          currentPlateauStart = null;
          currentPlateauStartIndex = -1;
        }
      }

      // Check if a plateau is ongoing at the very end of the data
      if (currentPlateauStart !== null) {
        const endDate = processedData[processedData.length - 1].date;
        // Ensure dates are valid
        if (
          !(endDate instanceof Date) ||
          !(currentPlateauStart instanceof Date) ||
          isNaN(endDate) ||
          isNaN(currentPlateauStart)
        ) {
          // Do nothing if dates invalid
        } else {
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
      const minSlopeDiff = CONFIG.trendChangeMinSlopeDiffKgWeek / 7; // Convert threshold to daily rate diff
      let changes = [];

      const calculateSlope = (dataSegment) => {
        // Use SMA for slope calculation for stability
        const validPoints = dataSegment.filter((p) => p.sma != null);
        if (validPoints.length < 2) return null;

        const first = validPoints[0];
        const last = validPoints[validPoints.length - 1];
        // Ensure dates are valid
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
        return (last.sma - first.sma) / timeDiffDays; // Daily rate change
      };

      for (let i = windowSize; i < processedData.length - windowSize; i++) {
        const currentDate = processedData[i].date;
        // Ensure current date is valid before proceeding
        if (!(currentDate instanceof Date) || isNaN(currentDate)) continue;

        // Define windows before and after the current point
        const beforeData = processedData.slice(i - windowSize, i);
        const afterData = processedData.slice(i + 1, i + 1 + windowSize); // Window starts *after* current point

        const slopeBefore = calculateSlope(beforeData);
        const slopeAfter = calculateSlope(afterData);

        if (slopeBefore != null && slopeAfter != null) {
          const slopeDiff = slopeAfter - slopeBefore; // Difference in daily rates
          if (Math.abs(slopeDiff) >= minSlopeDiff) {
            changes.push({ date: currentDate, magnitude: slopeDiff }); // Store daily rate difference
          }
        }
      }
      return changes;
    },

    // --- Main Calculation Orchestrator ---
    calculateAllStats() {
      const stats = {};
      const analysisRange = EventHandlers.getAnalysisDateRange(); // Use handler to get current range
      const { start: analysisStart, end: analysisEnd } = analysisRange;

      // --- Overall Stats (All Time) ---
      const validWeightDataAll = state.rawData.filter(
        (d) => d.value != null && !isNaN(d.value),
      ); // Filter NaN values too
      if (validWeightDataAll.length > 0) {
        stats.startingWeight = validWeightDataAll[0].value;
        stats.currentWeight =
          validWeightDataAll[validWeightDataAll.length - 1].value;

        // Find data points corresponding to max/min weights using d3.greatest/least
        const maxEntryObject = d3.greatest(validWeightDataAll, (d) => d.value);
        stats.maxWeight = maxEntryObject ? maxEntryObject.value : null;
        stats.maxWeightDate = maxEntryObject ? maxEntryObject.date : null;

        const minEntryObject = d3.least(validWeightDataAll, (d) => d.value);
        stats.minWeight = minEntryObject ? minEntryObject.value : null;
        stats.minWeightDate = minEntryObject ? minEntryObject.date : null;
        // --- End Fix ---

        // Calculate total change only if both start and end weights are valid
        if (stats.startingWeight != null && stats.currentWeight != null) {
          stats.totalChange = stats.currentWeight - stats.startingWeight;
        } else {
          stats.totalChange = null;
        }
      } else {
        // Set all overall stats to null if no valid weight data exists
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
      // Find the most recent SMA value, fallback to current raw weight if no SMA exists
      const lastSma = [...state.processedData]
        .reverse()
        .find((d) => d.sma != null);
      stats.currentSma = lastSma ? lastSma.sma : stats.currentWeight;

      // --- Analysis Range Dependent Calculations ---
      if (
        analysisStart instanceof Date &&
        analysisEnd instanceof Date &&
        analysisStart <= analysisEnd
      ) {
        // Update detected features based on full data but store them in state for potential display filtering later
        state.plateaus = StatsManager._detectPlateaus(state.processedData);
        state.trendChangePoints = StatsManager._detectTrendChanges(
          state.processedData,
        );

        // Calculate weekly stats *only for the analysis range*
        state.weeklySummaryData = StatsManager.calculateWeeklyStats(
          state.processedData,
          analysisStart,
          analysisEnd,
        );
        state.correlationScatterData = state.weeklySummaryData.filter(
          (w) => w.avgNetCal != null && w.weeklyRate != null,
        );

        // Calculate stats specific to the analysis range
        stats.netCalRateCorrelation =
          StatsManager._calculateNetCalRateCorrelation(state.weeklySummaryData);
        stats.currentWeeklyRate = StatsManager._calculateCurrentRate(
          state.processedData,
          analysisEnd,
        ); // Use the rate at the end of the range
        stats.volatility = StatsManager._calculateVolatility(
          state.processedData,
          analysisStart,
          analysisEnd,
        );

        // Averages within the range
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
        ); // Avg smoothed difference
        stats.avgTDEE_Adaptive = StatsManager._calculateAverageInRange(
          state.processedData,
          "adaptiveTDEE",
          analysisStart,
          analysisEnd,
        ); // Avg adaptive TDEE

        // Consistency counts within the range
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

        // Regression for Analysis Range (using effective range determined by handlers)
        const regressionRange = EventHandlers.getEffectiveRegressionRange();
        // Ensure regression range itself is valid before filtering
        if (
          regressionRange.start instanceof Date &&
          regressionRange.end instanceof Date
        ) {
          const regressionData = state.processedData.filter(
            (d) =>
              d.date instanceof Date && // Ensure date is valid
              d.date >= regressionRange.start &&
              d.date <= regressionRange.end &&
              d.value != null &&
              !d.isOutlier,
          );
          const analysisRegression = DataService.calculateLinearRegression(
            regressionData,
            regressionRange.start,
          ); // Use effective start date
          stats.regressionSlopeWeekly =
            analysisRegression.slope != null
              ? analysisRegression.slope * 7
              : null;
          stats.regressionStartDate = regressionRange.start; // Reflect the actual start date used for this calculation
          stats.regressionPointsWithCI = analysisRegression.pointsWithCI; // Pass CI data for insights
        } else {
          // Set regression stats to null if range is invalid
          stats.regressionSlopeWeekly = null;
          stats.regressionStartDate = null;
          stats.regressionPointsWithCI = [];
        }

        // TDEE from weight trend (prefer regression slope if valid and available, fallback to current rate)
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
        // Set defaults to null or empty if analysis range is invalid
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
        // Clear state arrays that depend on analysis range
        state.weeklySummaryData = [];
        state.correlationScatterData = [];
        // Keep plateaus/trends based on full data? Or clear? Let's clear for consistency.
        // state.plateaus = []; // Or keep based on full data if desired for display regardless of range
        // state.trendChangePoints = [];
      }

      // --- Goal Related Stats ---
      stats.targetWeight = state.goal.weight;
      stats.targetRate = state.goal.targetRate;
      stats.targetDate = state.goal.date;
      const referenceWeightForGoal = stats.currentSma ?? stats.currentWeight; // Use latest SMA if available

      // Calculate goal progress only if reference weight and target weight are known
      if (referenceWeightForGoal != null && stats.targetWeight != null) {
        stats.weightToGoal = stats.targetWeight - referenceWeightForGoal;
        // Use the most relevant current trend (regression if valid, else smoothed rate)
        const currentTrendForGoal =
          stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
        stats.estimatedTimeToGoal = StatsManager._calculateEstimatedTimeToGoal(
          referenceWeightForGoal,
          stats.targetWeight,
          currentTrendForGoal,
        );
        // Calculate required rate only if target date is set
        stats.requiredRateForGoal = stats.targetDate
          ? StatsManager._calculateRequiredRateForGoal(
              referenceWeightForGoal,
              stats.targetWeight,
              stats.targetDate,
            )
          : null;

        // Calculate required net calories and suggested intake if required rate is known
        if (stats.requiredRateForGoal != null) {
          // Use best available TDEE estimate from the analysis range: Adaptive > Trend > GFit
          const baselineTDEE =
            stats.avgTDEE_Adaptive ??
            stats.avgTDEE_WgtChange ??
            stats.avgExpenditureGFit;
          if (baselineTDEE != null && !isNaN(baselineTDEE)) {
            const requiredDailyDeficitSurplus =
              (stats.requiredRateForGoal / 7) * CONFIG.KCALS_PER_KG;
            stats.requiredNetCalories = requiredDailyDeficitSurplus;
            const targetIntake = baselineTDEE + requiredDailyDeficitSurplus;
            // Provide a simple range around the calculated target intake
            stats.suggestedIntakeRange = {
              min: Math.round(targetIntake - 100),
              max: Math.round(targetIntake + 100),
            };
          } else {
            // If TDEE cannot be estimated, cannot calculate calorie targets
            stats.requiredNetCalories = null;
            stats.suggestedIntakeRange = null;
          }
        } else {
          // If required rate cannot be calculated (e.g., no target date)
          stats.requiredNetCalories = null;
          stats.suggestedIntakeRange = null;
        }

        // Compare current rate to target rate if both exist
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
          // If target rate or current trend is missing
          stats.targetRateFeedback = { text: "N/A", class: "" };
        }
      } else {
        // Set defaults if goal cannot be calculated (missing target or current weight)
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

    // --- DOM Update ---
    updateStatsDisplay(stats) {
      const fv = Utils.formatValue;
      const fd = Utils.formatDate;
      const fdShort = Utils.formatDateShort; // Use short date for regression label
      const na = (v) => v ?? "N/A";

      // Helper to update a single stat element safely
      const updateElement = (key, value, formatter = na, args) => {
        const element = ui.statElements[key];
        if (element) {
          element.textContent = formatter(value, args);
          // Specific handling for highlightable dates
          if (key === "maxWeightDate" || key === "minWeightDate") {
            if (value instanceof Date && !isNaN(value)) {
              element.classList.add("highlightable");
              element.style.cursor = "pointer";
              element.style.textDecoration = "underline dotted";
              // Store date on element for listener, remove old listener first
              element.removeEventListener(
                "click",
                EventHandlers.statDateClickWrapper,
              ); // Use wrapper name
              element.__highlightDate = value; // Use a non-standard property
              element.addEventListener(
                "click",
                EventHandlers.statDateClickWrapper,
              ); // Attach wrapper
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
          // Specific handling for feedback class
          if (key === "currentRateFeedback" && stats.targetRateFeedback) {
            element.className = `stat-value feedback ${stats.targetRateFeedback.class || ""}`; // Reset classes safely
            element.textContent = stats.targetRateFeedback.text; // Use pre-formatted text
          }
        } else {
          // Log only once or use less verbose warning?
          // console.warn(`StatsManager: Stat element node not found in cache for key: ${key}`);
        }
      };

      // Update All-Time Stats
      updateElement("startingWeight", stats.startingWeight, fv, 1);
      updateElement("currentWeight", stats.currentWeight, fv, 1);
      updateElement("currentSma", stats.currentSma, fv, 1);
      updateElement("totalChange", stats.totalChange, fv, 1);
      updateElement("maxWeight", stats.maxWeight, fv, 1);
      updateElement("maxWeightDate", stats.maxWeightDate, fd);
      updateElement("minWeight", stats.minWeight, fv, 1);
      updateElement("minWeightDate", stats.minWeightDate, fd);

      // Update Analysis Range Stats
      updateElement("volatilityScore", stats.volatility, fv, 2);
      updateElement("rollingWeeklyChangeSma", stats.currentWeeklyRate, fv, 2); // Use currentWeeklyRate
      updateElement("regressionSlope", stats.regressionSlopeWeekly, fv, 2);
      // Update the regression start date label shown in the UI
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
      updateElement("avgExpenditure", stats.avgExpenditureGFit, fv, 0); // Clarified source
      updateElement("avgNetBalance", stats.avgNetBalance, fv, 0);
      updateElement(
        "estimatedDeficitSurplus",
        stats.estimatedDeficitSurplus,
        fv,
        0,
      );
      updateElement("avgTdeeGfit", stats.avgExpenditureGFit, fv, 0); // TDEE GFit is just avg expenditure
      updateElement("avgTdeeWgtChange", stats.avgTDEE_WgtChange, fv, 0);
      updateElement("avgTdeeDifference", stats.avgTDEE_Difference, fv, 0);
      updateElement("avgTdeeAdaptive", stats.avgTDEE_Adaptive, fv, 0);

      // Update Goal Tracker Stats
      updateElement("targetWeightStat", stats.targetWeight, fv, 1);
      updateElement("targetRateStat", stats.targetRate, fv, 2);
      updateElement("weightToGoal", stats.weightToGoal, fv, 1);
      updateElement("estimatedTimeToGoal", stats.estimatedTimeToGoal); // String, no formatter
      updateElement("requiredRateForGoal", stats.requiredRateForGoal, fv, 2);
      updateElement("requiredNetCalories", stats.requiredNetCalories, fv, 0);
      updateElement("suggestedIntakeRange", stats.suggestedIntakeRange, (r) =>
        r ? `${r.min} - ${r.max}` : "N/A",
      );
      updateElement("currentRateFeedback"); // Special handling via class/text above

      // Update other UI elements related to stats
      InsightsGenerator.updateSummary(stats); // Generate and display insights text
      WeeklySummaryUpdater.updateTable(state.weeklySummaryData); // Update the summary table
      ScatterPlotUpdater.updateChart(state.correlationScatterData); // Update scatter plot points
      EventHandlers.updatePinnedTooltipDisplay(); // Refresh pinned tooltip if visible
    },

    // --- Public Method to Trigger Update ---
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
    _getConsistencyInsight(correlation, consistencyWgt, consistencyCal) {
      let insight = "<h4>Consistency Check</h4>";
      let consistencyMsg = "";
      const wgtPct = consistencyWgt.percentage;
      const calPct = consistencyCal.percentage;

      if (wgtPct < 80 || calPct < 80) {
        consistencyMsg += `<span class="warn">Low data consistency!</span> `;
        if (wgtPct < 80)
          consistencyMsg += `Weight logged ${wgtPct.toFixed(0)}%. `;
        if (calPct < 80)
          consistencyMsg += `Calories logged ${calPct.toFixed(0)}%. `;
        consistencyMsg += `Stats & correlation may be unreliable.`;
      } else if (wgtPct < 95 || calPct < 95) {
        consistencyMsg += `<span class="good">Good consistency</span> (${wgtPct.toFixed(0)}% Wgt, ${calPct.toFixed(0)}% Cal).`;
      } else {
        consistencyMsg += `<span class="good">Excellent consistency</span> (${wgtPct.toFixed(0)}% Wgt, ${calPct.toFixed(0)}% Cal).`;
      }
      insight += `<p><strong>Logging Frequency:</strong> ${consistencyMsg}</p>`;

      if (wgtPct < 80 || calPct < 80) {
        insight += `<p><span class="warn">Warning: Low consistency likely impacts TDEE estimates and correlation accuracy.</span></p>`;
      }

      // Correlation Insight
      if (correlation != null && !isNaN(correlation)) {
        let level = "",
          explanation = "";
        const rVal = Utils.formatValue(correlation, 2);
        const absR = Math.abs(correlation);

        if (correlation <= -0.7) {
          level = `<span class="good">Strong Negative</span>`;
          explanation = `Net calories strongly align (inversely) with weight trend (r=${rVal}). Good tracking indication.`;
        } else if (correlation <= -0.4) {
          level = `<span class="good">Moderate Negative</span>`;
          explanation = `Net calories show a moderate inverse alignment with weight trend (r=${rVal}).`;
        } else if (correlation < -0.1) {
          level = `<span class="warn">Weak Negative</span>`;
          explanation = `A weak inverse link observed (r=${rVal}). Check tracking accuracy/consistency.`;
        } else if (absR < 0.1) {
          level = `<span class="bad">Very Weak/None</span>`;
          explanation = `No significant link between net calories and weight trend (r=${rVal}). Review tracking data carefully.`;
        } else {
          level = `<span class="bad">Unexpected Positive</span>`;
          explanation = `Positive link (r=${rVal}) suggests potential issues (e.g., lag, inaccurate TDEE source, inconsistent tracking).`;
        }

        insight += `<p><strong>Net Calorie vs. Rate Correlation:</strong> ${level}. ${explanation}</p>`;
      } else if (
        consistencyWgt.percentage >= 50 &&
        consistencyCal.percentage >= 50
      ) {
        // Only show message if some data exists
        insight += `<p><strong>Net Calorie vs. Rate Correlation:</strong> Not enough comparable weekly data (${state.weeklySummaryData.length} weeks) in range for reliable correlation analysis (min ${CONFIG.MIN_WEEKS_FOR_CORRELATION} required).</p>`;
      }

      return insight;
    },

    _getTDEEInsight(tdeeGFit, tdeeTrend, tdeeDiffAvg, tdeeAdaptive) {
      let insight = "<h4>Energy Balance (TDEE)</h4>";
      const fv = Utils.formatValue;

      // Prioritize TDEE estimates: Adaptive > Trend > GFit
      const estimates = [
        { label: "Adaptive TDEE", value: tdeeAdaptive, priority: 1 },
        { label: "Trend TDEE", value: tdeeTrend, priority: 2 },
        { label: "GFit Avg TDEE", value: tdeeGFit, priority: 3 },
      ]
        .filter((e) => e.value != null && !isNaN(e.value))
        .sort((a, b) => a.priority - b.priority);

      if (estimates.length === 0) {
        return (
          insight +
          "<p>Insufficient data in the analysis range to estimate TDEE.</p>"
        );
      }

      const primaryTDEE = estimates[0];
      insight += `<p><strong>Best Estimate (TDEE): ${primaryTDEE.label} ≈ ${fv(primaryTDEE.value, 0)} kcal/d.</strong></p>`;

      // Compare primary estimate to GFit if available and not primary
      const gfitEstimate = estimates.find((e) => e.label === "GFit Avg TDEE");
      if (gfitEstimate && gfitEstimate !== primaryTDEE) {
        const diff = primaryTDEE.value - gfitEstimate.value;
        const diffPercent =
          gfitEstimate.value !== 0
            ? (diff / gfitEstimate.value) * 100
            : diff > 0
              ? Infinity
              : -Infinity;
        const diffAvgStr =
          tdeeDiffAvg != null
            ? ` (Avg Trend-GFit Diff: ${fv(tdeeDiffAvg, 0)} kcal)`
            : "";

        let comparisonMsg = `Comparing to GFit Avg (~${fv(gfitEstimate.value, 0)} kcal/d): `;
        if (Math.abs(diffPercent) < 10)
          comparisonMsg += `<span class="good">Good alignment (&lt;10% diff).</span>${diffAvgStr}`;
        else if (diff > 0)
          comparisonMsg += `<span class="warn">Estimate is notably higher (+${diffPercent.toFixed(0)}%) than GFit.${diffAvgStr}</span> Check GFit accuracy or intake logging.`;
        else
          comparisonMsg += `<span class="warn">Estimate is notably lower (${diffPercent.toFixed(0)}%) than GFit.${diffAvgStr}</span> Check GFit accuracy or intake logging.`;
        insight += `<p>${comparisonMsg}</p>`;
      } else if (!gfitEstimate && primaryTDEE.label !== "GFit Avg TDEE") {
        insight +=
          "<p>Google Fit average TDEE data missing or incomplete in range for comparison.</p>";
      }

      // Mention other available estimates
      if (estimates.length > 1) {
        insight += `<p><small>Other estimates: ${estimates
          .slice(1)
          .map((e) => `${e.label} ≈ ${fv(e.value, 0)}`)
          .join(", ")}</small></p>`;
      }

      return insight;
    },

    _getTrendInsight(
      currentTrendWeekly,
      currentWeight,
      regressionUsed,
      regressionCI,
    ) {
      let insight = "<h4>Current Weight Trend</h4>";
      const fv = Utils.formatValue;

      if (currentTrendWeekly == null || isNaN(currentTrendWeekly)) {
        return (
          insight +
          "<p>Cannot determine weight trend in selected analysis range (check data consistency).</p>"
        );
      }

      let trendDesc = "";
      const trendAbs = Math.abs(currentTrendWeekly);
      // Calculate % change relative to current weight (use SMA if available)
      const weightForPct =
        currentWeight ??
        state.processedData.filter((d) => d.value != null).slice(-1)[0]?.value;
      const trendPercent =
        weightForPct && weightForPct > 0
          ? (currentTrendWeekly / weightForPct) * 100
          : null;
      const trendValStr = `<strong>${fv(currentTrendWeekly, 2)} kg/wk</strong>`;
      const trendPercentStr =
        trendPercent != null ? ` (${fv(trendPercent, 1)}%/wk)` : "";
      const basis = regressionUsed ? "linear regression" : "smoothed SMA rate";

      if (trendAbs < CONFIG.plateauRateThresholdKgWeek) {
        // Use plateau threshold for stable
        trendDesc = `Weight appears <span class="stable">stable</span> (${trendValStr}).`;
      } else if (currentTrendWeekly > 0) {
        trendDesc = `Actively <span class="gaining">gaining</span> at ${trendValStr}${trendPercentStr}.`;
        if (currentTrendWeekly > CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK)
          trendDesc += ` <span class="warn">(Rate may exceed recommended ${CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK}-${CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK} kg/wk range for lean gain.)</span>`;
        else if (currentTrendWeekly >= CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK)
          trendDesc += ` <span class="good">(Rate within typical lean gain range.)</span>`;
        else
          trendDesc += ` <span class="warn">(Rate is slow for typical lean gain goals. Ensure adequate surplus?)</span>`;
      } else {
        // Losing weight
        trendDesc = `Actively <span class="losing">losing</span> at ${trendValStr}${trendPercentStr}.`;
        // Add context if goal is gaining? (Requires goal info)
        if (state.goal.targetRate != null && state.goal.targetRate > 0) {
          trendDesc += ` <span class="warn">(Adjust intake/activity for gain goals.)</span>`;
        }
      }
      insight += `<p><strong>Trend Estimate:</strong> ${trendDesc} <small>(Based on ${basis} in analysis range)</small></p>`;

      // Confidence Interval Insight
      if (regressionUsed && regressionCI && regressionCI.length > 0) {
        const lastCI = regressionCI[regressionCI.length - 1];
        if (lastCI && lastCI.lowerCI != null && lastCI.upperCI != null) {
          const ciWidth = lastCI.upperCI - lastCI.lowerCI;
          const ciMsg = `The 95% CI for the regression line endpoint is approx. ${fv(lastCI.lowerCI, 1)} - ${fv(lastCI.upperCI, 1)} kg (width: ${fv(ciWidth, 1)} kg). A narrower interval indicates higher confidence in the trend line's position.`;
          insight += `<p><small><strong>Regression Confidence:</strong> ${ciMsg}</small></p>`;
        }
      }
      return insight;
    },

    _getGoalProgressInsight(stats) {
      let insight = "<h4>Goal Progress & Guidance</h4>";
      const fv = Utils.formatValue;
      const fd = Utils.formatDateShort;

      if (stats.targetWeight == null) {
        return (
          insight +
          "<p>No weight goal set. Use the Goal Tracker section to set one.</p>"
        );
      }

      const currentTrend =
        stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
      const timeEst = stats.estimatedTimeToGoal;

      insight += `<p><strong>Target:</strong> ${fv(stats.targetWeight, 1)} kg`;
      if (stats.targetDate) insight += ` by ${fd(stats.targetDate)}`;
      if (stats.weightToGoal != null)
        insight += `. <span class="${stats.weightToGoal > 0 ? "positive" : "negative"}">${fv(Math.abs(stats.weightToGoal), 1)} kg ${stats.weightToGoal >= 0 ? "to gain" : "to lose"}.</span>`;
      insight += `</p>`;

      // Projection based on current trend
      if (
        timeEst &&
        timeEst !== "N/A" &&
        timeEst !== "Trending away" &&
        timeEst !== "Trend flat" &&
        timeEst !== "Goal Achieved!"
      ) {
        insight += `<p><strong>Projection (Current Trend):</strong> Estimated time to goal: <span class="good">${timeEst}</span>.</p>`;
      } else if (timeEst === "Goal Achieved!") {
        insight += `<p><strong>Projection:</strong> <span class="good">Goal Achieved!</span></p>`;
      } else if (timeEst === "Trending away") {
        insight += `<p><strong>Projection:</strong> <span class="bad">Currently trending away from the goal weight.</span></p>`;
      } else if (timeEst === "Trend flat") {
        insight += `<p><strong>Projection:</strong> <span class="warn">Current trend is flat, goal unlikely at this rate.</span></p>`;
      } else {
        insight += `<p><strong>Projection:</strong> Cannot estimate time to goal with current trend data.</p>`;
      }

      // Target Rate vs Current Rate
      if (stats.targetRate != null) {
        insight += `<p><strong>Target Rate:</strong> ${fv(stats.targetRate, 2)} kg/wk. `;
        if (stats.targetRateFeedback) {
          insight += `<span class="feedback ${stats.targetRateFeedback.class || ""}">${stats.targetRateFeedback.text}</span>`;
        } else {
          insight += `(Comparison unavailable)`;
        }
        insight += `</p>`;
      }

      // Guidance for Target Date
      if (stats.targetDate) {
        if (stats.requiredRateForGoal != null) {
          insight += `<p><strong>Required Rate (for Target Date):</strong> ${fv(stats.requiredRateForGoal, 2)} kg/wk. `;
          if (currentTrend != null) {
            const diff = currentTrend - stats.requiredRateForGoal;
            const goalDirection =
              stats.requiredRateForGoal > 0 ? "gain" : "loss"; // Determine goal direction
            const currentDirection = currentTrend > 0 ? "gain" : "loss";

            if (Math.abs(diff) < 0.05) {
              // Close enough
              insight += `<span class="good">Current rate is on track.</span>`;
            } else if (goalDirection === "gain") {
              if (diff > 0)
                insight += `<span class="warn">Current rate (${fv(currentTrend, 2)}) is faster than required.</span>`;
              else
                insight += `<span class="warn">Current rate (${fv(currentTrend, 2)}) is slower than required.</span>`;
            } else {
              // Goal is loss
              if (diff < 0)
                insight += `<span class="warn">Current rate (${fv(currentTrend, 2)}) is faster (more loss) than required.</span>`;
              else
                insight += `<span class="warn">Current rate (${fv(currentTrend, 2)}) is slower (less loss) than required.</span>`;
            }
          } else {
            insight += `Cannot compare to current rate.`;
          }
          insight += `</p>`;

          if (stats.suggestedIntakeRange) {
            const baselineTDEE =
              stats.avgTDEE_Adaptive ??
              stats.avgTDEE_WgtChange ??
              stats.avgExpenditureGFit;
            const tdeeSource =
              baselineTDEE === stats.avgTDEE_Adaptive
                ? "Adaptive"
                : baselineTDEE === stats.avgTDEE_WgtChange
                  ? "Trend"
                  : "GFit";
            insight += `<p><strong>Guidance (for Target Date):</strong> Suggested intake ≈ ${stats.suggestedIntakeRange.min}-${stats.suggestedIntakeRange.max} kcal/d <small>(based on ${tdeeSource} TDEE ≈ ${fv(baselineTDEE ?? 0, 0)})</small>.</p>`;
          } else {
            insight += `<p><strong>Guidance:</strong> Cannot suggest intake range (TDEE estimate unavailable).</p>`;
          }
        } else {
          insight += `<p><strong>Guidance:</strong> Cannot calculate required rate for target date (check dates/weights).</p>`;
        }
      }

      return insight;
    },

    _getDetectedFeaturesInsight(analysisStartDate, analysisEndDate) {
      let insight = "";
      // Ensure dates are valid before filtering
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
        insight += `<h4>Detected Events in Range</h4>`;
        if (plateausInRange.length > 0) {
          insight += `<p><span class="warn">Potential Plateau(s):</span> `;
          insight += plateausInRange
            .map(
              (p) =>
                `${Utils.formatDateShort(p.startDate)} - ${Utils.formatDateShort(p.endDate)}`,
            )
            .join(", ");
          insight += `.</p>`;
        }
        if (changesInRange.length > 0) {
          insight += `<p><span class="warn">Potential Trend Change(s):</span> Around `;
          insight += changesInRange
            .map((p) => {
              const direction =
                p.magnitude > 0 ? "acceleration" : "deceleration";
              return `${Utils.formatDateShort(p.date)} (${direction})`;
            })
            .join(", ");
          insight += `.</p>`;
        }
      }
      return insight;
    },

    // --- Public Method ---
    updateSummary(stats) {
      if (!ui.insightSummaryContainer || ui.insightSummaryContainer.empty())
        return;

      const currentTrend =
        stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
      const regressionUsedForTrend = stats.regressionSlopeWeekly != null;
      const analysisRange = EventHandlers.getAnalysisDateRange();

      let summaryHtml = "";
      try {
        summaryHtml += InsightsGenerator._getConsistencyInsight(
          stats.netCalRateCorrelation,
          stats.weightDataConsistency,
          stats.calorieDataConsistency,
        );
        summaryHtml += InsightsGenerator._getTDEEInsight(
          stats.avgExpenditureGFit,
          stats.avgTDEE_WgtChange,
          stats.avgTDEE_Difference,
          stats.avgTDEE_Adaptive,
        );
        summaryHtml += InsightsGenerator._getTrendInsight(
          currentTrend,
          stats.currentSma,
          regressionUsedForTrend,
          stats.regressionPointsWithCI,
        );
        summaryHtml += InsightsGenerator._getGoalProgressInsight(stats);
        summaryHtml += InsightsGenerator._getDetectedFeaturesInsight(
          analysisRange.start,
          analysisRange.end,
        );
      } catch (error) {
        console.error(
          "InsightsGenerator: Error generating insights HTML",
          error,
        );
        summaryHtml =
          "<p class='error'>Error generating insights. Check console.</p>";
      }

      ui.insightSummaryContainer.html(
        summaryHtml ||
          "<p>Analysis requires more data or a different range.</p>",
      );
    },
  };

  // ========================================================================
  // Event Handlers (`EventHandlers`)
  // ========================================================================
  const EventHandlers = {
    _isZooming: false, // Flag to help differentiate brush/zoom events
    _isBrushing: false, // Flag for context brush

    dotMouseOver(event, d) {
      if (!ui.tooltip || !d || !d.date) return;
      state.activeHoverData = d; // Store for crosshair

      d3.select(event.currentTarget)
        .raise() // Bring dot to front
        .transition()
        .duration(50)
        .attr("r", CONFIG.dotHoverRadius)
        .style("opacity", 1);

      // --- Tooltip Content ---
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

      // Calorie/Rate Data (Show if *any* related data exists)
      const hasCalData = [
        d.calorieIntake,
        d.googleFitTDEE,
        d.netBalance,
        d.adaptiveTDEE,
        d.smoothedWeeklyRate,
        d.avgTdeeDifference,
      ].some((v) => v != null);
      if (hasCalData) {
        tt += `<hr class="tooltip-hr">`;
        if (d.calorieIntake != null)
          tt += `Intake: ${Utils.formatValue(d.calorieIntake, 0)} kcal<br/>`;
        if (d.googleFitTDEE != null)
          tt += `GFit TDEE: ${Utils.formatValue(d.googleFitTDEE, 0)} kcal<br/>`;
        if (d.netBalance != null)
          tt += `Net: ${Utils.formatValue(d.netBalance, 0)} kcal<br/>`;
        if (d.adaptiveTDEE != null)
          tt += `Adaptive TDEE: ${Utils.formatValue(d.adaptiveTDEE, 0)} kcal<br/>`;
        if (d.smoothedWeeklyRate != null)
          tt += `Smoothed Rate: ${Utils.formatValue(d.smoothedWeeklyRate, 2)} kg/wk<br/>`;
        if (d.avgTdeeDifference != null)
          tt += `Avg TDEE Diff: ${Utils.formatValue(d.avgTdeeDifference, 0)} kcal`;
      }

      // Annotation Note
      const annotation = AnnotationManager.findAnnotationByDate(d.date);
      if (annotation)
        tt += `<hr class="tooltip-hr"><span class="note annotation-note">${annotation.text}</span>`;

      // Pinned Status Note
      const isPinned = state.pinnedTooltipData?.id === d.date.getTime();
      tt += `<hr class="tooltip-hr"><span class="note pinned-note">${isPinned ? "Click dot to unpin." : "Click dot to pin tooltip."}</span>`;

      // --- Display Tooltip ---
      // Calculate position relative to the viewport
      const svgNode = ui.svg?.node();
      if (!svgNode) return; // Need SVG node for calculations

      // Use pageX/pageY for positioning relative to the document
      const tooltipX = event.pageX + 15;
      const tooltipY = event.pageY - 28;

      // Position tooltip relative to the page
      ui.tooltip
        .html(tt)
        .style("left", `${tooltipX}px`) // Use page coordinates for tooltip positioning
        .style("top", `${tooltipY}px`)
        .transition()
        .duration(100)
        .style("opacity", 0.95);

      FocusChartUpdater.updateCrosshair(d); // Show/update crosshair
    },

    dotMouseOut(event, d) {
      if (!ui.tooltip || !d || !d.date) return;
      state.activeHoverData = null; // Clear hover data

      // Hide tooltip *only if this dot is not the pinned one*
      if (
        !state.pinnedTooltipData ||
        state.pinnedTooltipData.id !== d.date.getTime()
      ) {
        ui.tooltip.transition().duration(300).style("opacity", 0);
      }

      // Revert dot appearance, considering highlight state
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
      event.stopPropagation(); // Prevent background click handler

      const dataId = d.date.getTime();

      if (state.pinnedTooltipData?.id === dataId) {
        // Unpin: Clear pinned data and hide tooltip immediately
        state.pinnedTooltipData = null;
        ui.tooltip.style("opacity", 0);
      } else {
        // Pin: Store data and position, refresh tooltip content
        state.pinnedTooltipData = {
          id: dataId,
          data: d,
          pageX: event.pageX,
          pageY: event.pageY, // Store page coords for potential repositioning
        };
        EventHandlers.dotMouseOver(event, d); // Refresh tooltip content & style
        ui.tooltip.style("opacity", 0.95); // Ensure visible
      }
      EventHandlers.updatePinnedTooltipDisplay(); // Update the static pinned display area
    },

    updatePinnedTooltipDisplay() {
      if (!ui.pinnedTooltipContainer) return;
      if (state.pinnedTooltipData) {
        const d = state.pinnedTooltipData.data;
        let pinnedHtml = `<strong>Pinned: ${Utils.formatDateShort(d.date)}</strong><br/>
                              Wgt: ${Utils.formatValue(d.value, 1)}`;
        if (d.sma != null)
          pinnedHtml += ` | SMA: ${Utils.formatValue(d.sma, 1)}`;
        // Add more details if needed

        ui.pinnedTooltipContainer.html(pinnedHtml).style("display", "block");
      } else {
        ui.pinnedTooltipContainer.html("").style("display", "none");
      }
    },

    annotationMouseOver(event, d) {
      if (!ui.tooltip || !d) return;
      d3.select(event.currentTarget) // Select the group
        .select("circle") // Select the circle within
        .transition()
        .duration(50)
        .attr("r", CONFIG.annotationMarkerRadius * 1.5); // Enlarge circle

      let tt = `<strong>Annotation (${Utils.formatDateShort(new Date(d.date))})</strong><br/>${d.text}`;
      ui.tooltip
        .html(tt)
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 28}px`)
        .transition()
        .duration(100)
        .style("opacity", 0.95);
    },

    annotationMouseOut(event, d) {
      if (!ui.tooltip) return;
      d3.select(event.currentTarget)
        .select("circle")
        .transition()
        .duration(150)
        .attr("r", CONFIG.annotationMarkerRadius); // Return to normal size
      ui.tooltip.transition().duration(300).style("opacity", 0);
    },

    trendChangeMouseOver(event, d) {
      if (!ui.tooltip || !d) return;
      d3.select(event.currentTarget) // Select the group
        .select("path") // Select the path within
        .transition()
        .duration(50)
        .attr("transform", "scale(1.5)"); // Scale the path

      const direction = d.magnitude > 0 ? "acceleration" : "deceleration";
      const rateChange = Math.abs(d.magnitude * 7); // Weekly rate change
      let tt = `<strong>Trend Change (${Utils.formatDateShort(d.date)})</strong><br/>Significant ${direction} detected.<br/>Rate Δ ≈ ${Utils.formatValue(rateChange, 2)} kg/wk`;

      ui.tooltip
        .html(tt)
        .style("left", `${event.pageX + 15}px`)
        .style("top", `${event.pageY - 28}px`)
        .transition()
        .duration(100)
        .style("opacity", 0.95);
    },

    trendChangeMouseOut(event, d) {
      if (!ui.tooltip) return;
      d3.select(event.currentTarget)
        .select("path")
        .transition()
        .duration(150)
        .attr("transform", "scale(1)"); // Return to normal scale
      ui.tooltip.transition().duration(300).style("opacity", 0);
    },

    contextBrushed(event) {
      // Ignore brushes triggered by zoom or internal calls
      if (
        !event ||
        !event.sourceEvent ||
        event.sourceEvent.type === "zoom" ||
        EventHandlers._isBrushing
      )
        return;
      // Ignore empty selections unless it's the final 'end' event after clearing
      if (!event.selection && event.type !== "end") return;

      EventHandlers._isBrushing = true; // Set flag

      // Clear interaction states
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.highlightedDate = null;
      state.interactiveRegressionRange = { start: null, end: null };

      const selection = event.selection;
      // Ensure context scale is available
      if (!scales.xContext) {
        EventHandlers._isBrushing = false;
        return;
      }

      const newXDomain = selection
        ? selection.map(scales.xContext.invert)
        : scales.xContext.domain();

      // Update focus chart domain
      scales.x.domain(newXDomain);

      // Update zoom transform to match brush, without triggering zoom event
      if (
        zoom &&
        ui.zoomCaptureRect &&
        !ui.zoomCaptureRect.empty() &&
        UISetup._dimensions?.focus?.valid
      ) {
        const [x0Pixel, x1Pixel] = selection || scales.xContext.range();
        // Avoid division by zero or invalid scale factor
        const pixelDiff = x1Pixel - x0Pixel;
        if (pixelDiff <= 0) {
          EventHandlers._isBrushing = false;
          return;
        } // Prevent invalid transform

        const k = UISetup._dimensions.focus.width / pixelDiff;
        const tx = -x0Pixel * k;
        state.lastZoomTransform = d3.zoomIdentity.translate(tx, 0).scale(k);

        // Temporarily disable zoom listener, apply transform, re-enable
        ui.zoomCaptureRect.on("zoom.handler", null); // Use namespaced listener
        ui.zoomCaptureRect.call(zoom.transform, state.lastZoomTransform);
        ui.zoomCaptureRect.on("zoom.handler", EventHandlers.zoomed);
      }

      state.analysisRange.isCustom = false; // Brushing resets custom analysis range
      MasterUpdater.updateAllCharts();
      StatsManager.update();

      // Reset flag after a short delay to allow event queue to clear
      setTimeout(() => {
        EventHandlers._isBrushing = false;
      }, 50);
    },

    zoomed(event) {
      // Ignore zoom events triggered by brush or internal calls
      if (
        !event ||
        !event.sourceEvent ||
        event.sourceEvent.type === "brush" ||
        EventHandlers._isZooming
      )
        return;

      EventHandlers._isZooming = true; // Set flag

      // Clear interaction states
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.highlightedDate = null;
      state.interactiveRegressionRange = { start: null, end: null };

      state.lastZoomTransform = event.transform; // Store the latest transform

      // Ensure context scale is available
      if (!scales.xContext || !scales.x) {
        EventHandlers._isZooming = false;
        return;
      }

      // Update focus chart domain based on zoom transform applied to context scale
      const newXDomain = state.lastZoomTransform
        .rescaleX(scales.xContext)
        .domain();
      scales.x.domain(newXDomain);

      // Update brush selection to reflect zoom, without triggering brush event
      if (ui.brushGroup?.node() && brushes.context) {
        const newBrushSelection = newXDomain.map(scales.xContext);
        // Temporarily disable brush listener, move brush, re-enable
        ui.brushGroup.on("brush.handler", null); // Namespaced listener
        ui.brushGroup.on("end.handler", null);
        // Ensure selection is valid before moving
        if (newBrushSelection.every((v) => !isNaN(v))) {
          ui.brushGroup.call(brushes.context.move, newBrushSelection);
        }
        ui.brushGroup.on("brush.handler", EventHandlers.contextBrushed);
        ui.brushGroup.on("end.handler", EventHandlers.contextBrushed);
      }

      state.analysisRange.isCustom = false; // Zooming resets custom analysis range
      MasterUpdater.updateAllCharts();
      StatsManager.update();

      // Reset flag after a short delay
      setTimeout(() => {
        EventHandlers._isZooming = false;
      }, 50);
    },

    regressionBrushed(event) {
      // Ignore programmatic calls, calls not from user, or calls during zoom/brush
      if (
        !event ||
        !event.sourceEvent ||
        event.sourceEvent.type === "zoom" ||
        event.sourceEvent.type === "brush"
      )
        return;
      // Only react on 'end' event for stability
      if (event.type !== "end") return;

      const selection = event.selection;
      let rangeUpdated = false;

      if (selection && selection[0] !== selection[1]) {
        // Valid brush selection
        // Ensure focus scale is available for inversion
        if (!scales.x) return;

        const startDate = scales.x.invert(selection[0]);
        const endDate = scales.x.invert(selection[1]);
        // Ensure inversion resulted in valid dates
        if (
          !(startDate instanceof Date) ||
          !(endDate instanceof Date) ||
          isNaN(startDate) ||
          isNaN(endDate)
        )
          return;

        const currentRange = state.interactiveRegressionRange;

        // Check if range significantly changed (e.g., by more than a day)
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
        // Brush cleared by user click/drag
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
        EventHandlers.updatePinnedTooltipDisplay(); // Clear pin
        MasterUpdater.updateAllCharts(); // Redraw regression line
        StatsManager.update(); // Recalculate stats using new range
      }
      // Ensure brush visual matches state (might be needed if clearing interactively)
      FocusChartUpdater.updateRegressionBrushDisplay();
    },

    // --- Control Panel Handlers ---
    handleResize: Utils.debounce(() => {
      console.log("EventHandlers: Resize detected, re-rendering chart...");
      state.highlightedDate = null;
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.interactiveRegressionRange = { start: null, end: null };

      if (UISetup.runAll()) {
        // Re-run setup (calculates new dimensions, etc.)
        if (state.isInitialized && state.processedData?.length > 0) {
          DomainManager.initializeDomains(state.processedData); // Re-initialize domains with new size
          // Restore last zoom/brush state visually
          EventHandlers.restoreViewAfterResize();
          MasterUpdater.updateAllCharts();
          StatsManager.update();
          LegendManager.build();
          AnnotationManager.renderList();
        } else if (state.isInitialized) {
          console.warn(
            "EventHandlers: Resize handler - No data to display after setup.",
          );
          // Ensure axes etc. are drawn even with no data
          MasterUpdater.updateAllCharts(); // Will use empty data
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
      // Ensure components are ready before restoring view
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

      // Re-apply last zoom transform to the zoom behavior instance
      ui.zoomCaptureRect.call(zoom.transform, state.lastZoomTransform);

      // Re-apply brush position based on the potentially new context scale range
      if (brushes.context && ui.brushGroup && !ui.brushGroup.empty()) {
        const currentFocusDomain = state.lastZoomTransform
          .rescaleX(scales.xContext)
          .domain();
        // Ensure domain is valid before mapping
        if (currentFocusDomain.every((d) => d instanceof Date && !isNaN(d))) {
          const brushSelection = currentFocusDomain.map(scales.xContext);
          // Move brush without triggering event
          ui.brushGroup.on("brush.handler", null);
          ui.brushGroup.on("end.handler", null);
          // Ensure selection is valid numbers before moving
          if (brushSelection.every((v) => !isNaN(v))) {
            ui.brushGroup.call(brushes.context.move, brushSelection);
          }
          ui.brushGroup.on("brush.handler", EventHandlers.contextBrushed);
          ui.brushGroup.on("end.handler", EventHandlers.contextBrushed);
        }
      }
      // Re-apply regression brush if active
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
      MasterUpdater.updateAllCharts(); // Trigger redraw which recalculates Y domain
      // Stats don't change based on Y-axis view
    },

    handleGoalSubmit(event) {
      event.preventDefault();
      const weightVal = ui.goalWeightInput?.property("value");
      const dateVal = ui.goalDateInput?.property("value");
      const rateVal = ui.goalTargetRateInput?.property("value");

      state.goal.weight = weightVal ? parseFloat(weightVal) : null;
      state.goal.date = dateVal ? new Date(dateVal) : null;
      state.goal.targetRate = rateVal ? parseFloat(rateVal) : null;

      // Validate inputs
      if (state.goal.weight != null && isNaN(state.goal.weight))
        state.goal.weight = null;
      if (state.goal.date instanceof Date && isNaN(state.goal.date))
        state.goal.date = null;
      if (state.goal.targetRate != null && isNaN(state.goal.targetRate))
        state.goal.targetRate = null;

      DataService.saveGoal(); // Persist goal
      StatsManager.update(); // Recalculate goal stats
      MasterUpdater.updateAllCharts(); // Redraw goal line
      LegendManager.build(); // Update legend if goal line visibility changes
    },

    handleTrendlineChange() {
      // Trendline inputs might affect the regression start date if linked
      // Update regression start date state if the UI element changed
      const newRegStartDate = DataService.getRegressionStartDateFromUI();
      // Check if the date actually changed
      const datesDiffer =
        (!state.regressionStartDate && newRegStartDate) || // Was null, now set
        (state.regressionStartDate && !newRegStartDate) || // Was set, now null
        (state.regressionStartDate &&
          newRegStartDate &&
          state.regressionStartDate.getTime() !== newRegStartDate.getTime()); // Both set but different

      if (datesDiffer) {
        state.regressionStartDate = newRegStartDate;
        // Recalculate stats which might depend on the regression slope (e.g., TDEE trend)
        StatsManager.update();
      }
      // Redraw trend lines and potentially the regression line/CI (always redraw on input change)
      MasterUpdater.updateAllCharts();
    },

    handleRegressionToggle(event) {
      const isVisible = event.target.checked;
      // Update both the general flag and specific series visibility
      state.seriesVisibility.regression = isVisible;
      state.seriesVisibility.regressionCI = isVisible; // Link CI visibility

      LegendManager.updateAppearance("regression", isVisible);
      LegendManager.updateAppearance("regressionCI", isVisible);

      MasterUpdater.updateAllCharts(); // Redraw charts
      StatsManager.update(); // Recalculate stats (trend & insights depend on regression)
    },

    handleAnalysisRangeUpdate() {
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.interactiveRegressionRange = { start: null, end: null }; // Clear interactive selection

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
        endDate.setHours(23, 59, 59, 999); // Include full end day

        state.analysisRange = {
          start: startDate,
          end: endDate,
          isCustom: true,
        };
        state.highlightedDate = null; // Clear highlight

        // Update chart view to match the new analysis range
        scales.x.domain([startDate, endDate]);
        EventHandlers.syncBrushAndZoomToFocus(); // Sync brush/zoom to new domain

        EventHandlers.updateAnalysisRangeDisplay();
        StatsManager.update(); // Calculate stats for the NEW range
        MasterUpdater.updateAllCharts(); // Redraw everything

        Utils.showStatusMessage("Analysis range updated.", "info", 1500);
      } else {
        Utils.showStatusMessage("Invalid date range selected.", "error");
        // Optionally revert inputs to current view
        EventHandlers.updateAnalysisRangeInputsFromCurrentView();
      }
    },

    handleAnalysisRangeReset() {
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();
      state.interactiveRegressionRange = { start: null, end: null };
      state.highlightedDate = null;

      state.analysisRange.isCustom = false;
      // Restore view based on last zoom/brush state before custom range was applied
      if (state.lastZoomTransform && scales.xContext) {
        const domainBeforeCustom = state.lastZoomTransform
          .rescaleX(scales.xContext)
          .domain();
        // Ensure domain is valid before setting
        if (domainBeforeCustom.every((d) => d instanceof Date && !isNaN(d))) {
          scales.x.domain(domainBeforeCustom);
        } else {
          // Fallback if rescale failed
          DomainManager.initializeDomains(state.processedData);
        }
      } else {
        // Fallback: Reset to initial domain if no transform saved
        DomainManager.initializeDomains(state.processedData);
      }
      EventHandlers.syncBrushAndZoomToFocus(); // Sync brush/zoom to restored domain

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
      // Ensure components are ready
      if (!scales.x || !scales.xContext || !UISetup._dimensions?.focus?.valid)
        return;

      const currentFocusDomain = scales.x.domain();
      // Ensure domain is valid before proceeding
      if (!currentFocusDomain.every((d) => d instanceof Date && !isNaN(d)))
        return;

      // Update Zoom Transform
      if (zoom && ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
        const [x0Pixel, x1Pixel] = currentFocusDomain.map(scales.xContext);
        // Ensure pixel values are valid
        if (isNaN(x0Pixel) || isNaN(x1Pixel)) return;

        const pixelDiff = x1Pixel - x0Pixel;
        // Avoid division by zero or invalid scale factor
        if (pixelDiff <= 0) return;

        const k = UISetup._dimensions.focus.width / pixelDiff;
        const tx = -x0Pixel * k;
        state.lastZoomTransform = d3.zoomIdentity.translate(tx, 0).scale(k);

        // Apply transform silently
        ui.zoomCaptureRect.on("zoom.handler", null);
        ui.zoomCaptureRect.call(zoom.transform, state.lastZoomTransform);
        ui.zoomCaptureRect.on("zoom.handler", EventHandlers.zoomed);
      }

      // Update Brush Selection
      if (ui.brushGroup?.node() && brushes.context) {
        const newBrushSelection = currentFocusDomain.map(scales.xContext);
        // Ensure selection is valid before moving
        if (newBrushSelection.every((v) => !isNaN(v))) {
          // Move brush silently
          ui.brushGroup.on("brush.handler", null);
          ui.brushGroup.on("end.handler", null);
          ui.brushGroup.call(brushes.context.move, newBrushSelection);
          ui.brushGroup.on("brush.handler", EventHandlers.contextBrushed);
          ui.brushGroup.on("end.handler", EventHandlers.contextBrushed);
        }
      }
      // Update regression brush display
      FocusChartUpdater.updateRegressionBrushDisplay();
    },

    // Wrapper function for stat date click handler to access event target's stored date
    statDateClickWrapper(event) {
      if (event.currentTarget && event.currentTarget.__highlightDate) {
        EventHandlers.statDateClick(event.currentTarget.__highlightDate);
      }
    },

    statDateClick(date) {
      if (!(date instanceof Date) || isNaN(date.getTime())) return;

      // Find the closest data point in processedData (necessary if date comes from all-time stats)
      const dateMs = date.getTime();
      let closestPoint = null;
      let minDiff = Infinity;
      state.processedData.forEach((p) => {
        if (p.date instanceof Date && !isNaN(p.date)) {
          // Ensure point date is valid
          const diff = Math.abs(p.date.getTime() - dateMs);
          if (diff < minDiff) {
            minDiff = diff;
            closestPoint = p;
          }
        }
      });

      if (!closestPoint) return; // No matching point found

      // Toggle highlight state
      if (state.highlightedDate?.getTime() === closestPoint.date.getTime()) {
        state.highlightedDate = null; // Turn off highlight
        state.pinnedTooltipData = null;
        EventHandlers.updatePinnedTooltipDisplay(); // Unpin if it was pinned
        ui.tooltip.style("opacity", 0);
      } else {
        state.highlightedDate = closestPoint.date; // Set highlight

        // --- Pan/Zoom to the highlighted date ---
        if (!scales.x || !scales.xContext || !UISetup._dimensions?.focus?.valid)
          return; // Scales needed

        const xDomain = scales.x.domain();
        // Ensure domain is valid before calculating width
        if (!xDomain.every((d) => d instanceof Date && !isNaN(d))) return;

        const viewWidthMs = xDomain[1].getTime() - xDomain[0].getTime();
        const halfViewMs = viewWidthMs / 2;

        // Calculate new domain centered on the point's time
        const targetStartTime = closestPoint.date.getTime() - halfViewMs;
        const targetEndTime = targetStartTime + viewWidthMs;

        // Clamp to the full data range allowed by the context scale
        const [minDate, maxDate] = scales.xContext.domain();
        // Ensure context domain is valid
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

        // If adjusting start pushed end beyond max, clamp end and recalculate start
        if (clampedEndTime > maxTime) {
          clampedEndTime = maxTime;
          clampedStartTime = clampedEndTime - viewWidthMs;
          // Re-clamp start if necessary
          clampedStartTime = Math.max(minTime, clampedStartTime);
        }
        // Final domain check
        if (clampedEndTime < clampedStartTime)
          clampedEndTime = clampedStartTime; // Avoid inverted domain

        const finalDomain = [
          new Date(clampedStartTime),
          new Date(clampedEndTime),
        ];

        scales.x.domain(finalDomain); // Set new domain on focus scale
        state.analysisRange.isCustom = false; // Panning resets custom analysis range flag
        EventHandlers.syncBrushAndZoomToFocus(); // Update brush/zoom to match new domain
      }

      MasterUpdater.updateAllCharts(); // Redraw chart with new view/highlight
      StatsManager.update(); // Update stats for the new view range
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

      resultDisplay.classed("error", false).text("Calculating..."); // Clear previous result

      if (isNaN(futureIntake) || isNaN(durationDays) || durationDays <= 0) {
        resultDisplay
          .classed("error", true)
          .text("Please enter valid intake and duration > 0.");
        return;
      }

      // Get current stats to find best TDEE estimate and starting weight
      const currentStats = StatsManager.calculateAllStats(); // Use the main calc function
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

      // Use latest SMA or raw weight as starting point
      const startWeight = currentStats.currentSma ?? currentStats.currentWeight;

      if (startWeight == null || isNaN(startWeight)) {
        resultDisplay
          .classed("error", true)
          .text("Cannot project: Current weight unknown.");
        return;
      }

      const projectedWeight = startWeight + totalWeightChangeKg;
      const fv = Utils.formatValue;
      resultDisplay.html(`Based on ${tdeeSource} TDEE ≈ ${fv(tdeeEstimate, 0)} kcal:<br/>
              Est. change: ${fv(totalWeightChangeKg, 1)} kg in ${durationDays} days.<br/>
              Projected Weight: <strong>${fv(projectedWeight, 1)} kg</strong>.`);
    },

    handleBackgroundClick(event) {
      const targetNode = event.target;

      // Determine if click was on an interactive element we *don't* want to clear state for
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
      const isStatDate = d3.select(targetNode).classed("highlightable"); // Click on highlightable stat date

      // Check if click is on SVG background or zoom capture rectangle
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
        let redrawNeeded = false; // Track if redraw is necessary

        // Clear highlight
        if (state.highlightedDate) {
          state.highlightedDate = null;
          redrawNeeded = true; // Need to redraw dots/marker
        }
        // Clear pin
        if (state.pinnedTooltipData) {
          state.pinnedTooltipData = null;
          EventHandlers.updatePinnedTooltipDisplay();
          ui.tooltip.style("opacity", 0);
          // No redraw needed just for clearing pin display
        }
        // Clear interactive regression brush via its handler
        if (
          state.interactiveRegressionRange.start ||
          state.interactiveRegressionRange.end
        ) {
          if (
            brushes.regression &&
            ui.regressionBrushGroup &&
            !ui.regressionBrushGroup.empty()
          ) {
            // Programmatically move the brush to null to trigger the clearing logic in its handler
            // The regressionBrushed handler will trigger necessary updates if the range changed.
            ui.regressionBrushGroup.on("end.handler", null); // Prevent loop
            ui.regressionBrushGroup.call(brushes.regression.move, null);
            ui.regressionBrushGroup.on(
              "end.handler",
              EventHandlers.regressionBrushed,
            );
            // Explicitly update display in case handler doesn't run (e.g., already null)
            FocusChartUpdater.updateRegressionBrushDisplay();
            // Assume stats/insights need update if regression range changed
            if (
              state.interactiveRegressionRange.start ||
              state.interactiveRegressionRange.end
            ) {
              // Check if it actually cleared
              state.interactiveRegressionRange = { start: null, end: null };
              MasterUpdater.updateAllCharts(); // Redraw regression line
              StatsManager.update(); // Recalculate stats
              redrawNeeded = false; // Updates handled by MasterUpdater
            }
          }
        }
        // Redraw necessary parts if highlight was cleared
        if (redrawNeeded) {
          FocusChartUpdater.updateDots(state.filteredData);
          FocusChartUpdater.updateHighlightMarker(state.filteredData);
        }
      }
      // Let specific handlers for dots, annotations, etc., manage their own state.
    },

    getAnalysisDateRange() {
      // Priority 1: Custom range set via UI
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
      // Priority 2: Current chart view (focus scale domain)
      const chartDomain = scales.x?.domain();
      if (
        chartDomain?.length === 2 &&
        chartDomain[0] instanceof Date &&
        chartDomain[1] instanceof Date &&
        !isNaN(chartDomain[0]) &&
        !isNaN(chartDomain[1])
      ) {
        // Return dates clamped to midnight start/end of the view day
        const start = new Date(chartDomain[0]);
        start.setHours(0, 0, 0, 0);
        const end = new Date(chartDomain[1]);
        end.setHours(23, 59, 59, 999);
        return { start: start, end: end };
      }
      // Fallback (e.g., if chart not initialized)
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
      // Priority 1: Interactive brush selection (if valid)
      if (
        state.interactiveRegressionRange.start instanceof Date &&
        !isNaN(state.interactiveRegressionRange.start) &&
        state.interactiveRegressionRange.end instanceof Date &&
        !isNaN(state.interactiveRegressionRange.end)
      ) {
        return { ...state.interactiveRegressionRange };
      }
      // Priority 2: UI-defined start date within the current analysis range
      const analysisRange = EventHandlers.getAnalysisDateRange();
      // Ensure analysis range is valid before proceeding
      if (
        !(analysisRange.start instanceof Date) ||
        !(analysisRange.end instanceof Date)
      ) {
        console.warn("EventHandlers: Invalid analysis range for regression.");
        return { start: null, end: null }; // Return invalid range
      }

      const uiRegressionStart = state.regressionStartDate; // Use the state value updated by DataService/EventHandlers

      // Use UI start date only if it's valid and falls within the analysis range
      const start =
        uiRegressionStart instanceof Date &&
        !isNaN(uiRegressionStart) &&
        uiRegressionStart >= analysisRange.start &&
        uiRegressionStart <= analysisRange.end
          ? uiRegressionStart
          : analysisRange.start; // Otherwise, use the start of the analysis range

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

      // Update the small text in the analysis results heading
      if (ui.analysisResultsHeading) {
        const headingSmallText = state.analysisRange.isCustom
          ? "(Custom Range)"
          : "(Chart View)";
        ui.analysisResultsHeading.select("small").text(headingSmallText);
      }
    },

    // --- Setup All Handlers ---
    setupAll() {
      console.log("EventHandlers: Setting up event listeners...");
      window.addEventListener("resize", EventHandlers.handleResize);
      ui.themeToggle?.on("click", EventHandlers.handleThemeToggle);
      ui.dynamicYAxisToggle?.on(
        "change",
        EventHandlers.handleDynamicYAxisToggle,
      );

      // Form submissions
      d3.select("#goal-setting-form").on(
        "submit",
        EventHandlers.handleGoalSubmit,
      );
      ui.annotationForm?.on("submit", AnnotationManager.handleSubmit);

      // Input changes
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

      // Button clicks
      ui.updateAnalysisRangeBtn?.on(
        "click",
        EventHandlers.handleAnalysisRangeUpdate,
      );
      ui.resetAnalysisRangeBtn?.on(
        "click",
        EventHandlers.handleAnalysisRangeReset,
      );
      ui.whatIfSubmitBtn?.on("click", EventHandlers.handleWhatIfSubmit);

      // What-If Enter key press
      ui.whatIfIntakeInput?.on("keydown", (event) => {
        if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
      });
      ui.whatIfDurationInput?.on("keydown", (event) => {
        if (event.key === "Enter") EventHandlers.handleWhatIfSubmit(event);
      });

      // Background click for clearing interactions
      ui.svg?.on("click", EventHandlers.handleBackgroundClick);

      // Attach brush/zoom handlers using namespacing for easier removal/management
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
  };

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

      // Special handling for linked visibilities
      if (seriesId === "regression") {
        // Link Regression CI visibility to main regression line
        state.seriesVisibility.regressionCI = isVisible;
        LegendManager.updateAppearance("regressionCI", isVisible);
        // Also update the toggle input state if it exists
        ui.regressionToggle?.property("checked", isVisible);
      } else if (seriesId === "bf") {
        // Toggle visibility of the second Y axis label with BF line
        ui.svg
          ?.select(".y-axis-label2")
          .style("display", isVisible ? null : "none");
      }

      // Clear interactions that might become invalid
      state.highlightedDate = null;
      state.pinnedTooltipData = null;
      EventHandlers.updatePinnedTooltipDisplay();

      // Update the specific legend item's appearance
      LegendManager.updateAppearance(seriesId, isVisible);

      // Trigger necessary updates
      MasterUpdater.updateAllCharts(); // Redraw charts with new visibility
      StatsManager.update(); // Recalculate stats if visibility affects insights/trends
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
      ui.legendContainer.html(""); // Clear existing items

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
          id: "expected",
          label: "Expected Wgt (Net Cal)",
          type: "line",
          colorKey: "expectedLineColor",
          styleClass: "expected-weight-line",
          dash: "2, 3",
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
        // Conditionally add goal line item
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
        // Body Fat placeholder - uncomment if BF% feature is fully added
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
        // Only create item if its visibility state is defined
        if (state.seriesVisibility.hasOwnProperty(item.id)) {
          const isVisible = state.seriesVisibility[item.id];
          const itemColor = colors[item.colorKey] || "#000"; // Fallback color
          const areaColor = colors[item.areaColorKey] || "rgba(0,0,0,0.1)";

          const itemDiv = ui.legendContainer
            .append("div")
            .attr("class", `legend-item ${item.styleClass}`)
            .attr("data-id", item.id)
            .classed("hidden", !isVisible)
            .on("click", () =>
              LegendManager.toggleSeriesVisibility(item.id, !isVisible),
            ); // Toggle on click

          const swatch = itemDiv
            .append("span")
            .attr("class", `legend-swatch type-${item.type}`); // Add type class

          // Style swatch based on type
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
              if (item.dash) swatch.classed("dashed", true); // Use CSS for dashes if possible
              break;
            case "area+line":
              swatch.style("background-color", areaColor);
              swatch.style("border", `1px solid ${itemColor}`); // Line color as border
              // Add inner element to represent the line more clearly if needed
              // swatch.append("span").attr("class", "line-inside").style("background-color", itemColor);
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
      state.annotations = []; // Reset before loading
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Validate and potentially migrate old format
          if (Array.isArray(parsed)) {
            state.annotations = parsed
              .map((a) => ({
                // Ensure required fields and add ID if missing
                id: a.id ?? Date.now() + Math.random(), // Simple unique ID fallback
                date: a.date, // Expecting YYYY-MM-DD string
                text: a.text || "", // Ensure text is at least empty string
                type: a.type === "range" ? "range" : "point", // Default to 'point'
              }))
              .filter(
                (a) =>
                  a.date &&
                  typeof a.text === "string" &&
                  /^\d{4}-\d{2}-\d{2}$/.test(a.date),
              ); // Basic validation including date format
          }
        } catch (e) {
          console.error(
            "AnnotationManager: Error loading/parsing annotations:",
            e,
          );
          // Keep state.annotations as empty array
        }
      }
      state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort after loading/parsing
      AnnotationManager.renderList(); // Update UI list after loading
    },

    save() {
      try {
        // Only save essential fields
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
        return false; // Indicate failure
      }
      date.setHours(0, 0, 0, 0); // Normalize date

      const newAnnotation = {
        id: Date.now(), // Use timestamp as simple unique ID
        date: date.toISOString().slice(0, 10), // Store as YYYY-MM-DD string
        text: text.trim(),
        type: type === "range" ? "range" : "point", // Sanitize type
      };

      state.annotations.push(newAnnotation);
      state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date)); // Keep sorted

      AnnotationManager.save();
      AnnotationManager.renderList();
      FocusChartUpdater.updateAnnotations(state.filteredData); // Redraw markers

      Utils.showStatusMessage("Annotation added.", "success", 1500);
      return true; // Indicate success
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
      const targetTime = new Date(targetDate).setHours(0, 0, 0, 0); // Normalize target date
      // Find the first annotation matching the date (ignoring time)
      return state.annotations.find((a) => {
        const annoDate = new Date(a.date); // Assumes date is YYYY-MM-DD
        // Check if annoDate is valid before setting hours
        return (
          !isNaN(annoDate.getTime()) &&
          annoDate.setHours(0, 0, 0, 0) === targetTime
        );
      });
    },

    handleSubmit(event) {
      event.preventDefault(); // Prevent default form submission
      const dateVal = ui.annotationDateInput?.property("value");
      const textVal = ui.annotationTextInput?.property("value");
      // const typeVal = ui.annotationTypeInput?.property("value") || "point"; // If type selector exists

      if (AnnotationManager.add(dateVal, textVal /*, typeVal */)) {
        // Clear form on successful addition
        ui.annotationDateInput?.property("value", "");
        ui.annotationTextInput?.property("value", "");
      }
    },

    renderList() {
      const list = ui.annotationList;
      if (!list || list.empty()) return; // Don't proceed if list container doesn't exist

      list.html(""); // Clear previous entries

      if (state.annotations.length === 0) {
        list
          .append("li")
          .attr("class", "empty-msg")
          .text("No annotations added yet.");
        return;
      }

      const items = list
        .selectAll("li.annotation-list-item") // Use specific class
        .data(state.annotations, (d) => d.id) // Key by unique ID
        .join("li") // Use join pattern for enter/update/exit
        .attr("class", "annotation-list-item");

      // Add content structure (can be refined with more complex HTML if needed)
      items
        .append("span")
        .attr("class", "annotation-date")
        .text((d) => {
          const dateObj = new Date(d.date); // Assumes YYYY-MM-DD
          return Utils.formatDateShort(dateObj); // Format date
        });

      items
        .append("span")
        .attr("class", "annotation-text")
        .text((d) => d.text); // Display text

      items
        .append("button")
        .attr("class", "remove-annotation")
        .attr("aria-label", "Remove annotation") // Accessibility
        .html("&times;") // Use HTML entity for 'x' button
        .on("click", (event, d) => {
          event.stopPropagation(); // Prevent triggering potential li click listeners
          AnnotationManager.remove(d.id); // Call remove function with ID
        });
    },
  };

  // ========================================================================
  // Initialization & Public Interface
  // ========================================================================

  // Cache D3 selections for UI elements
  function _cacheSelectors() {
    console.log("Initialization: Caching UI element selections...");
    ui.body = d3.select("body");

    // Define elements and their corresponding keys in the 'ui' object
    // Use a map for easier management and potential renaming
    const elementIdMap = {
      // Containers
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
      // Controls & Inputs
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
      // Stat Display Elements (IDs match keys in statElements cache)
      "starting-weight": "startingWeight",
      "current-weight": "currentWeight",
      "current-sma": "currentSma",
      "total-change": "totalChange",
      "max-weight": "maxWeight",
      "max-weight-date": "maxWeightDate",
      "min-weight": "minWeight",
      "min-weight-date": "minWeightDate",
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
    ]; // IDs essential for basic operation

    // Clear statElements cache before populating
    ui.statElements = {};

    for (const [id, key] of Object.entries(elementIdMap)) {
      const elementNode = Utils.getElementByIdSafe(id);
      if (elementNode) {
        ui[key] = d3.select(elementNode); // Store D3 selection

        // Cache direct node reference for elements that need frequent text updates (stats)
        if (
          elementNode.classList.contains("stat-value") ||
          elementNode.classList.contains("stat-date") ||
          elementNode.classList.contains("stat-details") ||
          elementNode.classList.contains("feedback") ||
          elementNode.classList.contains("what-if-result") ||
          elementNode.classList.contains("analysis-range-display") ||
          id === "regression-start-date-label"
        ) {
          ui.statElements[key] = elementNode;
        }
      } else {
        ui[key] = d3.select(null); // Store empty selection if not found
        if (criticalIds.includes(id)) {
          console.error(
            `Initialization Error: Critical UI element #${id} not found.`,
          );
          missingCritical = true;
        } else {
          // console.warn(`Initialization Warning: UI element #${id} not found.`); // Optional warning for non-critical elements
        }
      }
    }

    // Set initial regression visibility state based on toggle (if it exists)
    if (ui.regressionToggle && !ui.regressionToggle.empty()) {
      state.seriesVisibility.regression =
        ui.regressionToggle.property("checked");
      state.seriesVisibility.regressionCI = state.seriesVisibility.regression; // Link CI
    } else {
      // Default if toggle doesn't exist
      state.seriesVisibility.regression = true;
      state.seriesVisibility.regressionCI = true;
    }
    // Set initial dynamic Y axis state based on toggle
    state.useDynamicYAxis =
      ui.dynamicYAxisToggle?.property("checked") ??
      localStorage.getItem(CONFIG.localStorageKeys.dynamicYAxis) === "true"; // Fallback to localStorage

    if (missingCritical) {
      throw new Error(
        "Missing critical UI elements required for chart initialization. Check console for details.",
      );
    }
    console.log("Initialization: UI element caching finished.");
  }

  // Main initialization function
  async function initialize() {
    console.log(
      "Initialization: Starting Weight Insights Chart (v3.1 Refactored)...",
    );
    try {
      // 1. Cache UI Elements & Basic Setup
      _cacheSelectors(); // Find and store references to DOM elements
      ThemeManager.init(); // Load theme preference and colors

      // Update state based on UI potentially before data loading (e.g., regression start date)
      state.regressionStartDate = DataService.getRegressionStartDateFromUI();

      // 2. Load & Process Data
      const rawDataObjects = await DataService.fetchData(); // Fetch from data.json
      state.rawData = DataService.mergeRawData(rawDataObjects); // Merge sources
      state.processedData = DataService.processData(state.rawData); // Calculate SMA, rates, etc.

      // 3. Load Persisted State
      DataService.loadGoal(); // Load goal from localStorage
      AnnotationManager.load(); // Load annotations

      // 4. Setup D3 Chart Structure (SVG, Scales, Axes, etc.)
      if (!UISetup.runAll()) {
        throw new Error("Chart UI setup failed. Dimensions might be invalid.");
      }

      // 5. Initialize Domains & View
      if (state.processedData?.length > 0) {
        DomainManager.initializeDomains(state.processedData);
        EventHandlers.syncBrushAndZoomToFocus(); // Set initial brush/zoom state
      } else {
        console.warn(
          "Initialization: No data available. Chart will be mostly empty.",
        );
        // Set placeholder domains if no data?
        DomainManager.setXDomains([]);
        DomainManager.setContextYDomain([]);
        DomainManager.setFocusYDomains([], null);
        DomainManager.setSecondaryYDomains([]);
        DomainManager.setScatterPlotDomains([]);
      }

      // 6. Build Legend
      LegendManager.build();

      // 7. Setup Event Handlers
      EventHandlers.setupAll();

      // 8. Initial Render & Stats Calculation
      state.isInitialized = true;
      MasterUpdater.updateAllCharts(); // Perform the first full draw
      StatsManager.update(); // Calculate and display initial stats & insights

      console.log(
        "Initialization: Chart successfully initialized (v3.1 Refactored).",
      );
    } catch (error) {
      console.error("CRITICAL INITIALIZATION ERROR:", error);
      state.isInitialized = false; // Ensure state reflects failure
      // Display a user-friendly error message in the chart container
      if (ui.chartContainer && !ui.chartContainer.empty()) {
        ui.chartContainer.html(
          `<div class="init-error"><h2>Chart Initialization Failed</h2><p>Could not render the chart due to an error:</p><pre>${error.message}</pre><p>Please check the browser console for more details.</p></div>`,
        );
      }
      // Optionally dim other parts of the UI to highlight the error
      d3.selectAll(
        ".dashboard-container > *:not(#chart-container), .sidebar > *",
      )
        .style("opacity", 0.3)
        .style("pointer-events", "none");
      ui.chartContainer?.style("opacity", 1).style("pointer-events", "auto");
    }
  }

  // --- Public Interface ---
  return {
    initialize: initialize,
    // Expose other methods if needed for external control, e.g.:
    // refreshData: async () => { /* logic to reload and redraw */ },
    // setTheme: ThemeManager.setTheme,
  };
})(); // End of IIFE

// --- Run Initialization on DOMContentLoaded ---
console.log(
  "chart.js (v3.1 Refactored): Setting up DOMContentLoaded listener.",
);
document.addEventListener("DOMContentLoaded", () => {
  console.log("chart.js (v3.1 Refactored): DOMContentLoaded fired.");
  // Use setTimeout to ensure the browser has definitely finished layout/parsing, even with defer
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
      WeightTrackerChart.initialize(); // Call the async init function
    } else {
      console.error(
        "chart.js (v3.1 Refactored): ERROR - WeightTrackerChart or initialize is not defined!",
      );
      document.body.innerHTML =
        '<div class="init-error"><h2>Initialization Failed</h2><p>The chart script (WeightTrackerChart) did not load or define correctly. Check the console.</p></div>';
    }
  }, 0); // Timeout 0 yields execution briefly
});
console.log("chart.js (v3.1 Refactored): Script parsing finished.");
