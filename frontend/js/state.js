// --- START OF FILE state.js ---

// state.js

export const state = {
  isInitialized: false,
  rawData: [], // Raw data loaded from source
  processedData: [], // Data after calculations (SMA, rates, TDEE, etc.)
  weeklySummaryData: [], // Aggregated weekly stats
  correlationScatterData: [], // Data points for the scatter plot
  filteredData: [], // Data currently visible in focus chart (X domain)
  annotations: [], // User-added annotations
  plateaus: [], // Detected plateau periods {startDate, endDate}
  trendChangePoints: [], // Detected trend change points {date, magnitude}
  goal: { weight: null, date: null, targetRate: null }, // User goal settings
  goalAchievedDate: null, // <<< ADDED: Date goal was first met (based on SMA)
  analysisRange: { start: null, end: null }, // Currently analyzed date range
  interactiveRegressionRange: { start: null, end: null }, // Range selected by regression brush
  regressionStartDate: null, // Start date set via UI for regression calculation (if not using interactive brush)
  currentTheme: "light", // Current UI theme ('light' or 'dark')
  seriesVisibility: {
    // Visibility toggles for different chart series
    raw: true,
    smaLine: true,
    smaBand: true,
    regression: true,
    regressionCI: true,
    trend1: true,
    trend2: true,
    goal: true,
    annotations: true,
    plateaus: true,
    trendChanges: true,
    rateMA: true, // <<< ADDED: Visibility toggle for rate MA line
  },
  highlightedDate: null, // Date of the currently highlighted data point
  pinnedTooltipData: null, // Data for the pinned tooltip {id, data, pageX, pageY}
  activeHoverData: null, // Data point currently being hovered over
  lastZoomTransform: null, // Stores the last d3.zoom transform
  statusTimeoutId: null, // Timeout ID for the status message
  tooltipTimeoutId: null, // Timeout ID for showing/hiding tooltip
  sortColumnKey: "weekStartDate", // Default sort column
  sortDirection: "asc", // Default sort direction ('asc' or 'desc')
  settings: {
    smaWindow: null, // Will be populated by SettingsManager.loadSettings
    rollingVolatilityWindow: null, // Will be populated by SettingsManager.loadSettings
  },
};
// --- END OF FILE state.js ---
