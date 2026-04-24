// js/ui/renderers/refeedRecommenderRenderer.js
// E3: Refeed & Diet-Break Coach widget.

import { StateManager } from "../../core/stateManager.js";
import { RefeedService } from "../../core/refeedService.js";
import { Utils } from "../../core/utils.js";
import { icon } from "../icons.js";

const TIER_CONFIG = {
  "none":          { label: "No action needed",         color: "var(--success-color)", iconName: "check" },
  "refeed-day":    { label: "Refeed day recommended",   color: "var(--warning-color)", iconName: "refeed" },
  "diet-break-1w": { label: "1-week diet break advised",color: "var(--warning-color)", iconName: "pause" },
  "diet-break-2w": { label: "2-week diet break needed", color: "var(--danger-color)",  iconName: "pause" },
};

export const RefeedRecommenderRenderer = {
  _container: null,
  _histContainer: null,
  _isInitialized: false,

  init() {
    this._container    = document.getElementById("refeed-recommender-content");
    this._histContainer = document.getElementById("refeed-history-content");
    if (!this._container) return;

    const render = () => this._render();
    StateManager.subscribeToSpecificEvent("state:filteredDataChanged", render);
    StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", render);
    StateManager.subscribeToSpecificEvent("state:periodizationPhasesChanged", render);
    StateManager.subscribeToSpecificEvent("state:settingsChanged", render);
    StateManager.subscribeToSpecificEvent("state:initializationComplete", render);

    this._isInitialized = true;
    const s = StateManager.getState();
    if (s.isInitialized) this._render();
  },

  _render() {
    if (!this._container) return;
    const state = StateManager.getState();
    const result = RefeedService.analyze(state);

    this._renderMain(result);
    if (this._histContainer) this._renderHistory(result.pastRefeeds);
  },

  _renderMain(result) {
    const { inCut, cutWeeks, adaptationPct, plateauDays, daysSinceLastRefeed,
      recommendation, maintenanceCalories, targetCalories, isDismissed } = result;

    const tier = TIER_CONFIG[recommendation] || TIER_CONFIG["none"];
    const tierIcon = icon(tier.iconName, { size: 16, cls: "refeed-ribbon-icon" });

    // Status strip
    const parts = [];
    if (inCut) {
      parts.push(`Cut · week ${cutWeeks}`);
      if (Math.abs(adaptationPct) >= 1) {
        const sign = adaptationPct < 0 ? "−" : "+";
        parts.push(`adaptation ${sign}${Math.abs(adaptationPct).toFixed(1)}%`);
      }
      if (plateauDays >= 7) parts.push(`plateau ${plateauDays}d`);
      if (daysSinceLastRefeed != null) parts.push(`last refeed ${daysSinceLastRefeed}d ago`);
    } else if (result.currentPhase) {
      parts.push(result.currentPhase.charAt(0).toUpperCase() + result.currentPhase.slice(1) + " phase");
    } else {
      parts.push("No phase detected yet");
    }

    const dismissed = isDismissed && recommendation !== "none";

    this._container.innerHTML = `
      <div class="refeed-status-strip">${parts.join(" · ")}</div>
      ${dismissed ? `<div class="refeed-snooze-notice">Dismissed · will resurface automatically.</div>` : ""}
      <div class="refeed-card" style="--ribbon-color:${tier.color}">
        <div class="refeed-ribbon">${tierIcon}<span>${tier.label}</span></div>
        ${recommendation !== "none" && !dismissed ? `
          ${targetCalories != null ? `<p class="refeed-detail">Target: eat at <strong>~${targetCalories.toLocaleString()} kcal</strong>${recommendation === "refeed-day" ? " for 1 day" : recommendation === "diet-break-1w" ? " for 7 days" : " for 14 days"}</p>` : ""}
          ${maintenanceCalories != null ? `<p class="refeed-detail muted">Maintenance estimate: ${maintenanceCalories.toLocaleString()} kcal</p>` : ""}
          <div class="refeed-actions">
            <button class="btn-primary refeed-schedule-btn">Mark scheduled</button>
            <button class="btn-secondary refeed-dismiss-btn">Dismiss for 7 days</button>
          </div>
        ` : (recommendation === "none" ? `<p class="refeed-detail">You're on track — keep it up.</p>` : "")}
      </div>
    `;

    this._container.querySelector(".refeed-schedule-btn")?.addEventListener("click", () => {
      RefeedService.recordScheduled();
      Utils.showStatusMessage("Refeed scheduled — good luck!", "success", 3000);
    });

    this._container.querySelector(".refeed-dismiss-btn")?.addEventListener("click", () => {
      RefeedService.dismiss();
      this._render();
      Utils.showStatusMessage("Dismissed for 7 days.", "info", 2500);
    });
  },

  _renderHistory(pastRefeeds) {
    if (!this._histContainer) return;
    if (!pastRefeeds?.length) {
      this._histContainer.innerHTML = `<p class="refeed-detail muted" style="padding:12px">No refeeds detected yet.</p>`;
      return;
    }
    const recent = [...pastRefeeds].reverse().slice(0, 8);
    const rows = recent.map(r => `
      <div class="refeed-history-row">
        <span class="refeed-history-date">${Utils.formatDateShort(r.date)}</span>
        <span class="refeed-history-kcal">${Math.round(r.intake).toLocaleString()} kcal</span>
      </div>
    `).join("");
    this._histContainer.innerHTML = `<div class="refeed-history-list">${rows}</div>`;
  },
};
