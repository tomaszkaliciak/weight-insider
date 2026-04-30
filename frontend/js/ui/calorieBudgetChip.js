// js/ui/calorieBudgetChip.js
// A4: Header chip showing today's calorie target based on the active goal + adaptive TDEE.
// Clicking opens a popover with the breakdown.

import { StateManager } from "../core/stateManager.js";
import { SettingsService } from "../core/settingsService.js";
import { CONFIG } from "../config.js";
import { Utils } from "../core/utils.js";

let _chip, _popover, _valueEl, _tdeeEl, _adjEl, _loggedEl, _barEl, _mainToggle;
let _open = false;

function _update() {
  const state = StateManager.getState();
  const stats = state.displayStats || {};
  const settings = state.settings || {};
  const data = state.filteredData?.length ? state.filteredData : state.processedData;
  const latestCaloriePoint = [...(data || [])].reverse().find(d => d.calorieIntake != null);

  const useMaintenance = settings.budgetUseMaintenance;
  const tdee =
    stats.avgTDEE_Adaptive ??
    stats.avgTDEE_WgtChange ??
    stats.avgExpenditureGFit ??
    null;
  const targetFromRate =
    tdee != null && state.goal?.targetRate != null
      ? tdee + (state.goal.targetRate / 7) * CONFIG.KCALS_PER_KG
      : null;
  const target = useMaintenance ? tdee : (stats.suggestedIntakeTarget ?? targetFromRate ?? null);
  const logged = latestCaloriePoint?.calorieIntake ?? null;

  // Chip value
  if (_valueEl) {
    if (target != null) {
      _valueEl.textContent = Math.round(target).toLocaleString();
    } else if (!state.goal?.weight) {
      _valueEl.textContent = "Set goal";
    } else {
      _valueEl.textContent = "Needs TDEE";
    }
  }

  // Chip color state
  if (_chip) {
    _chip.classList.remove("budget-chip--on-track", "budget-chip--off-track");
    if (target != null && logged != null) {
      const ratio = logged / target;
      if (ratio >= 0.90 && ratio <= 1.10) _chip.classList.add("budget-chip--on-track");
      else if (ratio > 1.15) _chip.classList.add("budget-chip--off-track");
    }
  }

  // Popover content
  const tdeeSource = stats.baselineTDEESource ?? "adaptive";
  if (_tdeeEl) _tdeeEl.textContent = tdee != null ? `${Math.round(tdee).toLocaleString()} kcal (${tdeeSource})` : "No TDEE yet";

  const adj = target != null && tdee != null ? target - tdee : null;
  if (_adjEl) {
    if (adj != null) {
      const sign = adj >= 0 ? "+" : "−";
      _adjEl.textContent = `${sign}${Math.round(Math.abs(adj)).toLocaleString()} kcal/day`;
      _adjEl.className = "budget-popover-value " + (adj < 0 ? "budget-neg" : "budget-pos");
    } else {
      _adjEl.textContent = "—";
    }
  }

  if (_loggedEl) {
    const loggedDate = latestCaloriePoint?.date instanceof Date
      ? ` (${Utils.formatDateShort(latestCaloriePoint.date)})`
      : "";
    _loggedEl.textContent = logged != null ? `${Math.round(logged).toLocaleString()} kcal${loggedDate}` : "No calorie log";
  }

  // Progress bar
  if (_barEl && target != null && logged != null) {
    const pct = Math.min(150, Math.round((logged / target) * 100));
    _barEl.style.width = `${Math.min(100, pct)}%`;
    _barEl.className = "budget-popover-bar " + (pct > 110 ? "budget-bar-over" : pct >= 90 ? "budget-bar-ok" : "budget-bar-under");
  } else if (_barEl) {
    _barEl.style.width = "0";
  }

  if (_mainToggle) _mainToggle.checked = useMaintenance;
}

function _togglePopover() {
  _open = !_open;
  if (_popover) {
    _popover.hidden = !_open;
  }
  _chip?.setAttribute("aria-expanded", String(_open));
  if (_open) _update(); // refresh on open
}

function _closePopover(e) {
  if (!_open) return;
  if (!_chip?.contains(e.target) && !_popover?.contains(e.target)) {
    _open = false;
    if (_popover) _popover.hidden = true;
    _chip?.setAttribute("aria-expanded", "false");
  }
}

export const CalorieBudgetChip = {
  init() {
    _chip     = document.getElementById("daily-budget-chip");
    _popover  = document.getElementById("budget-chip-popover");
    _valueEl  = document.getElementById("budget-chip-value");
    _tdeeEl   = document.getElementById("budget-popover-tdee");
    _adjEl    = document.getElementById("budget-popover-adj");
    _loggedEl = document.getElementById("budget-popover-logged");
    _barEl    = document.getElementById("budget-popover-bar");
    _mainToggle = document.getElementById("budget-maintenance-toggle");

    if (!_chip) return;

    _chip.addEventListener("click", (e) => {
      e.stopPropagation();
      _togglePopover();
    });
    document.addEventListener("click", _closePopover);

    if (_mainToggle) {
      _mainToggle.addEventListener("change", () => {
        SettingsService.save({ budgetUseMaintenance: _mainToggle.checked });
        StateManager.dispatch({
          type: "UPDATE_SETTINGS",
          payload: { budgetUseMaintenance: _mainToggle.checked },
        });
        _update();
        Utils.showStatusMessage(
          _mainToggle.checked ? "Budget chip now shows maintenance calories." : "Budget chip now follows your goal target.",
          "info",
          2500,
        );
      });
    }

    // Goal icon chip also navigates to goal form when no goal is set
    _chip.addEventListener("click", () => {
      if (!StateManager.getState().goal?.weight) {
        document.getElementById("goal-widget")?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("goalWeight")?.focus();
      }
    });

    StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", _update);
    StateManager.subscribeToSpecificEvent("state:settingsChanged", _update);
    StateManager.subscribeToSpecificEvent("state:initializationComplete", _update);
  },
};
