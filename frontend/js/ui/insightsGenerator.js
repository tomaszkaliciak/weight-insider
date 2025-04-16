// js/ui/insightsGenerator.js
// Generates textual insights based on calculated display statistics from the state.

import { Utils } from "../core/utils.js";
import { CONFIG } from "../config.js";
import { StateManager } from "../core/stateManager.js";
import { ui } from "./uiCache.js";
import * as Selectors from "../core/selectors.js";

export const InsightsGenerator = {
  // Flag to prevent repeated warnings if container is missing
  _warnedContainerMissing: false,

  // --- Helper Functions for Generating Insight Components (Keep internal logic) ---

  /**
   * Generates HTML for the data consistency status.
   * @param {object} consistencyWgt - Weight consistency object {percentage}.
   * @param {object} consistencyCal - Calorie consistency object {percentage}.
   * @returns {string} HTML string for the consistency status.
   */
  _getConsistencyStatus(consistencyWgt, consistencyCal) {
    const wgtPct = consistencyWgt?.percentage;
    const calPct = consistencyCal?.percentage;
    if (wgtPct == null || calPct == null || isNaN(wgtPct) || isNaN(calPct)) {
      // Added NaN checks
      return `<span class="warn">Consistency data unavailable.</span>`;
    }
    const wgtStr = `W:${wgtPct.toFixed(0)}%`;
    const calStr = `C:${calPct.toFixed(0)}%`;
    if (wgtPct < 80 || calPct < 80) {
      return `<span class="warn">Low data consistency</span> (${wgtStr}, ${calStr}). Estimates may be less reliable.`;
    } else if (wgtPct < 95 || calPct < 95) {
      return `<span class="good">Good consistency</span> (${wgtStr}, ${calStr}).`;
    } else {
      return `<span class="good">Excellent consistency</span> (${wgtStr}, ${calStr}).`;
    }
  },

  /**
   * Generates HTML for the primary TDEE estimate status.
   * @param {number|null} tdeeGFit - Average TDEE from Google Fit.
   * @param {number|null} tdeeTrend - TDEE estimated from weight trend.
   * @param {number|null} tdeeAdaptive - TDEE estimated using the adaptive method.
   * @returns {string} HTML string for the TDEE status.
   */
  _getPrimaryTDEEStatus(tdeeGFit, tdeeTrend, tdeeAdaptive) {
    const fv = Utils.formatValue;
    // Prefer Adaptive > Trend > GFit, filtering out null/NaN
    const estimates = [
      { label: "Adaptive", value: tdeeAdaptive, priority: 1 },
      { label: "Trend", value: tdeeTrend, priority: 2 },
      { label: "GFit Avg", value: tdeeGFit, priority: 3 },
    ]
      .filter((e) => e.value != null && !isNaN(e.value))
      .sort((a, b) => a.priority - b.priority);

    if (estimates.length === 0) {
      return 'Est. TDEE: <span class="warn">N/A</span>';
    }
    const primaryTDEE = estimates[0];
    return `Est. TDEE (<span class="stable">${primaryTDEE.label}</span>): <strong>${fv(primaryTDEE.value, 0)} kcal/d</strong>`;
  },

  /**
   * Generates HTML for the current weight trend status.
   * @param {number|null} currentTrendWeekly - The primary weekly trend rate (regression or smoothed).
   * @param {number|null} currentWeight - Current weight (SMA or raw) for percentage calculation.
   * @param {boolean} regressionUsed - Whether the trend value came from regression.
   * @returns {string} HTML string for the trend status.
   */
  _getTrendStatus(currentTrendWeekly, currentWeight, regressionUsed) {
    const fv = Utils.formatValue;
    if (currentTrendWeekly == null || isNaN(currentTrendWeekly)) {
      return 'Trend: <span class="warn">N/A</span>';
    }
    const trendAbs = Math.abs(currentTrendWeekly);
    const weightForPct = currentWeight; // Assumes currentWeight (SMA or raw) is passed in
    const trendPercent =
      weightForPct != null && weightForPct > 0 && !isNaN(weightForPct)
        ? (currentTrendWeekly / weightForPct) * 100
        : null;
    const trendValStr = `<strong>${fv(currentTrendWeekly, 2)} kg/wk</strong>`;
    const trendPercentStr =
      trendPercent != null ? ` (${fv(trendPercent, 1)}% BW)` : ""; // Abbreviate
    const basis = regressionUsed ? "Regression" : "Smoothed Rate";

    if (trendAbs < CONFIG.plateauRateThresholdKgWeek) {
      return `Trend (<span class="stable">Stable</span>): ${trendValStr} <small>(${basis})</small>`;
    } else if (currentTrendWeekly > 0) {
      // Gaining
      let status = `Trend (<span class="gaining">Gaining</span>): ${trendValStr}${trendPercentStr} <small>(${basis})</small>`;
      // Check against optimal gain zone from config
      if (
        typeof CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK === "number" &&
        typeof CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK === "number"
      ) {
        const minGain = CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK;
        const maxGain = CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK;
        if (currentTrendWeekly > maxGain) {
          status += ` <span class="warn">(Faster than optimal zone [${minGain}-${maxGain}])</span>`;
        } else if (currentTrendWeekly < minGain) {
          status += ` <span class="stable">(Slower than optimal zone [${minGain}-${maxGain}])</span>`;
        } else {
          status += ` <span class="good">(In optimal zone [${minGain}-${maxGain}])</span>`;
        }
      }
      return status;
    } else {
      // Losing
      return `Trend (<span class="losing">Losing</span>): ${trendValStr}${trendPercentStr} <small>(${basis})</small>`;
    }
  },

  /**
   * Generates HTML for the goal status summary.
   * @param {object} displayStats - The calculated display statistics object.
   * @param {boolean} isGoalAchieved - Whether the goal is currently achieved.
   * @returns {string} HTML string for the goal status.
   */
  _getGoalStatus(displayStats, isGoalAchieved) {
    // Use isGoalAchieved flag
    if (displayStats.targetWeight == null) {
      return 'Goal: <span class="stable">Not set.</span>';
    }
    const fv = Utils.formatValue;
    let status = `Goal: <strong>${fv(displayStats.targetWeight, 1)} kg</strong>. `;

    if (isGoalAchieved) {
      // Use flag
      status += ` <strong class="goal-achieved-badge good">🎉 Achieved!</strong> `;
    } else if (displayStats.weightToGoal != null) {
      const gainOrLose = displayStats.weightToGoal >= 0 ? "to gain" : "to lose";
      const weightDiffClass =
        displayStats.weightToGoal >= 0 ? "gaining" : "losing";
      status += `<span class="${weightDiffClass}">${fv(Math.abs(displayStats.weightToGoal), 1)} kg ${gainOrLose}.</span> `;
    }

    const timeEstimate = displayStats.estimatedTimeToGoal;
    const isMeaningfulTime =
      timeEstimate &&
      !["N/A", "Goal Achieved!", "Trending away", "Trend flat"].includes(
        timeEstimate,
      );

    if (isMeaningfulTime && !isGoalAchieved) {
      // Check flag
      status += ` Est. <span class="good">${timeEstimate}.</span>`;
    } else if (
      (timeEstimate === "Trending away" || timeEstimate === "Trend flat") &&
      !isGoalAchieved
    ) {
      // Check flag
      status += ` <span class="warn">(Status: ${timeEstimate})</span>`;
    }
    return status;
  },

  /**
   * Generates HTML list for detected plateaus and trend changes within the analysis range.
   * Reads plateaus, trendChangePoints, and analysisRange from state using selectors.
   * @param {object} stateSnapshot - A snapshot of the current application state.
   * @returns {string} HTML string for the detected features list, or empty string if none detected.
   */
  _getDetectedFeaturesInsightHTML(stateSnapshot) {
    const analysisRange = Selectors.selectAnalysisRange(stateSnapshot);
    const plateaus = Selectors.selectPlateaus(stateSnapshot);
    const trendChangePoints = Selectors.selectTrendChangePoints(stateSnapshot);

    // Basic check for valid analysis range dates
    if (
      !(analysisRange.start instanceof Date) ||
      !(analysisRange.end instanceof Date) ||
      isNaN(analysisRange.start) ||
      isNaN(analysisRange.end)
    )
      return "";

    const analysisStartDate = analysisRange.start;
    const analysisEndDate = analysisRange.end;

    // Filter detected features to be within the current analysis range
    const plateausInRange = (Array.isArray(plateaus) ? plateaus : []).filter(
      (p) =>
        p.endDate instanceof Date &&
        p.startDate instanceof Date &&
        p.endDate >= analysisStartDate &&
        p.startDate <= analysisEndDate,
    );
    const changesInRange = (
      Array.isArray(trendChangePoints) ? trendChangePoints : []
    ).filter(
      (p) =>
        p.date instanceof Date &&
        p.date >= analysisStartDate &&
        p.date <= analysisEndDate,
    );

    if (plateausInRange.length === 0 && changesInRange.length === 0) return "";

    let insight = `<h4 class="detected-events-heading">Detected Events <small>(Analysis Range)</small></h4>`;
    insight += `<ul class="detected-events-list">`;

    // Add Plateau Items
    if (plateausInRange.length > 0) {
      plateausInRange.forEach((p) => {
        insight += `<li><span class="insight-icon">⏸️</span> <div><span class="warn">Plateau:</span> ${Utils.formatDateShort(p.startDate)} - ${Utils.formatDateShort(p.endDate)}</div></li>`;
      });
    }

    // Add Trend Change Items
    if (changesInRange.length > 0) {
      const useDetails = changesInRange.length > 3; // Use <details> if many changes
      insight += `<li><span class="insight-icon">⚠️</span>`;
      if (useDetails) {
        insight += `<details class="trend-change-details"><summary><span class="warn">Trend Changes:</span> ${changesInRange.length} detected</summary>`;
      } else {
        insight += `<div><span class="warn">Trend Changes:</span>`;
      }

      insight += `<ul class="trend-change-list ${useDetails ? "" : "short-list"}">`;
      // Sort changes by date before displaying
      changesInRange
        .sort((a, b) => a.date - b.date)
        .forEach((p) => {
          const isAccel = p.magnitude > 0;
          const direction = isAccel ? "acceleration" : "deceleration";
          const rateChangeKgWeek = Math.abs(p.magnitude * 7); // Convert daily slope diff to weekly rate diff
          const rateChangeString = `(Δ ≈ ${Utils.formatValue(rateChangeKgWeek, 2)} kg/wk)`;
          const directionClass = isAccel ? "trend-accel" : "trend-decel";
          const icon = isAccel ? "📈" : "📉";
          insight += `<li class="trend-change-list-item"><span class="insight-icon">${icon}</span> <span class="trend-change-item ${directionClass}">${Utils.formatDateShort(p.date)} (${direction}) <small>${rateChangeString}</small></span></li>`;
        });
      insight += `</ul>`;

      if (useDetails) {
        insight += `</details></li>`;
      } else {
        insight += `</div></li>`;
      }
    }
    insight += `</ul>`;
    return insight;
  },

  /**
   * Updates the insight summary box in the UI.
   * Triggered by state changes carrying displayStats payload.
   * @param {object} displayStats - The displayStats object from the state update event.
   */
  _renderSummary(displayStats) {
    // Ensure the container exists in the DOM and is cached.
    if (!ui.insightSummaryContainer || ui.insightSummaryContainer.empty()) {
      if (!this._warnedContainerMissing) {
        console.warn(
          "InsightsGenerator: Insight summary container (#insight-summary) not found in uiCache.",
        );
        this._warnedContainerMissing = true; // Prevent repeated warnings
      }
      return; // Exit early if container not found
    } else {
      this._warnedContainerMissing = false; // Reset warning flag if found
    }

    if (!displayStats || typeof displayStats !== "object") {
      console.warn(
        "InsightsGenerator: Invalid displayStats received in _renderSummary.",
      );
      ui.insightSummaryContainer.html("<p>Waiting for data analysis...</p>");
      return;
    }

    const stateSnapshot = StateManager.getState(); // Get full state for features detection etc.
    const isGoalAchieved = Selectors.selectIsGoalAchieved(stateSnapshot); // Use selector
    const currentTrendWeekly =
      displayStats.regressionSlopeWeekly ?? displayStats.currentWeeklyRate;
    const regressionUsedForTrend = displayStats.regressionSlopeWeekly != null;

    let summaryHtml = "";
    try {
      // Generate individual insight components
      const trendStatus = this._getTrendStatus(
        currentTrendWeekly,
        displayStats.currentSma,
        regressionUsedForTrend,
      );
      const tdeeStatus = this._getPrimaryTDEEStatus(
        displayStats.avgExpenditureGFit,
        displayStats.avgTDEE_WgtChange,
        displayStats.avgTDEE_Adaptive,
      );
      const goalStatus = this._getGoalStatus(displayStats, isGoalAchieved);
      const consistencyStatus = this._getConsistencyStatus(
        displayStats.weightDataConsistency,
        displayStats.calorieDataConsistency,
      );
      const detectedFeaturesHtml =
        this._getDetectedFeaturesInsightHTML(stateSnapshot); // Pass full state

      // Assemble the final HTML
      if (trendStatus) summaryHtml += `<p>${trendStatus}</p>`;
      if (tdeeStatus) summaryHtml += `<p>${tdeeStatus}</p>`;
      if (goalStatus) summaryHtml += `<p>${goalStatus}</p>`;
      if (consistencyStatus) summaryHtml += `<p>${consistencyStatus}</p>`;
      if (detectedFeaturesHtml) summaryHtml += detectedFeaturesHtml; // Add detected features section
    } catch (error) {
      console.error(
        "InsightsGenerator: Error generating summary box HTML",
        error,
      );
      summaryHtml =
        "<p class='error'>Error generating summary. Check console.</p>";
    }

    // Update the container's content
    ui.insightSummaryContainer.html(
      summaryHtml || "<p>Analysis requires more data or a different range.</p>",
    );
  },

  /**
   * Initializes the InsightsGenerator by subscribing to state changes.
   */
  init() {
    StateManager.subscribeToSpecificEvent(
      "state:displayStatsUpdated",
      (payload) => this._renderSummary(payload),
    ); // Payload *is* displayStats
    console.log(
      "[InsightsGenerator Init] Subscribed to state:displayStatsUpdated.",
    );
    // Render initial empty state
    this._renderSummary({});
  },
};
