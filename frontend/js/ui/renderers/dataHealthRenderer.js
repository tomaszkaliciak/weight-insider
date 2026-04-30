// js/ui/renderers/dataHealthRenderer.js
// Scannable data-quality card so users know why some widgets show
// "insufficient data" or why their stats look off.

import { StateManager } from "../../core/stateManager.js";
import * as Selectors from "../../core/selectors.js";

const DAY_MS = 86400000;
const WINDOW_DAYS = 30;
const MACRO_WINDOW_DAYS = 14;

function _startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _daysBetween(a, b) {
  return Math.round((_startOfDay(a) - _startOfDay(b)) / DAY_MS);
}

function _missingWeighIns(processed, today) {
  const windowStart = today.getTime() - (WINDOW_DAYS - 1) * DAY_MS;
  const windowDays = processed.filter(
    (d) => d.date instanceof Date && d.date.getTime() >= windowStart,
  );
  const total = WINDOW_DAYS;
  const logged = windowDays.filter((d) => d.value != null).length;
  return { logged, missing: Math.max(0, total - logged), total };
}

function _missingCalories(processed, today) {
  const windowStart = today.getTime() - (WINDOW_DAYS - 1) * DAY_MS;
  const windowDays = processed.filter(
    (d) => d.date instanceof Date && d.date.getTime() >= windowStart,
  );
  const logged = windowDays.filter((d) => d.calorieIntake != null).length;
  return { logged, missing: Math.max(0, WINDOW_DAYS - logged), total: WINDOW_DAYS };
}

function _outliers(processed) {
  const windowStart = Date.now() - (WINDOW_DAYS - 1) * DAY_MS;
  return processed.filter(
    (d) => d.isOutlier && d.date instanceof Date && d.date.getTime() >= windowStart,
  ).length;
}

function _macroCompleteness(processed) {
  const windowStart = Date.now() - (MACRO_WINDOW_DAYS - 1) * DAY_MS;
  const window = processed.filter(
    (d) => d.date instanceof Date && d.date.getTime() >= windowStart,
  );
  const complete = window.filter(
    (d) => d.protein != null && d.carbs != null && d.fat != null,
  ).length;
  return { complete, total: MACRO_WINDOW_DAYS };
}

function _calorieSpikes(processed) {
  const windowStart = Date.now() - (WINDOW_DAYS - 1) * DAY_MS;
  const days = processed
    .filter(
      (d) =>
        d.date instanceof Date &&
        d.date.getTime() >= windowStart &&
        d.calorieIntake != null,
    )
    .map((d) => d.calorieIntake);
  if (days.length < 7) return 0;
  const mean = days.reduce((a, b) => a + b, 0) / days.length;
  const variance =
    days.reduce((sum, x) => sum + (x - mean) ** 2, 0) / days.length;
  const sd = Math.sqrt(variance);
  if (sd <= 0) return 0;
  return days.filter((x) => Math.abs(x - mean) / sd > 2).length;
}

function _staleness(processed) {
  const lastWithValue = [...processed]
    .reverse()
    .find((d) => d.value != null && d.date instanceof Date);
  if (!lastWithValue) return null;
  return _daysBetween(new Date(), lastWithValue.date);
}

function _row({ status, title, detail, action }) {
  const safeAction = action
    ? `<button type="button" class="health-action" data-action="${action.id}">${action.label}</button>`
    : "";
  return `
    <li class="health-row health-${status}">
      <span class="health-status" aria-hidden="true"></span>
      <div class="health-text">
        <div class="health-title">${title}</div>
        <div class="health-detail">${detail}</div>
      </div>
      ${safeAction}
    </li>
  `;
}

function _buildChecks(state) {
  const processed = Selectors.selectProcessedData(state) || [];
  if (!processed.length) {
    return [
      _row({
        status: "warn",
        title: "Waiting for data",
        detail: "No processed entries yet. Add a weight or calorie entry to begin.",
        action: { id: "add-entry", label: "Add entry" },
      }),
    ];
  }

  const today = new Date();
  const checks = [];

  const stale = _staleness(processed);
  if (stale == null) {
    checks.push(
      _row({
        status: "warn",
        title: "No weigh-ins",
        detail: "Add a recent weight to unlock charts and trend analytics.",
        action: { id: "add-entry", label: "Add today" },
      }),
    );
  } else if (stale > 3) {
    checks.push(
      _row({
        status: "warn",
        title: "Stale data",
        detail: `Last weigh-in was ${stale} days ago.`,
        action: { id: "add-entry", label: "Add today" },
      }),
    );
  } else {
    checks.push(
      _row({
        status: "good",
        title: "Recent weigh-in",
        detail: stale === 0 ? "Today is logged." : `Last weigh-in ${stale}d ago.`,
      }),
    );
  }

  const weighIns = _missingWeighIns(processed, today);
  checks.push(
    _row({
      status:
        weighIns.missing === 0 ? "good" : weighIns.missing <= 5 ? "warn" : "error",
      title: "Weight log coverage",
      detail: `${weighIns.logged} / ${weighIns.total} days in last ${WINDOW_DAYS} have weight data.`,
    }),
  );

  const calories = _missingCalories(processed, today);
  checks.push(
    _row({
      status:
        calories.missing === 0 ? "good" : calories.missing <= 7 ? "warn" : "error",
      title: "Calorie log coverage",
      detail: `${calories.logged} / ${calories.total} days have calorie entries.`,
    }),
  );

  const outliers = _outliers(processed);
  if (outliers > 0) {
    checks.push(
      _row({
        status: outliers > 2 ? "warn" : "good",
        title: "Weight outliers",
        detail: `${outliers} day(s) flagged as unusual in the last ${WINDOW_DAYS} days.`,
      }),
    );
  }

  const macros = _macroCompleteness(processed);
  if (macros.total > 0) {
    const ratio = macros.complete / macros.total;
    checks.push(
      _row({
        status: ratio >= 0.8 ? "good" : ratio >= 0.4 ? "warn" : "error",
        title: "Macro completeness (14d)",
        detail: `${macros.complete} / ${macros.total} days have protein/carbs/fat.`,
      }),
    );
  }

  const spikes = _calorieSpikes(processed);
  if (spikes > 0) {
    checks.push(
      _row({
        status: spikes > 2 ? "warn" : "good",
        title: "Calorie spikes",
        detail: `${spikes} day(s) more than ±2σ from the 30d average.`,
      }),
    );
  }

  return checks;
}

let _container = null;

function _render() {
  if (!_container) return;
  const state = StateManager.getState();
  const checks = _buildChecks(state);
  _container.innerHTML = `<ul class="health-list">${checks.join("")}</ul>`;
}

function _onClick(event) {
  const btn = event.target?.closest(".health-action");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "add-entry") {
    document
      .getElementById("manual-entry-widget")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => document.getElementById("me-weight")?.focus(), 250);
  }
}

export const DataHealthRenderer = {
  init() {
    _container = document.getElementById("data-health-content");
    if (!_container) return;
    _container.addEventListener("click", _onClick);
    StateManager.subscribeToSpecificEvent(
      "state:filteredDataChanged",
      _render,
    );
    StateManager.subscribeToSpecificEvent(
      "state:initializationComplete",
      _render,
    );
    _render();
  },
};
