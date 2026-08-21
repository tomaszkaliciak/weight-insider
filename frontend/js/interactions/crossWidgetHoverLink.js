// js/interactions/crossWidgetHoverLink.js
// Links hover/focus in secondary widgets to the main chart highlight marker.

import { StateManager, ActionTypes } from "../core/stateManager.js";
import * as Selectors from "../core/selectors.js";

function normalizeDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resolveLinkedDate(rawDate, { snapToLogged = true, maxDistanceDays = 45 } = {}) {
  const normalized = normalizeDate(rawDate);
  if (!normalized) return null;
  if (!snapToLogged) return normalized;

  const processedData = Selectors.selectProcessedData(StateManager.getState()) || [];
  const candidates = processedData.filter(
    (d) => d?.value != null && d.date instanceof Date && !isNaN(d.date.getTime()),
  );
  if (!candidates.length) return normalized;

  let closest = null;
  let minDiff = Infinity;
  candidates.forEach((point) => {
    const pointDate = normalizeDate(point.date);
    const diff = Math.abs(pointDate.getTime() - normalized.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = pointDate;
    }
  });

  return minDiff <= maxDistanceDays * 86400000 ? closest : normalized;
}

export function setCrossWidgetHighlightedDate(rawDate, options = {}) {
  const resolved = resolveLinkedDate(rawDate, options);
  if (!resolved) return null;
  StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: resolved });
  return resolved;
}

export function clearCrossWidgetHighlightedDate(expectedDate = null) {
  const current = Selectors.selectHighlightedDate(StateManager.getState());
  if (!current) return;
  if (!expectedDate) {
    StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: null });
    return;
  }
  const normalizedExpected = normalizeDate(expectedDate);
  if (
    normalizedExpected &&
    current.getTime() === normalizedExpected.getTime()
  ) {
    StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: null });
  }
}

export function bindCrossWidgetHoverDate(element, getDate, options = {}) {
  if (!element || typeof getDate !== "function") return;
  const activate = () => {
    const date = getDate(element);
    element.__linkedHighlightDate = setCrossWidgetHighlightedDate(date, options);
  };
  const deactivate = () => {
    clearCrossWidgetHighlightedDate(element.__linkedHighlightDate || null);
    element.__linkedHighlightDate = null;
  };
  element.addEventListener("mouseenter", activate);
  element.addEventListener("focus", activate);
  element.addEventListener("mouseleave", deactivate);
  element.addEventListener("blur", deactivate);
}
