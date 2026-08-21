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
      ema: getColor("--ema-color", "ema"),
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
    // No need to dispatch event here, components needing colors can just import `colors`
  },

  // Cycle order: light → dark → gruvbox → light …
  _THEME_CYCLE: ["light", "dark", "gruvbox"],

  // SVG icons: each icon hints at the *next* theme in the cycle.
  _THEME_ICONS: {
    // Currently light → next is dark → show moon
    light: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    // Currently dark → next is gruvbox → show flame
    dark: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
    // Currently gruvbox → next is light → show sun
    gruvbox: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  },

  /**
   * Updates the theme toggle button icon to hint at the *next* theme in the cycle.
   * @param {string} currentTheme - The active theme ('light' | 'dark' | 'gruvbox').
   */
  _updateToggleButtonIcon(currentTheme) {
    const icon = this._THEME_ICONS[currentTheme] ?? this._THEME_ICONS.light;
    ui.themeToggle?.html(icon);

    // Tooltip label showing the next theme name
    const idx = this._THEME_CYCLE.indexOf(currentTheme);
    const nextTheme = this._THEME_CYCLE[(idx + 1) % this._THEME_CYCLE.length];
    const labels = { light: "Light", dark: "Dark", gruvbox: "Gruvbox" };
    ui.themeToggle?.attr("title", `Switch to ${labels[nextTheme]} theme`);
    ui.themeToggle?.attr("aria-label", `Switch to ${labels[nextTheme]} theme`);
  },

  /**
   * Applies the correct body class and persists the choice.
   * @param {string} newTheme - The theme to apply ('light' | 'dark' | 'gruvbox').
   */
  _applyTheme(newTheme) {
    const valid = this._THEME_CYCLE.includes(newTheme) ? newTheme : "light";

    ui.body?.classed("theme-transitioning", true);

    // Remove all theme classes then apply the correct one
    ui.body
      ?.classed("dark-theme",    valid === "dark")
      .classed("gruvbox-theme",  valid === "gruvbox");

    localStorage.setItem(CONFIG.localStorageKeys.theme, valid);
    this._updateColorsObject();
    this._updateToggleButtonIcon(valid);

    setTimeout(() => {
      ui.body?.classed("theme-transitioning", false);
    }, 400);
  },

  /**
   * Advances to the next theme in the cycle (light → dark → gruvbox → light).
   */
  toggleTheme() {
    const currentTheme = Selectors.selectCurrentTheme(StateManager.getState());
    const idx = this._THEME_CYCLE.indexOf(currentTheme);
    const nextTheme = this._THEME_CYCLE[(idx + 1) % this._THEME_CYCLE.length];
    StateManager.dispatch({ type: "SET_THEME", payload: nextTheme });
  },

  /**
   * Initializes the ThemeManager.
   * Reads the saved theme, dispatches the initial state, and subscribes to changes.
   */
  init() {
    const savedTheme = localStorage.getItem(CONFIG.localStorageKeys.theme);
    const initialTheme = this._THEME_CYCLE.includes(savedTheme) ? savedTheme : "light";

    // IMPORTANT: Dispatch the initial theme *before* applying it or subscribing
    // This ensures the state is correct before any reactions happen.
    StateManager.dispatch({ type: "SET_THEME", payload: initialTheme });

    StateManager.subscribeToSpecificEvent("state:themeUpdated", (payload) => {
      // Payload is { theme: newTheme }
      this._applyTheme(payload.theme);
    });

    // Apply the initial theme based on the now-dispatched state
    this._applyTheme(initialTheme);
  },
};
