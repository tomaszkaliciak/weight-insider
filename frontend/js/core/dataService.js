// js/core/dataService.js
// Handles fetching, merging, initial processing, and utility calculations for weight data.

import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";

// Assume simple-statistics (ss) is loaded globally or provide check/fallback
const ss = window.ss || {
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
    return 1.96;
  },
};

export const DataService = {
  // --- Fetching & Basic Merging ---
  async fetchData() {
    console.log("DataService: Fetching data from data.json...");
    try {
      const response = await fetch("../data.json"); // Adjust path if needed
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
      }; // Return empty structure on error
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
      // Basic validation of date string format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        console.warn(
          `DataService: Skipping invalid date key format: ${dateStr}`,
        );
        continue;
      }
      const dateObj = new Date(dateStr + "T00:00:00"); // Ensure parsing as local date at midnight
      if (isNaN(dateObj.getTime())) {
        console.warn(
          `DataService: Skipping invalid date string after parsing: ${dateStr}`,
        );
        continue;
      }
      // Note: Fields not present in raw data will default to null/undefined here
      const intake = calorieIntake[dateStr] ?? null;
      const expenditure = googleFitExpenditure[dateStr] ?? null;
      const netBalance = this._calculateDailyBalance(intake, expenditure); // Use internal helper

      mergedData.push({
        dateString: dateStr,
        date: dateObj, // Store Date object
        value: weights[dateStr] ?? null,
        bfPercent: bodyFat[dateStr] ?? null,
        calorieIntake: intake,
        googleFitTDEE: expenditure,
        netBalance: netBalance,
        // Initialize all derived fields to null initially
        sma: null,
        ema: null,
        stdDev: null,
        lowerBound: null,
        upperBound: null,
        lbm: null,
        fm: null,
        lbmSma: null,
        fmSma: null,
        isOutlier: false,
        dailySmaRate: null,
        smoothedWeeklyRate: null,
        rateMovingAverage: null,
        rollingVolatility: null,
        tdeeTrend: null,
        tdeeDifference: null,
        avgTdeeDifference: null,
        adaptiveTDEE: null,
        regressionValue: null,
      });
    }
    // Sort by date ascending
    mergedData.sort((a, b) => a.date - b.date);
    console.log(
      `DataService: Merged data for ${mergedData.length} unique dates.`,
    );
    return mergedData;
  },

  // --- Data Processing Pipeline (Initial Calculations) ---
  processData(rawData) {
    console.log("DataService: Starting data processing pipeline...");
    if (!Array.isArray(rawData) || rawData.length === 0) {
      console.warn("DataService: No raw data to process.");
      return [];
    }
    // Create a new array to avoid modifying the input directly
    let processed = Utils.deepClone(rawData);

    // Apply processing steps sequentially
    processed = this._calculateBodyComposition(processed);
    processed = this._calculateSMAAndStdDev(processed);
    processed = this._calculateEMA(processed);
    processed = this._identifyOutliers(processed);
    processed = this._calculateRollingVolatility(
      processed,
      CONFIG.ROLLING_VOLATILITY_WINDOW,
    );
    processed = this._calculateDailyRatesAndTDEETrend(processed);
    processed = this._calculateAdaptiveTDEE(processed);
    processed = this._smoothRatesAndTDEEDifference(processed);
    processed = this._calculateRateMovingAverage(processed);

    console.log("DataService: Data processing pipeline completed.");
    return processed;
  },

  // --- Processing Steps (Internal Helpers - rely on CONFIG, not state) ---
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
  _calculateSMAAndStdDev(data) {
    const windowSize = CONFIG.movingAverageWindow;
    const stdDevMult = CONFIG.stdDevMultiplier;
    return data.map((d, i, arr) => {
      const windowDataPoints = arr.slice(
        Math.max(0, i - windowSize + 1),
        i + 1,
      );
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
      return { ...d, sma, stdDev, lowerBound, upperBound, lbmSma, fmSma };
    });
  },
  _calculateEMA(data) {
    const windowSize = CONFIG.emaWindow;
    if (windowSize <= 0) return data;
    const alpha = 2 / (windowSize + 1);
    let previousEMA = null;
    return data.map((d, i) => {
      let currentEMA = null;
      const currentValue = d.value;
      if (currentValue != null && !isNaN(currentValue)) {
        if (previousEMA === null) {
          currentEMA = currentValue;
        } else {
          currentEMA = currentValue * alpha + previousEMA * (1 - alpha);
        }
        previousEMA = currentEMA;
      } else if (previousEMA !== null) {
        currentEMA = previousEMA;
      } // Carry forward last valid EMA if current value is null
      return { ...d, ema: currentEMA };
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
        // Check stdDev > 0 to avoid division issues
        if (Math.abs(d.value - d.sma) > threshold * d.stdDev) {
          isOutlier = true;
        }
      }
      return { ...d, isOutlier };
    });
  },
  _calculateRollingVolatility(data, windowSize) {
    // console.log(`DataService: Calculating rolling volatility (window: ${windowSize} days)...`); // Less verbose log
    return data.map((d, i, arr) => {
      let rollingVolatility = null;
      const windowStartIndex = Math.max(0, i - windowSize + 1);
      const windowDataPoints = arr.slice(windowStartIndex, i + 1);
      const validDeviations = windowDataPoints
        .filter(
          (p) =>
            p.value != null &&
            p.sma != null &&
            !p.isOutlier &&
            !isNaN(p.value) &&
            !isNaN(p.sma),
        )
        .map((p) => p.value - p.sma);
      if (
        validDeviations.length >= 2 &&
        typeof ss?.standardDeviation === "function"
      ) {
        try {
          rollingVolatility = ss.standardDeviation(validDeviations);
        } catch (e) {
          console.warn(
            `DataService: Error calculating stdev for rolling volatility at index ${i}`,
            e,
          );
          rollingVolatility = null;
        }
      }
      return { ...d, rollingVolatility };
    });
  },
  _calculateDailyRatesAndTDEETrend(data) {
    return data.map((d, i, arr) => {
      let dailySmaRate = null;
      let tdeeTrend = null;
      if (i > 0) {
        const prev = arr[i - 1];
        if (
          prev.sma != null &&
          d.sma != null &&
          d.date instanceof Date &&
          prev.date instanceof Date &&
          !isNaN(d.date) &&
          !isNaN(prev.date)
        ) {
          const timeDiffDays =
            (d.date.getTime() - prev.date.getTime()) / 86400000;
          // Allow calculation even if timeDiffDays is slightly larger than 1 (e.g., due to DST or missing days) up to the MA window
          if (timeDiffDays > 0 && timeDiffDays <= CONFIG.movingAverageWindow) {
            const smaDiff = d.sma - prev.sma;
            dailySmaRate = smaDiff / timeDiffDays;
            if (prev.calorieIntake != null && !isNaN(prev.calorieIntake)) {
              // Use previous day's intake for trend TDEE
              const dailyDeficitSurplusKcals =
                dailySmaRate * CONFIG.KCALS_PER_KG;
              tdeeTrend = prev.calorieIntake - dailyDeficitSurplusKcals;
            }
          }
        }
      }
      return { ...d, dailySmaRate, tdeeTrend };
    });
  },
  _calculateAdaptiveTDEE(data) {
    const windowSize = CONFIG.adaptiveTDEEWindow;
    const minDataRatio = 0.7; // Minimum ratio of valid intake days needed in window
    return data.map((d, i, arr) => {
      let adaptiveTDEE = null;
      if (i >= windowSize - 1) {
        const windowData = arr.slice(i - windowSize + 1, i + 1);
        const startPoint = windowData[0];
        const endPoint = d; // Current point is the end point
        const validIntakes = windowData
          .map((p) => p.calorieIntake)
          .filter((v) => v != null && !isNaN(v));
        // Ensure start/end points have valid SMA and dates
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
            // Avoid division by zero if dates are same
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
      tdeeDifference: tdeeDifferences[i], // Store raw difference
      avgTdeeDifference: smoothedTdeeDifferences[i], // Store smoothed difference
    }));
  },
  _calculateRateMovingAverage(data) {
    const weeklyRates = data.map((d) => d.smoothedWeeklyRate);
    const rateMovingAverage = Utils.calculateRollingAverage(
      weeklyRates,
      CONFIG.rateMovingAverageWindow,
    );
    return data.map((d, i) => ({
      ...d,
      rateMovingAverage: rateMovingAverage[i],
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

  // --- Regression & Trend Calculations (Used by StatsManager) ---
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
      console.log(
        `[DataService Reg] Not enough points (${filteredData.length}) for regression starting ${startDate?.toISOString().slice(0, 10)}.`,
      );
      return { slope: null, intercept: null, points: [] };
    }

    filteredData.sort((a, b) => a.date - b.date);
    const firstDateMs = filteredData[0].date.getTime();
    const dayInMillis = 86400000;
    const dataForRegression = filteredData.map((d) => [
      (d.date.getTime() - firstDateMs) / dayInMillis,
      d.value,
    ]);

    try {
      if (!ss || typeof ss.linearRegression !== "function") {
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

      const slope = regressionLine.m;
      const intercept = regressionLine.b;

      // Calculate regression points directly
      const plotPoints = filteredData
        .map((d) => {
          const xValue = (d.date.getTime() - firstDateMs) / dayInMillis;
          const regressionValue = slope * xValue + intercept;
          // Ensure regressionValue is finite, otherwise return null or handle appropriately
          const finalRegressionValue = isFinite(regressionValue)
            ? regressionValue
            : null;
          return { date: d.date, regressionValue: finalRegressionValue };
        })
        .filter((p) => p.regressionValue !== null); // Filter out points where regression couldn't be calculated

      console.log(
        `[DataService Reg] Success. Slope: ${slope.toFixed(4)}, Intercept: ${intercept.toFixed(2)}, Points: ${plotPoints.length}`,
      );
      return { slope, intercept, points: plotPoints };
    } catch (e) {
      console.error("DataService: Error calculating linear regression:", e);
      return { slope: null, intercept: null, points: [] };
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

  /** Aggregates processed data into weekly statistics (Used by StatsManager) */
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
    const getWeekKey = (date) => d3.timeFormat("%Y-W%W")(d3.timeMonday(date));
    const groupedByWeek = d3.group(rangeData, (d) => getWeekKey(d.date));

    groupedByWeek.forEach((weekData, weekKey) => {
      weekData.sort((a, b) => a.date - b.date);
      if (weekData.length > 0) {
        // Ensure week has data from range
        const avgMetric = (data, metric) => {
          const valid = data
            .map((d) => d[metric])
            .filter((v) => v != null && !isNaN(v));
          return valid.length > 0 ? d3.mean(valid) : null;
        };
        weeklyStats.push({
          weekKey,
          weekStartDate: d3.timeMonday(weekData[0].date),
          avgNetCal: avgMetric(weekData, "netBalance"),
          weeklyRate: avgMetric(weekData, "smoothedWeeklyRate"),
          avgWeight: avgMetric(weekData, "sma") ?? avgMetric(weekData, "value"), // Fallback to raw if SMA missing
          avgExpenditure: avgMetric(weekData, "googleFitTDEE"),
          avgIntake: avgMetric(weekData, "calorieIntake"),
        });
      }
    });
    weeklyStats.sort((a, b) => a.weekStartDate - b.weekStartDate);
    return weeklyStats;
  },
};
