// js/ui/renderers/adaptiveRateRenderer.js
// Shows personalized rate benchmarks based on user's history

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/**
 * Provides adaptive rate analysis comparing current performance to personal history:
 * - Your typical bulk/cut rates
 * - How current rate compares
 * - Personal percentile ranking
 */
export const AdaptiveRateRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('adaptive-rate-content');
        if (!this._container) {
            console.warn('[AdaptiveRateRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('PROCESSED_DATA')) {
                this._analyze();
            }
        });

        setTimeout(() => this._analyze(), 850);
        console.log('[AdaptiveRateRenderer] Initialized.');
    },

    _analyze() {
        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const processedData = Selectors.selectProcessedData(state);

        if (!processedData || processedData.length < 30) {
            this._renderNoData();
            return;
        }

        const analysis = this._calculateAdaptiveMetrics(processedData, displayStats);
        this._render(analysis, displayStats);
    },

    _calculateAdaptiveMetrics(data, stats) {
        const rates = data
            .filter(d => d.smoothedWeeklyRate != null)
            .map(d => d.smoothedWeeklyRate);

        // Separate bulk and cut phases
        const bulkRates = rates.filter(r => r > 0.1);
        const cutRates = rates.filter(r => r < -0.1);
        const maintenanceRates = rates.filter(r => Math.abs(r) <= 0.1);

        const percentile = (arr, val) => {
            if (arr.length === 0) return null;
            const sorted = [...arr].sort((a, b) => a - b);
            const below = sorted.filter(x => x < val).length;
            return (below / sorted.length) * 100;
        };

        const mean = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const median = arr => {
            if (arr.length === 0) return null;
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        const currentRate = stats.latestWeeklyRate || 0;
        const isGaining = currentRate > 0.05;
        const isLosing = currentRate < -0.05;

        // Calculate personal benchmarks
        const yourBulkAvg = mean(bulkRates);
        const yourCutAvg = mean(cutRates);
        const yourBulkMax = bulkRates.length > 0 ? Math.max(...bulkRates) : null;
        const yourCutMax = cutRates.length > 0 ? Math.min(...cutRates) : null;

        // Current rate compared to relevant history
        let comparison = null;
        let percentileRank = null;

        if (isGaining && bulkRates.length >= 3) {
            percentileRank = percentile(bulkRates, currentRate);
            comparison = {
                type: 'bulk',
                avgRate: yourBulkAvg,
                maxRate: yourBulkMax,
                diff: currentRate - yourBulkAvg
            };
        } else if (isLosing && cutRates.length >= 3) {
            percentileRank = 100 - percentile(cutRates, currentRate); // Invert for cuts (more negative = better)
            comparison = {
                type: 'cut',
                avgRate: yourCutAvg,
                maxRate: yourCutMax,
                diff: currentRate - yourCutAvg
            };
        }

        return {
            currentRate,
            isGaining,
            isLosing,
            comparison,
            percentileRank,
            history: {
                bulkAvg: yourBulkAvg,
                cutAvg: yourCutAvg,
                bulkMax: yourBulkMax,
                cutMax: yourCutMax,
                bulkWeeks: bulkRates.length,
                cutWeeks: cutRates.length,
                maintenanceWeeks: maintenanceRates.length
            }
        };
    },

    _render(analysis, stats) {
        if (!this._container) return;

        const formatRate = (r) => r != null ? `${r > 0 ? '+' : ''}${r.toFixed(2)} kg/wk` : 'N/A';
        const { comparison, percentileRank, history, currentRate, isGaining, isLosing } = analysis;

        let comparisonHtml = '';
        if (comparison) {
            const diffText = comparison.diff > 0
                ? `${Math.abs(comparison.diff).toFixed(2)} kg/wk faster than your average`
                : `${Math.abs(comparison.diff).toFixed(2)} kg/wk slower than your average`;
            const diffClass = comparison.type === 'bulk'
                ? (comparison.diff > 0 ? 'good' : 'warning')
                : (comparison.diff < 0 ? 'good' : 'warning'); // For cuts, more negative is better

            comparisonHtml = `
        <div class="comparison-card ${diffClass}">
          <div class="comparison-header">
            <span class="comparison-type">${comparison.type === 'bulk' ? '💪 Bulk Phase' : '🔥 Cut Phase'}</span>
            <span class="percentile-badge">${percentileRank.toFixed(0)}th percentile</span>
          </div>
          <div class="comparison-body">
            <div class="rate-comparison">
              <div class="current-rate">
                <span class="rate-label">Current</span>
                <span class="rate-value">${formatRate(currentRate)}</span>
              </div>
              <div class="vs-divider">vs</div>
              <div class="avg-rate">
                <span class="rate-label">Your Average</span>
                <span class="rate-value">${formatRate(comparison.avgRate)}</span>
              </div>
            </div>
            <div class="comparison-insight ${diffClass}">
              ${comparison.diff > 0 && comparison.type === 'bulk' ? '📈' : comparison.diff < 0 && comparison.type === 'cut' ? '📉' : '⚡'}
              ${diffText}
            </div>
          </div>
        </div>
      `;
        }

        this._container.innerHTML = `
      <div class="adaptive-rate-analysis">
        ${comparisonHtml || `
          <div class="no-comparison-message">
            <p>${!isGaining && !isLosing ? '⚖️ Currently in maintenance' : 'Need more historical data for comparison'}</p>
          </div>
        `}
        
        <div class="personal-benchmarks">
          <h4 class="benchmarks-title">📊 Your Personal Benchmarks</h4>
          <div class="benchmarks-grid">
            <div class="benchmark-card bulk">
              <div class="benchmark-icon">💪</div>
              <div class="benchmark-label">Bulk Phases</div>
              <div class="benchmark-stats">
                <div class="stat-item">
                  <span class="stat-label">Average</span>
                  <span class="stat-value">${formatRate(history.bulkAvg)}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Best</span>
                  <span class="stat-value">${formatRate(history.bulkMax)}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Weeks</span>
                  <span class="stat-value">${history.bulkWeeks}</span>
                </div>
              </div>
            </div>
            <div class="benchmark-card cut">
              <div class="benchmark-icon">🔥</div>
              <div class="benchmark-label">Cut Phases</div>
              <div class="benchmark-stats">
                <div class="stat-item">
                  <span class="stat-label">Average</span>
                  <span class="stat-value">${formatRate(history.cutAvg)}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Best</span>
                  <span class="stat-value">${formatRate(history.cutMax)}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Weeks</span>
                  <span class="stat-value">${history.cutWeeks}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more history</p>
        <small>At least 4 weeks of data required for adaptive analysis</small>
      </div>
    `;
    }
};
