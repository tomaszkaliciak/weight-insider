import { ui } from "../uiCache.js";
import { Utils } from "../../core/utils.js";
import { StateManager } from "../../core/stateManager.js";
import { EventHandlers } from "../../interactions/eventHandlers.js";
import * as Selectors from "../../core/selectors.js";
import { AnimatedNumbers } from "../animatedNumbers.js";

// Keys that should have animated number transitions
const ANIMATED_KEYS = new Set([
  'startingWeight', 'currentWeight', 'currentSma', 'totalChange',
  'maxWeight', 'minWeight', 'avgIntake', 'avgExpenditure', 'avgNetBalance',
  'estimatedDeficitSurplus', 'weightToGoal', 'regressionSlope',
  'rollingWeeklyChangeSma', 'volatilityScore', 'rollingVolatility'
]);

export const StatsDisplayRenderer = {
  /**
   * Updates the text content of various stat display elements.
   * @param {object} displayStats - The displayStats object received from the state update event.
   */
  _render(displayStats) {
    console.log(
      "[StatsDisplayRenderer] _render called with displayStats:",
      JSON.stringify(displayStats),
    );
    if (!displayStats || typeof displayStats !== "object") {
      console.warn(
        "StatsDisplayRenderer: _render called without valid stats data. Rendering N/A.",
      );
      displayStats = {}; // Use empty object to avoid errors below and render N/A
    }

    const fv = Utils.formatValue;
    const fd = Utils.formatDate;
    const fdShort = Utils.formatDateShort;
    const na = (v) => (v != null ? v : "N/A");

    const updateElement = (key, value, formatter = na, args = undefined) => {
      const element = ui.statElements[key];
      if (element) {
        let formattedValue = formatter(value, args);
        // Special handling (remains the same)
        if (key === "currentRateFeedback" && displayStats.targetRateFeedback) {
          element.className = `stat-value feedback ${displayStats.targetRateFeedback.class || ""}`;
          element.textContent = displayStats.targetRateFeedback.text ?? "N/A";
        } else if (
          key === "weightConsistencyDetails" &&
          displayStats.weightDataConsistency
        ) {
          element.textContent = `(${displayStats.weightDataConsistency.count ?? "?"}/${displayStats.weightDataConsistency.totalDays ?? "?"} days)`;
        } else if (
          key === "calorieConsistencyDetails" &&
          displayStats.calorieDataConsistency
        ) {
          element.textContent = `(${displayStats.calorieDataConsistency.count ?? "?"}/${displayStats.calorieDataConsistency.totalDays ?? "?"} days)`;
        } else if (key === "suggestedIntakeTarget") { // Changed key
          // Display single target value, or N/A
          element.textContent = value != null ? fv(value, 0) : "N/A";
        } else if (ANIMATED_KEYS.has(key) && typeof value === 'number' && !isNaN(value)) {
          // Animate numeric stats for premium feel
          const decimals = args !== undefined ? args : 1;
          AnimatedNumbers.animate(element, value, { decimals, duration: 400 });
        } else {
          element.textContent = formattedValue; // Default
        }

        // Add/Remove highlightable class and listener (remains the same)
        if (key === "maxWeightDate" || key === "minWeightDate") {
          if (value instanceof Date && !isNaN(value)) {
            element.classList.add("highlightable");
            element.style.cursor = "pointer";
            element.style.textDecoration = "underline dotted";
            element.__highlightDate = value;
            element.removeEventListener(
              "click",
              EventHandlers.statDateClickWrapper,
            );
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
            element.textContent = "N/A"; // Ensure N/A
          }
        }
      }
    };

    // Update all stat elements using the provided displayStats object
    updateElement("startingWeight", displayStats.startingWeight, fv, 1);
    updateElement("currentWeight", displayStats.currentWeight, fv, 1);
    updateElement("currentSma", displayStats.currentSma, fv, 1);
    updateElement("totalChange", displayStats.totalChange, fv, 1);
    updateElement("maxWeight", displayStats.maxWeight, fv, 1);
    updateElement("maxWeightDate", displayStats.maxWeightDate, fd);
    updateElement("minWeight", displayStats.minWeight, fv, 1);
    updateElement("minWeightDate", displayStats.minWeightDate, fd);
    updateElement("startingLbm", displayStats.startingLbm, fv, 1);
    updateElement("currentLbmSma", displayStats.currentLbmSma, fv, 1);
    updateElement("totalLbmChange", displayStats.totalLbmChange, fv, 1);
    updateElement("currentFmSma", displayStats.currentFmSma, fv, 1);
    updateElement("totalFmChange", displayStats.totalFmChange, fv, 1);
    updateElement("volatilityScore", displayStats.volatility, fv, 2);
    updateElement("rollingVolatility", displayStats.rollingVolatility, fv, 2);
    updateElement(
      "rollingWeeklyChangeSma",
      displayStats.currentWeeklyRate,
      fv,
      2,
    );
    updateElement("rateConsistencyStdDev", displayStats.rateConsistencyStdDev, fv, 2); // Added this line
    updateElement("regressionSlope", displayStats.regressionSlopeWeekly, fv, 2);
    // Update regression start date label directly
    if (ui.statElements.regressionStartDateLabel) {
      ui.statElements.regressionStartDateLabel.textContent =
        displayStats.regressionStartDate
          ? `(${fdShort(displayStats.regressionStartDate)})`
          : "(Range Start)";
    }
    updateElement(
      "netcalRateCorrelation",
      displayStats.netCalRateCorrelation,
      fv,
      2,
    );
    updateElement(
      "weightConsistency",
      displayStats.weightDataConsistency?.percentage,
      fv,
      0,
    );
    updateElement("weightConsistencyDetails"); // Special handling inside updateElement
    updateElement(
      "calorieConsistency",
      displayStats.calorieDataConsistency?.percentage,
      fv,
      0,
    );
    updateElement("calorieConsistencyDetails"); // Special handling inside updateElement
    updateElement("avgIntake", displayStats.avgIntake, fv, 0);
    updateElement("avgExpenditure", displayStats.avgExpenditureGFit, fv, 0);
    updateElement("avgNetBalance", displayStats.avgNetBalance, fv, 0);
    updateElement(
      "estimatedDeficitSurplus",
      displayStats.estimatedDeficitSurplus,
      fv,
      0,
    );
    updateElement("avgTdeeGfit", displayStats.avgExpenditureGFit, fv, 0);
    updateElement("avgTdeeWgtChange", displayStats.avgTDEE_WgtChange, fv, 0);
    updateElement("avgTdeeDifference", displayStats.avgTDEE_Difference, fv, 0);
    updateElement("avgTdeeAdaptive", displayStats.avgTDEE_Adaptive, fv, 0);
    updateElement("targetWeightStat", displayStats.targetWeight, fv, 1);
    updateElement("targetRateStat", displayStats.targetRate, fv, 2);
    updateElement("weightToGoal", displayStats.weightToGoal, fv, 1);
    updateElement("estimatedTimeToGoal", displayStats.estimatedTimeToGoal);
    updateElement(
      "requiredRateForGoal",
      displayStats.requiredRateForGoal,
      fv,
      2,
    );
    updateElement(
      "requiredNetCalories",
      displayStats.requiredNetCalories,
      fv,
      0,
    );
    updateElement(
      "requiredCalorieAdjustment",
      displayStats.requiredCalorieAdjustment,
      fv,
      0,
    );
    updateElement("suggestedIntakeTarget", displayStats.suggestedIntakeTarget); // Changed key, uses new special handling
    updateElement("suggestedIntakeSource", displayStats.baselineTDEESource); // Added: Display TDEE source (assumes element exists)
    updateElement("currentRateFeedback", displayStats.targetRateFeedback); // Special handling

    // --- Trend Flux Insight  ---
    // Calculates the difference between Scale Weight and Trend Weight
    this._renderTrendFlux(displayStats);

    // Call any other specific updaters if needed
    if (ui.statElements["currentRateFeedback"]) {
      // Re-apply class for rate feedback if needed (redundant safety)
    }
  },

  _renderTrendFlux(stats) {
    const container = document.getElementById('trend-flux-container');
    if (!container) return;

    const scale = stats.currentWeight;
    const trend = stats.currentSma;

    if (scale != null && trend != null && !isNaN(scale) && !isNaN(trend)) {
      const flux = scale - trend;
      const absFlux = Math.abs(flux);

      container.style.display = 'block';
      let message = '';
      let className = 'trend-flux';

      if (absFlux < 0.1) {
        // Scale matches Trend (Balanced)
        message = `Scale matches Trend.<br><small>Perfectly aligned.</small>`;
        className += ' flux-neutral'; // Need to add CSS for this if desired, or reuse existing
      } else if (flux > 0) {
        // Scale is higher than trend (Water retention, inflammation, etc.)
        message = `Scale is <strong>+${flux.toFixed(1)}kg</strong> over Trend.<br><small>Likely water fluctuation.</small>`;
        className += ' flux-high';
      } else {
        // Scale is lower than trend (Whoosh, new low)
        message = `Scale is <strong>-${absFlux.toFixed(1)}kg</strong> under Trend.<br><small>New low detected!</small>`;
        className += ' flux-low';
      }

      container.innerHTML = `<div class="${className}">${message}</div>`;
    } else {
      console.warn('[StatsDisplayRenderer] Trend Flux missing data:', { scale, trend });
      container.style.display = 'none';
    }
  },

  init() {
    // Bind context to ensure 'this' is correct when called by StateManager
    this._render = this._render.bind(this);

    // Subscribe specifically to the event carrying the display stats
    StateManager.subscribeToSpecificEvent(
      "state:displayStatsUpdated",
      this._render,
    );
    console.log(
      "[StatsDisplayRenderer Init] Subscribed to state:displayStatsUpdated.",
    );
    // Render initial empty state
    this._render({});
  },
};
