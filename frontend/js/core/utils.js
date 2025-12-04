// js/core/utils.js
// Provides common utility functions used throughout the application.

import { ui } from "../ui/uiCache.js";
import { CONFIG } from "../config.js";

// Assume simple-statistics (ss) might be needed elsewhere, keep reference if used
// const ss = window.ss || { /* ... fallback implementations ... */ };

export const Utils = {
  /**
   * Safely gets an element by ID, returning null if not found.
   * @param {string} id - The ID of the element.
   * @returns {HTMLElement|null} The element or null.
   */
  getElementByIdSafe(id) {
    try {
      // Basic check for invalid selector characters, although IDs are generally safe
      if (/[^a-zA-Z0-9\-_]/.test(id)) {
        console.warn(`Utils: Potentially invalid ID selector used: "${id}"`);
        // Allow it for now, but could restrict further if needed
      }
      return document.getElementById(id);
    } catch (e) {
      console.error(`Utils: Error accessing element with ID "${id}"`, e);
      return null;
    }
  },

  /**
   * Formats a numeric value to a fixed number of decimals, returning 'N/A' for invalid inputs.
   * Handles null, undefined, NaN, and non-finite numbers.
   * @param {*} val - The value to format.
   * @param {number} [decimals=2] - The number of decimal places.
   * @returns {string} The formatted value or 'N/A'.
   */
  formatValue(val, decimals = 2) {
    const num = Number(val); // Attempt conversion
    return val != null && !isNaN(num) && isFinite(num)
      ? num.toFixed(decimals)
      : "N/A";
  },

  /**
   * Formats a Date object or a valid date string as 'YYYY-MM-DD', returning 'N/A' for invalid inputs.
   * @param {Date|string|null|undefined} dateInput - The Date object or string to format.
   * @returns {string} The formatted date string or 'N/A'.
   */
  formatDate(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput); // Attempt conversion if string
    return date instanceof Date && !isNaN(date)
      ? d3.timeFormat("%Y-%m-%d")(date)
      : "N/A";
  },

  /**
   * Formats a Date object or a valid date string as 'DD-MM-YYYY', returning 'N/A' for invalid inputs.
   * @param {Date|string|null|undefined} dateInput - The Date object or string to format.
   * @returns {string} The formatted date string or 'N/A'.
   */
  formatDateDMY(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return date instanceof Date && !isNaN(date)
      ? d3.timeFormat("%d-%m-%Y")(date)
      : "N/A";
  },

  /**
   * Parses a date string in 'DD-MM-YYYY' format into a Date object.
   * @param {string} dateStr - The date string in DD-MM-YYYY format.
   * @returns {Date|null} The parsed Date object or null if invalid.
   */
  parseDateDMY(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const date = new Date(year, month, day);
    // Validate the date is valid (e.g., not Feb 30)
    if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
      return null;
    }
    return date;
  },

  /**
   * Formats a Date object or a valid date string as 'DD Mon 'YY', returning 'N/A' for invalid inputs.
   * @param {Date|string|null|undefined} dateInput - The Date object or string to format.
   * @returns {string} The formatted date string or 'N/A'.
   */
  formatDateShort(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return date instanceof Date && !isNaN(date)
      ? d3.timeFormat("%d %b '%y")(date)
      : "N/A";
  },

  /**
   * Formats a Date object or a valid date string as 'Day, DD Mon YYYY', returning 'N/A' for invalid inputs.
   * @param {Date|string|null|undefined} dateInput - The Date object or string to format.
   * @returns {string} The formatted date string or 'N/A'.
   */
  formatDateLong(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return date instanceof Date && !isNaN(date)
      ? d3.timeFormat("%a, %d %b %Y")(date)
      : "N/A";
  },

  /**
   * Creates a debounced version of a function.
   * @param {Function} func - The function to debounce.
   * @param {number} wait - The number of milliseconds to delay.
   * @param {object} [options={}] - Options: leading (boolean).
   * @returns {Function} The new debounced function with a `cancel` method.
   */
  debounce(func, wait, options = {}) {
    let timeout, result;
    const debounced = function (...args) {
      const context = this;
      const later = function () {
        timeout = null;
        if (!options.leading) {
          result = func.apply(context, args);
        }
      };
      const callNow = options.leading && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) {
        result = func.apply(context, args);
        // Set timeout to null after immediate call if leading is true,
        // to allow subsequent calls after wait period.
        // Context and args are cleared by later function if trailing call happens.
        // If only leading, timeout is cleared and reset above anyway.
      }
      return result;
    };
    debounced.cancel = function () {
      clearTimeout(timeout);
      timeout = null;
    };
    return debounced;
  },

  /**
   * Creates a throttled version of a function.
   * @param {Function} func - The function to throttle.
   * @param {number} wait - The number of milliseconds to throttle invocations to.
   * @param {object} [options={}] - Optional settings. `leading`: false to disable leading call. `trailing`: false to disable trailing call.
   * @returns {Function} The new throttled function with a `cancel` method.
   */
  throttle(func, wait, options = {}) {
    let context, args, result;
    let timeout = null;
    let previous = 0;
    if (!options) options = {};

    const later = function () {
      previous = options.leading === false ? 0 : Date.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null; // Clean up references
    };

    const throttled = function (...throttledArgs) {
      const now = Date.now();
      if (!previous && options.leading === false) previous = now;
      const remaining = wait - (now - previous);
      context = this;
      args = throttledArgs; // Use rest parameter

      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null; // Clean up references
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };

    throttled.cancel = function () {
      clearTimeout(timeout);
      previous = 0;
      timeout = context = args = null;
    };

    return throttled;
  },

  /**
   * Shows a temporary status message at the top of the screen.
   * Manages its own timeout internally. Concurrent calls will reset the timer for the latest message.
   * @param {string} message - The message text.
   * @param {'info'|'success'|'warn'|'error'} [type='info'] - The message type (affects styling).
   * @param {number} [duration=CONFIG.statusMessageDurationMs] - How long the message stays visible (ms).
   */
  showStatusMessage(
    message,
    type = "info",
    duration = CONFIG.statusMessageDurationMs,
  ) {
    // Static variable within the function scope to hold the timeout ID
    if (typeof this.statusTimeoutId === "undefined") {
      this.statusTimeoutId = null;
    }

    if (!ui.statusMessage || ui.statusMessage.empty()) {
      console.warn("Status message UI element not found in cache.");
      return;
    }

    // Clear any existing timeout for the status message
    if (this.statusTimeoutId) {
      clearTimeout(this.statusTimeoutId);
      this.statusTimeoutId = null; // Reset the stored ID
    }

    // Update and show the message
    ui.statusMessage
      .attr("class", `status-message ${type}`) // Set classes first
      .text(message) // Then set text
      .classed("show", true); // Then add show class

    // Create new timeout and store its ID
    this.statusTimeoutId = setTimeout(() => {
      ui.statusMessage.classed("show", false);
      this.statusTimeoutId = null; // Clear the stored ID when timeout executes
    }, duration);
  },

  /**
   * Displays a critical error message in an overlay.
   * @param {string} message - The error message to display.
   */
  showCriticalErrorMessage(message) {
    // Remove existing overlay if present
    const existingOverlay = document.querySelector(".critical-error-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create a modal-like overlay
    const overlay = document.createElement("div");
    overlay.classList.add("critical-error-overlay"); // Add specific class for styling/selection
    // Use template literal for cleaner HTML structure
    overlay.innerHTML = `
        <div class="init-error">
            <h2>Chart Initialization Failed</h2>
            <p>Could not render the chart due to an error:</p>
            <pre>${message || "Unknown error"}</pre>
            <p>Please check the browser console for more details or try reloading the page.</p>
        </div>
    `;
    document.body.appendChild(overlay);
  },

  /**
   * Calculates a rolling average for an array of numbers. Null/NaN values are ignored.
   * @param {Array<number|null>} data - Array of numbers or nulls.
   * @param {number} windowSize - The size of the rolling window.
   * @returns {Array<number|null>} Array containing the rolling average, or null if insufficient data in window.
   */
  calculateRollingAverage(data, windowSize) {
    if (!Array.isArray(data) || windowSize <= 0) {
      return new Array(data?.length || 0).fill(null);
    }
    const result = new Array(data.length).fill(null);
    let sum = 0;
    let count = 0;
    const windowQueue = []; // Use a queue for efficient window management

    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      let isValidValue = value != null && !isNaN(value) && isFinite(value);

      // Add current value (or null placeholder) to queue
      windowQueue.push(isValidValue ? value : null);

      // Add to sum/count if valid
      if (isValidValue) {
        sum += value;
        count++;
      }

      // Remove value leaving the window from the left (if window is full)
      if (windowQueue.length > windowSize) {
        const removedValue = windowQueue.shift(); // Remove from the beginning
        if (removedValue != null) {
          // Check if the removed value was valid
          sum -= removedValue;
          count--;
        }
      }

      // Calculate average if there are valid points in the window
      if (count > 0) {
        result[i] = sum / count;
      }
      // else result[i] remains null
    }
    return result;
  },

  /**
   * Performs a deep clone of an object or array. Handles basic types, objects, arrays, Dates.
   * Does not handle functions, Maps, Sets, or circular references correctly.
   * @param {any} obj - The object or array to clone.
   * @param {Map} [hash=new Map()] - Internal map to handle circular references (optional).
   * @returns {any} A deep clone of the input.
   */
  deepClone(obj, hash = new Map()) {
    // Handle primitive types and null
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    // Handle Dates
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    // Handle circular references
    if (hash.has(obj)) {
      return hash.get(obj);
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
      const arrClone = [];
      hash.set(obj, arrClone); // Store the clone reference immediately
      for (let i = 0; i < obj.length; i++) {
        arrClone[i] = Utils.deepClone(obj[i], hash); // Pass hash down
      }
      return arrClone;
    }

    // Handle Objects
    // Use Object.create to preserve prototype chain if needed, otherwise {} is fine
    // const objClone = Object.create(Object.getPrototypeOf(obj));
    const objClone = {};
    hash.set(obj, objClone); // Store the clone reference immediately
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        objClone[key] = Utils.deepClone(obj[key], hash); // Pass hash down
      }
    }
    return objClone;
  },
};
