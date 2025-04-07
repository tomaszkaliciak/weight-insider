// utils.js
// Provides common utility functions used throughout the application.

// We'll need access to uiCache and config for showStatusMessage
import { ui } from "../ui/uiCache.js";
import { CONFIG } from "../config.js";
import { state } from "../state.js"; // Need state for statusTimeoutId

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

export const Utils = {
  /**
   * Safely gets an element by ID, returning null if not found.
   * @param {string} id - The ID of the element.
   * @returns {HTMLElement|null} The element or null.
   */
  getElementByIdSafe(id) {
    const el = document.getElementById(id);
    return el;
  },

  /**
   * Formats a numeric value to a fixed number of decimals, returning 'N/A' for invalid inputs.
   * @param {*} val - The value to format.
   * @param {number} [decimals=2] - The number of decimal places.
   * @returns {string} The formatted value or 'N/A'.
   */
  formatValue(val, decimals = 2) {
    return val != null && !isNaN(val) ? val.toFixed(decimals) : "N/A";
  },

  /**
   * Formats a Date object as 'YYYY-MM-DD', returning 'N/A' for invalid dates.
   * @param {Date} date - The Date object to format.
   * @returns {string} The formatted date string or 'N/A'.
   */
  formatDate(date) {
    return date instanceof Date && !isNaN(date)
      ? d3.timeFormat("%Y-%m-%d")(date)
      : "N/A";
  },

  /**
   * Formats a Date object as 'DD Mon 'YY', returning 'N/A' for invalid dates.
   * @param {Date} date - The Date object to format.
   * @returns {string} The formatted date string or 'N/A'.
   */
  formatDateShort(date) {
    return date instanceof Date && !isNaN(date)
      ? d3.timeFormat("%d %b '%y")(date)
      : "N/A";
  },

  /**
   * Formats a Date object as 'Day, DD Mon YYYY', returning 'N/A' for invalid dates.
   * @param {Date} date - The Date object to format.
   * @returns {string} The formatted date string or 'N/A'.
   */
  formatDateLong(date) {
    return date instanceof Date && !isNaN(date)
      ? d3.timeFormat("%a, %d %b %Y")(date)
      : "N/A";
  },

  /**
   * Creates a debounced version of a function that delays invoking func until after wait milliseconds have elapsed since the last time the debounced function was invoked.
   * @param {Function} func - The function to debounce.
   * @param {number} wait - The number of milliseconds to delay.
   * @returns {Function} The new debounced function.
   */
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

  /**
   * Shows a temporary status message at the top of the screen.
   * @param {string} message - The message text.
   * @param {'info'|'success'|'warn'|'error'} [type='info'] - The message type (affects styling).
   * @param {number} [duration=CONFIG.statusMessageDurationMs] - How long the message stays visible (ms).
   */
  showStatusMessage(
    message,
    type = "info",
    duration = CONFIG.statusMessageDurationMs,
  ) {
    // Use the imported ui cache
    if (!ui.statusMessage || ui.statusMessage.empty()) {
      console.warn("Status message UI element not found in cache.");
      return;
    }
    // Use the imported state
    if (state.statusTimeoutId) clearTimeout(state.statusTimeoutId);

    ui.statusMessage
      .text(message)
      .attr("class", `status-message ${type}`) // Keep dynamic class setting
      .classed("show", true);

    state.statusTimeoutId = setTimeout(() => {
      ui.statusMessage.classed("show", false);
      state.statusTimeoutId = null;
    }, duration);
  },

  showCriticalErrorMessage(message) {
    // Create a modal-like overlay
    const overlay = document.createElement("div");
    overlay.classList.add("critical-error-overlay");
    overlay.innerHTML = `<div class="init-error"><h2>Chart Initialization Failed</h2><p>Could not render the chart due to an error:</p><pre>${message}</pre><p>Please check the browser console for more details or try reloading the page.</p></div>`;
    document.body.appendChild(overlay);
  },

  /**
   * Calculates a rolling average for an array of numbers. Null/NaN values are ignored in the calculation but advance the window.
   * @param {Array<number|null>} data - Array of numbers or nulls.
   * @param {number} windowSize - The size of the rolling window.
   * @returns {Array<number|null>} Array containing the rolling average, or null if insufficient data in window.
   */
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

  /**
   * Calculates the confidence interval for a linear regression line.
   * Requires simple-statistics library (ss).
   * @param {Array<object>} points - Array of data points, must have 'date' and 'value' properties.
   * @param {{slope: number, intercept: number}} regressionParams - Regression parameters {slope, intercept}.
   * @param {number} alpha - Significance level (e.g., 0.05 for 95% CI).
   * @returns {Array<object>} Original points array with added 'regressionValue', 'lowerCI', and 'upperCI' properties.
   */
  calculateRegressionCI(points, regressionParams, alpha) {
    if (
      !points ||
      points.length < 2 ||
      !regressionParams ||
      regressionParams.slope == null ||
      isNaN(regressionParams.slope) ||
      !ss || // Check if stats library is available
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
      return points.map((p, i) => {
        // Find the original point corresponding to this date to return all original properties
        const originalPoint = points.find(
          (op) => op.date.getTime() === p.date.getTime(),
        );
        return {
          ...originalPoint, // Use the matched original point
          regressionValue: yHatValues[i] ?? null, // Still provide regression value if calculated
          lowerCI: null,
          upperCI: null,
        };
      });
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
