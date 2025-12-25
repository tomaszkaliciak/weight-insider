// js/core/statsManager.js
// Calculates derived data (filtered data, stats, regression, weekly summaries, etc.)
// based on primary state changes and dispatches actions to update derived state.

import * as d3 from 'd3';
import * as ss from 'simple-statistics';
import { CONFIG } from "../config.js";
import { StateManager, ActionTypes } from "./stateManager.js"; // Added ActionTypes
import { Utils } from "./utils.js";
import { DataService } from "./dataService.js";
import * as Selectors from "./selectors.js";
import { scales } from "../ui/chartSetup.js"; // TODO: Remove this dependency - contextDomain should be in state

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
  /**
   * Calculates a correlation matrix for a set of input and output variables.
   * @param {Array<Object>} filteredData - The data points within the current analysis range.
   * @returns {Object|null} The correlation matrix object or null if insufficient data.
   */
  _calculateCorrelationMatrix(filteredData) {
    if (!filteredData || filteredData.length < 10) return null;

    // 1. Prepare variables for each day
    // We need days with complete data for the variables we care about
    const matrixData = filteredData.map((d, i, arr) => {
      const prev = i > 0 ? arr[i - 1] : null;
      const weightDelta = (d.value != null && prev && prev.value != null) ? (d.value - prev.value) : null;

      return {
        calories: d.calorieIntake,
        proteinPct: (d.protein && d.calorieIntake) ? (d.protein * 4 / d.calorieIntake) : null,
        carbsPct: (d.carbs && d.calorieIntake) ? (d.carbs * 4 / d.calorieIntake) : null,
        fatPct: (d.fat && d.calorieIntake) ? (d.fat * 9 / d.calorieIntake) : null,
        volatility: d.rollingVolatility,
        weightDelta: weightDelta,
        tdee: d.adaptiveTDEE || d.tdeeTrend,
        rate: d.smoothedWeeklyRate
      };
    });

    const variables = [
      { id: 'calories', label: 'Calories' },
      { id: 'proteinPct', label: 'Protein %' },
      { id: 'carbsPct', label: 'Carbs %' },
      { id: 'fatPct', label: 'Fat %' },
      { id: 'volatility', label: 'Volatility' },
      { id: 'weightDelta', label: 'Weight Δ' },
      { id: 'tdee', label: 'TDEE' },
      { id: 'rate', label: 'Rate' }
    ];

    const matrix = {
      labels: variables.map(v => v.label),
      ids: variables.map(v => v.id),
      values: []
    };

    // 2. Calculate Pearson correlation for each pair
    for (let i = 0; i < variables.length; i++) {
      const row = [];
      for (let j = 0; j < variables.length; j++) {
        if (i === j) {
          row.push(1.0);
          continue;
        }

        // Extract pairs where both variables are non-null
        const varI = variables[i].id;
        const varJ = variables[j].id;

        const pairs = matrixData
          .filter(d => d[varI] !== null && d[varJ] !== null)
          .map(d => [d[varI], d[varJ]]);

        if (pairs.length >= 7) {
          try {
            const x = pairs.map(p => p[0]);
            const y = pairs.map(p => p[1]);
            const corr = ss.sampleCorrelation(x, y);
            row.push(isNaN(corr) ? 0 : corr);
          } catch (e) {
            row.push(0);
          }
        } else {
          row.push(null); // Insufficient data for this pair
        }
      }
      matrix.values.push(row);
    }

    return matrix;
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
  }, // <-- Add missing comma


  /**
   * Calculates the data points for a single trend line based on config and current view.
   * @param {object} stateSnapshot - Current application state.
   * @param {number} rate - The weekly rate for this trend line.
   * @returns {Array} Array of {date, weight} points.
   * @private
   */
  _calculateTrendLinePoints(stateSnapshot, rate) {
    const trendConfig = stateSnapshot.trendConfig;
    const processedData = stateSnapshot.processedData;
    const analysisRange = stateSnapshot.analysisRange; // Use analysis range for view bounds

    if (!trendConfig.isValid || rate == null || processedData.length === 0 || !analysisRange?.start || !analysisRange?.end) {
      return [];
    }

    const currentXDomain = [analysisRange.start, analysisRange.end]; // Focus domain from state

    // Generate points slightly beyond the visible range for smoother panning/zooming
    const bufferDays = 7; // Add a buffer
    const viewStartDate = d3.timeDay.offset(currentXDomain[0], -bufferDays);
    const viewEndDate = d3.timeDay.offset(currentXDomain[1], bufferDays);

    // Generate points across the visible range + buffer
    // Using processedData ensures we have points even if filteredData is sparse at edges
    const pointsInRange = processedData.filter(
      (d) => d.date >= viewStartDate && d.date <= viewEndDate,
    );

    const points = pointsInRange
      .map((d) => ({
        date: d.date,
        weight: DataService.calculateTrendWeight(
          trendConfig.startDate,
          trendConfig.initialWeight,
          rate,
          d.date,
        ),
      }))
      .filter((p) => p.weight != null);

    // Add explicit start/end points for the buffered view range
    const trendStart = DataService.calculateTrendWeight(
      trendConfig.startDate,
      trendConfig.initialWeight,
      rate,
      viewStartDate,
    );
    const trendEnd = DataService.calculateTrendWeight(
      trendConfig.startDate,
      trendConfig.initialWeight,
      rate,
      viewEndDate,
    );
    if (trendStart != null) points.unshift({ date: viewStartDate, weight: trendStart });
    if (trendEnd != null) points.push({ date: viewEndDate, weight: trendEnd });

    // Remove duplicates and sort
    const uniquePoints = Array.from(
      new Map(points.map((p) => [p.date.getTime(), p])).values(),
    );
    uniquePoints.sort((a, b) => a.date - b.date);
    return uniquePoints;
  },

  /**
   * Calculates the data points for the goal line.
   * @param {object} stateSnapshot - Current application state.
   * @returns {Array} Array of {date, weight} points or empty array.
   * @private
   */
  _calculateGoalLinePoints(stateSnapshot) {
    const goal = stateSnapshot.goal;
    const processedData = stateSnapshot.processedData;
    const visibility = stateSnapshot.seriesVisibility; // Need visibility state

    // TODO: Remove dependency on scales.xContext. Context domain should be in state.
    const contextXDomain = scales.xContext?.domain();

    if (!visibility.goal || goal.weight == null || processedData.length === 0 || !contextXDomain) {
      return [];
    }

    // Find last valid SMA point in the *entire* dataset to start the goal line
    const lastSmaPoint = [...processedData]
      .reverse()
      .find((d) => d.sma != null);

    if (lastSmaPoint?.date && lastSmaPoint.sma != null) {
      const startDate = lastSmaPoint.date;
      const startWeight = lastSmaPoint.sma;
      // End date is goal date or the end of the *context* x-axis if no goal date
      const endDateRaw = goal.date
        ? goal.date
        : contextXDomain?.[1] || startDate; // Fallback to start date if context missing

      if (
        endDateRaw instanceof Date &&
        !isNaN(endDateRaw) &&
        endDateRaw >= startDate
      ) {
        return [
          { date: startDate, weight: startWeight },
          { date: endDateRaw, weight: goal.weight },
        ];
      }
    }
    return [];
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
      regressionResult: { slope: null, intercept: null, points: [], extendedPoints: [] },
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
      validLbmSmaData[0]?.lbmSma ?? null;
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
        // Calculate Rate Consistency
        const validRates = results.filteredData
          .map(d => d.smoothedWeeklyRate)
          .filter(rate => rate != null && !isNaN(rate));
        displayStats.rateConsistencyStdDev = validRates.length >= 2 && typeof ss?.standardDeviation === 'function'
          ? ss.standardDeviation(validRates)
          : null;

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

        // Regression & Macro
        if (effectiveRegRange.start && effectiveRegRange.end) {
          const regressionData = processedData.filter(
            (d) =>
              d.date instanceof Date &&
              d.date >= effectiveRegRange.start &&
              d.date <= effectiveRegRange.end,
          );
          const regCalcResult = DataService.calculateLinearRegression(
            regressionData,
            effectiveRegRange.start,
          );

          let extendedPoints = [];
          if (regCalcResult.slope != null && regCalcResult.intercept != null && regCalcResult.firstDateMs != null && analysisRange.start && analysisRange.end) {
            const { slope, intercept, firstDateMs } = regCalcResult;
            const dayInMillis = 86400000;
            const analysisStartDate = analysisRange.start;
            const analysisEndDate = analysisRange.end;
            const xStart = (analysisStartDate.getTime() - firstDateMs) / dayInMillis;
            const yStart = slope * xStart + intercept;
            const xEnd = (analysisEndDate.getTime() - firstDateMs) / dayInMillis;
            const yEnd = slope * xEnd + intercept;

            if (isFinite(yStart) && isFinite(yEnd)) {
              extendedPoints = [
                { date: analysisStartDate, regressionValue: yStart },
                { date: analysisEndDate, regressionValue: yEnd }
              ];
            }
          }

          results.regressionResult = {
            slope: regCalcResult.slope,
            intercept: regCalcResult.intercept,
            points: regCalcResult.points,
            extendedPoints: extendedPoints
          };

          displayStats.regressionSlopeWeekly =
            results.regressionResult.slope != null
              ? results.regressionResult.slope * 7
              : null;
          displayStats.regressionStartDate = effectiveRegRange.start;

          // Macro Impact Analytics
          const macroData = results.filteredData.filter(d =>
            d.calorieIntake > 0 &&
            d.protein !== null &&
            d.carbs !== null &&
            d.fat !== null
          );

          if (macroData.length >= 7) {
            let totalCals = 0, totalP = 0, totalC = 0, totalF = 0;
            macroData.forEach(d => {
              totalCals += d.calorieIntake;
              totalP += d.protein;
              totalC += d.carbs;
              totalF += d.fat;
            });

            displayStats.macroSplit = {
              protein: Math.round((totalP * 4 / totalCals) * 100),
              carbs: Math.round((totalC * 4 / totalCals) * 100),
              fat: Math.round((totalF * 9 / totalCals) * 100)
            };

            const correlationPairs = macroData
              .filter(d => d.rollingVolatility !== null)
              .map(d => ({
                carbsPct: (d.carbs * 4 / d.calorieIntake),
                volatility: d.rollingVolatility
              }));

            if (correlationPairs.length >= 7) {
              try {
                const x = correlationPairs.map(p => p.carbsPct);
                const y = correlationPairs.map(p => p.volatility);
                displayStats.carbVolatilityCorrelation = ss.sampleCorrelation(x, y);
              } catch (e) {
                displayStats.carbVolatilityCorrelation = null;
              }
            } else {
              displayStats.carbVolatilityCorrelation = null;
            }

            displayStats.correlationMatrix = this._calculateCorrelationMatrix(results.filteredData);
          } else {
            displayStats.macroSplit = null;
            displayStats.carbVolatilityCorrelation = null;
            displayStats.correlationMatrix = null;
          }
        } else {
          results.regressionResult = { slope: null, intercept: null, points: [], extendedPoints: [] };
          displayStats.regressionSlopeWeekly = null;
          displayStats.regressionStartDate = null;
          displayStats.macroSplit = null;
          displayStats.carbVolatilityCorrelation = null;
          displayStats.correlationMatrix = null;
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
            if (d.sma != null && Math.abs(goal.weight - d.sma) <= weightThreshold) {
              achievedPoint = d;
              break;
            }
          }
          results.goalAchievedDate = achievedPoint ? achievedPoint.date : null;
        } else {
          results.goalAchievedDate = null;
        }
      } else {
        results.weeklySummaryData = [];
        results.correlationScatterData = [];
        results.goalAchievedDate = null;
        results.regressionResult = { slope: null, intercept: null, points: [], extendedPoints: [] };
      }
    } else {
      results.filteredData = [];
      results.plateaus = [];
      results.trendChangePoints = [];
      results.weeklySummaryData = [];
      results.correlationScatterData = [];
      results.goalAchievedDate = null;
      results.regressionResult = { slope: null, intercept: null, points: [], extendedPoints: [] };
    }

    // Goal Related Display Stats
    displayStats.targetWeight = goal.weight;
    displayStats.targetRate = goal.targetRate;
    displayStats.targetDate = goal.date;
    const referenceWeightForGoal = displayStats.currentSma ?? displayStats.currentWeight;
    const currentTrendForGoal = displayStats.regressionSlopeWeekly ?? displayStats.currentWeeklyRate;
    const isAchieved = results.goalAchievedDate instanceof Date;
    displayStats.weightToGoal = (referenceWeightForGoal != null && displayStats.targetWeight != null)
      ? displayStats.targetWeight - referenceWeightForGoal : null;
    displayStats.estimatedTimeToGoal = this._estimateTimeToGoal(referenceWeightForGoal, displayStats.targetWeight, currentTrendForGoal, isAchieved);
    displayStats.requiredRateForGoal = (displayStats.targetDate && !isAchieved)
      ? this._calculateRequiredRateForGoal(referenceWeightForGoal, displayStats.targetWeight, displayStats.targetDate) : null;

    displayStats.requiredCalorieAdjustment = null;
    displayStats.requiredNetCalories = null;
    displayStats.suggestedIntakeTarget = null;
    displayStats.baselineTDEESource = null;

    let baselineTDEE = null;
    if (displayStats.avgTDEE_Adaptive != null && !isNaN(displayStats.avgTDEE_Adaptive)) {
      baselineTDEE = displayStats.avgTDEE_Adaptive;
      displayStats.baselineTDEESource = 'Adaptive';
    } else if (displayStats.avgTDEE_WgtChange != null && !isNaN(displayStats.avgTDEE_WgtChange)) {
      baselineTDEE = displayStats.avgTDEE_WgtChange;
      displayStats.baselineTDEESource = 'Weight Change Trend';
    } else if (displayStats.avgExpenditureGFit != null && !isNaN(displayStats.avgExpenditureGFit)) {
      baselineTDEE = displayStats.avgExpenditureGFit;
      displayStats.baselineTDEESource = 'Google Fit';
    }

    if (displayStats.targetRate != null && currentTrendForGoal != null && baselineTDEE != null) {
      const rateDifferenceKgWeek = displayStats.targetRate - currentTrendForGoal;
      displayStats.requiredCalorieAdjustment = (rateDifferenceKgWeek / 7) * CONFIG.KCALS_PER_KG;
    }

    const effectiveTargetRate = displayStats.requiredRateForGoal ?? displayStats.targetRate;
    if (effectiveTargetRate != null && baselineTDEE != null) {
      const targetDailyDeficitSurplus = (effectiveTargetRate / 7) * CONFIG.KCALS_PER_KG;
      if (displayStats.requiredRateForGoal != null) displayStats.requiredNetCalories = targetDailyDeficitSurplus;
      const targetIntake = baselineTDEE + targetDailyDeficitSurplus;
      if (!isNaN(targetIntake)) displayStats.suggestedIntakeTarget = Math.round(targetIntake);
    }

    displayStats.targetRateFeedback = { text: "N/A", class: "" };
    if (displayStats.targetRate != null && currentTrendForGoal != null) {
      const diff = currentTrendForGoal - displayStats.targetRate;
      const absDiff = Math.abs(diff);
      if (absDiff < 0.03) displayStats.targetRateFeedback = { text: "On Target", class: "good" };
      else if (diff > 0) displayStats.targetRateFeedback = { text: `Faster (+${Utils.formatValue(diff, 2)})`, class: "warn" };
      else displayStats.targetRateFeedback = { text: `Slower (${Utils.formatValue(diff, 2)})`, class: "warn" };
    }
    return results;
  },

  /**
   * Triggered by relevant state changes. Reads state, calculates derived data,
   * dispatches actions to update derived state, and publishes consolidated event.
   */
  update() {
    try {
      const stateSnapshot = StateManager.getState();

      if (
        !Selectors.selectProcessedData(stateSnapshot) ||
        Selectors.selectProcessedData(stateSnapshot).length === 0
      ) {
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
      // Periodization Phase Detection
      const phases = DataService.detectPeriodizationPhases(stateSnapshot.processedData);
      StateManager.dispatch({
        type: ActionTypes.SET_PERIODIZATION_PHASES,
        payload: phases,
      });
      // Workout Correlation Calculation
      const workoutCorrelation = DataService.calculateWorkoutCorrelation(stateSnapshot.processedData);
      StateManager.dispatch({
        type: ActionTypes.SET_WORKOUT_CORRELATION,
        payload: workoutCorrelation,
      });
      StateManager.dispatch({
        type: "SET_DISPLAY_STATS",
        payload: derivedData.displayStats,
      });

      // --- Dispatch actions for newly calculated line data ---
      // Calculate line points using the *latest* state snapshot
      const latestState = StateManager.getState(); // Get latest state AFTER other dispatches
      let trendPoints1 = [];
      let trendPoints2 = [];
      if (latestState.trendConfig.isValid) {
        if (latestState.trendConfig.weeklyIncrease1 != null) {
          trendPoints1 = this._calculateTrendLinePoints(latestState, latestState.trendConfig.weeklyIncrease1);
        }
        if (latestState.trendConfig.weeklyIncrease2 != null) {
          trendPoints2 = this._calculateTrendLinePoints(latestState, latestState.trendConfig.weeklyIncrease2);
        }
      }
      const goalPoints = this._calculateGoalLinePoints(latestState);

      StateManager.dispatch({
        type: ActionTypes.SET_TREND_LINE_DATA,
        payload: { trend1: trendPoints1, trend2: trendPoints2 }
      });
      StateManager.dispatch({
        type: ActionTypes.SET_GOAL_LINE_DATA,
        payload: goalPoints
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
    const relevantEvents = [
      "state:analysisRangeChanged", // User changes view via brush, zoom, or date inputs
      "state:interactiveRegressionRangeChanged", // User changes regression brush
      "state:trendConfigChanged", // Affects trend lines and default regression start
      // "state:goalChanged", // REMOVED: Goal line calculated with other stats based on inputs below
      "state:initializationComplete", // Trigger initial calculation
      // Consider adding state:processedDataChanged if data can change dynamically
    ];

    relevantEvents.forEach((eventName) => {
      StateManager.subscribeToSpecificEvent(eventName, () => {
        // Use setTimeout to batch potential rapid changes and avoid re-entry
        setTimeout(() => {
          this.update();
        }, 0);
      });
    });

    console.log("[StatsManager Init] Refined subscriptions complete.");
  },
};
