// js/core/stateManager.js

import { Utils } from "./utils.js";
// Selectors are used by consumers, not needed here.

// Define the initial structure and default values of the state
const initialState = {
  isInitialized: false,
  // --- Primary State ---
  rawData: [],
  goal: { weight: null, date: null, targetRate: null },
  annotations: [],
  analysisRange: { start: null, end: null },
  interactiveRegressionRange: { start: null, end: null },
  currentTheme: "light",
  seriesVisibility: {
    /* ... keep all keys ... */ raw: true,
    smaLine: true,
    emaLine: true,
    smaBand: true,
    regression: true,
    trend1: true,
    trend2: true,
    goal: true,
    annotations: true,
    plateaus: true,
    trendChanges: true,
    rateMA: true,
  },
  trendConfig: {
    startDate: null,
    initialWeight: null,
    weeklyIncrease1: null,
    weeklyIncrease2: null,
    isValid: false,
  },
  highlightedDate: null,
  pinnedTooltipData: null,
  activeHoverData: null,
  lastZoomTransform: null,
  statusTimeoutId: null,
  tooltipTimeoutId: null,
  sortColumnKey: "weekStartDate",
  sortDirection: "asc",
  settings: { smaWindow: null, rollingVolatilityWindow: null },

  // --- Derived State ---
  processedData: [],
  filteredData: [],
  weeklySummaryData: [],
  correlationScatterData: [],
  plateaus: [],
  trendChangePoints: [],
  goalAchievedDate: null,
  regressionResult: { slope: null, intercept: null, points: [] },
  displayStats: {}, // Display stats are now part of the state
};

// Use a deep clone for the initial state
let state = Utils.deepClone(initialState);

// --- Internal Subscriber Storage ---
const generalSubscribers = new Set(); // Use Set for easier add/remove
const specificSubscribers = {}; // { eventName: Set<callback> }

// --- Reducer Logic ---
function reducer(currentState, action) {
  console.log("[StateManager] Reducing action:", action.type, action.payload);
  const nextState = Utils.deepClone(currentState); // Clone before modifying

  switch (action.type) {
    case "INITIALIZE_START":
      nextState.isInitialized = false;
      nextState.rawData = [];
      nextState.processedData = [];
      nextState.filteredData = [];
      nextState.weeklySummaryData = [];
      nextState.correlationScatterData = [];
      nextState.plateaus = [];
      nextState.trendChangePoints = [];
      nextState.goalAchievedDate = null;
      nextState.regressionResult = { slope: null, intercept: null, points: [] };
      nextState.analysisRange = { start: null, end: null };
      nextState.interactiveRegressionRange = { start: null, end: null };
      nextState.displayStats = {}; // Reset display stats too
      break;
    case "SET_INITIAL_DATA":
      nextState.rawData = action.payload.rawData || [];
      nextState.processedData = action.payload.processedData || [];
      break;
    case "SET_PROCESSED_DATA":
      nextState.processedData = action.payload || [];
      break;
    case "SET_FILTERED_DATA":
      nextState.filteredData = action.payload || [];
      break;
    case "SET_WEEKLY_SUMMARY":
      nextState.weeklySummaryData = action.payload || [];
      break;
    case "SET_CORRELATION_DATA":
      nextState.correlationScatterData = action.payload || [];
      break;
    case "SET_REGRESSION_RESULT":
      nextState.regressionResult = {
        slope: action.payload?.slope ?? null,
        intercept: action.payload?.intercept ?? null,
        points: Array.isArray(action.payload?.points)
          ? action.payload.points
          : [],
      };
      break;
    case "LOAD_GOAL":
      nextState.goal = { ...nextState.goal, ...(action.payload || {}) };
      if (nextState.goal.date && !(nextState.goal.date instanceof Date)) {
        const parsedDate = new Date(nextState.goal.date);
        nextState.goal.date = !isNaN(parsedDate) ? parsedDate : null;
      }
      break;
    case "LOAD_ANNOTATIONS":
      nextState.annotations = action.payload || [];
      break;
    case "ADD_ANNOTATION":
      nextState.annotations = [...nextState.annotations, action.payload];
      break;
    case "DELETE_ANNOTATION":
      nextState.annotations = nextState.annotations.filter(
        (a) => a.id !== action.payload.id,
      );
      break;
    case "SET_PLATEAUS":
      nextState.plateaus = action.payload || [];
      break;
    case "SET_TREND_CHANGES":
      nextState.trendChangePoints = action.payload || [];
      break;
    case "SET_GOAL_ACHIEVED_DATE":
      nextState.goalAchievedDate =
        action.payload instanceof Date || action.payload === null
          ? action.payload
          : null;
      break;
    case "SET_ANALYSIS_RANGE":
      nextState.analysisRange = {
        ...nextState.analysisRange,
        ...(action.payload || {}),
      };
      if (
        nextState.analysisRange.start &&
        !(nextState.analysisRange.start instanceof Date)
      ) {
        const parsedDate = new Date(nextState.analysisRange.start);
        nextState.analysisRange.start = !isNaN(parsedDate) ? parsedDate : null;
      }
      if (
        nextState.analysisRange.end &&
        !(nextState.analysisRange.end instanceof Date)
      ) {
        const parsedDate = new Date(nextState.analysisRange.end);
        nextState.analysisRange.end = !isNaN(parsedDate) ? parsedDate : null;
      }
      break;
    case "SET_INTERACTIVE_REGRESSION_RANGE":
      nextState.interactiveRegressionRange = {
        ...nextState.interactiveRegressionRange,
        ...(action.payload || {}),
      };
      if (
        nextState.interactiveRegressionRange.start &&
        !(nextState.interactiveRegressionRange.start instanceof Date)
      ) {
        const parsedDate = new Date(nextState.interactiveRegressionRange.start);
        nextState.interactiveRegressionRange.start = !isNaN(parsedDate)
          ? parsedDate
          : null;
      }
      if (
        nextState.interactiveRegressionRange.end &&
        !(nextState.interactiveRegressionRange.end instanceof Date)
      ) {
        const parsedDate = new Date(nextState.interactiveRegressionRange.end);
        nextState.interactiveRegressionRange.end = !isNaN(parsedDate)
          ? parsedDate
          : null;
      }
      break;
    case "SET_THEME":
      nextState.currentTheme = action.payload;
      break;
    case "TOGGLE_SERIES_VISIBILITY":
      if (nextState.seriesVisibility.hasOwnProperty(action.payload.seriesId)) {
        nextState.seriesVisibility[action.payload.seriesId] =
          !!action.payload.isVisible;
      }
      break;
    case "SET_HIGHLIGHTED_DATE":
      nextState.highlightedDate =
        action.payload instanceof Date || action.payload === null
          ? action.payload
          : null;
      break;
    case "SET_PINNED_TOOLTIP":
      nextState.pinnedTooltipData = action.payload;
      break;
    case "SET_ACTIVE_HOVER_DATA":
      nextState.activeHoverData = action.payload;
      break;
    case "SET_LAST_ZOOM_TRANSFORM":
      if (
        action.payload &&
        typeof action.payload.k === "number" &&
        typeof action.payload.x === "number" &&
        typeof action.payload.y === "number"
      ) {
        nextState.lastZoomTransform = {
          k: action.payload.k,
          x: action.payload.x,
          y: action.payload.y,
        };
      } else {
        nextState.lastZoomTransform = null;
      }
      break;
    case "SET_STATUS_TIMEOUT_ID":
      if (nextState.statusTimeoutId) clearTimeout(nextState.statusTimeoutId);
      nextState.statusTimeoutId = action.payload;
      break;
    case "SET_TOOLTIP_TIMEOUT_ID":
      if (nextState.tooltipTimeoutId) clearTimeout(nextState.tooltipTimeoutId);
      nextState.tooltipTimeoutId = action.payload;
      break;
    case "SET_SORT_OPTIONS":
      nextState.sortColumnKey =
        action.payload.columnKey ?? nextState.sortColumnKey;
      nextState.sortDirection =
        action.payload.direction ?? nextState.sortDirection;
      break;
    case "LOAD_SETTINGS":
      nextState.settings = { ...nextState.settings, ...(action.payload || {}) };
      break;
    case "UPDATE_TREND_CONFIG":
      const { startDate, initialWeight, weeklyIncrease1, weeklyIncrease2 } =
        action.payload || {};
      const parsedStartDate =
        startDate instanceof Date && !isNaN(startDate.getTime())
          ? startDate
          : null;
      const parsedInitialWeight =
        initialWeight != null && isFinite(initialWeight)
          ? parseFloat(initialWeight)
          : null;
      const parsedWeeklyIncrease1 =
        weeklyIncrease1 != null && isFinite(weeklyIncrease1)
          ? parseFloat(weeklyIncrease1)
          : null;
      const parsedWeeklyIncrease2 =
        weeklyIncrease2 != null && isFinite(weeklyIncrease2)
          ? parseFloat(weeklyIncrease2)
          : null;
      const isValid =
        parsedStartDate &&
        parsedInitialWeight !== null &&
        parsedWeeklyIncrease1 !== null &&
        parsedWeeklyIncrease2 !== null;
      nextState.trendConfig = {
        startDate: parsedStartDate,
        initialWeight: parsedInitialWeight,
        weeklyIncrease1: parsedWeeklyIncrease1,
        weeklyIncrease2: parsedWeeklyIncrease2,
        isValid: isValid,
      };
      break;
    case "SET_DISPLAY_STATS": // Store display stats
      nextState.displayStats =
        typeof action.payload === "object" && action.payload !== null
          ? action.payload
          : {};
      break;
    case "INITIALIZATION_COMPLETE":
      nextState.isInitialized = true;
      break;
    case "INITIALIZATION_FAILED":
      nextState.isInitialized = false;
      break;
    default:
      console.warn(`[StateManager] Unknown action type: ${action.type}`);
      return currentState;
  }

  console.log("[StateManager] State updated.");
  return nextState;
}

// --- Internal Notification Helpers ---
function _notifyGeneralSubscribers(newState, previousState, action) {
  // console.log("[StateManager] Notifying general subscribers..."); // Can be noisy
  generalSubscribers.forEach((listener) => {
    try {
      listener({ newState, previousState, action });
    } catch (error) {
      console.error("[StateManager] Error in general subscriber:", error, {
        listener,
      });
    }
  });
}

function _notifySpecificSubscribers(eventName, payload) {
  if (specificSubscribers[eventName]) {
    // console.log(`[StateManager] Notifying specific subscribers for: ${eventName}`); // Can be noisy
    specificSubscribers[eventName].forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          `[StateManager] Error in specific subscriber for ${eventName}:`,
          error,
          { listener },
        );
      }
    });
  }
}

// --- Exported StateManager Object ---
export const StateManager = {
  /**
   * Returns a deep clone of the current state.
   * @returns {object} A copy of the current application state.
   */
  getState() {
    return Utils.deepClone(state);
  },

  /**
   * Dispatches an action to update the state and notifies subscribers.
   * @param {object} action - The action object { type: string, payload?: any }.
   */
  dispatch(action) {
    if (!action || typeof action.type !== "string") {
      console.error("[StateManager] Invalid action dispatched:", action);
      return;
    }
    const previousState = Utils.deepClone(state); // Clone for comparison
    state = reducer(state, action); // Update internal state
    const newStateForEvent = Utils.deepClone(state); // Clone *new* state for events

    // --- Notify Subscribers Directly ---
    _notifyGeneralSubscribers(newStateForEvent, previousState, action);

    // Map actions to specific event names
    const specificEventsMap = {
      LOAD_ANNOTATIONS: "state:annotationsChanged",
      ADD_ANNOTATION: "state:annotationsChanged",
      DELETE_ANNOTATION: "state:annotationsChanged",
      TOGGLE_SERIES_VISIBILITY: "state:visibilityChanged",
      LOAD_GOAL: "state:goalChanged",
      SET_GOAL_ACHIEVED_DATE: "state:goalChanged",
      SET_THEME: "state:themeUpdated",
      SET_ANALYSIS_RANGE: "state:analysisRangeChanged",
      SET_INTERACTIVE_REGRESSION_RANGE:
        "state:interactiveRegressionRangeChanged",
      SET_FILTERED_DATA: "state:filteredDataChanged",
      SET_WEEKLY_SUMMARY: "state:weeklySummaryUpdated",
      SET_CORRELATION_DATA: "state:correlationDataUpdated",
      SET_PLATEAUS: "state:plateausChanged",
      SET_TREND_CHANGES: "state:trendChangesChanged",
      SET_REGRESSION_RESULT: "state:regressionResultChanged",
      UPDATE_TREND_CONFIG: "state:trendConfigChanged",
      SET_SORT_OPTIONS: "state:sortOptionsChanged",
      SET_DISPLAY_STATS: "state:displayStatsUpdated", // Now signals stats update
      INITIALIZATION_COMPLETE: "state:initializationComplete",
      SET_HIGHLIGHTED_DATE: "state:highlightedDateChanged",
      SET_PINNED_TOOLTIP: "state:pinnedTooltipDataChanged",
      SET_ACTIVE_HOVER_DATA: "state:activeHoverDataChanged",
      // Add other specific events if needed
    };

    const eventName = specificEventsMap[action.type];
    if (eventName) {
      // Determine the payload based on the event
      let eventPayload;
      switch (action.type) {
        case "LOAD_ANNOTATIONS":
        case "ADD_ANNOTATION":
        case "DELETE_ANNOTATION":
          eventPayload = { annotations: newStateForEvent.annotations };
          break;
        case "TOGGLE_SERIES_VISIBILITY":
          eventPayload = { visibility: newStateForEvent.seriesVisibility };
          break;
        case "LOAD_GOAL":
        case "SET_GOAL_ACHIEVED_DATE":
          eventPayload = {
            goal: newStateForEvent.goal,
            achievedDate: newStateForEvent.goalAchievedDate,
          };
          break;
        case "SET_THEME":
          eventPayload = { theme: newStateForEvent.currentTheme };
          break;
        case "SET_ANALYSIS_RANGE":
          eventPayload = { range: newStateForEvent.analysisRange };
          break;
        case "SET_INTERACTIVE_REGRESSION_RANGE":
          eventPayload = { range: newStateForEvent.interactiveRegressionRange };
          break;
        case "SET_FILTERED_DATA":
          eventPayload = { data: newStateForEvent.filteredData };
          break;
        case "SET_WEEKLY_SUMMARY":
          eventPayload = { data: newStateForEvent.weeklySummaryData };
          break;
        case "SET_CORRELATION_DATA":
          eventPayload = { data: newStateForEvent.correlationScatterData };
          break;
        case "SET_PLATEAUS":
          eventPayload = { plateaus: newStateForEvent.plateaus };
          break;
        case "SET_TREND_CHANGES":
          eventPayload = {
            trendChangePoints: newStateForEvent.trendChangePoints,
          };
          break;
        case "SET_REGRESSION_RESULT":
          eventPayload = { result: newStateForEvent.regressionResult };
          break;
        case "UPDATE_TREND_CONFIG":
          eventPayload = { config: newStateForEvent.trendConfig };
          break;
        case "SET_SORT_OPTIONS":
          eventPayload = {
            columnKey: newStateForEvent.sortColumnKey,
            direction: newStateForEvent.sortDirection,
          };
          break;
        case "SET_DISPLAY_STATS":
          eventPayload = newStateForEvent.displayStats;
          break; // Pass the stats object
        case "INITIALIZATION_COMPLETE":
          eventPayload = {};
          break; // No specific payload needed
        case "SET_HIGHLIGHTED_DATE":
          eventPayload = { date: newStateForEvent.highlightedDate };
          break;
        case "SET_PINNED_TOOLTIP":
          eventPayload = { data: newStateForEvent.pinnedTooltipData };
          break;
        case "SET_ACTIVE_HOVER_DATA":
          eventPayload = { data: newStateForEvent.activeHoverData };
          break;
        default:
          // Fallback for events not explicitly listed above
          console.warn(
            `[StateManager] Missing specific event payload definition for ${action.type} in dispatch.`,
          );
          eventPayload = { newState: newStateForEvent }; // Default to sending new state
      }
      _notifySpecificSubscribers(eventName, eventPayload);
    }
  },

  /**
   * Subscribes a listener function to the general 'stateChanged' event.
   * @param {function} listener - The callback function ({ newState, previousState, action }).
   * @returns {function} An unsubscribe function.
   */
  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    generalSubscribers.add(listener);
    // Return an unsubscribe function
    return () => {
      generalSubscribers.delete(listener);
      console.log(`[StateManager] General subscriber unsubscribed.`);
    };
  },

  /**
   * Subscribes a listener function to specific state change events.
   * @param {string} eventName - The specific event name (e.g., 'state:annotationsChanged').
   * @param {function} listener - The callback function (receives event-specific payload).
   * @returns {function} An unsubscribe function.
   */
  subscribeToSpecificEvent(eventName, listener) {
    if (typeof listener !== "function") return () => {};
    if (!specificSubscribers[eventName]) {
      specificSubscribers[eventName] = new Set();
    }
    specificSubscribers[eventName].add(listener);
    console.log(`[StateManager] Specific subscriber added for: ${eventName}`);
    // Return an unsubscribe function
    return () => {
      if (specificSubscribers[eventName]) {
        specificSubscribers[eventName].delete(listener);
        console.log(
          `[StateManager] Specific subscriber unsubscribed from: ${eventName}`,
        );
      }
    };
  },
};

// Optional: Log initial state setup
console.log("[StateManager] Initialized (using internal eventing).");
