// Builds and shows SMA / TDEE / Rate explain popovers.

import { CONFIG } from "../config.js";
import { StateManager } from "../core/stateManager.js";
import * as Selectors from "../core/selectors.js";
import { Utils } from "../core/utils.js";

const DAY_MS = 86400000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);
}

function formatRange(range) {
  if (!range?.start || !range?.end) return "Not set";
  return `${Utils.formatDateShort(range.start)} – ${Utils.formatDateShort(range.end)}`;
}

function countOutliers(processed, range) {
  if (!Array.isArray(processed) || !range?.start || !range?.end) return 0;
  return processed.filter(
    (d) =>
      d.isOutlier &&
      d.date instanceof Date &&
      d.date >= range.start &&
      d.date <= range.end,
  ).length;
}

function stalenessDays(processed) {
  const last = [...(processed || [])].reverse().find((d) => d.value != null && d.date instanceof Date);
  if (!last) return null;
  return Math.max(0, daysBetween(new Date(), last.date));
}

function daysInRange(range) {
  if (!range?.start || !range?.end) return null;
  return Math.max(1, daysBetween(range.end, range.start) + 1);
}

/**
 * Pure copy for one vital-stat explainer.
 * @param {'sma'|'tdee'|'rate'} kind
 * @param {object} ctx
 */
export function buildStatExplanation(kind, ctx = {}) {
  const {
    displayStats = {},
    settings = {},
    analysisRange = {},
    outlierCount = 0,
    staleDays = null,
    rangeDays = null,
  } = ctx;

  const smaWindow = settings.smaWindow || CONFIG.movingAverageWindow;
  const common = [
    { label: "Analysis range", value: formatRange(analysisRange) },
    { label: "Days in range", value: rangeDays != null ? String(rangeDays) : "—" },
    { label: "Outliers in range", value: String(outlierCount) },
    { label: "Last weigh-in", value: staleDays == null ? "—" : staleDays === 0 ? "Today" : `${staleDays}d ago` },
  ];

  if (kind === "sma") {
    return {
      title: "SMA",
      body: `${smaWindow}-day mean of scale weight. Outliers are flagged but not stripped from this average.`,
      rows: common,
    };
  }

  if (kind === "tdee") {
    const source = displayStats.baselineTDEESource || "Adaptive";
    return {
      title: "TDEE",
      body: `Baseline source: ${source}. Adaptive TDEE is ${CONFIG.adaptiveTDEEWindow}-day intake minus SMA change × ${CONFIG.KCALS_PER_KG}, and needs roughly 70% of days logged. Fallbacks are weight-change trend, then Google Fit.`,
      rows: [
        { label: "Source", value: source },
        ...common,
      ],
    };
  }

  return {
    title: "Rate",
    body: `Smoothed weekly SMA slope (${CONFIG.rateOfChangeSmoothingWindow}-day smooth). This is the last value at the analysis end date.`,
    rows: common,
  };
}

function ensurePopover() {
  let el = document.getElementById("stat-explainer-popover");
  if (el) return el;
  el = document.createElement("div");
  el.id = "stat-explainer-popover";
  el.className = "stat-explainer-popover";
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function closePopover() {
  const el = document.getElementById("stat-explainer-popover");
  if (el) el.hidden = true;
  document.querySelectorAll(".stat-explain-btn[aria-expanded='true']").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function openPopover(anchor, explanation) {
  const el = ensurePopover();
  el.innerHTML = `
    <div class="stat-explainer-title">${explanation.title}</div>
    <p class="stat-explainer-body">${explanation.body}</p>
    <dl class="stat-explainer-rows">
      ${explanation.rows.map((row) => `
        <div class="stat-explainer-row">
          <dt>${row.label}</dt>
          <dd>${row.value}</dd>
        </div>
      `).join("")}
    </dl>
  `;
  el.hidden = false;

  const rect = anchor.getBoundingClientRect();
  const popW = Math.min(320, window.innerWidth - 24);
  let left = rect.left;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  el.style.width = `${popW}px`;
  el.style.left = `${Math.max(12, left)}px`;
  el.style.top = `${rect.bottom + 8 + window.scrollY}px`;
}

export const StatsExplainer = {
  init() {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest(".stat-explain-btn");
      if (btn) {
        event.preventDefault();
        const kind = btn.dataset.stat;
        const expanded = btn.getAttribute("aria-expanded") === "true";
        closePopover();
        if (expanded) return;
        const state = StateManager.getState();
        const processed = Selectors.selectProcessedData(state) || [];
        const range = Selectors.selectAnalysisRange(state);
        const explanation = buildStatExplanation(kind, {
          displayStats: Selectors.selectDisplayStats(state) || {},
          settings: Selectors.selectSettings(state) || {},
          analysisRange: range,
          outlierCount: countOutliers(processed, range),
          staleDays: stalenessDays(processed),
          rangeDays: daysInRange(range),
        });
        btn.setAttribute("aria-expanded", "true");
        openPopover(btn, explanation);
        return;
      }
      if (!event.target.closest("#stat-explainer-popover")) closePopover();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePopover();
    });
  },
};
