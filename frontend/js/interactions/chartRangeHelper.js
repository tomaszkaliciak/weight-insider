// js/interactions/chartRangeHelper.js
// Shared helper for cross-widget chart range navigation.
// Dispatches SET_ANALYSIS_RANGE, updates the chart scales, syncs the brush,
// and reflects the new range in the Analysis Range date inputs.

import { StateManager, ActionTypes } from '../core/stateManager.js';
import { scales } from '../ui/chartSetup.js';
import { ChartInteractions } from './chartInteractions.js';
import { ui } from '../ui/uiCache.js';

/**
 * Navigate the main chart to the given date range.
 * Mirrors the logic in formHandlers.js debouncedRangeInputChange.
 *
 * @param {Date} rawStart  - Start of the range (will be clamped to start-of-day)
 * @param {Date} rawEnd    - End of the range (will be clamped to end-of-day)
 */
export function setAnalysisRangeAndSyncChart(rawStart, rawEnd) {
  if (!(rawStart instanceof Date) || !(rawEnd instanceof Date)) return;
  if (isNaN(rawStart) || isNaN(rawEnd) || rawStart > rawEnd) return;

  const start = new Date(new Date(rawStart).setHours(0, 0, 0, 0));
  const end   = new Date(new Date(rawEnd).setHours(23, 59, 59, 999));

  StateManager.dispatch({
    type: ActionTypes.SET_ANALYSIS_RANGE,
    payload: { start, end },
  });
  StateManager.dispatch({ type: ActionTypes.SET_PINNED_TOOLTIP, payload: null });
  StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: null });

  if (scales.x) scales.x.domain([start, end]);
  ChartInteractions.syncBrushAndZoomToFocus();

  // Reflect in the Analysis Range input fields (YYYY-MM-DD format for <input type="date">)
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  if (ui.analysisStartDateInput) ui.analysisStartDateInput.property('value', fmt(start));
  if (ui.analysisEndDateInput)   ui.analysisEndDateInput.property('value', fmt(end));
}
