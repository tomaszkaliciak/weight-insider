// config.js
// Stores immutable configuration values for the application.

export const CONFIG = Object.freeze({
  // Make CONFIG immutable

  localStorageKeys: {
    goal: "weightInsightsGoalV3",
    theme: "weightInsightsThemeV3",
    annotations: "weightInsightsAnnotationsV3",
  },

  // --- Data Processing & Analysis ---
  movingAverageWindow: 7, // Days for SMA
  emaWindow: 7, // Days for EMA (Ensure this matches desired EMA calculation)
  rateOfChangeSmoothingWindow: 7, // Days for smoothing the daily rate before calculating weekly rate
  rateMovingAverageWindow: 7, // Days for the secondary MA on the weekly rate chart
  tdeeDiffSmoothingWindow: 14, // Days for smoothing the TDEE difference (Trend - GFit)
  adaptiveTDEEWindow: 28, // Days for the adaptive TDEE calculation window
  stdDevMultiplier: 1.0, // Multiplier for SMA band width (1.0 = +/- 1 Std Dev)
  KCALS_PER_KG: 7700, // Approximate calories per kilogram of body weight change
  OUTLIER_STD_DEV_THRESHOLD: 2.5, // Std Devs from SMA to be marked as an outlier
  ROLLING_VOLATILITY_WINDOW: 14, // Days for calculating rolling volatility stat
  MIN_POINTS_FOR_REGRESSION: 7, // Minimum non-outlier points needed within range for regression line
  MIN_WEEKS_FOR_CORRELATION: 4, // Minimum weeks of data needed in analysis range for correlation calculation

  // --- Plateau & Trend Detection ---
  plateauRateThresholdKgWeek: 0.07, // Max absolute weekly rate (kg/wk) to be considered a plateau
  plateauMinDurationWeeks: 3, // Minimum duration for a flat period to be called a plateau
  trendChangeWindowDays: 14, // Lookback/lookahead window (days) for detecting trend changes
  trendChangeMinSlopeDiffKgWeek: 0.3, // Minimum change in weekly slope (kg/wk) to mark a trend change

  // --- Visual Appearance ---
  margins: {
    // SVG margins for charts
    focus: { top: 10, right: 50, bottom: 30, left: 70 }, // Main chart
    context: { top: 10, right: 50, bottom: 30, left: 50 }, // Context/brush chart
    balance: { top: 5, right: 50, bottom: 20, left: 70 }, // Calorie balance bars
    rate: { top: 10, right: 50, bottom: 20, left: 70 }, // Rate of change line
    tdeeDiff: { top: 5, right: 50, bottom: 20, left: 70 }, // TDEE difference line
    correlationScatter: { top: 10, right: 30, bottom: 50, left: 70 }, // Scatter plot
  },
  dotRadius: 3.5, // Default radius for SMA dots (if shown)
  dotHoverRadius: 5.5, // Radius on hover
  rawDotRadius: 3, // Radius for raw data points
  highlightRadiusMultiplier: 1.8, // Multiplier for highlighted dot radius
  annotationMarkerRadius: 4, // Radius for annotation markers
  yAxisPaddingFactor: 0.02, // Percentage padding for Y-axis domain (applied top and bottom)
  yAxisMinPaddingKg: 0.1, // Minimum absolute padding (kg) for Y-axis domain
  domainBufferDays: 7, // Days added to each side of view for dynamic Y-axis calculation

  // --- Interaction & Timing ---
  debounceResizeMs: 350, // Delay (ms) for debouncing window resize events
  transitionDurationMs: 300, // Default D3 transition duration (ms)
  initialViewMonths: 3, // Default number of months shown on initial load
  statusMessageDurationMs: 3000, // How long status messages stay visible (ms)
  tooltipDelayMs: 100, // Delay before tooltip appears (ms)

  // --- Goal Guidance & Lean Gain ---
  // Define the "optimal" range for lean gaining (kg/week)
  MIN_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.1,
  MAX_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.35,

  // --- Fallback Colors (Used if CSS variables fail/are missing) ---
  fallbackColors: {
    sma: "#3498db", // Blue
    ema: "#e67e22", // Orange (Added)
    band: "rgba(52,152,219,0.08)", // Light blue area
    rawDot: "#bdc3c7", // Grey
    dot: "#3498db", // Blue (Same as SMA line)
    trend1: "#2ecc71", // Green
    trend2: "#e74c3c", // Red
    regression: "#f39c12", // Yellow/Orange
    goal: "#9b59b6", // Purple
    outlier: "#e74c3c", // Red
    deficit: "#2ecc71", // Green (Used for negative balance)
    surplus: "#e74c3c", // Red (Used for positive balance)
    rateLineColor: "#8e44ad", // Darker Purple
    rateMALine: "#ff7f0e", // Darker Orange (Added)
    tdeeDiffLineColor: "#1abc9c", // Turquoise
    annotationMarker: "#e67e22", // Orange
    annotationRange: "rgba(230, 126, 34, 0.1)", // Light orange area
    plateauColor: "rgba(127, 140, 141, 0.15)", // Grey area
    trendChangeColor: "#e74c3c", // Red
    highlightStroke: "#f1c40f", // Bright Yellow
    scatterDotColor: "#34495e", // Dark Blue/Grey
    secondAxisColor: "#27ae60", // Green (If a second Y-axis were used)
    optimalGainZone: "hsla(120, 60%, 50%, 0.1)", // Light green area
  },
});

// Log loading for confirmation
console.log("Config module loaded.");
