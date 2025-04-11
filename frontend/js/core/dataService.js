// --- START OF FILE dataService.js ---

import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";
import { state } from "../state.js";
import { ui } from "../ui/uiCache.js";

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
      const response = await fetch("../data.json");
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
      dateObj.setHours(0, 0, 0, 0);
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
        notes: undefined,
        calorieIntake: intake,
        googleFitTDEE: expenditure,
        netBalance: netBalance,
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
    let processed = [...rawData];
    processed = DataService._calculateBodyComposition(processed);
    processed = DataService._calculateSMAAndStdDev(processed);
    processed = DataService._calculateEMA(processed);
    processed = DataService._identifyOutliers(processed);
    processed = DataService._calculateRollingVolatility(
      processed,
      CONFIG.ROLLING_VOLATILITY_WINDOW,
    );
    processed = DataService._calculateDailyRatesAndTDEETrend(processed);
    processed = DataService._calculateAdaptiveTDEE(processed);
    processed = DataService._smoothRatesAndTDEEDifference(processed);
    processed = DataService._calculateRateMovingAverage(processed);
    console.log("DataService: Data processing pipeline completed.");
    const validSMACount = processed.filter((d) => d.sma != null).length;
    const validEMACount = processed.filter((d) => d.ema != null).length;
    const validRateCount = processed.filter(
      (d) => d.smoothedWeeklyRate != null,
    ).length;
    const validAdaptiveTDEECount = processed.filter(
      (d) => d.adaptiveTDEE != null,
    ).length;
    const validRollingVolCount = processed.filter(
      (d) => d.rollingVolatility != null,
    ).length;
    const validRateMACount = processed.filter(
      (d) => d.rateMovingAverage != null,
    ).length;
    console.log(
      `DataService: Processed data stats - SMA: ${validSMACount}, EMA: ${validEMACount}, Smoothed Rate: ${validRateCount}, Adaptive TDEE: ${validAdaptiveTDEECount}, Rolling Volatility: ${validRollingVolCount}, Rate MA: ${validRateMACount}`,
    );
    return processed;
  },

  // --- Processing Steps (Internal Helpers) ---
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
        sma = d3.mean(validValuesInWindow); // Use global d3
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
        validLbmInWindow.length > 0 ? d3.mean(validLbmInWindow) : null; // Use global d3
      const validFmInWindow = windowDataPoints
        .map((p) => p.fm)
        .filter((v) => v != null && !isNaN(v));
      const fmSma =
        validFmInWindow.length > 0 ? d3.mean(validFmInWindow) : null; // Use global d3
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
      }

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
        if (Math.abs(d.value - d.sma) > threshold * d.stdDev) {
          isOutlier = true;
        }
      }
      return { ...d, isOutlier };
    });
  },

  /**
   * Calculates rolling volatility (std dev of raw value vs SMA, excluding outliers).
   * @param {Array<object>} data - Data with `date`, `value`, `sma`, `isOutlier`.
   * @param {number} windowSize - The number of days for the rolling window.
   * @returns {Array<object>} Data array with added `rollingVolatility`.
   */
  _calculateRollingVolatility(data, windowSize) {
    console.log(
      `DataService: Calculating rolling volatility (window: ${windowSize} days)...`,
    );
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
            `DataService: Error calculating standard deviation for rolling volatility at index ${i}`,
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
          const totalSmaChange = endPoint.sma - startPoint.sma; // Use global d3
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
      tdeeDifference: tdeeDifferences[i],
      avgTdeeDifference: smoothedTdeeDifferences[i],
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
      const pointsForCI = filteredData.map((d) => ({ ...d, value: d.value }));
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

  // +++ calculateWeeklyStats Method (Moved Here) +++
  /**
   * Aggregates processed data into weekly statistics.
   * @param {Array<object>} processedData - The full processed data array.
   * @param {Date|null} startDate - Optional start date for filtering data before aggregation.
   * @param {Date|null} endDate - Optional end date for filtering data before aggregation.
   * @returns {Array<object>} An array of weekly statistics objects.
   */
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
    const getWeekKey = (date) => d3.timeFormat("%Y-W%W")(d3.timeMonday(date)); // Use global d3
    const groupedByWeek = d3.group(rangeData, (d) => getWeekKey(d.date)); // Use global d3
    groupedByWeek.forEach((weekData, weekKey) => {
      weekData.sort((a, b) => a.date - b.date);
      const validPointsForRate = weekData.filter(
        (d) => d.smoothedWeeklyRate != null && !isNaN(d.smoothedWeeklyRate),
      );
      const validPointsForBalance = weekData.filter(
        (d) => d.netBalance != null && !isNaN(d.netBalance),
      );
      if (validPointsForRate.length >= 3 && validPointsForBalance.length >= 3) {
        // Require min days for both rate & balance
        const avgNetCal = d3.mean(validPointsForBalance, (d) => d.netBalance); // Use global d3
        const avgWeeklyRate = d3.mean(
          validPointsForRate,
          (d) => d.smoothedWeeklyRate,
        ); // Use global d3
        const avgWeight = d3.mean(weekData, (d) => d.sma ?? d.value); // Use global d3
        const avgExpenditure = d3.mean(weekData, (d) => d.googleFitTDEE); // Use global d3
        const avgIntake = d3.mean(weekData, (d) => d.calorieIntake); // Use global d3
        const weekStartDate = d3.timeMonday(weekData[0].date); // Use global d3
        weeklyStats.push({
          weekKey,
          weekStartDate,
          avgNetCal: avgNetCal ?? null,
          weeklyRate: avgWeeklyRate ?? null,
          avgWeight: avgWeight ?? null,
          avgExpenditure: avgExpenditure ?? null,
          avgIntake: avgIntake ?? null,
        });
      }
    });
    weeklyStats.sort((a, b) => a.weekStartDate - b.weekStartDate);
    return weeklyStats;
  },
  // +++ END OF calculateWeeklyStats Method +++

  // --- UI Value Readers ---
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
