// js/core/statsManager.js
// Calculates derived data (filtered data, stats, regression, weekly summaries, etc.)
// based on primary state changes and dispatches actions to update derived state.

import { CONFIG } from "../config.js";
import { StateManager } from "./stateManager.js";
import { Utils } from "./utils.js";
import { DataService } from "./dataService.js";
import * as Selectors from "./selectors.js";

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

export const StatsManager = {
  // --- Internal Calculation Helpers ---
  _calculateAverageInRange(data, field, startDate, endDate) {
    if (!Array.isArray(data) || !startDate || !endDate || startDate > endDate)
      return null;
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
    if (!Array.isArray(data) || !startDate || !endDate || startDate > endDate)
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
    const percentage = totalDays > 0 ? (count / totalDays) * 100 : 0;
    return { count, totalDays, percentage };
  },
  _calculateCurrentRate(allProcessedData, analysisEndDate) {
    if (
      !Array.isArray(allProcessedData) ||
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
    if (
      !Array.isArray(processedData) ||
      !startDate ||
      !endDate ||
      startDate > endDate
    )
      return null;
    const viewData = processedData.filter(
      (d) => d.date >= startDate && d.date <= endDate,
    );
    const deviations = viewData
      .filter((d) => d.sma != null && d.value != null && !d.isOutlier)
      .map((d) => d.value - d.sma);
    return deviations.length >= 2 && typeof ss?.standardDeviation === "function"
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
    const dailyKgChange = weeklyKgChange / 7;
    return dailyKgChange * CONFIG.KCALS_PER_KG;
  },
  _calculateNetCalRateCorrelation(weeklyStats) {
    if (!ss || typeof ss.sampleCorrelation !== "function") return null;
    if (
      !Array.isArray(weeklyStats) ||
      weeklyStats.length < CONFIG.MIN_WEEKS_FOR_CORRELATION
    )
      return null;
    const validWeeklyStats = weeklyStats.filter(
      (w) =>
        w.avgNetCal != null &&
        !isNaN(w.avgNetCal) &&
        w.weeklyRate != null &&
        !isNaN(w.weeklyRate),
    );
    if (validWeeklyStats.length < CONFIG.MIN_WEEKS_FOR_CORRELATION) return null;
    const netCalArray = validWeeklyStats.map((w) => w.avgNetCal);
    const rateArray = validWeeklyStats.map((w) => w.weeklyRate);
    try {
      const correlation = ss.sampleCorrelation(netCalArray, rateArray);
      return isNaN(correlation) ? null : correlation;
    } catch (e) {
      console.error("StatsManager: Error calculating correlation:", e);
      return null;
    }
  },
  _estimateTimeToGoal(
    currentWeight,
    goalWeight,
    weeklyChange,
    goalAchieved = false,
  ) {
    if (goalAchieved) return "Goal Achieved!";
    if (
      currentWeight == null ||
      goalWeight == null ||
      weeklyChange == null ||
      isNaN(currentWeight) ||
      isNaN(goalWeight) ||
      isNaN(weeklyChange)
    )
      return "N/A";
    const weightDifference = goalWeight - currentWeight;
    if (Math.abs(weeklyChange) < 0.01) return "Trend flat";
    if (
      (weeklyChange > 0 && weightDifference < 0) ||
      (weeklyChange < 0 && weightDifference > 0)
    )
      return "Trending away";
    const weeksNeeded = weightDifference / weeklyChange;
    if (weeksNeeded <= 0) return "N/A"; // Already past goal
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
    if (!Array.isArray(processedData) || processedData.length === 0) return [];
    const minDurationDays = CONFIG.plateauMinDurationWeeks * 7;
    const rateThreshold = CONFIG.plateauRateThresholdKgWeek;
    let plateaus = [];
    let currentPlateauStart = null;
    let currentPlateauStartDateObj = null;

    for (let i = 0; i < processedData.length; i++) {
      const d = processedData[i];
      if (!(d.date instanceof Date) || isNaN(d.date.getTime())) continue;
      const rate = d.smoothedWeeklyRate;
      const isFlat =
        rate != null && !isNaN(rate) && Math.abs(rate) < rateThreshold;
      if (isFlat && currentPlateauStart === null) {
        currentPlateauStart = d.date;
        currentPlateauStartDateObj = new Date(d.date);
      } else if (!isFlat && currentPlateauStart !== null) {
        const endDate = processedData[i - 1]?.date;
        if (
          !(endDate instanceof Date) ||
          isNaN(endDate.getTime()) ||
          !(currentPlateauStartDateObj instanceof Date) ||
          isNaN(currentPlateauStartDateObj.getTime())
        ) {
          currentPlateauStart = null;
          currentPlateauStartDateObj = null;
          continue;
        }
        const durationDays =
          (endDate.getTime() - currentPlateauStartDateObj.getTime()) / 86400000;
        if (durationDays >= minDurationDays - 1) {
          plateaus.push({
            startDate: currentPlateauStartDateObj,
            endDate: endDate,
          });
        }
        currentPlateauStart = null;
        currentPlateauStartDateObj = null;
      }
    }
    // Check for plateau ending at the last data point
    if (currentPlateauStart !== null) {
      const endDate = processedData[processedData.length - 1]?.date;
      if (
        endDate instanceof Date &&
        !isNaN(endDate.getTime()) &&
        currentPlateauStartDateObj instanceof Date &&
        !isNaN(currentPlateauStartDateObj.getTime())
      ) {
        const durationDays =
          (endDate.getTime() - currentPlateauStartDateObj.getTime()) / 86400000;
        if (durationDays >= minDurationDays - 1) {
          plateaus.push({
            startDate: currentPlateauStartDateObj,
            endDate: endDate,
          });
        }
      }
    }
    return plateaus;
  },
  _detectTrendChanges(processedData) {
    if (
      !Array.isArray(processedData) ||
      processedData.length < CONFIG.trendChangeWindowDays * 2
    )
      return [];
    const windowSize = CONFIG.trendChangeWindowDays;
    const minSlopeDiff = CONFIG.trendChangeMinSlopeDiffKgWeek / 7; // Convert threshold to daily slope diff
    let changes = [];
    const calculateSlope = (dataSegment) => {
      const validPoints = dataSegment.filter(
        (p) => p.sma != null && p.date instanceof Date && !isNaN(p.date),
      );
      if (validPoints.length < 2) return null;
      validPoints.sort((a, b) => a.date - b.date); // Ensure sorted by date
      const first = validPoints[0];
      const last = validPoints[validPoints.length - 1];
      const timeDiffDays =
        (last.date.getTime() - first.date.getTime()) / 86400000;
      if (timeDiffDays <= 0) return null; // Avoid division by zero or negative time
      return (last.sma - first.sma) / timeDiffDays; // Daily rate of change
    };
    for (let i = windowSize; i < processedData.length - windowSize; i++) {
      const currentDate = processedData[i].date;
      if (!(currentDate instanceof Date) || isNaN(currentDate.getTime()))
        continue; // Skip invalid dates
      const beforeData = processedData.slice(i - windowSize, i);
      const afterData = processedData.slice(i, i + windowSize);
      const slopeBefore = calculateSlope(beforeData);
      const slopeAfter = calculateSlope(afterData);
      if (
        slopeBefore != null &&
        slopeAfter != null &&
        !isNaN(slopeBefore) &&
        !isNaN(slopeAfter)
      ) {
        const slopeDiff = slopeAfter - slopeBefore; // Daily slope difference
        if (Math.abs(slopeDiff) >= minSlopeDiff) {
          changes.push({ date: currentDate, magnitude: slopeDiff }); // Store daily slope difference
        }
      }
    }
    return changes;
  },

  /**
   * Calculates *all* derived data based on the provided state snapshot.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   * @returns {object} An object containing calculated derived data { displayStats, filteredData, ... }.
   */
  _calculateDerivedData(stateSnapshot) {
    const results = {
      displayStats: {},
      filteredData: [],
      weeklySummaryData: [],
      correlationScatterData: [],
      plateaus: [],
      trendChangePoints: [],
      goalAchievedDate: null,
      regressionResult: { slope: null, intercept: null, points: [] },
    };
    const displayStats = results.displayStats;
    const processedData = Selectors.selectProcessedData(stateSnapshot);
    const rawData = Selectors.selectRawData(stateSnapshot);
    const analysisRange = Selectors.selectAnalysisRange(stateSnapshot);
    const goal = Selectors.selectGoal(stateSnapshot);
    const effectiveRegRange =
      Selectors.selectEffectiveRegressionRange(stateSnapshot);

    // Filter Data
    if (processedData.length > 0 && analysisRange.start && analysisRange.end) {
      results.filteredData = processedData.filter(
        (d) =>
          d.date instanceof Date &&
          d.date >= analysisRange.start &&
          d.date <= analysisRange.end,
      );
    } else {
      results.filteredData = [];
    }

    // All-Time Stats
    const validWeightDataAll = rawData.filter(
      (d) => d.value != null && !isNaN(d.value),
    );
    if (validWeightDataAll.length > 0) {
      displayStats.startingWeight = validWeightDataAll[0].value;
      displayStats.currentWeight =
        validWeightDataAll[validWeightDataAll.length - 1].value;
      const maxEntryObject = d3.greatest(validWeightDataAll, (d) => d.value);
      displayStats.maxWeight = maxEntryObject?.value ?? null;
      displayStats.maxWeightDate = maxEntryObject?.date ?? null;
      const minEntryObject = d3.least(validWeightDataAll, (d) => d.value);
      displayStats.minWeight = minEntryObject?.value ?? null;
      displayStats.minWeightDate = minEntryObject?.date ?? null;
      displayStats.totalChange =
        displayStats.startingWeight != null &&
        displayStats.currentWeight != null
          ? displayStats.currentWeight - displayStats.startingWeight
          : null;
    } else {
      /* ... defaults ... */
      Object.assign(displayStats, {
        startingWeight: null,
        currentWeight: null,
        maxWeight: null,
        maxWeightDate: null,
        minWeight: null,
        minWeightDate: null,
        totalChange: null,
      });
    }
    const lastSmaEntry = [...processedData]
      .reverse()
      .find((d) => d.sma != null);
    displayStats.currentSma =
      lastSmaEntry?.sma ?? displayStats.currentWeight ?? null;

    // Body Comp Stats
    const validLbmSmaData = processedData.filter(
      (d) => d.lbmSma != null && !isNaN(d.lbmSma),
    );
    const validFmSmaData = processedData.filter(
      (d) => d.fmSma != null && !isNaN(d.fmSma),
    );
    displayStats.startingLbm =
      validLbmSmaData[0]?.lbmSma ?? null; /* ... etc ... */
    displayStats.currentLbmSma =
      validLbmSmaData[validLbmSmaData.length - 1]?.lbmSma ?? null;
    displayStats.totalLbmChange =
      displayStats.startingLbm != null && displayStats.currentLbmSma != null
        ? displayStats.currentLbmSma - displayStats.startingLbm
        : null;
    const startingFmSma = validFmSmaData[0]?.fmSma ?? null;
    displayStats.currentFmSma =
      validFmSmaData[validFmSmaData.length - 1]?.fmSma ?? null;
    displayStats.totalFmChange =
      startingFmSma != null && displayStats.currentFmSma != null
        ? displayStats.currentFmSma - startingFmSma
        : null;

    // Analysis Range Specific Calculations
    if (analysisRange.start && analysisRange.end && processedData.length > 0) {
      results.plateaus = this._detectPlateaus(processedData);
      results.trendChangePoints = this._detectTrendChanges(processedData);
      if (results.filteredData.length > 0) {
        results.weeklySummaryData = DataService.calculateWeeklyStats(
          processedData,
          analysisRange.start,
          analysisRange.end,
        );
        results.correlationScatterData = results.weeklySummaryData.filter(
          (w) => w.avgNetCal != null && w.weeklyRate != null,
        );
        displayStats.netCalRateCorrelation =
          this._calculateNetCalRateCorrelation(results.weeklySummaryData);
        displayStats.currentWeeklyRate = this._calculateCurrentRate(
          processedData,
          analysisRange.end,
        );
        displayStats.volatility = this._calculateVolatility(
          processedData,
          analysisRange.start,
          analysisRange.end,
        );
        const latestFilteredWithVol = [...results.filteredData]
          .reverse()
          .find((d) => d.rollingVolatility != null);
        displayStats.rollingVolatility =
          latestFilteredWithVol?.rollingVolatility ?? null;
        displayStats.avgIntake = this._calculateAverageInRange(
          processedData,
          "calorieIntake",
          analysisRange.start,
          analysisRange.end,
        );
        displayStats.avgExpenditureGFit = this._calculateAverageInRange(
          processedData,
          "googleFitTDEE",
          analysisRange.start,
          analysisRange.end,
        );
        displayStats.avgNetBalance = this._calculateAverageInRange(
          processedData,
          "netBalance",
          analysisRange.start,
          analysisRange.end,
        );
        displayStats.avgTDEE_Difference = this._calculateAverageInRange(
          processedData,
          "avgTdeeDifference",
          analysisRange.start,
          analysisRange.end,
        );
        displayStats.avgTDEE_Adaptive = this._calculateAverageInRange(
          processedData,
          "adaptiveTDEE",
          analysisRange.start,
          analysisRange.end,
        );
        displayStats.weightDataConsistency = this._calculateCountInRange(
          processedData,
          "value",
          analysisRange.start,
          analysisRange.end,
        );
        displayStats.calorieDataConsistency = this._calculateCountInRange(
          processedData,
          "calorieIntake",
          analysisRange.start,
          analysisRange.end,
        );

        // Regression
        if (effectiveRegRange.start && effectiveRegRange.end) {
          const regressionData = processedData.filter(
            (d) =>
              d.date instanceof Date &&
              d.date >= effectiveRegRange.start &&
              d.date <= effectiveRegRange.end,
          ); // Use processedData for full range
          results.regressionResult = DataService.calculateLinearRegression(
            regressionData,
            effectiveRegRange.start,
          ); // Pass start date
          displayStats.regressionSlopeWeekly =
            results.regressionResult.slope != null
              ? results.regressionResult.slope * 7
              : null;
          displayStats.regressionStartDate = effectiveRegRange.start;
        } else {
          /* ... defaults ... */
          results.regressionResult = {
            slope: null,
            intercept: null,
            points: [],
          };
          displayStats.regressionSlopeWeekly = null;
          displayStats.regressionStartDate = null;
        }
        // TDEE from Trend
        const trendForTDEECalc =
          displayStats.regressionSlopeWeekly ??
          displayStats.currentWeeklyRate;
        displayStats.avgTDEE_WgtChange = this._calculateTDEEFromTrend(
          displayStats.avgIntake,
          trendForTDEECalc,
        );
        displayStats.estimatedDeficitSurplus =
          this._estimateDeficitSurplusFromTrend(trendForTDEECalc);
        // Goal Achievement Check
        const weightThreshold = 0.1;
        if (goal.weight != null) {
          let achievedPoint = null;
          for (const d of results.filteredData) {
            if (
              d.sma != null &&
              Math.abs(goal.weight - d.sma) <= weightThreshold
            ) {
              achievedPoint = d;
              break;
            }
          }
          results.goalAchievedDate = achievedPoint ? achievedPoint.date : null;
        } else {
          results.goalAchievedDate = null;
        }
      } else {
        /* ... defaults ... */
        results.weeklySummaryData = [];
        results.correlationScatterData = [];
        results.goalAchievedDate = null;
        results.regressionResult = { slope: null, intercept: null, points: [] };
        Object.assign(displayStats, {
        });
      }
    } else {
      /* ... defaults ... */
      results.filteredData = [];
      results.plateaus = [];
      results.trendChangePoints = [];
      results.weeklySummaryData = [];
      results.correlationScatterData = [];
      results.goalAchievedDate = null;
      results.regressionResult = { slope: null, intercept: null, points: [] };
      Object.assign(displayStats, {
      });
    }

    // Goal Related Display Stats
    displayStats.targetWeight = goal.weight;
    displayStats.targetRate = goal.targetRate;
    displayStats.targetDate = goal.date;
    const referenceWeightForGoal =
      displayStats.currentSma ?? displayStats.currentWeight;
    const currentTrendForGoal =
      displayStats.regressionSlopeWeekly ?? displayStats.currentWeeklyRate;
    const isAchieved = results.goalAchievedDate instanceof Date;
    displayStats.weightToGoal =
      referenceWeightForGoal != null && displayStats.targetWeight != null
        ? displayStats.targetWeight - referenceWeightForGoal
        : null;
    displayStats.estimatedTimeToGoal = this._estimateTimeToGoal(
      referenceWeightForGoal,
      displayStats.targetWeight,
      currentTrendForGoal,
      isAchieved,
    );
    displayStats.requiredRateForGoal =
      displayStats.targetDate && !isAchieved
        ? this._calculateRequiredRateForGoal(
            referenceWeightForGoal,
            displayStats.targetWeight,
            displayStats.targetDate,
          )
        : null;
    // Required Calorie Adjustment & Suggested Intake
    displayStats.requiredCalorieAdjustment = null;
    displayStats.requiredNetCalories = null;
    displayStats.suggestedIntakeRange = null;
    const baselineTDEE =
      displayStats.avgTDEE_Adaptive ??
      displayStats.avgTDEE_WgtChange ??
      displayStats.avgExpenditureGFit;
    if (
      displayStats.targetRate != null &&
      currentTrendForGoal != null &&
      !isNaN(currentTrendForGoal) &&
      !isNaN(displayStats.targetRate) &&
      baselineTDEE != null &&
      !isNaN(baselineTDEE)
    ) {
      const rateDifferenceKgWeek =
        displayStats.targetRate - currentTrendForGoal;
      displayStats.requiredCalorieAdjustment =
        (rateDifferenceKgWeek / 7) * CONFIG.KCALS_PER_KG;
    }
    if (
      displayStats.requiredRateForGoal != null &&
      baselineTDEE != null &&
      !isNaN(baselineTDEE) &&
      !isNaN(displayStats.requiredRateForGoal)
    ) {
      const requiredDailyDeficitSurplus =
        (displayStats.requiredRateForGoal / 7) * CONFIG.KCALS_PER_KG;
      displayStats.requiredNetCalories = requiredDailyDeficitSurplus;
      const targetIntake = baselineTDEE + requiredDailyDeficitSurplus;
      if (!isNaN(targetIntake)) {
        displayStats.suggestedIntakeRange = {
          min: Math.round(targetIntake - 100),
          max: Math.round(targetIntake + 100),
        };
      }
    }
    // Target Rate Feedback
    displayStats.targetRateFeedback = { text: "N/A", class: "" };
    if (
      displayStats.targetRate != null &&
      currentTrendForGoal != null &&
      !isNaN(currentTrendForGoal) &&
      !isNaN(displayStats.targetRate)
    ) {
      const diff = currentTrendForGoal - displayStats.targetRate;
      const absDiff = Math.abs(diff);
      if (absDiff < 0.03) {
        displayStats.targetRateFeedback = { text: "On Target", class: "good" };
      } else if (diff > 0) {
        displayStats.targetRateFeedback = {
          text: `Faster (+${Utils.formatValue(diff, 2)})`,
          class: "warn",
        };
      } else {
        displayStats.targetRateFeedback = {
          text: `Slower (${Utils.formatValue(diff, 2)})`,
          class: "warn",
        };
      }
    }
    return results;
  },

  /**
   * Triggered by relevant state changes. Reads state, calculates derived data,
   * dispatches actions to update derived state, and publishes consolidated event.
   */
  update() {
    console.log("[StatsManager update] Triggered.");
    try {
      const stateSnapshot = StateManager.getState();

      if (
        !Selectors.selectProcessedData(stateSnapshot) ||
        Selectors.selectProcessedData(stateSnapshot).length === 0
      ) {
        console.warn(
          "[StatsManager update] Skipping update - no processed data available.",
        );
        return;
      }

      const derivedData = this._calculateDerivedData(stateSnapshot);

      // --- Dispatch actions to update derived state ---
      StateManager.dispatch({
        type: "SET_FILTERED_DATA",
        payload: derivedData.filteredData,
      });
      StateManager.dispatch({
        type: "SET_PLATEAUS",
        payload: derivedData.plateaus,
      });
      StateManager.dispatch({
        type: "SET_TREND_CHANGES",
        payload: derivedData.trendChangePoints,
      });
      StateManager.dispatch({
        type: "SET_REGRESSION_RESULT",
        payload: derivedData.regressionResult,
      });
      StateManager.dispatch({
        type: "SET_WEEKLY_SUMMARY",
        payload: derivedData.weeklySummaryData,
      });
      StateManager.dispatch({
        type: "SET_CORRELATION_DATA",
        payload: derivedData.correlationScatterData,
      });
      StateManager.dispatch({
        type: "SET_GOAL_ACHIEVED_DATE",
        payload: derivedData.goalAchievedDate,
      });
      StateManager.dispatch({
        type: "SET_DISPLAY_STATS",
        payload: derivedData.displayStats,
      });
    } catch (error) {
      console.error(
        "StatsManager: Error during derived data calculation/update:",
        error,
      );
      Utils.showStatusMessage("Error updating statistics.", "error");
    }
  },

  init() {
    // Subscribe ONLY to primary state changes that NECESSITATE recalculating derived data.
    const relevantEvents = [
      // 'state:processedDataChanged', // Only if core processing can be re-run
      // 'state:rawDataChanged', // Only if raw data can be loaded dynamically
      "state:analysisRangeChanged", // User changes view via brush, zoom, or date inputs
      "state:interactiveRegressionRangeChanged", // User changes regression brush
      "state:trendConfigChanged", // Affects default regression start if interactive range is null
      // 'state:goalChanged', // <<< REMOVED THIS SUBSCRIPTION >>> Goal values are read during calculation, no need to trigger full recalc on change.
      // 'state:settingsChanged', // Add this back if settings are dynamic and affect calcs
      "state:initializationComplete", // Trigger initial calculation
    ];

    relevantEvents.forEach((eventName) => {
      StateManager.subscribeToSpecificEvent(eventName, () => {
        console.log(
          `[StatsManager] Received primary event: ${eventName}. Triggering update.`,
        );
        // Use setTimeout to batch potential rapid changes and avoid re-entry
        setTimeout(() => {
          this.update();
        }, 0);
      });
    });

    console.log("[StatsManager Init] Refined subscriptions complete.");
  },
};
