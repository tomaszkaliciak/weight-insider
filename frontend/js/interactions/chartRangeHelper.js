// js/interactions/chartRangeHelper.js
// Shared helper for cross-widget chart range navigation.

import { StateManager, ActionTypes } from '../core/stateManager.js';
import { scales } from '../ui/chartSetup.js';
import { ChartInteractions } from './chartInteractions.js';
import { ui } from '../ui/uiCache.js';
import { Utils } from '../core/utils.js';

function syncRangeInputs(start, end) {
  const startNode = ui.analysisStartDateInput?.node?.();
  const endNode = ui.analysisEndDateInput?.node?.();
  const startStr = startNode?.type === "date"
    ? Utils.formatDate(start)
    : Utils.formatDateDMY(start);
  const endStr = endNode?.type === "date"
    ? Utils.formatDate(end)
    : Utils.formatDateDMY(end);
  if (ui.analysisStartDateInput) ui.analysisStartDateInput.property("value", startStr);
  if (ui.analysisEndDateInput) ui.analysisEndDateInput.property("value", endStr);
}

function applyDomain(start, end, { clearHighlight = true } = {}) {
  StateManager.dispatch({
    type: ActionTypes.SET_ANALYSIS_RANGE,
    payload: { start, end },
  });
  StateManager.dispatch({ type: ActionTypes.SET_PINNED_TOOLTIP, payload: null });
  if (clearHighlight) {
    StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: null });
  }

  if (scales.x) scales.x.domain([start, end]);
  ChartInteractions.syncBrushAndZoomToFocus();
  syncRangeInputs(start, end);
}

/**
 * Navigate the main chart to the given date range.
 */
export function setAnalysisRangeAndSyncChart(rawStart, rawEnd) {
  if (!(rawStart instanceof Date) || !(rawEnd instanceof Date)) return;
  if (isNaN(rawStart) || isNaN(rawEnd) || rawStart > rawEnd) return;

  const start = new Date(new Date(rawStart).setHours(0, 0, 0, 0));
  const end   = new Date(new Date(rawEnd).setHours(23, 59, 59, 999));
  applyDomain(start, end, { clearHighlight: true });
}

/**
 * Shift the current window so `date` is inside it. Keeps duration. Does not clear highlight.
 */
export function panRangeToInclude(date) {
  if (!(date instanceof Date) || isNaN(date) || !scales.x) return;
  const domain = scales.x.domain();
  if (!Array.isArray(domain) || domain.length < 2) return;
  const [d0, d1] = domain;
  const t = date.getTime();
  if (t >= d0.getTime() && t <= d1.getTime()) return;

  const duration = d1.getTime() - d0.getTime();
  if (!(duration > 0)) return;

  let start;
  let end;
  if (t < d0.getTime()) {
    start = new Date(date);
    start.setHours(0, 0, 0, 0);
    end = new Date(start.getTime() + duration);
  } else {
    end = new Date(date);
    end.setHours(23, 59, 59, 999);
    start = new Date(end.getTime() - duration);
  }
  applyDomain(start, end, { clearHighlight: false });
}
