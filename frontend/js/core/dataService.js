// js/core/dataService.js
// Handles fetching, merging, initial processing, and utility calculations for weight data.

import * as d3 from 'd3';
import * as ss from 'simple-statistics';
import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";

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
    const weights = rawDataObjects.bodyWeight || rawDataObjects.weights || {};
    const calorieIntake = rawDataObjects.calorieIntake || {};
    const googleFitExpenditure = rawDataObjects.googleFitExpenditure || {};
    const bodyFat = rawDataObjects.bodyFat || {};
    const protein = rawDataObjects.protein || {};
    const carbs = rawDataObjects.carbs || {};
    const fat = rawDataObjects.fat || {};
    const workouts = rawDataObjects.workouts || {};
    const allDates = new Set([
      ...Object.keys(weights),
      ...Object.keys(calorieIntake),
      ...Object.keys(googleFitExpenditure),
      ...Object.keys(bodyFat),
      ...Object.keys(protein),
      ...Object.keys(carbs),
      ...Object.keys(fat),
      ...Object.keys(workouts),
    ]);
    let mergedData = [];
    for (const dateStr of allDates) {
      // Basic validation of date string format (YYYY-MM-DD)
      // Basic validation of date string format (YYYY-M-D or YYYY-MM-DD)
      if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
        console.warn(
          `DataService: Skipping invalid date key format: ${dateStr}`,
        );
        continue;
      }

      // Robust parsing for unpadded dates
      const [y, m, d] = dateStr.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d); // Local midnight

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
        // Macro data
        protein: protein[dateStr] ?? null,
        carbs: carbs[dateStr] ?? null,
        fat: fat[dateStr] ?? null,
        // Workout data
        workoutCount: workouts[dateStr]?.workoutCount ?? null,
        totalSets: workouts[dateStr]?.totalSets ?? null,
        totalVolume: workouts[dateStr]?.totalVolume ?? null,
        isRestDay: workouts[dateStr]?.isRestDay ?? null,
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

  // --- Data Processing Steps (Exported Methods) ---
  // These methods take data and return a *new* array with the calculated field added.
  // They rely on CONFIG values, not external state.

  calculateBodyComposition(data) {
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

  calculateSMAAndStdDev(data) {
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

  calculateEMA(data) {
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

  identifyOutliers(data) {
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

  calculateRollingVolatility(data, windowSize = CONFIG.ROLLING_VOLATILITY_WINDOW) {
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

  calculateDailyRatesAndTDEETrend(data) {
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

  calculateAdaptiveTDEE(data, windowSize = CONFIG.adaptiveTDEEWindow) {
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

  smoothRatesAndTDEEDifference(data) {
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

  calculateRateMovingAverage(data) {
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
      return { slope: null, intercept: null, points: [], firstDateMs: null };
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

      return { slope, intercept, points: plotPoints, firstDateMs };
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

  /**
   * Detects periodization phases (bulk/cut/maintenance) based on smoothedWeeklyRate.
   * @param {Array} processedData - The processed data array with smoothedWeeklyRate.
   * @returns {Array} Array of phase objects with type, startDate, endDate, avgRate, avgCalories, weightChange.
   */
  detectPeriodizationPhases(processedData) {
    if (!processedData || processedData.length === 0) return [];

    const bulkThreshold = CONFIG.BULK_RATE_THRESHOLD_KG_WEEK;
    const cutThreshold = CONFIG.CUT_RATE_THRESHOLD_KG_WEEK;
    const minPhaseDuration = CONFIG.MIN_PHASE_DURATION_WEEKS * 7; // Convert weeks to days

    // Filter to data with valid smoothedWeeklyRate
    const validData = processedData.filter(
      (d) => d.smoothedWeeklyRate != null && !isNaN(d.smoothedWeeklyRate) && d.date instanceof Date
    );

    if (validData.length < 7) return []; // Need at least a week of data

    const classifyPhase = (rate) => {
      if (rate >= bulkThreshold) return 'bulk';
      if (rate <= cutThreshold) return 'cut';
      return 'maintenance';
    };

    // Build phases by tracking consecutive days with same classification
    let phases = [];
    let currentPhase = null;

    for (let i = 0; i < validData.length; i++) {
      const d = validData[i];
      const phaseType = classifyPhase(d.smoothedWeeklyRate);

      if (!currentPhase || currentPhase.type !== phaseType) {
        // Start new phase
        if (currentPhase) {
          phases.push(currentPhase);
        }
        currentPhase = {
          type: phaseType,
          startDate: d.date,
          endDate: d.date,
          rates: [d.smoothedWeeklyRate],
          calories: d.calorieIntake != null ? [d.calorieIntake] : [],
          startWeight: d.sma ?? d.value,
          endWeight: d.sma ?? d.value,
        };
      } else {
        // Extend current phase
        currentPhase.endDate = d.date;
        currentPhase.rates.push(d.smoothedWeeklyRate);
        if (d.calorieIntake != null) currentPhase.calories.push(d.calorieIntake);
        currentPhase.endWeight = d.sma ?? d.value;
      }
    }

    // Don't forget the last phase
    if (currentPhase) {
      phases.push(currentPhase);
    }

    // Filter out phases shorter than minimum duration and calculate final stats
    const finalPhases = phases
      .filter((p) => {
        const durationDays = (p.endDate.getTime() - p.startDate.getTime()) / 86400000;
        return durationDays >= minPhaseDuration;
      })
      .map((p) => {
        const durationDays = Math.round((p.endDate.getTime() - p.startDate.getTime()) / 86400000);
        const durationWeeks = Math.round(durationDays / 7 * 10) / 10; // 1 decimal
        const avgRate = p.rates.length > 0 ? d3.mean(p.rates) : null;
        const avgCalories = p.calories.length > 0 ? Math.round(d3.mean(p.calories)) : null;
        const weightChange =
          p.startWeight != null && p.endWeight != null
            ? Math.round((p.endWeight - p.startWeight) * 10) / 10
            : null;

        return {
          type: p.type,
          startDate: p.startDate,
          endDate: p.endDate,
          durationDays,
          durationWeeks,
          avgRate: avgRate != null ? Math.round(avgRate * 100) / 100 : null,
          avgCalories,
          weightChange,
        };
      });

    console.log(`DataService: Detected ${finalPhases.length} periodization phases.`);
    return finalPhases;
  },

  /**
   * Calculates correlation between workout metrics and weight changes.
   * Uses weekly aggregates to smooth out daily noise.
   * @param {Array<object>} processedData - The fullprocessed data array.
   * @returns {object} Correlation results including coefficient, weekly data, and interpretation.
   */
  calculateWorkoutCorrelation(processedData) {
    if (!Array.isArray(processedData) || processedData.length < 14) {
      return { coefficient: null, weeklyData: [], interpretation: 'Insufficient data' };
    }

    // Group data by week
    const getWeekKey = (date) => d3.timeFormat("%Y-W%W")(d3.timeMonday(date));
    const groupedByWeek = d3.group(processedData, (d) => getWeekKey(d.date));

    const weeklyData = [];
    groupedByWeek.forEach((weekData, weekKey) => {
      weekData.sort((a, b) => a.date - b.date);
      if (weekData.length === 0) return;

      // Calculate weekly volume (sum of all workout volume for the week)
      const weeklyVolume = weekData.reduce((sum, d) => {
        return sum + (d.totalVolume || 0);
      }, 0);

      // Calculate weekly training days
      const trainingDays = weekData.filter(d => d.workoutCount > 0).length;

      // Calculate average weekly rate (smoothed) for this week
      const validRates = weekData
        .map(d => d.smoothedWeeklyRate)
        .filter(r => r != null && !isNaN(r));
      const avgWeeklyRate = validRates.length > 0 ? d3.mean(validRates) : null;

      // Calculate average SMA weight for the week
      const validWeights = weekData
        .map(d => d.sma != null ? d.sma : d.value)
        .filter(w => w != null && !isNaN(w));
      const avgWeight = validWeights.length > 0 ? d3.mean(validWeights) : null;

      if (avgWeeklyRate != null && weeklyVolume > 0) {
        weeklyData.push({
          weekKey,
          weekStartDate: d3.timeMonday(weekData[0].date),
          weeklyVolume,
          trainingDays,
          avgWeeklyRate,
          avgWeight,
        });
      }
    });

    weeklyData.sort((a, b) => a.weekStartDate - b.weekStartDate);

    if (weeklyData.length < 4) {
      return { coefficient: null, weeklyData, interpretation: 'Need at least 4 weeks of workout data' };
    }

    // Calculate Pearson correlation between weekly volume and weight change rate
    const volumeValues = weeklyData.map(w => w.weeklyVolume);
    const rateValues = weeklyData.map(w => w.avgWeeklyRate);

    let coefficient = null;
    try {
      if (typeof ss?.sampleCorrelation === 'function') {
        coefficient = ss.sampleCorrelation(volumeValues, rateValues);
      } else {
        // Fallback: manual Pearson correlation calculation
        const n = volumeValues.length;
        const meanV = d3.mean(volumeValues);
        const meanR = d3.mean(rateValues);

        let numerator = 0;
        let denomV = 0;
        let denomR = 0;

        for (let i = 0; i < n; i++) {
          const dV = volumeValues[i] - meanV;
          const dR = rateValues[i] - meanR;
          numerator += dV * dR;
          denomV += dV * dV;
          denomR += dR * dR;
        }

        const denominator = Math.sqrt(denomV * denomR);
        coefficient = denominator !== 0 ? numerator / denominator : null;
      }
    } catch (err) {
      console.warn('DataService: Error calculating workout correlation:', err);
    }

    // Interpret the correlation
    let interpretation = 'No correlation';
    if (coefficient != null && !isNaN(coefficient)) {
      const absCoef = Math.abs(coefficient);
      const direction = coefficient > 0 ? 'positive' : 'negative';
      if (absCoef >= 0.7) {
        interpretation = `Strong ${direction} correlation`;
      } else if (absCoef >= 0.4) {
        interpretation = `Moderate ${direction} correlation`;
      } else if (absCoef >= 0.2) {
        interpretation = `Weak ${direction} correlation`;
      } else {
        interpretation = 'No significant correlation';
      }
    }

    console.log(`DataService: Calculated workout correlation: ${coefficient?.toFixed(3)} (${interpretation})`);
    return {
      coefficient: coefficient != null ? Math.round(coefficient * 1000) / 1000 : null,
      weeklyData,
      interpretation,
      totalWeeks: weeklyData.length,
    };
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
