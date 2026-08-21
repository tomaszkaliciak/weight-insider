import { StateManager } from "../core/stateManager.js";
import * as Selectors from "../core/selectors.js";
import { Utils } from "../core/utils.js";
import { buildFilmstripCaption } from "../core/filmstripCaption.js";
import { lastWeighInDate, staleWeighInStatus } from "../core/staleWeighIn.js";
import { startOfDay } from "../core/timelineNav.js";
import { DayInspector } from "./dayInspector.js";

let _caption;
let _logBtn;

function processedDays() {
  return (Selectors.selectProcessedData(StateManager.getState()) || [])
    .filter((d) => d.date instanceof Date && !isNaN(d.date))
    .sort((a, b) => a.date - b.date);
}

function findDay(date) {
  const t = startOfDay(date)?.getTime();
  if (t == null) return null;
  return processedDays().find((d) => startOfDay(d.date)?.getTime() === t) || null;
}

function syncCaption() {
  if (!_caption) return;
  const state = StateManager.getState();
  const highlighted = Selectors.selectHighlightedDate(state);
  if (!highlighted) {
    _caption.hidden = true;
    _caption.textContent = "";
    return;
  }
  const days = processedDays();
  const day = findDay(highlighted);
  const idx = days.findIndex((d) => startOfDay(d.date)?.getTime() === startOfDay(highlighted)?.getTime());
  const prev = idx > 0 ? days[idx - 1] : null;
  const text = buildFilmstripCaption({
    day: day || { date: highlighted, _skeleton: true },
    prev,
    formatDate: (d) => Utils.formatDateShort(d),
  });
  _caption.textContent = text;
  _caption.hidden = !text;
}

function syncLogToday() {
  if (!_logBtn) return;
  const last = lastWeighInDate(Selectors.selectProcessedData(StateManager.getState()));
  const status = staleWeighInStatus(last, new Date());
  _logBtn.hidden = !status.stale;
  if (status.stale) {
    _logBtn.textContent = status.label;
    _logBtn.title = status.label;
  }
}

function sync() {
  syncCaption();
  syncLogToday();
}

export const ChartChrome = {
  init() {
    _caption = document.getElementById("chart-filmstrip-caption");
    _logBtn = document.getElementById("chart-log-today");
    _logBtn?.addEventListener("click", () => DayInspector.openToday());
    StateManager.subscribeToSpecificEvent("state:highlightedDateChanged", sync);
    StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", sync);
    StateManager.subscribeToSpecificEvent("state:initializationComplete", sync);
    StateManager.subscribeToSpecificEvent("state:settingsChanged", sync);
    sync();
  },
};
