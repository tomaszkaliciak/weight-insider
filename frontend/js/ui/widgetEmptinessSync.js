import { StateManager } from "../core/stateManager.js";
import { emptyWidgetIds } from "../core/widgetEmptiness.js";
import { WidgetVisibility } from "./widgetVisibility.js";

function apply() {
  WidgetVisibility.setDataHidden(emptyWidgetIds(StateManager.getState()));
}

export const WidgetEmptiness = {
  init() {
    StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", apply);
    StateManager.subscribeToSpecificEvent("state:filteredDataChanged", apply);
    StateManager.subscribeToSpecificEvent("state:initializationComplete", apply);
    StateManager.subscribeToSpecificEvent("state:periodizationPhasesChanged", apply);
  },
};
