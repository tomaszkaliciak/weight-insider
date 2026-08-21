// Slide-over inspector for a single chart day.

import { StateManager, ActionTypes } from "../core/stateManager.js";
import * as Selectors from "../core/selectors.js";
import { Utils } from "../core/utils.js";
import { UnitFormatter } from "../core/unitFormatter.js";
import { ManualEntryService } from "../core/manualEntryService.js";
import { AnnotationManager } from "../core/annotationManager.js";
import { DataService } from "../core/dataService.js";
import { SettingsPanel } from "./settingsPanel.js";
import { explainOutlier } from "../core/outlierExplainer.js";
import { neighborDay, skeletonDay, startOfDay } from "../core/timelineNav.js";
import { panRangeToInclude } from "../interactions/chartRangeHelper.js";
import { hasTdeeDisagreement, tdeeDisagreementKcal } from "../core/tdeeDisagreement.js";

let _drawer;
let _overlay;
let _body;
let _title;
let _currentDate = null;

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

function fmt(n, decimals = 0, fallback = "—") {
  if (n == null || !isFinite(n)) return fallback;
  return Utils.formatValue(n, decimals);
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function isDrawerOpen() {
  return Boolean(_drawer && !_drawer.hidden);
}

function highlightAndPan(date) {
  if (!(date instanceof Date) || isNaN(date)) return;
  StateManager.dispatch({ type: ActionTypes.SET_HIGHLIGHTED_DATE, payload: date });
  panRangeToInclude(date);
}

export function stepHighlightedDay(delta) {
  const days = processedDays();
  const current =
    _currentDate ||
    Selectors.selectHighlightedDate(StateManager.getState()) ||
    days[days.length - 1]?.date;
  if (!current) return null;
  const next = neighborDay(days, current, delta);
  if (!next) return null;
  _currentDate = next.date;
  highlightAndPan(next.date);
  if (isDrawerOpen()) render(next);
  return next;
}

function render(day) {
  if (!_body || !_title) return;
  if (!day) {
    _title.textContent = "No data";
    _body.innerHTML = `<p class="settings-hint">No processed day for this date.</p>`;
    return;
  }

  _currentDate = day.date;
  _title.textContent = Utils.formatDateLong(day.date);
  const dateStr = Utils.formatDate(day.date);
  const anno = AnnotationManager.findAnnotationByDate(day.date);
  const unit = UnitFormatter.getUnitLabel();
  const processed = processedDays();
  const recentCalories = processed
    .slice(-30)
    .filter((p) => p.calorieIntake != null && p.calorieIntake > 0)
    .map((p) => p.calorieIntake);
  const avgCalories = recentCalories.length
    ? recentCalories.reduce((a, b) => a + b, 0) / recentCalories.length
    : null;
  const outlier = day.isOutlier ? explainOutlier(day, avgCalories) : null;
  const manual = ManualEntryService.getAll()[dateStr] || {};
  const disagreeKcal = tdeeDisagreementKcal(day);

  const rows = [
    ["Weight", day.value != null ? `${UnitFormatter.formatWeight(day.value, 1)} ${unit}` : "—"],
    ["SMA", day.sma != null ? `${UnitFormatter.formatWeight(day.sma, 1)} ${unit}` : "—"],
    ["Calories", fmt(day.calorieIntake, 0, "—") + (day.calorieIntake != null ? " kcal" : "")],
    ["Wearable TDEE", fmt(day.googleFitTDEE, 0, "—") + (day.googleFitTDEE != null ? " kcal" : "")],
    ["Adaptive TDEE", fmt(day.adaptiveTDEE, 0, "—") + (day.adaptiveTDEE != null ? " kcal" : "")],
    ["Protein", fmt(day.protein, 0, "—") + (day.protein != null ? " g" : "")],
    ["Carbs", fmt(day.carbs, 0, "—") + (day.carbs != null ? " g" : "")],
    ["Fat", fmt(day.fat, 0, "—") + (day.fat != null ? " g" : "")],
    ["Fiber", fmt(day.fiber, 0, "—") + (day.fiber != null ? " g" : "")],
  ];

  if (hasTdeeDisagreement(day) && disagreeKcal != null) {
    const sign = disagreeKcal > 0 ? "+" : "";
    rows.push(["Wearable vs adaptive", `${sign}${Math.round(disagreeKcal)} kcal`]);
  }
  if (day.workoutCount != null) rows.push(["Workouts", String(day.workoutCount)]);
  if (day.isRestDay) rows.push(["Rest day", "Yes"]);
  if (day._skeleton) {
    rows.unshift(["Status", "No processed row yet — save to log this day."]);
  }

  _body.innerHTML = `
    <dl class="day-inspector-facts">
      ${rows.map(([label, value]) => `
        <div class="day-inspector-row">
          <dt>${label}</dt>
          <dd>${value}</dd>
        </div>
      `).join("")}
    </dl>
    ${outlier ? `<p class="day-inspector-note">${outlier.narrative}</p>` : ""}
    <form id="day-inspector-form" class="day-inspector-form">
      <label>Weight (${unit})
        <input type="number" id="di-weight" step="0.1" min="20" max="300"
          value="${(manual.weight != null ? UnitFormatter.formatWeight(manual.weight, 1) : (day.value != null ? UnitFormatter.formatWeight(day.value, 1) : ""))}">
      </label>
      <label>Calories (kcal)
        <input type="number" id="di-calories" step="1" min="0" max="20000"
          value="${manual.calories != null ? manual.calories : (day.calorieIntake ?? "")}">
      </label>
      <label>Note
        <textarea id="di-note" rows="3" maxlength="280">${anno?.text ? anno.text.replace(/</g, "&lt;") : ""}</textarea>
      </label>
      <p class="settings-hint">Saved locally and merged with your main data. A later backend sync for this date can overwrite it.</p>
      <button type="submit" class="btn-primary">Save day</button>
    </form>
  `;

  document.getElementById("day-inspector-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCurrent();
  });
}

async function saveCurrent() {
  if (!_currentDate) return;
  const dateStr = Utils.formatDate(_currentDate);
  const weightVal = parseFloat(document.getElementById("di-weight")?.value);
  const calVal = parseFloat(document.getElementById("di-calories")?.value);
  const note = document.getElementById("di-note")?.value ?? "";

  const hasWeight = !isNaN(weightVal) && weightVal > 0;
  const hasCalories = !isNaN(calVal) && calVal >= 0;
  if (hasWeight || hasCalories) {
    ManualEntryService.upsert(dateStr, {
      weight: hasWeight ? UnitFormatter.toKg(weightVal) : null,
      calories: hasCalories ? calVal : null,
    });
  }

  const existing = AnnotationManager.findAnnotationByDate(_currentDate);
  const trimmed = note.trim();
  if (!trimmed && existing) {
    AnnotationManager.remove(existing.id);
  } else if (trimmed && existing && existing.text !== trimmed) {
    AnnotationManager.remove(existing.id);
    AnnotationManager.add(dateStr, trimmed);
  } else if (trimmed && !existing) {
    AnnotationManager.add(dateStr, trimmed);
  }

  try {
    const fetchedRaw = await DataService.fetchData();
    const raw = ManualEntryService.mergeInto(fetchedRaw);
    const merged = DataService.mergeRawData(raw);
    SettingsPanel.reprocessFromMerged(merged);
  } catch (err) {
    console.error("DayInspector: reprocess failed", err);
  }

  Utils.showStatusMessage(`Saved ${Utils.formatDateDMY(_currentDate)}.`, "success");
  render(findDay(_currentDate) || skeletonDay(_currentDate));
}

function openFor(dateOrDay) {
  const rawDate = dateOrDay?.date instanceof Date ? dateOrDay.date : dateOrDay;
  const day = findDay(rawDate) || skeletonDay(rawDate);
  if (!day) {
    Utils.showStatusMessage("No day data to inspect.", "warn");
    return;
  }
  _currentDate = day.date;
  highlightAndPan(day.date);
  render(day);
  if (_drawer) {
    _drawer.hidden = false;
    _drawer.removeAttribute("aria-hidden");
  }
  if (_overlay) _overlay.hidden = false;
}

function close() {
  if (_drawer) {
    _drawer.hidden = true;
    _drawer.setAttribute("aria-hidden", "true");
  }
  if (_overlay) _overlay.hidden = true;
}

export const DayInspector = {
  init() {
    _drawer = document.getElementById("day-inspector");
    _overlay = document.getElementById("day-inspector-overlay");
    _body = document.getElementById("day-inspector-body");
    _title = document.getElementById("day-inspector-title");
    if (!_drawer) return;

    document.getElementById("day-inspector-close")?.addEventListener("click", close);
    _overlay?.addEventListener("click", close);
    document.getElementById("day-inspector-prev")?.addEventListener("click", () => {
      stepHighlightedDay(-1);
    });
    document.getElementById("day-inspector-next")?.addEventListener("click", () => {
      stepHighlightedDay(1);
    });
    document.addEventListener("keydown", (event) => {
      if (isTypingTarget(document.activeElement)) return;
      const palette = document.getElementById("command-palette-modal");
      if (palette && !palette.hidden) return;

      if (event.key === "Escape" && isDrawerOpen()) {
        close();
        event.stopPropagation();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const next = stepHighlightedDay(event.key === "ArrowRight" ? 1 : -1);
        if (next) event.preventDefault();
      }
    });
  },

  open(dateOrDay) {
    openFor(dateOrDay);
  },

  openToday() {
    const today = startOfDay(new Date()) || new Date();
    openFor(today);
  },

  openLatest() {
    const days = processedDays();
    if (!days.length) {
      this.openToday();
      return;
    }
    openFor(days[days.length - 1].date);
  },

  close,
  stepHighlightedDay,
};
