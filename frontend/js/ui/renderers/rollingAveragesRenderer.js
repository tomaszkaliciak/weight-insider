// js/ui/renderers/rollingAveragesRenderer.js
// Displays multiple rolling averages for trend comparison

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/**
 * Shows 7-day, 14-day, and 30-day rolling averages:
 * - Compare short vs long term trends
 * - Identify momentum and reversals
 */
export const RollingAveragesRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('rolling-averages-content');
        if (!this._container) {
            console.warn('[RollingAveragesRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('FILTERED_DATA') ||
                stateChanges.action.type.includes('DISPLAY_STATS')) {
                this._calculate();
            }
        });

        setTimeout(() => this._calculate(), 1150);
        console.log('[RollingAveragesRenderer] Initialized.');
    },

    _calculate() {
        const state = StateManager.getState();
        const filteredData = Selectors.selectFilteredData(state);

        if (!filteredData || filteredData.length < 14) {
            this._renderNoData();
            return;
        }

        const averages = this._calculateRollingAverages(filteredData);
        this._render(averages);
    },

    _calculateRollingAverages(data) {
        const windows = [
            { days: 7, label: '7-Day', color: 'primary' },
            { days: 14, label: '14-Day', color: 'secondary' },
            { days: 30, label: '30-Day', color: 'tertiary' }
        ];

        const latest = {};
        const trends = {};

        windows.forEach(w => {
            // Get data for window
            const windowData = data.slice(-w.days).filter(d => d.value != null);

            if (windowData.length === 0) {
                latest[w.days] = null;
                trends[w.days] = null;
                return;
            }

            // Calculate average
            const avg = windowData.reduce((s, d) => s + d.value, 0) / windowData.length;
            latest[w.days] = avg;

            // Calculate trend (compare first half to second half of window)
            if (windowData.length >= 4) {
                const mid = Math.floor(windowData.length / 2);
                const firstHalf = windowData.slice(0, mid);
                const secondHalf = windowData.slice(mid);

                const firstAvg = firstHalf.reduce((s, d) => s + d.value, 0) / firstHalf.length;
                const secondAvg = secondHalf.reduce((s, d) => s + d.value, 0) / secondHalf.length;

                trends[w.days] = secondAvg - firstAvg;
            } else {
                trends[w.days] = null;
            }
        });

        // Calculate momentum (7-day trend vs 30-day trend)
        const momentum = latest[7] != null && latest[30] != null
            ? latest[7] - latest[30]
            : null;

        // Detect potential reversal
        const potentialReversal = this._detectReversal(trends);

        // Get latest raw weight
        const latestWeight = data.slice(-1)[0]?.value;

        return {
            windows: windows.map(w => ({
                ...w,
                average: latest[w.days],
                trend: trends[w.days]
            })),
            momentum,
            potentialReversal,
            latestWeight,
            latestDate: data.slice(-1)[0]?.date
        };
    },

    _detectReversal(trends) {
        // Reversal: short-term trend opposite to long-term
        if (trends[7] == null || trends[30] == null) return null;

        const shortTrend = trends[7];
        const longTrend = trends[30];

        if (shortTrend > 0.1 && longTrend < -0.1) {
            return {
                type: 'bullish',
                message: 'Short-term trend turning positive while long-term still negative'
            };
        }
        if (shortTrend < -0.1 && longTrend > 0.1) {
            return {
                type: 'bearish',
                message: 'Short-term trend turning negative while long-term still positive'
            };
        }

        return null;
    },

    _render(averages) {
        if (!this._container) return;

        const formatWeight = (w) => w != null ? `${w.toFixed(1)} kg` : 'N/A';
        const formatTrend = (t) => {
            if (t == null) return '';
            const icon = t > 0.05 ? '📈' : t < -0.05 ? '📉' : '➡️';
            return `${icon} ${t > 0 ? '+' : ''}${t.toFixed(2)}`;
        };

        const momentumClass = averages.momentum > 0.2 ? 'gaining' :
            averages.momentum < -0.2 ? 'losing' : 'stable';
        const momentumText = averages.momentum != null
            ? `${averages.momentum > 0 ? '+' : ''}${averages.momentum.toFixed(2)} kg`
            : 'N/A';

        this._container.innerHTML = `
      <div class="rolling-averages">
        <div class="current-weight">
          <span class="current-label">Latest Weight</span>
          <span class="current-value">${formatWeight(averages.latestWeight)}</span>
        </div>

        <div class="averages-grid">
          ${averages.windows.map(w => `
            <div class="average-card average-${w.color}">
              <div class="average-label">${w.label}</div>
              <div class="average-value">${formatWeight(w.average)}</div>
              <div class="average-trend">${formatTrend(w.trend)}</div>
              ${w.average != null && averages.latestWeight != null ? `
                <div class="average-diff ${averages.latestWeight > w.average ? 'above' : 'below'}">
                  ${averages.latestWeight > w.average ? '↑' : '↓'} 
                  ${Math.abs(averages.latestWeight - w.average).toFixed(2)} kg
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>

        <div class="momentum-indicator ${momentumClass}">
          <span class="momentum-label">Momentum (7d vs 30d)</span>
          <span class="momentum-value">${momentumText}</span>
          <span class="momentum-description">
            ${momentumClass === 'gaining' ? 'Short-term trending higher than long-term' :
                momentumClass === 'losing' ? 'Short-term trending lower than long-term' :
                    'Short and long-term aligned'}
          </span>
        </div>

        ${averages.potentialReversal ? `
          <div class="reversal-alert ${averages.potentialReversal.type}">
            <span class="reversal-icon">🔄</span>
            <span class="reversal-text">${averages.potentialReversal.message}</span>
          </div>
        ` : ''}

        <div class="averages-explanation">
          <small>
            💡 <strong>Reading tip:</strong> When short-term (7d) average crosses above long-term (30d), 
            it often signals a trend reversal. Watch the momentum indicator.
          </small>
        </div>
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more data</p>
        <small>At least 2 weeks of data required for rolling averages</small>
      </div>
    `;
    }
};
