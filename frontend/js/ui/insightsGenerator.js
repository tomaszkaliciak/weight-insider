// insightsGenerator.js
// Generates textual insights based on calculated statistics.

import { Utils } from "../core/utils.js";
import { CONFIG } from "../config.js";
import { state } from "../state.js"; // Needed for plateaus/trend changes
import { ui } from "./uiCache.js"; // Needed to update the summary container
import { EventHandlers } from "../interactions/eventHandlers.js";
import { EventBus } from "../core/eventBus.js";

export const InsightsGenerator = {
  // --- Helper Functions for Generating Insight Components ---

  /**
   * Generates HTML for the data consistency status.
   * @param {object} consistencyWgt - Weight consistency object {percentage}.
   * @param {object} consistencyCal - Calorie consistency object {percentage}.
   * @returns {string} HTML string for the consistency status.
   */
  _getConsistencyStatus(consistencyWgt, consistencyCal) {
    const wgtPct =
      consistencyWgt && typeof consistencyWgt.percentage === "number"
        ? consistencyWgt.percentage
        : null;
    const calPct =
      consistencyCal && typeof consistencyCal.percentage === "number"
        ? consistencyCal.percentage
        : null;
    if (wgtPct === null || calPct === null) {
      return `<span class="warn">Consistency data unavailable.</span>`;
    }
    if (wgtPct < 80 || calPct < 80) {
      return `<span class="warn">Low data consistency</span> (W:${wgtPct.toFixed(0)}%, C:${calPct.toFixed(0)}%). Estimates may be less reliable.`;
    } else if (wgtPct < 95 || calPct < 95) {
      return `<span class="good">Good consistency</span> (W:${wgtPct.toFixed(0)}%, C:${calPct.toFixed(0)}%).`;
    } else {
      return `<span class="good">Excellent consistency</span> (W:${wgtPct.toFixed(0)}%, C:${calPct.toFixed(0)}%).`;
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
    const weightForPct =
      currentWeight ??
      state.processedData?.filter((d) => d.value != null)?.slice(-1)[0]?.value;
    const trendPercent =
      weightForPct != null && weightForPct > 0
        ? (currentTrendWeekly / weightForPct) * 100
        : null;
    const trendValStr = `<strong>${fv(currentTrendWeekly, 2)} kg/wk</strong>`;
    const trendPercentStr =
      trendPercent != null ? ` (${fv(trendPercent, 1)}% Bodyweight)` : "";
    const basis = regressionUsed ? "Regression" : "Smoothed Rate";
    if (trendAbs < CONFIG.plateauRateThresholdKgWeek) {
      return `Trend (<span class="stable">Stable</span>): ${trendValStr} <small>(${basis})</small>`;
    } else if (currentTrendWeekly > 0) {
      let status = `Trend (<span class="gaining">Gaining</span>): ${trendValStr}${trendPercentStr} <small>(${basis})</small>`;
      if (currentTrendWeekly > CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK) {
        status += ` <span class="warn">(Faster than optimal gain zone)</span>`;
      } else if (
        currentTrendWeekly < CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK
      ) {
        status += ` <span class="warn">(Slower than optimal gain zone)</span>`;
      } else {
        status += ` <span class="good">(Within optimal gain zone)</span>`;
      }
      return status;
    } else {
      return `Trend (<span class="losing">Losing</span>): ${trendValStr}${trendPercentStr} <small>(${basis})</small>`;
    }
  },

  /**
   * Generates HTML for the goal status summary.
   * @param {object} stats - The calculated statistics object.
   * @returns {string} HTML string for the goal status.
   */
  _getGoalStatus(stats) {
    if (stats.targetWeight == null) {
      return 'Goal: <span class="stable">Not set.</span>';
    }

    const fv = Utils.formatValue;
    let status = `Goal: <strong>${fv(stats.targetWeight, 1)} kg</strong>. `;

    // <<< Prominent Goal Achieved Message >>>
    if (stats.goalAchieved) {
      status += ` <strong class="goal-achieved-badge good">🎉 Achieved!</strong> `;
    }
    // <<< End Prominent Message >>>
    else if (stats.weightToGoal != null) {
      const gainOrLose = stats.weightToGoal >= 0 ? "to gain" : "to lose";
      const weightDiffClass = stats.weightToGoal >= 0 ? "gaining" : "losing";
      status += `<span class="${weightDiffClass}">${fv(Math.abs(stats.weightToGoal), 1)} kg ${gainOrLose}.</span> `;
    }

    const timeEstimate = stats.estimatedTimeToGoal;
    // Only show time estimate if not achieved and it's meaningful
    const isMeaningfulTime =
      timeEstimate &&
      !["N/A", "Goal Achieved!", "Trending away", "Trend flat"].includes(
        timeEstimate,
      );

    if (isMeaningfulTime) {
      status += ` Est. <span class="good">${timeEstimate}.</span>`;
    } else if (
      timeEstimate === "Trending away" ||
      timeEstimate === "Trend flat"
    ) {
      // Make trending away/flat more distinct
      status += ` <span class="warn">(Status: ${timeEstimate})</span>`;
    }
    // Removed explicit "Goal Achieved!" check here as it's handled above

    return status;
  },

  /**
   * Generates HTML list for detected plateaus and trend changes within the analysis range.
   * @param {Date|null} analysisStartDate - Start date of the analysis range.
   * @param {Date|null} analysisEndDate - End date of the analysis range.
   * @returns {string} HTML string for the detected features list, or empty string if none detected.
   */
  _getDetectedFeaturesInsightHTML(analysisStartDate, analysisEndDate) {
    let insight = "";
    if (
      !(analysisStartDate instanceof Date) ||
      !(analysisEndDate instanceof Date)
    )
      return "";
    const plateausInRange = state.plateaus.filter(
      (p) =>
        p.endDate instanceof Date &&
        p.startDate instanceof Date &&
        p.endDate >= analysisStartDate &&
        p.startDate <= analysisEndDate,
    );
    const changesInRange = state.trendChangePoints.filter(
      (p) =>
        p.date instanceof Date &&
        p.date >= analysisStartDate &&
        p.date <= analysisEndDate,
    );
    if (plateausInRange.length === 0 && changesInRange.length === 0) {
      return "";
    }
    insight += `<h4 class="detected-events-heading">Detected Events <small>(Analysis Range)</small></h4>`;
    insight += `<ul class="detected-events-list">`;
    if (plateausInRange.length > 0) {
      plateausInRange.forEach((p) => {
        insight += `<li><span class="insight-icon">⏸️</span> <div><span class="warn">Plateau:</span> ${Utils.formatDateShort(p.startDate)} - ${Utils.formatDateShort(p.endDate)}</div></li>`;
      });
    }
    if (changesInRange.length > 0) {
      const useDetails = changesInRange.length > 3;
      if (useDetails) {
        insight += `<li><span class="insight-icon">⚠️</span> <details class="trend-change-details"><summary><span class="warn">Trend Changes:</span> ${changesInRange.length} detected</summary><ul class="trend-change-list">`;
      } else {
        insight += `<li><span class="insight-icon">⚠️</span> <div><span class="warn">Trend Changes:</span><ul class="trend-change-list short-list">`;
      }
      changesInRange.sort((a, b) => a.date - b.date);
      changesInRange.forEach((p) => {
        const isAccel = p.magnitude > 0;
        const direction = isAccel ? "acceleration" : "deceleration";
        const rateChangeKgWeek = Math.abs(p.magnitude * 7);
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
   * Generates HTML list items for actionable insights based on stats.
   * @param {object} stats - The calculated statistics object.
   * @param {Array<object>} plateausInRange - Plateaus detected within the analysis range.
   * @returns {string} HTML string of <li> elements.
   */
  _generateActionableInsightsHTML(stats, plateausInRange = []) {
    let insights = [];
    const fv = Utils.formatValue;
    const consistencyWgt = stats.weightDataConsistency?.percentage ?? 100;
    const consistencyCal = stats.calorieDataConsistency?.percentage ?? 100;
    const lowConsistency = consistencyWgt < 80 || consistencyCal < 80;

    // --- Consistency First ---
    if (lowConsistency) {
      insights.push(
        `<li class="insight-warning"><span class="insight-icon">⚠️</span> <strong>Improve Logging:</strong> Data consistency is low (W:${fv(consistencyWgt, 0)}%, C:${fv(consistencyCal, 0)}%). Improve logging frequency for more reliable insights and suggestions.</li>`,
      );
      if (consistencyWgt < 60 || consistencyCal < 60) {
        return insights.join(""); // Return only the consistency warning
      }
    }

    // --- Goal-Related Insights ---
    const currentTrend = stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
    // Suggestion based on required calorie adjustment for TARGET RATE
    if (
      stats.targetRate != null &&
      stats.requiredCalorieAdjustment != null &&
      !stats.goalAchieved
    ) {
      const adjustment = stats.requiredCalorieAdjustment;
      if (Math.abs(adjustment) > 50) {
        // Only suggest if adjustment is somewhat significant
        const direction = adjustment > 0 ? "increase" : "decrease";
        insights.push(
          `<li class="insight-suggestion"><span class="insight-icon">🎯</span> <strong>Target Rate Adjustment:</strong> To align with your target rate of ${fv(stats.targetRate, 2)} kg/wk, consider an average daily net calorie ${direction} of ~${fv(Math.abs(adjustment), 0)} kcal.</li>`,
        );
      }
    }
    // Suggestion based on required calorie adjustment for TARGET DATE & WEIGHT
    else if (
      stats.targetWeight != null &&
      stats.targetDate != null &&
      !stats.goalAchieved &&
      stats.requiredNetCalories != null
    ) {
      const adjustment =
        stats.requiredNetCalories - (stats.estimatedDeficitSurplus ?? 0); // How much to change from current estimated balance
      if (Math.abs(adjustment) > 50) {
        const direction = adjustment > 0 ? "increase" : "decrease";
        insights.push(
          `<li class="insight-suggestion"><span class="insight-icon">📅</span> <strong>Target Date Adjustment:</strong> To reach ${fv(stats.targetWeight, 1)} kg by ${Utils.formatDateShort(stats.targetDate)}, consider adjusting your average daily net calorie balance by ~${fv(adjustment, 0)} kcal. Current suggested intake range: ${stats.suggestedIntakeRange?.min ?? "N/A"} - ${stats.suggestedIntakeRange?.max ?? "N/A"} kcal.</li>`,
        );
      }
    }
    // Optimal Gain Zone Check (if gaining)
    if (currentTrend != null && currentTrend > 0 && !stats.goalAchieved) {
      if (currentTrend > CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK) {
        insights.push(
          `<li class="insight-warning"><span class="insight-icon">📈</span> <strong>Rapid Gain:</strong> Current trend (${fv(currentTrend, 2)} kg/wk) is faster than the typical optimal lean gain range (${fv(CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK, 2)}-${fv(CONFIG.MAX_RECOMMENDED_GAIN_RATE_KG_WEEK, 2)} kg/wk). Consider if this rate aligns with your goals.</li>`,
        );
      } else if (currentTrend < CONFIG.MIN_RECOMMENDED_GAIN_RATE_KG_WEEK) {
        // insights.push(`<li class="insight-info"><span class="insight-icon">📉</span> <strong>Slow Gain:</strong> Current trend (${fv(currentTrend, 2)} kg/wk) is slower than the typical optimal lean gain range. This may be fine, but review if faster progress is desired.</li>`);
      }
    }

    // --- TDEE Insights ---
    const tdeeDiff = stats.avgTDEE_Difference;
    const tdeeAdaptive = stats.avgTDEE_Adaptive;
    const tdeeTrend = stats.avgTDEE_WgtChange;
    const tdeeGFit = stats.avgExpenditureGFit;

    if (tdeeDiff != null && Math.abs(tdeeDiff) > 150) {
      // If significant difference between Trend and GFit
      const higherSource = tdeeDiff > 0 ? "Weight Trend" : "GFit";
      const lowerSource = tdeeDiff > 0 ? "GFit" : "Weight Trend";
      insights.push(
        `<li class="insight-info"><span class="insight-icon">💡</span> <strong>TDEE Discrepancy:</strong> Your TDEE estimated from ${higherSource} (~${fv(tdeeTrend, 0)} kcal) is significantly different from your average GFit expenditure (~${fv(tdeeGFit, 0)} kcal). Review your calorie logging accuracy and GFit activity levels/reporting.</li>`,
      );
    } else if (
      tdeeAdaptive != null &&
      tdeeTrend != null &&
      Math.abs(tdeeAdaptive - tdeeTrend) > 150
    ) {
      insights.push(
        `<li class="insight-info"><span class="insight-icon">💡</span> <strong>TDEE Methods Differ:</strong> Your Adaptive TDEE (~${fv(tdeeAdaptive, 0)} kcal) differs notably from the Trend-based estimate (~${fv(tdeeTrend, 0)} kcal). The Adaptive value is often more stable; consider prioritizing it for planning.</li>`,
      );
    }

    // --- Plateau Insights ---
    if (plateausInRange.length > 0) {
      const lastPlateau = plateausInRange[plateausInRange.length - 1];
      insights.push(
        `<li class="insight-warning"><span class="insight-icon">⏸️</span> <strong>Plateau Detected:</strong> Your weight trend was relatively flat between ${Utils.formatDateShort(lastPlateau.startDate)} - ${Utils.formatDateShort(lastPlateau.endDate)}. If progress has stalled unintentionally, review your average intake and expenditure.</li>`,
      );
    }

    // --- Fallback message ---
    if (insights.length === 0 && !lowConsistency) {
      insights.push(
        `<li class="insight-info"><span class="insight-icon">👍</span> No specific suggestions currently. Continue monitoring your trends and consistency!</li>`,
      );
    }

    return insights.join("");
  },

  /**
   * Updates the insight summary box and actionable insights in the UI.
   * @param {object} stats - The calculated statistics object.
   */
  updateSummary(stats) {
    // --- Update Descriptive Summary (Existing Logic) ---
    if (ui.insightSummaryContainer && !ui.insightSummaryContainer.empty()) {
      const currentTrendWeekly =
        stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
      const regressionUsedForTrend = stats.regressionSlopeWeekly != null;
      const analysisRange = EventHandlers.getAnalysisDateRange(); // Get current range
      let summaryHtml = "";
      try {
        const trendStatus = this._getTrendStatus(
          currentTrendWeekly,
          stats.currentSma,
          regressionUsedForTrend,
        );
        const tdeeStatus = this._getPrimaryTDEEStatus(
          stats.avgExpenditureGFit,
          stats.avgTDEE_WgtChange,
          stats.avgTDEE_Adaptive,
        );
        const goalStatus = this._getGoalStatus(stats);
        const consistencyStatus = this._getConsistencyStatus(
          stats.weightDataConsistency,
          stats.calorieDataConsistency,
        );
        const detectedFeaturesHtml = this._getDetectedFeaturesInsightHTML(
          analysisRange.start,
          analysisRange.end,
        ); // Pass range dates

        if (trendStatus) summaryHtml += `<p>${trendStatus}</p>`;
        if (tdeeStatus) summaryHtml += `<p>${tdeeStatus}</p>`;
        if (goalStatus) summaryHtml += `<p>${goalStatus}</p>`; // Goal status is now enhanced
        if (consistencyStatus) summaryHtml += `<p>${consistencyStatus}</p>`;
        if (detectedFeaturesHtml) summaryHtml += detectedFeaturesHtml;
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
          "<p>Analysis requires more data or a different range.</p>",
      );
    } else {
      console.warn("InsightsGenerator: Insight summary container not found.");
    }

    // --- Update Actionable Insights ---
    if (ui.actionableInsightsList && !ui.actionableInsightsList.empty()) {
      // Need plateaus detected within the current analysis range
      const analysisRange = EventHandlers.getAnalysisDateRange();
      const plateausInRange = state.plateaus.filter(
        (p) =>
          p.endDate instanceof Date &&
          p.startDate instanceof Date &&
          p.endDate >= analysisRange.start &&
          p.startDate <= analysisRange.end,
      );

      const actionableHtml = this._generateActionableInsightsHTML(
        stats,
        plateausInRange,
      );
      ui.actionableInsightsList.html(
        actionableHtml ||
          '<li class="insight-info">No specific suggestions available.</li>',
      );

      // Show/hide the whole actionable container based on content
      if (ui.actionableInsightsContainer) {
        ui.actionableInsightsContainer.style(
          "display",
          actionableHtml ? null : "none",
        );
      }
    } else {
      console.warn(
        "InsightsGenerator: Actionable insights list container not found.",
      );
    }
  },
  init() {
    EventBus.subscribe("state:statsUpdated", InsightsGenerator.updateSummary);
  },
};
