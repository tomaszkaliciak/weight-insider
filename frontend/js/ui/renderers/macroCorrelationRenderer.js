// js/ui/renderers/macroCorrelationRenderer.js
// Visualizes the relationship between macro intake and weight dynamics

import { StateManager } from '../../core/stateManager.js';
import { Utils } from '../../core/utils.js';

export const MacroCorrelationRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('macro-impact-content');
        if (!this._container) {
            console.warn('[MacroCorrelationRenderer] Container not found.');
            return;
        }

        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => {
            this._render(stats);
        });

        console.log('[MacroCorrelationRenderer] Initialized.');
    },

    _render(stats) {
        if (!this._container) return;

        const split = stats.macroSplit;
        const corr = stats.carbVolatilityCorrelation;

        if (!split) {
            this._container.innerHTML = `<p class="empty-state">Need at least 7 days of macro data to analyse trends.</p>`;
            return;
        }

        // Determine Insight Text
        let insight = "Your macro distribution is balanced.";
        if (corr > 0.4) insight = "Higher carb intake strongly correlates with temporary water weight fluctuations.";
        if (corr < -0.4) insight = "Your weight appears more stable on higher carb days (unusual, but interesting!).";
        if (split.protein < 25) insight = "Increasing protein intake may help stabilize your weight trend.";

        this._container.innerHTML = `
            <div class="macro-summary">
                <h4>Average Macro Split</h4>
                <div class="macro-grid">
                    <div class="macro-item">
                        <span class="label">Protein</span>
                        <div class="value protein-text">${split.protein}%</div>
                    </div>
                    <div class="macro-item">
                        <span class="label">Carbs</span>
                        <div class="value carbs-text">${split.carbs}%</div>
                    </div>
                    <div class="macro-item">
                        <span class="label">Fat</span>
                        <div class="value fat-text">${split.fat}%</div>
                    </div>
                </div>
            </div>

            <hr class="subtle-hr" />

            <div class="correlation-insight">
                <h4>Macro-Weight Correlation</h4>
                <div class="insight-value ${Math.abs(corr) > 0.3 ? 'highlight' : ''}">
                    Correlation Strength: <strong>${corr !== null ? corr.toFixed(2) : 'N/A'}</strong>
                </div>
                <p class="insight-text">${insight}</p>
                <small class="text-muted">Analyzes Pearson correlation between Carbohydrate intake % and Rolling Volatility (water weight).</small>
            </div>
        `;
    }
};
