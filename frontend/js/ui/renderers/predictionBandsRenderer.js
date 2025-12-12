// js/ui/renderers/predictionBandsRenderer.js
// Shows weight predictions with confidence bands

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/**
 * Predicts future weight based on current trend with confidence intervals:
 * - 4-week, 8-week, 12-week projections
 * - Best case / worst case scenarios
 */
export const PredictionBandsRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('prediction-bands-content');
        if (!this._container) {
            console.warn('[PredictionBandsRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                this._predict();
            }
        });

        setTimeout(() => this._predict(), 900);
        console.log('[PredictionBandsRenderer] Initialized.');
    },

    _predict() {
        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const filteredData = Selectors.selectFilteredData(state);

        if (!filteredData || filteredData.length < 14 || displayStats.latestWeight == null) {
            this._renderNoData();
            return;
        }

        const predictions = this._calculatePredictions(filteredData, displayStats);
        this._render(predictions, displayStats);
    },

    _calculatePredictions(data, stats) {
        const currentWeight = stats.latestWeight;
        const currentRate = stats.latestWeeklyRate || 0;

        // Calculate rate volatility from historical data
        const rates = data
            .filter(d => d.smoothedWeeklyRate != null)
            .map(d => d.smoothedWeeklyRate);

        const rateStdDev = rates.length > 2
            ? Math.sqrt(rates.reduce((sum, r) => sum + Math.pow(r - currentRate, 2), 0) / rates.length)
            : Math.abs(currentRate) * 0.3; // Default 30% uncertainty

        const timeFrames = [
            { weeks: 4, label: '4 weeks' },
            { weeks: 8, label: '8 weeks' },
            { weeks: 12, label: '12 weeks' }
        ];

        return timeFrames.map(tf => {
            const expectedChange = currentRate * tf.weeks;
            const uncertainty = rateStdDev * Math.sqrt(tf.weeks) * 1.5; // Uncertainty grows with sqrt of time

            return {
                weeks: tf.weeks,
                label: tf.label,
                expected: currentWeight + expectedChange,
                optimistic: currentWeight + expectedChange + (currentRate > 0 ? uncertainty : -uncertainty),
                pessimistic: currentWeight + expectedChange + (currentRate > 0 ? -uncertainty : uncertainty),
                confidence: Math.max(50, 95 - tf.weeks * 3) // Confidence decreases over time
            };
        });
    },

    _render(predictions, stats) {
        if (!this._container) return;

        const currentWeight = stats.latestWeight;
        const currentRate = stats.latestWeeklyRate || 0;
        const direction = currentRate > 0 ? 'gaining' : currentRate < 0 ? 'losing' : 'maintaining';
        const directionIcon = currentRate > 0 ? '📈' : currentRate < 0 ? '📉' : '➡️';

        this._container.innerHTML = `
      <div class="prediction-header">
        <div class="current-status">
          <span class="status-icon">${directionIcon}</span>
          <span class="status-text">Currently ${direction} at <strong>${Math.abs(currentRate).toFixed(2)} kg/week</strong></span>
        </div>
      </div>
      
      <div class="predictions-grid">
        ${predictions.map(p => `
          <div class="prediction-card">
            <div class="prediction-timeframe">${p.label}</div>
            <div class="prediction-main">
              <div class="prediction-expected">${p.expected.toFixed(1)} kg</div>
              <div class="prediction-change ${currentRate > 0 ? 'gain' : 'loss'}">
                ${currentRate > 0 ? '+' : ''}${(p.expected - currentWeight).toFixed(1)} kg
              </div>
            </div>
            <div class="prediction-range">
              <div class="range-bar">
                <div class="range-fill" style="left: 20%; right: 20%;"></div>
                <div class="range-marker expected" style="left: 50%;"></div>
              </div>
              <div class="range-labels">
                <span class="range-min">${p.pessimistic.toFixed(1)}</span>
                <span class="range-max">${p.optimistic.toFixed(1)}</span>
              </div>
            </div>
            <div class="prediction-confidence">
              ${p.confidence}% confidence
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="prediction-note">
        <small>
          📊 Predictions based on your current ${Math.abs(currentRate).toFixed(2)} kg/week trend. 
          Ranges account for your historical rate variability.
        </small>
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Insufficient data for predictions</p>
        <small>Need at least 2 weeks of weight data</small>
      </div>
    `;
    }
};
