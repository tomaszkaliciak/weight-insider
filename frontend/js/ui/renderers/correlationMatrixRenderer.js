// js/ui/renderers/correlationMatrixRenderer.js
// Visualizes a heatmap of correlations between multiple nutrition/weight variables.

import { StateManager } from "../../core/stateManager.js";
import { Utils } from "../../core/utils.js";
import { VisibilityManager } from "../visibilityManager.js";

export const CorrelationMatrixRenderer = {
    containerId: "correlation-matrix-container",
    _isVisible: false,
    _lastMatrix: null,

    init() {
        const container = document.getElementById(this.containerId);
        if (container) {
            VisibilityManager.observe(container.parentElement, (isVisible) => {
                this._isVisible = isVisible;
                if (isVisible && this._lastMatrix) {
                    this.render(this._lastMatrix);
                }
            });
        }

        StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", (stats) => {
            this._lastMatrix = stats.correlationMatrix;
            if (this._isVisible) {
                this.render(this._lastMatrix);
            }
        });
    },

    render(matrix) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        if (!matrix || !matrix.values || matrix.values.length === 0) {
            container.innerHTML = '<p class="empty-state">Need at least 14 days of complete nutrition data to build the matrix.</p>';
            return;
        }

        const { labels, values } = matrix;
        const n = labels.length;

        // Clear container
        container.innerHTML = "";

        // Create Grid
        const grid = document.createElement("div");
        grid.className = "correlation-grid";
        grid.style.gridTemplateColumns = `repeat(${n + 1}, 1fr)`;

        // 1. Top-left empty corner
        grid.appendChild(document.createElement("div"));

        // 2. Column Labels
        labels.forEach(label => {
            const el = document.createElement("div");
            el.className = "matrix-label col-label";
            el.textContent = label;
            grid.appendChild(el);
        });

        // 3. Rows
        for (let i = 0; i < n; i++) {
            // Row Label
            const rowLabel = document.createElement("div");
            rowLabel.className = "matrix-label row-label";
            rowLabel.textContent = labels[i];
            grid.appendChild(rowLabel);

            // Row Cells
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

                    // Tooltip interpretation
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

        container.appendChild(grid);

        // Add Legend
        const legend = document.createElement("div");
        legend.className = "matrix-legend";
        legend.innerHTML = `
            <div class="legend-item"><div class="legend-color" style="background: hsl(0, 70%, 50%)"></div> Negative</div>
            <div class="legend-item"><div class="legend-color" style="background: hsl(0, 0%, 50%)"></div> Neutral</div>
            <div class="legend-item"><div class="legend-color" style="background: hsl(150, 70%, 40%)"></div> Positive</div>
        `;
        container.appendChild(legend);
    },

    /**
     * Maps correlation (-1 to 1) to color.
     * Positive (Green), Negative (Red), Neutral (Gray/Transparent)
     */
    _getColorForValue(val) {
        if (val === null || isNaN(val)) return "transparent";

        const absVal = Math.abs(val);
        // Intensity scaling (non-linear for better visual pop on weak correlations)
        const intensity = Math.pow(absVal, 0.7) * 100;

        if (val > 0) {
            // Green (Hue 150)
            return `hsla(150, 70%, 40%, ${intensity / 100})`;
        } else {
            // Red (Hue 0)
            return `hsla(0, 70%, 50%, ${intensity / 100})`;
        }
    }
};
