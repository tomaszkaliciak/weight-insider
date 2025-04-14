// js/core/goalManager.js
// Handles loading and saving goal settings to localStorage and dispatching state updates.

import { StateManager } from "./stateManager.js";
// uiCache import removed - no direct UI updates
import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";
import * as Selectors from "./selectors.js"; // Import selectors

export const GoalManager = {
  /**
   * Loads the goal from localStorage and dispatches an action to update the state.
   */
  load() {
    const storedGoal = localStorage.getItem(CONFIG.localStorageKeys.goal);
    let loadedGoalData = { weight: null, date: null, targetRate: null }; // Default structure

    if (storedGoal) {
      try {
        const parsed = JSON.parse(storedGoal);
        // Validate and parse data carefully
        const weight = parsed.weight ? parseFloat(parsed.weight) : null;
        // Ensure date string is handled correctly (YYYY-MM-DD expected from save)
        const date = (parsed.date && typeof parsed.date === 'string') ? new Date(parsed.date + 'T00:00:00') : null; // Parse as local midnight
        const targetRate = parsed.targetRate ? parseFloat(parsed.targetRate) : null;

        loadedGoalData.weight = (weight != null && !isNaN(weight)) ? weight : null;
        loadedGoalData.date = (date instanceof Date && !isNaN(date.getTime())) ? date : null;
        loadedGoalData.targetRate = (targetRate != null && !isNaN(targetRate)) ? targetRate : null;

      } catch (e) {
        console.error("GoalManager: Error parsing goal from localStorage", e);
        localStorage.removeItem(CONFIG.localStorageKeys.goal); // Clear invalid data
        // loadedGoalData remains default
      }
    }
    // Dispatch action to update state with the loaded or default goal
    StateManager.dispatch({ type: 'LOAD_GOAL', payload: loadedGoalData });
    console.log("GoalManager: Dispatched LOAD_GOAL action with payload:", loadedGoalData);
    // UI updates are handled by components subscribing to state:goalChanged or state:displayStatsUpdated
  },

  /**
   * Saves the current goal state to localStorage.
   * Should be called after the state has been updated (e.g., after form submit dispatches).
   */
  save() {
    try {
      // Read the current goal directly from the state using a selector
      const currentGoal = Selectors.selectGoal(StateManager.getState());

      // Prepare object for storage, ensuring date is formatted correctly
      const goalToStore = {
        weight: currentGoal.weight,
        // Format Date object to YYYY-MM-DD string or null
        date: (currentGoal.date instanceof Date && !isNaN(currentGoal.date))
                ? currentGoal.date.toISOString().slice(0, 10)
                : null,
        targetRate: currentGoal.targetRate,
      };

      localStorage.setItem(
        CONFIG.localStorageKeys.goal,
        JSON.stringify(goalToStore),
      );
      console.log("GoalManager: Goal saved to localStorage:", goalToStore);
      // Utils.showStatusMessage("Goal saved successfully.", "success"); // Status message could be shown by the component triggering the save
    } catch (e) {
      console.error("GoalManager: Error saving goal to localStorage", e);
      Utils.showStatusMessage("Could not save goal due to storage error.", "error");
    }
  },

  // Removed updateGoalUI - This is now handled by StatsDisplayRenderer and potentially a form renderer
  // reacting to state changes.

  /**
   * Initializes the GoalManager by loading any saved goal.
   * Typically called during application startup.
   */
   init() {
       this.load();
       // Optional: Subscribe to state:goalChanged to automatically save?
       // StateManager.subscribeToSpecificEvent('state:goalChanged', () => {
       //     console.log("[GoalManager] Detected goal state change, auto-saving...");
       //     this.save();
       // });
       console.log("[GoalManager Init] Initialized and loaded goal.");
   }
};