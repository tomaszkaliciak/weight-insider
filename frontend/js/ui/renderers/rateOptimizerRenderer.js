// js/ui/renderers/rateOptimizerRenderer.js
// Suggests optimal rate of change based on user's situation

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';

/**
 * Rate Optimizer:
 * - Suggest optimal rate based on current weight, history, and phase
 * - Consider body fat estimates if available
 * - Provide phase-appropriate recommendations
 */
export const RateOptimizerRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('rate-optimizer-content');
        if (!this._container) {
            console.warn('[RateOptimizerRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('PERIODIZATION')) {
                this._analyze();
            }
        });

        setTimeout(() => this._analyze(), 1450);
        console.log('[RateOptimizerRenderer] Initialized.');
    },

    _analyze() {
        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const processedData = Selectors.selectProcessedData(state);
        const phases = Selectors.selectPeriodizationPhases(state);

        if (!processedData || processedData.length < 14) {
            this._renderNoData();
            return;
        }

        const analysis = this._calculateOptimalRate(processedData, displayStats, phases);
        this._render(analysis);
    },

    _calculateOptimalRate(data, stats, phases) {
        // Get current weight
        const recentWeights = data.slice(-7).filter(d => d.value != null);
        const currentWeight = recentWeights.length > 0 ?
            recentWeights[recentWeights.length - 1].value : null;

        // Get body fat if available
        const recentBf = data.slice(-30).filter(d => d.bodyFat != null);
        const currentBf = recentBf.length > 0 ?
            recentBf[recentBf.length - 1].bodyFat : null;

        // Get current rate
        const currentRate = stats.latestWeeklyRate || 0;

        // Determine current phase
        let currentPhase = 'maintenance';
        if (currentRate > 0.15) currentPhase = 'bulk';
        else if (currentRate < -0.15) currentPhase = 'cut';

        // Historical performance
        const cutPhases = phases?.filter(p => p.type === 'cut') || [];
        const bulkPhases = phases?.filter(p => p.type === 'bulk') || [];

        const historicalCutRate = cutPhases.length > 0 ?
            cutPhases.reduce((s, p) => s + p.avgRate, 0) / cutPhases.length : -0.5;
        const historicalBulkRate = bulkPhases.length > 0 ?
            bulkPhases.reduce((s, p) => s + p.avgRate, 0) / bulkPhases.length : 0.25;

        // Calculate recommendations based on body fat (if available) or weight
        const recommendations = this._getRecommendations(currentWeight, currentBf, currentPhase, historicalCutRate, historicalBulkRate);

        // Compare current rate to optimal
        const optimalForPhase = currentPhase === 'cut' ? recommendations.cut :
            currentPhase === 'bulk' ? recommendations.bulk :
                recommendations.maintenance;

        const rateAssessment = this._assessRate(currentRate, optimalForPhase, currentPhase);

        return {
            currentWeight,
            currentBf,
            currentRate,
            currentPhase,
            recommendations,
            optimalForPhase,
            rateAssessment,
            historicalCutRate,
            historicalBulkRate,
            phaseDuration: this._getCurrentPhaseDuration(data)
        };
    },

    _getRecommendations(weight, bf, phase, histCut, histBulk) {
        // Standard recommendations
        let cutMin = -0.5, cutMax = -1.0, cutOptimal = -0.7;
        let bulkMin = 0.1, bulkMax = 0.3, bulkOptimal = 0.2;
        let maintMin = -0.1, maintMax = 0.1;

        // Adjust based on body fat if available
        if (bf !== null) {
            if (bf > 25) {
                // Higher BF - can cut more aggressively
                cutOptimal = -0.8;
                cutMax = -1.2;
            } else if (bf < 15) {
                // Lower BF - need slower cut
                cutOptimal = -0.4;
                cutMax = -0.6;
                // Also slower bulk to minimize fat gain
                bulkOptimal = 0.15;
                bulkMax = 0.2;
            }
        }

        // Adjust based on historical performance
        if (Math.abs(histCut) > 0.3) {
            cutOptimal = Math.max(cutOptimal, histCut * 0.85); // Slightly less aggressive than history
        }
        if (histBulk > 0.1) {
            bulkOptimal = Math.min(bulkOptimal, histBulk * 1.1); // Slightly more than history
        }

        // Calculate as percentage of body weight
        const cutPct = weight ? (cutOptimal / weight * 100) : null;
        const bulkPct = weight ? (bulkOptimal / weight * 100) : null;

        return {
            cut: {
                min: cutMin,
                max: cutMax,
                optimal: cutOptimal,
                pct: cutPct,
                reason: bf && bf > 25 ? 'Higher body fat allows faster loss' :
                    bf && bf < 15 ? 'Low body fat requires slower approach' :
                        'Standard recommendation'
            },
            bulk: {
                min: bulkMin,
                max: bulkMax,
                optimal: bulkOptimal,
                pct: bulkPct,
                reason: bf && bf < 15 ? 'Lean individuals should bulk slowly' :
                    'Moderate surplus for lean gains'
            },
            maintenance: {
                min: maintMin,
                max: maintMax,
                optimal: 0,
                reason: 'Weight stable within normal fluctuation'
            }
        };
    },

    _assessRate(current, optimal, phase) {
        if (phase === 'maintenance') {
            if (Math.abs(current) < 0.15) return { status: 'perfect', message: 'Weight is stable - perfect maintenance!', class: 'success' };
            if (current > 0.15) return { status: 'gaining', message: 'Trending upward - reduce calories if unintended', class: 'warning' };
            return { status: 'losing', message: 'Trending downward - increase calories if unintended', class: 'warning' };
        }

        if (phase === 'cut') {
            if (current > optimal.min) return { status: 'too_slow', message: 'Rate is slow - consider larger deficit', class: 'warning' };
            if (current < optimal.max) return { status: 'too_fast', message: 'Rate is aggressive - risk of muscle loss', class: 'danger' };
            if (current >= optimal.optimal * 0.8 && current <= optimal.optimal * 1.2) {
                return { status: 'optimal', message: 'Rate is in the optimal range!', class: 'success' };
            }
            return { status: 'good', message: 'Rate is acceptable', class: 'info' };
        }

        if (phase === 'bulk') {
            if (current < optimal.min) return { status: 'too_slow', message: 'Rate is slow - increase surplus', class: 'warning' };
            if (current > optimal.max) return { status: 'too_fast', message: 'Rate is aggressive - may gain excess fat', class: 'warning' };
            if (current >= optimal.optimal * 0.8 && current <= optimal.optimal * 1.2) {
                return { status: 'optimal', message: 'Perfect lean bulk rate!', class: 'success' };
            }
            return { status: 'good', message: 'Rate is acceptable', class: 'info' };
        }

        return { status: 'unknown', message: 'Unable to assess', class: 'neutral' };
    },

    _getCurrentPhaseDuration(data) {
        let duration = 0;
        let direction = null;

        for (let i = data.length - 1; i >= 0; i--) {
            const rate = data[i].smoothedWeeklyRate;
            if (rate == null) continue;

            const currentDir = rate > 0.15 ? 'bulk' : rate < -0.15 ? 'cut' : 'maint';
            if (direction === null) direction = currentDir;
            if (currentDir !== direction) break;
            duration++;
        }

        return duration;
    },

    _render(analysis) {
        if (!this._container) return;

        const phaseIcon = analysis.currentPhase === 'cut' ? '📉' :
            analysis.currentPhase === 'bulk' ? '📈' : '⚖️';

        this._container.innerHTML = `
      <div class="rate-optimizer-dashboard">
        <div class="current-section">
          <div class="current-header">
            <span class="phase-icon">${phaseIcon}</span>
            <span class="phase-name">${this._formatPhase(analysis.currentPhase)}</span>
            <span class="duration-badge">${analysis.phaseDuration} days</span>
          </div>
          
          <div class="current-rate-display">
            <div class="rate-value">${analysis.currentRate > 0 ? '+' : ''}${analysis.currentRate.toFixed(2)}</div>
            <div class="rate-unit">kg/week</div>
          </div>

          <div class="rate-assessment ${analysis.rateAssessment.class}">
            ${analysis.rateAssessment.message}
          </div>
        </div>

        <div class="optimal-section">
          <h4>🎯 Optimal Rates</h4>
          
          <div class="rate-cards">
            <div class="rate-card ${analysis.currentPhase === 'cut' ? 'active' : ''}">
              <div class="card-header">📉 Cutting</div>
              <div class="rate-range">
                <span class="optimal">${analysis.recommendations.cut.optimal.toFixed(2)}</span>
                <span class="range">kg/wk (${analysis.recommendations.cut.min} to ${analysis.recommendations.cut.max})</span>
              </div>
              <div class="rate-reason">${analysis.recommendations.cut.reason}</div>
            </div>
            
            <div class="rate-card ${analysis.currentPhase === 'bulk' ? 'active' : ''}">
              <div class="card-header">📈 Bulking</div>
              <div class="rate-range">
                <span class="optimal">+${analysis.recommendations.bulk.optimal.toFixed(2)}</span>
                <span class="range">kg/wk (${analysis.recommendations.bulk.min} to ${analysis.recommendations.bulk.max})</span>
              </div>
              <div class="rate-reason">${analysis.recommendations.bulk.reason}</div>
            </div>
          </div>
        </div>

        ${analysis.currentBf ? `
          <div class="bf-context">
            <span class="bf-icon">📊</span>
            Body fat estimate: <strong>${analysis.currentBf.toFixed(1)}%</strong> - recommendations adjusted accordingly
          </div>
        ` : ''}

        <div class="history-section">
          <h4>📊 Your Historical Rates</h4>
          <div class="history-stats">
            <div class="hist-stat">
              <span class="label">Avg Cut Rate</span>
              <span class="value">${analysis.historicalCutRate.toFixed(2)} kg/wk</span>
            </div>
            <div class="hist-stat">
              <span class="label">Avg Bulk Rate</span>
              <span class="value">+${analysis.historicalBulkRate.toFixed(2)} kg/wk</span>
            </div>
          </div>
        </div>

        <div class="tips-section">
          <h4>💡 Rate Guidelines</h4>
          <ul>
            <li><strong>Cutting:</strong> 0.5-1% of body weight per week is sustainable</li>
            <li><strong>Bulking:</strong> 0.25-0.5% per week minimizes fat gain</li>
            <li><strong>Lower body fat?</strong> Use slower rates to preserve muscle</li>
            <li><strong>Higher body fat?</strong> Faster rates are usually fine</li>
          </ul>
        </div>
      </div>
    `;
    },

    _formatPhase(phase) {
        switch (phase) {
            case 'cut': return 'Cutting Phase';
            case 'bulk': return 'Bulking Phase';
            case 'maintenance': return 'Maintenance';
            default: return 'Unknown';
        }
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more data</p>
        <small>At least 2 weeks required for rate analysis</small>
      </div>
    `;
    }
};
