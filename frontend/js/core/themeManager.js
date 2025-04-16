// js/core/themeManager.js
// Handles theme switching (light/dark) based on state and updates CSS variables/colors object.

import { StateManager } from "./stateManager.js";
import { ui } from "../ui/uiCache.js";
import { CONFIG } from "../config.js";
import * as Selectors from "./selectors.js";

// Exported colors object, updated by updateColors
export const colors = {};

export const ThemeManager = {
  /**
   * Updates the colors object by reading CSS variables.
   * Should be called after the theme class is applied to the body.
   */
  _updateColorsObject() {
    if (!document?.documentElement) {
      console.error(
        "ThemeManager: Cannot update colors, documentElement not found.",
      );
      // Optionally clear colors object or return early?
      Object.keys(colors).forEach((key) => delete colors[key]); // Clear existing colors
      return;
    }
    const style = getComputedStyle(document.documentElement);

    const getColor = (varName, fallbackKey) => {
      const val = style.getPropertyValue(varName)?.trim();
      return val || CONFIG.fallbackColors[fallbackKey] || "#000000"; // Use fallback
    };

    // Update the exported colors object
    Object.assign(colors, {
      sma: getColor("--sma-color", "sma"),
      ema: getColor("--ema-color", "ema"), // Added EMA
      band: getColor("--band-color", "band"),
      rawDot: getColor("--raw-dot-color", "rawDot"),
      dot: getColor("--dot-color", "dot"),
      trend1: getColor("--trend1-color", "trend1"),
      trend2: getColor("--trend2-color", "trend2"),
      regression: getColor("--regression-color", "regression"),
      goal: getColor("--goal-line-color", "goal"),
      outlier: getColor("--outlier-color", "outlier"),
      deficit: getColor("--deficit-color", "deficit"),
      surplus: getColor("--surplus-color", "surplus"),
      rateLineColor: getColor("--rate-line-color", "rateLineColor"),
      rateMALine: getColor("--rate-ma-line-color", "rateMALine"),
      tdeeDiffLineColor: getColor(
        "--tdee-diff-line-color",
        "tdeeDiffLineColor",
      ),
      annotationMarker: getColor(
        "--annotation-marker-color",
        "annotationMarker",
      ),
      annotationRange: getColor("--annotation-range-color", "annotationRange"),
      plateauColor: getColor("--plateau-color", "plateauColor"),
      trendChangeColor: getColor("--trend-change-color", "trendChangeColor"),
      highlightStroke: getColor("--highlight-stroke-color", "highlightStroke"),
      scatterDotColor: getColor("--scatter-dot-color", "scatterDotColor"),
      secondAxisColor: getColor("--second-axis-color", "secondAxisColor"), // Keep if used
      optimalGainZone: getColor("--optimal-gain-zone-color", "optimalGainZone"),
    });
    console.log("[ThemeManager] Updated colors object:", colors);
    // No need to dispatch event here, components needing colors can just import `colors`
  },

  /**
   * Updates the theme toggle button icon based on the current theme.
   * @param {string} currentTheme - The current theme ('light' or 'dark').
   */
  _updateToggleButtonIcon(currentTheme) {
    ui.themeToggle?.html(
      currentTheme === "dark"
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-sun"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>` // Sun
        : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-moon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`, // Moon
    );
  },

  /**
   * Applies the theme class to the body and updates dependent visuals.
   * Called by the state change listener.
   * @param {string} newTheme - The theme to apply ('light' or 'dark').
   */
  _applyTheme(newTheme) {
    const theme = newTheme === "dark" ? "dark" : "light";
    console.log(`[ThemeManager] Applying theme: ${theme}`);
    ui.body?.classed("dark-theme", theme === "dark");
    localStorage.setItem(CONFIG.localStorageKeys.theme, theme); // Keep saving preference
    this._updateColorsObject(); // Recalculate colors based on new theme
    this._updateToggleButtonIcon(theme); // Update button icon
    // MasterUpdater will handle chart redraw via its own subscription to theme change
  },

  /**
   * Dispatches an action to toggle the current theme.
   */
  toggleTheme() {
    const currentTheme = Selectors.selectCurrentTheme(StateManager.getState()); // Read state
    const newTheme = currentTheme === "light" ? "dark" : "light";
    console.log(`[ThemeManager] Dispatching SET_THEME action: ${newTheme}`);
    StateManager.dispatch({ type: "SET_THEME", payload: newTheme });
    // The _applyTheme method will be called via the state subscription.
  },

  /**
   * Initializes the ThemeManager.
   * Reads the saved theme, dispatches the initial state, and subscribes to changes.
   */
  init() {
    // Determine initial theme (localStorage > default)
    const savedTheme = localStorage.getItem(CONFIG.localStorageKeys.theme);
    const initialTheme = savedTheme === "dark" ? "dark" : "light";
    console.log(
      `[ThemeManager Init] Initial theme determined as: ${initialTheme}`,
    );

    // IMPORTANT: Dispatch the initial theme *before* applying it or subscribing
    // This ensures the state is correct before any reactions happen.
    StateManager.dispatch({ type: "SET_THEME", payload: initialTheme });

    // Subscribe to subsequent theme changes from the state
    StateManager.subscribeToSpecificEvent("state:themeUpdated", (payload) => {
      // Payload is { theme: newTheme }
      this._applyTheme(payload.theme);
    });
    console.log("[ThemeManager Init] Subscribed to state:themeUpdated.");

    // Apply the initial theme based on the now-dispatched state
    this._applyTheme(initialTheme);
  },
};
