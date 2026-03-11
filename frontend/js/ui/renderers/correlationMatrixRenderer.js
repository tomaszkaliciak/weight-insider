// js/ui/renderers/correlationMatrixRenderer.js
// Visualizes a heatmap of correlations and drives a selectable scatter explorer.

import * as ss from "simple-statistics";
import { StateManager, ActionTypes } from "../../core/stateManager.js";
import * as Selectors from "../../core/selectors.js";
import { VisibilityManager } from "../visibilityManager.js";

const EXPLORER_OPTIONS = [
  { key: "avgNetCal", label: "Avg Net Calories", unit: "kcal/d" },
  { key: "weeklyRate", label: "Weekly Rate", unit: "kg/wk" },
  { key: "avgIntake", label: "Avg Intake", unit: "kcal/d" },
  { key: "avgExpenditure", label: "Avg Expenditure", unit: "kcal/d" },
  { key: "avgAdaptiveTdee", label: "Adaptive TDEE", unit: "kcal/d" },
  { key: "avgProtein", label: "Protein", unit: "g/d" },
  { key: "avgCarbs", label: "Carbs", unit: "g/d" },
  { key: "avgFat", label: "Fat", unit: "g/d" },
  { key: "avgFiber", label: "Fiber", unit: "g/d" },
  { key: "avgVolatility", label: "Volatility", unit: "kg" },
  { key: "loggingRate", label: "Logging Rate", unit: "%" },
  { key: "calorieCoverage", label: "Calorie Coverage", unit: "%" },
  { key: "weekendSpike", label: "Weekend Spike", unit: "kcal" },
];

export const CorrelationMatrixRenderer = {
  containerId: "correlation-matrix-container",
  _isVisible: false,
  _lastMatrix: null,
  _hasReceivedData: false,
  _selectedX: "avgNetCal",
  _selectedY: "weeklyRate",

  init() {
    const container = document.getElementById(this.containerId);
    if (container) {
      VisibilityManager.observe(container.parentElement, (isVisible) => {
        this._isVisible = isVisible;
        if (isVisible && this._hasReceivedData) {
          this.render(this._lastMatrix);
        }
      });
    }

    StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", (stats) => {
      this._lastMatrix = stats.correlationMatrix;
      this._hasReceivedData = true;
      this._syncScatterExplorer();
      if (this._isVisible) {
        this.render(this._lastMatrix);
      }
    });

    const s = StateManager.getState();
    if (s.isInitialized && s.displayStats?.correlationMatrix) {
      this._lastMatrix = s.displayStats.correlationMatrix;
      this._hasReceivedData = true;
      this._syncScatterExplorer();
      this.render(this._lastMatrix);
    }
  },

  _getOption(key) {
    return EXPLORER_OPTIONS.find((option) => option.key === key) || EXPLORER_OPTIONS[0];
  },

  _buildScatterPoints() {
    const weeklyData = Selectors.selectWeeklySummaryData(StateManager.getState()) || [];
    const xOption = this._getOption(this._selectedX);
    const yOption = this._getOption(this._selectedY);
    return weeklyData
      .filter((week) => week[this._selectedX] != null && week[this._selectedY] != null)
      .map((week) => ({
        ...week,
        xValue: xOption.unit === "%" ? week[this._selectedX] * 100 : week[this._selectedX],
        yValue: yOption.unit === "%" ? week[this._selectedY] * 100 : week[this._selectedY],
        xLabel: xOption.label,
        yLabel: yOption.label,
        xUnit: xOption.unit,
        yUnit: yOption.unit,
      }));
  },

  _computeScatterSummary(scatterPoints) {
    if (!Array.isArray(scatterPoints) || scatterPoints.length < 4) {
      return { count: scatterPoints.length, correlation: null };
    }
    try {
      const x = scatterPoints.map((point) => point.xValue);
      const y = scatterPoints.map((point) => point.yValue);
      const correlation = ss.sampleCorrelation(x, y);
      return {
        count: scatterPoints.length,
        correlation: isNaN(correlation) ? null : correlation,
      };
    } catch {
      return { count: scatterPoints.length, correlation: null };
    }
  },

  _setScatterAxisLabels(scatterPoints) {
    const sample = scatterPoints[0];
    const xOption = this._getOption(this._selectedX);
    const yOption = this._getOption(this._selectedY);
    const xLabel = document.querySelector(".scatter-axis-label-x");
    const yLabel = document.querySelector(".scatter-axis-label-y");
    if (xLabel) {
      xLabel.textContent = `${sample?.xLabel || xOption.label} (${sample?.xUnit || xOption.unit})`;
    }
    if (yLabel) {
      yLabel.textContent = `${sample?.yLabel || yOption.label} (${sample?.yUnit || yOption.unit})`;
    }
  },

  _syncScatterExplorer() {
    const scatterPoints = this._buildScatterPoints();
    this._setScatterAxisLabels(scatterPoints);
    StateManager.dispatch({
      type: ActionTypes.SET_CORRELATION_DATA,
      payload: scatterPoints,
    });
    return scatterPoints;
  },

  render(matrix) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const scatterPoints = this._syncScatterExplorer();
    const summary = this._computeScatterSummary(scatterPoints);

    if (!matrix || !matrix.values || matrix.values.length === 0) {
      container.innerHTML = `
        <div class="correlation-explorer-toolbar">
          ${this._controlsHTML(summary)}
        </div>
        <div class="empty-state-message">
          <p>Need more data</p>
          <small>At least 14 days of complete nutrition data are required to build the matrix.</small>
        </div>
      `;
      this._bindControls();
      return;
    }

    const { labels, values } = matrix;
    const n = labels.length;

    container.innerHTML = `
      <div class="correlation-explorer-toolbar">
        ${this._controlsHTML(summary)}
      </div>
      <div class="correlation-grid" style="grid-template-columns: repeat(${n + 1}, 1fr)"></div>
      <div class="matrix-legend">
        <div class="legend-item"><div class="legend-color" style="background: hsl(0, 70%, 50%)"></div> Negative</div>
        <div class="legend-item"><div class="legend-color" style="background: hsl(0, 0%, 50%)"></div> Neutral</div>
        <div class="legend-item"><div class="legend-color" style="background: hsl(150, 70%, 40%)"></div> Positive</div>
      </div>
    `;

    const grid = container.querySelector(".correlation-grid");
    if (!grid) return;
    grid.appendChild(document.createElement("div"));

    labels.forEach((label) => {
      const el = document.createElement("div");
      el.className = "matrix-label col-label";
      el.textContent = label;
      grid.appendChild(el);
    });

    for (let i = 0; i < n; i++) {
      const rowLabel = document.createElement("div");
      rowLabel.className = "matrix-label row-label";
      rowLabel.textContent = labels[i];
      grid.appendChild(rowLabel);

      for (let j = 0; j < n; j++) {
        const val = values[i][j];
        const cell = document.createElement("div");
        cell.className = "matrix-cell";

        if (val === null) {
          cell.className += " empty";
          cell.textContent = "-";
          cell.title = "Insufficient data for this pair";
        } else {
          const absVal = Math.abs(val);
          cell.textContent = val.toFixed(2);
          cell.style.backgroundColor = this._getColorForValue(val);
          let strength = "None";
          if (absVal > 0.7) strength = "Strong";
          else if (absVal > 0.4) strength = "Moderate";
          else if (absVal > 0.2) strength = "Weak";
          const direction = val > 0 ? "Positive" : "Negative";
          cell.title = `${labels[i]} vs ${labels[j]}\nCorrelation: ${val.toFixed(3)}\nStrength: ${strength} ${direction}`;
        }

        grid.appendChild(cell);
      }
    }

    this._bindControls();
  },

  _controlsHTML(summary) {
    const correlationText = summary.correlation == null
      ? "r = N/A"
      : `r = ${summary.correlation.toFixed(2)}`;
    return `
      <div class="correlation-explorer-header">
        <div>
          <div class="correlation-explorer-title">Scatter Explorer</div>
          <div class="correlation-explorer-subtitle">Drive the scatter plot from any weekly metric pair.</div>
        </div>
        <div class="correlation-explorer-summary">
          <span>${correlationText}</span>
          <span>${summary.count} weeks</span>
        </div>
      </div>
      <div class="correlation-explorer-controls">
        <label class="correlation-select-group">
          <span>X</span>
          <select id="correlation-x-select">
            ${EXPLORER_OPTIONS.map((option) => `<option value="${option.key}" ${option.key === this._selectedX ? "selected" : ""}>${option.label}</option>`).join("")}
          </select>
        </label>
        <label class="correlation-select-group">
          <span>Y</span>
          <select id="correlation-y-select">
            ${EXPLORER_OPTIONS.map((option) => `<option value="${option.key}" ${option.key === this._selectedY ? "selected" : ""}>${option.label}</option>`).join("")}
          </select>
        </label>
      </div>
    `;
  },

  _bindControls() {
    const container = document.getElementById(this.containerId);
    const xSelect = container?.querySelector("#correlation-x-select");
    const ySelect = container?.querySelector("#correlation-y-select");
    if (!xSelect || !ySelect) return;

    xSelect.addEventListener("change", (event) => {
      this._selectedX = event.target.value;
      if (this._selectedX === this._selectedY) {
        const fallback = EXPLORER_OPTIONS.find((option) => option.key !== this._selectedX);
        if (fallback) this._selectedY = fallback.key;
      }
      this.render(this._lastMatrix);
    });

    ySelect.addEventListener("change", (event) => {
      this._selectedY = event.target.value;
      if (this._selectedX === this._selectedY) {
        const fallback = EXPLORER_OPTIONS.find((option) => option.key !== this._selectedY);
        if (fallback) this._selectedX = fallback.key;
      }
      this.render(this._lastMatrix);
    });
  },

  _getColorForValue(val) {
    if (val === null || isNaN(val)) return "transparent";

    const absVal = Math.abs(val);
    const intensity = Math.pow(absVal, 0.7) * 100;

    if (val > 0) {
      return `hsla(150, 70%, 40%, ${intensity / 100})`;
    }
    return `hsla(0, 70%, 50%, ${intensity / 100})`;
  },
};
