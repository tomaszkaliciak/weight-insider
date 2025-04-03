// config.js
// Stores immutable configuration values for the application.

export const CONFIG = Object.freeze({
  // Make CONFIG immutable
  localStorageKeys: {
    goal: "weightInsightsGoalV2",
    theme: "weightInsightsThemeV2",
    annotations: "weightInsightsAnnotationsV2",
  },
  // Data Processing & Analysis
  movingAverageWindow: 7,
  rateOfChangeSmoothingWindow: 7,
  tdeeDiffSmoothingWindow: 14,
  adaptiveTDEEWindow: 28,
  stdDevMultiplier: 1.0, // For SMA band width
  KCALS_PER_KG: 7700,
  OUTLIER_STD_DEV_THRESHOLD: 2.5,
  ROLLING_VOLATILITY_WINDOW: 14, // <<< ADDED: Window size in days
  MIN_POINTS_FOR_REGRESSION: 7,
  MIN_WEEKS_FOR_CORRELATION: 4,
  CONFIDENCE_INTERVAL_ALPHA: 0.05, // For 95% CI
  // Plateau & Trend Detection
  plateauRateThresholdKgWeek: 0.07,
  plateauMinDurationWeeks: 3,
  trendChangeWindowDays: 14,
  trendChangeMinSlopeDiffKgWeek: 0.15,
  // Visual Appearance
  margins: {
    focus: { top: 10, right: 50, bottom: 30, left: 50 },
    context: { top: 10, right: 50, bottom: 30, left: 50 },
    balance: { top: 5, right: 50, bottom: 20, left: 50 },
    rate: { top: 10, right: 50, bottom: 20, left: 50 },
    tdeeDiff: { top: 5, right: 50, bottom: 20, left: 50 },
    correlationScatter: { top: 10, right: 30, bottom: 30, left: 50 },
  },
  dotRadius: 3.5,
  dotHoverRadius: 5.5,
  rawDotRadius: 2.5,
  highlightRadiusMultiplier: 1.8,
  annotationMarkerRadius: 4,
  yAxisPaddingFactor: 0.02,
  yAxisMinPaddingKg: 0.1,
  domainBufferDays: 7, // Buffer for dynamic Y-axis calculation
  // Interaction & Timing
  debounceResizeMs: 350,
  transitionDurationMs: 300,
  initialViewMonths: 3,
  statusMessageDurationMs: 3000,
  tooltipShowDelayMs: 100, // Slight delay before showing tooltip
  tooltipHideDelayMs: 300, // Delay before hiding tooltip
  // Goal Guidance & Lean Gain
  MIN_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.1, // Lower bound for optimal lean gain
  MAX_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.35, // Upper bound for optimal lean gain
  // Fallback Colors (referenced if CSS variables fail)
  fallbackColors: {
    sma: "#3498db",
    band: "rgba(52,152,219,0.08)",
    rawDot: "#bdc3c7",
    dot: "#3498db",
    trend1: "#2ecc71",
    trend2: "#e74c3c",
    regression: "#f39c12",
    regressionCI: "rgba(243,156,18, 0.1)",
    goal: "#9b59b6",
    outlier: "#e74c3c",
    deficit: "#2ecc71",
    surplus: "#e74c3c",
    rateLineColor: "#8e44ad",
    tdeeDiffLineColor: "#1abc9c",
    annotationMarker: "#e67e22",
    annotationRange: "rgba(230, 126, 34, 0.1)",
    plateauColor: "rgba(127, 140, 141, 0.15)",
    trendChangeColor: "#e74c3c",
    highlightStroke: "#f1c40f",
    scatterDotColor: "#34495e",
    secondAxisColor: "#27ae60",
    optimalGainZone: "hsla(120, 60%, 50%, 0.1)",
  },
});
