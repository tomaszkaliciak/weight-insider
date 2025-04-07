// themeManager.js
// Handles theme switching (light/dark) and CSS variable caching for colors.

import { state } from "../state.js";
import { ui } from "../ui/uiCache.js";
import { CONFIG } from "../config.js";
import { EventBus } from "./eventBus.js";

export const colors = {};

export const ThemeManager = {
  init() {
    const savedTheme =
      localStorage.getItem(CONFIG.localStorageKeys.theme) || "light";
    this._setThemeInternal(savedTheme);
    this.updateColors();

    this._updateToggleButton();
  },

  _setThemeInternal(theme) {
    state.currentTheme = theme === "dark" ? "dark" : "light";
    ui.body?.classed("dark-theme", state.currentTheme === "dark");
    localStorage.setItem(CONFIG.localStorageKeys.theme, state.currentTheme);
  },

  _updateToggleButton() {
    ui.themeToggle?.html(
      state.currentTheme === "dark"
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-sun"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>` // Sun icon
        : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-moon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`, // Moon icon
    );
  },

  setTheme(theme, triggerUpdate = true) {
    this._setThemeInternal(theme);
    this._updateToggleButton();
    this.updateColors();

    if (state.isInitialized && triggerUpdate) {
      console.log(
        `ThemeManager: Switched to ${theme} theme, triggering updates.`,
      );

      EventBus.publish("state::themeChanged");
    }
  },

  toggleTheme() {
    this.setTheme(state.currentTheme === "light" ? "dark" : "light");
  },

  updateColors() {
    if (!document?.documentElement) {
      console.error(
        "ThemeManager: Cannot update colors, documentElement not found.",
      );
      return;
    }
    const style = getComputedStyle(document.documentElement);

    const getColor = (varName, fallbackKey) => {
      const val = style.getPropertyValue(varName)?.trim();
      if (!val && CONFIG.fallbackColors[fallbackKey]) {
        return CONFIG.fallbackColors[fallbackKey];
      }
      return val || CONFIG.fallbackColors[fallbackKey] || "#000000";
    };

    Object.assign(colors, {
      sma: getColor("--sma-color", "sma"),
      band: getColor("--band-color", "band"),
      rawDot: getColor("--raw-dot-color", "rawDot"),
      dot: getColor("--dot-color", "dot"),
      trend1: getColor("--trend1-color", "trend1"),
      trend2: getColor("--trend2-color", "trend2"),
      regression: getColor("--regression-color", "regression"),
      regressionCI: getColor("--regression-ci-color", "regressionCI"),
      goal: getColor("--goal-line-color", "goal"),
      outlier: getColor("--outlier-color", "outlier"),
      deficit: getColor("--deficit-color", "deficit"),
      surplus: getColor("--surplus-color", "surplus"),
      rateLineColor: getColor("--rate-line-color", "rateLineColor"),
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
      secondAxisColor: getColor("--second-axis-color", "secondAxisColor"),
      optimalGainZone: getColor("--optimal-gain-zone-color", "optimalGainZone"),
    });
  },
};
