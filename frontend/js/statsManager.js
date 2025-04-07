// statsManager.js
// Calculates and updates various statistics based on the processed data and current view/analysis range.

import { CONFIG } from "./config.js";
import { state } from "./state.js"; // Make sure state is imported
import { ui } from "./uiCache.js";
import { Utils } from "./utils.js";
import { DataService } from "./dataService.js";
import { EventHandlers } from "./eventHandlers.js";
import { InsightsGenerator } from "./insightsGenerator.js";
import { WeeklySummaryUpdater } from "./weeklySummaryUpdater.js";
import { ScatterPlotUpdater } from "./chartUpdaters.js";
import { EventBus } from "./eventBus.js";

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
    return relevantValues.length > 0 ? d3.mean(relevantValues) : null; // Use global d3
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
    const percentage = totalDays > 0 ? (count / totalDays) * 100 : 0; // Avoid division by zero
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
    ) {
      return "Trending away";
    }
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

  // --- Plateau & Trend Detection Helpers (Pure Functions) ---
  _detectPlateaus(processedData) {
    if (!Array.isArray(processedData) || processedData.length === 0) return [];
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
        endDate instanceof Date &&
        currentPlateauStart instanceof Date &&
        !isNaN(endDate) &&
        !isNaN(currentPlateauStart)
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
      !Array.isArray(processedData) ||
      processedData.length < CONFIG.trendChangeWindowDays * 2
    )
      return [];
    const windowSize = CONFIG.trendChangeWindowDays;
    const minSlopeDiff = CONFIG.trendChangeMinSlopeDiffKgWeek / 7; // Daily threshold
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
      return (last.sma - first.sma) / timeDiffDays; // Slope in kg/day
    };
    for (let i = windowSize; i < processedData.length - windowSize; i++) {
      const currentDate = processedData[i].date;
      if (!(currentDate instanceof Date) || isNaN(currentDate)) continue;
      const beforeData = processedData.slice(i - windowSize, i);
      const afterData = processedData.slice(i + 1, i + 1 + windowSize);
      const slopeBefore = calculateSlope(beforeData);
      const slopeAfter = calculateSlope(afterData);
      if (slopeBefore != null && slopeAfter != null) {
        const slopeDiff = slopeAfter - slopeBefore; // Difference in daily slopes
        if (Math.abs(slopeDiff) >= minSlopeDiff) {
          changes.push({ date: currentDate, magnitude: slopeDiff });
        }
      }
    }
    return changes;
  },

  // --- Main Calculation and Update Functions ---
  calculateAllStats() {
    const stats = {};
    const analysisRange = EventHandlers.getAnalysisDateRange();
    const { start: analysisStart, end: analysisEnd } = analysisRange;

    // All-Time Stats
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
      stats.totalChange =
        stats.startingWeight != null && stats.currentWeight != null
          ? stats.currentWeight - stats.startingWeight
          : null;
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
    const lastSmaEntry = [...state.processedData]
      .reverse()
      .find((d) => d.sma != null);
    stats.currentSma = lastSmaEntry ? lastSmaEntry.sma : stats.currentWeight;

    // Body Composition Stats
    const validLbmSmaData = state.processedData.filter(
      (d) => d.lbmSma != null && !isNaN(d.lbmSma),
    );
    const validFmSmaData = state.processedData.filter(
      (d) => d.fmSma != null && !isNaN(d.fmSma),
    );
    stats.startingLbm =
      validLbmSmaData.length > 0 ? validLbmSmaData[0].lbmSma : null;
    stats.currentLbmSma =
      validLbmSmaData.length > 0
        ? validLbmSmaData[validLbmSmaData.length - 1].lbmSma
        : null;
    stats.totalLbmChange =
      stats.startingLbm != null && stats.currentLbmSma != null
        ? stats.currentLbmSma - stats.startingLbm
        : null;
    const startingFmSma =
      validFmSmaData.length > 0 ? validFmSmaData[0].fmSma : null;
    stats.currentFmSma =
      validFmSmaData.length > 0
        ? validFmSmaData[validFmSmaData.length - 1].fmSma
        : null;
    stats.totalFmChange =
      startingFmSma != null && stats.currentFmSma != null
        ? stats.currentFmSma - startingFmSma
        : null;

    // Analysis Range Specific Stats
    if (
      analysisStart instanceof Date &&
      analysisEnd instanceof Date &&
      analysisStart <= analysisEnd
    ) {
      // <<<---- CALCULATE AND ASSIGN PLATEAUS/TREND CHANGES TO STATE HERE ---->>>
      state.plateaus = this._detectPlateaus(state.processedData);
      state.trendChangePoints = this._detectTrendChanges(state.processedData);
      // <<<----------------------------------------------------------------->>>

      state.weeklySummaryData = DataService.calculateWeeklyStats(
        state.processedData,
        analysisStart,
        analysisEnd,
      );
      state.correlationScatterData = state.weeklySummaryData.filter(
        (w) => w.avgNetCal != null && w.weeklyRate != null,
      );
      stats.netCalRateCorrelation = this._calculateNetCalRateCorrelation(
        state.weeklySummaryData,
      );
      stats.currentWeeklyRate = this._calculateCurrentRate(
        state.processedData,
        analysisEnd,
      );
      // Calculate OVERALL volatility for the range
      stats.volatility = this._calculateVolatility(
        state.processedData,
        analysisStart,
        analysisEnd,
      );

      stats.rollingVolatility = null;
      const dataInRange = state.processedData.filter(
        (d) =>
          d.date >= analysisStart &&
          d.date <= analysisEnd &&
          d.rollingVolatility != null &&
          !isNaN(d.rollingVolatility),
      );
      if (dataInRange.length > 0) {
        stats.rollingVolatility =
          dataInRange[dataInRange.length - 1].rollingVolatility;
      }

      stats.avgIntake = this._calculateAverageInRange(
        state.processedData,
        "calorieIntake",
        analysisStart,
        analysisEnd,
      );
      stats.avgExpenditureGFit = this._calculateAverageInRange(
        state.processedData,
        "googleFitTDEE",
        analysisStart,
        analysisEnd,
      );
      stats.avgNetBalance = this._calculateAverageInRange(
        state.processedData,
        "netBalance",
        analysisStart,
        analysisEnd,
      );
      stats.avgTDEE_Difference = this._calculateAverageInRange(
        state.processedData,
        "avgTdeeDifference",
        analysisStart,
        analysisEnd,
      );
      stats.avgTDEE_Adaptive = this._calculateAverageInRange(
        state.processedData,
        "adaptiveTDEE",
        analysisStart,
        analysisEnd,
      );
      stats.weightDataConsistency = this._calculateCountInRange(
        state.processedData,
        "value",
        analysisStart,
        analysisEnd,
      );
      stats.calorieDataConsistency = this._calculateCountInRange(
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
        stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
      stats.avgTDEE_WgtChange = this._calculateTDEEFromTrend(
        stats.avgIntake,
        trendForTDEECalc,
      );
      stats.estimatedDeficitSurplus =
        this._estimateDeficitSurplusFromTrend(trendForTDEECalc);
    } else {
      // <<<---- RESET PLATEAUS/TREND CHANGES IF RANGE INVALID ---->>>
      state.plateaus = [];
      state.trendChangePoints = [];
      // <<<----------------------------------------------------->>>
      Object.assign(stats, {
        netCalRateCorrelation: null,
        currentWeeklyRate: null,
        volatility: null,
        rollingVolatility: null,
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

    // --- Goal Related Stats ---
    stats.targetWeight = state.goal.weight;
    stats.targetRate = state.goal.targetRate;
    stats.targetDate = state.goal.date;
    stats.goalAchieved = false;
    state.goalAchievedDate = null;

    const referenceWeightForGoal = stats.currentSma ?? stats.currentWeight;
    const weightThreshold = 0.1;

    if (referenceWeightForGoal != null && stats.targetWeight != null) {
      stats.weightToGoal = stats.targetWeight - referenceWeightForGoal;
      const currentTrendForGoal =
        stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;

      // Goal Achievement Logic
      if (Math.abs(stats.weightToGoal) <= weightThreshold) {
        stats.goalAchieved = true;
        if (
          analysisStart instanceof Date &&
          analysisEnd instanceof Date &&
          analysisStart <= analysisEnd
        ) {
          const achievedPoint = state.processedData.find(
            (d) =>
              d.date instanceof Date &&
              d.date >= analysisStart &&
              d.date <= analysisEnd &&
              d.sma != null &&
              Math.abs(stats.targetWeight - d.sma) <= weightThreshold,
          );
          state.goalAchievedDate = achievedPoint
            ? achievedPoint.date
            : analysisEnd;
        } else {
          state.goalAchievedDate = null;
        }
      }

      stats.estimatedTimeToGoal = this._estimateTimeToGoal(
        referenceWeightForGoal,
        stats.targetWeight,
        currentTrendForGoal,
        stats.goalAchieved,
      );
      stats.requiredRateForGoal = stats.targetDate
        ? this._calculateRequiredRateForGoal(
            referenceWeightForGoal,
            stats.targetWeight,
            stats.targetDate,
          )
        : null;

      // Required Calorie Adjustment Calculation
      stats.requiredCalorieAdjustment = null;
      if (
        stats.targetRate != null &&
        currentTrendForGoal != null &&
        !isNaN(currentTrendForGoal)
      ) {
        const baselineTDEE =
          stats.avgTDEE_Adaptive ??
          stats.avgTDEE_WgtChange ??
          stats.avgExpenditureGFit;
        if (baselineTDEE != null && !isNaN(baselineTDEE)) {
          const rateDifferenceKgWeek = stats.targetRate - currentTrendForGoal;
          stats.requiredCalorieAdjustment =
            (rateDifferenceKgWeek / 7) * CONFIG.KCALS_PER_KG;
        }
      }

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
        stats.targetRateFeedback = { text: feedbackText, class: feedbackClass };
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
      stats.goalAchieved = false;
      state.goalAchievedDate = null;
      stats.requiredCalorieAdjustment = null;
    }

    return stats;
  },

  update() {
    try {
      // Calculate all stats (including detection of plateaus/trends)
      const statsData = this.calculateAllStats();
      EventBus.publish("state::StatsUpdate", statsData);
    } catch (error) {
      console.error("StatsManager: Error during statistics update:", error);
      Utils.showStatusMessage("Error updating statistics.", "error");
    }
  },
};
