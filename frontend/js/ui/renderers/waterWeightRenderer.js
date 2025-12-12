// js/ui/renderers/waterWeightRenderer.js
// Detects and predicts water weight fluctuations

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';

/**
 * Water Weight Predictor:
 * - Detect likely water weight fluctuations
 * - Analyze calorie swings and patterns
 * - Predict when water weight might drop
 */
export const WaterWeightRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('water-weight-content');
        if (!this._container) {
            console.warn('[WaterWeightRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('FILTERED_DATA') ||
                stateChanges.action.type.includes('DISPLAY_STATS')) {
                this._analyze();
            }
        });

        setTimeout(() => this._analyze(), 1350);
        console.log('[WaterWeightRenderer] Initialized.');
    },

    _analyze() {
        const state = StateManager.getState();
        const filteredData = Selectors.selectFilteredData(state);

        if (!filteredData || filteredData.length < 7) {
            this._renderNoData();
            return;
        }

        const analysis = this._detectWaterWeight(filteredData);
        this._render(analysis);
    },

    _detectWaterWeight(data) {
        const recent = data.slice(-14);
        const patterns = [];

        // Calculate baseline volatility
        const weights = recent.filter(d => d.value != null).map(d => d.value);
        const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
        const volatility = Math.sqrt(
            weights.reduce((sum, w) => sum + Math.pow(w - avgWeight, 2), 0) / weights.length
        );

        // Detect calorie spikes (potential water retention trigger)
        const withCalories = data.filter(d => d.calorieIntake != null);
        const avgCalories = withCalories.length > 0 ?
            withCalories.reduce((s, d) => s + d.calorieIntake, 0) / withCalories.length : 2000;

        // Look for high calorie days followed by weight spike
        let refeedDetected = false;
        let recentSpike = null;

        for (let i = 1; i < recent.length; i++) {
            const prev = recent[i - 1];
            const curr = recent[i];

            // High carb/calorie day
            if (prev.calorieIntake != null && prev.calorieIntake > avgCalories * 1.3) {
                // Followed by weight jump
                if (curr.value != null && prev.value != null) {
                    const jump = curr.value - prev.value;
                    if (jump > volatility * 1.5) {
                        refeedDetected = true;
                        recentSpike = {
                            date: curr.date,
                            amount: jump,
                            trigger: 'High calorie day',
                            calorieExcess: prev.calorieIntake - avgCalories
                        };
                    }
                }
            }
        }

        // Look for deficit followed by sudden drop (woosh effect)
        let wooshPotential = false;
        let daysInDeficit = 0;

        for (let i = recent.length - 1; i >= Math.max(0, recent.length - 7); i--) {
            const d = recent[i];
            if (d.calorieIntake != null && d.googleFitExpenditure != null) {
                if (d.calorieIntake < d.googleFitExpenditure - 200) {
                    daysInDeficit++;
                }
            }
        }

        if (daysInDeficit >= 5) {
            wooshPotential = true;
        }

        // Calculate expected vs actual based on calorie balance
        const last7 = recent.slice(-7);
        let totalDeficit = 0;
        let daysWithData = 0;

        last7.forEach(d => {
            if (d.calorieIntake != null && d.googleFitExpenditure != null) {
                totalDeficit += d.googleFitExpenditure - d.calorieIntake;
                daysWithData++;
            }
        });

        const expectedWeeklyChange = daysWithData > 0 ? -totalDeficit / 7700 * (7 / daysWithData) : 0;
        const actualWeeklyChange = last7.length >= 2 && last7[0].value != null && last7[last7.length - 1].value != null ?
            last7[last7.length - 1].value - last7[0].value : null;

        let waterRetention = 0;
        if (actualWeeklyChange != null && expectedWeeklyChange < 0) {
            waterRetention = actualWeeklyChange - expectedWeeklyChange;
        }

        // Day of week patterns
        const dayOfWeekVolatility = this._analyzeDayOfWeekPatterns(data);

        return {
            currentStatus: this._getWaterStatus(waterRetention, wooshPotential, refeedDetected),
            waterRetention: Math.abs(waterRetention),
            isRetaining: waterRetention > 0.2,
            wooshPotential,
            daysInDeficit,
            refeedDetected,
            recentSpike,
            volatility,
            expectedChange: expectedWeeklyChange,
            actualChange: actualWeeklyChange,
            dayOfWeekVolatility,
            tips: this._generateTips(wooshPotential, refeedDetected, waterRetention)
        };
    },

    _getWaterStatus(retention, woosh, refeed) {
        if (retention > 0.5) return { icon: '💧', text: 'Likely Retaining Water', class: 'warning' };
        if (woosh) return { icon: '⚡', text: 'Woosh Effect Possible', class: 'positive' };
        if (refeed) return { icon: '🍔', text: 'Post-Refeed Bloat', class: 'info' };
        return { icon: '✅', text: 'Normal Fluctuation', class: 'normal' };
    },

    _analyzeDayOfWeekPatterns(data) {
        const byDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

        for (let i = 1; i < data.length; i++) {
            const d = data[i];
            const prev = data[i - 1];
            if (d.value != null && prev.value != null) {
                const change = d.value - prev.value;
                byDay[d.date.getDay()].push(change);
            }
        }

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const result = {};

        for (let i = 0; i < 7; i++) {
            const changes = byDay[i];
            if (changes.length >= 3) {
                result[dayNames[i]] = {
                    avg: changes.reduce((a, b) => a + b, 0) / changes.length,
                    count: changes.length
                };
            }
        }

        return result;
    },

    _generateTips(woosh, refeed, retention) {
        const tips = [];

        if (retention > 0.3) {
            tips.push({ icon: '💧', tip: 'Check sodium intake - high salt causes water retention' });
            tips.push({ icon: '😴', tip: 'Poor sleep increases cortisol and water retention' });
        }

        if (woosh) {
            tips.push({ icon: '⏰', tip: 'A "woosh" drop may come soon - stay consistent!' });
            tips.push({ icon: '🍺', tip: 'A small carb refeed or alcohol can trigger a woosh' });
        }

        if (refeed) {
            tips.push({ icon: '⏳', tip: 'Post-refeed water weight typically drops in 2-4 days' });
        }

        if (tips.length === 0) {
            tips.push({ icon: '👍', tip: 'Weight is tracking normally with expected fluctuations' });
        }

        return tips;
    },

    _render(analysis) {
        if (!this._container) return;

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        this._container.innerHTML = `
      <div class="water-weight-dashboard">
        <div class="status-banner ${analysis.currentStatus.class}">
          <span class="status-icon">${analysis.currentStatus.icon}</span>
          <span class="status-text">${analysis.currentStatus.text}</span>
        </div>

        <div class="water-stats">
          <div class="stat-card">
            <div class="stat-label">Expected Change</div>
            <div class="stat-value">${analysis.expectedChange > 0 ? '+' : ''}${analysis.expectedChange.toFixed(2)} kg</div>
            <div class="stat-note">from calorie balance</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Actual Change</div>
            <div class="stat-value">${analysis.actualChange != null ? (analysis.actualChange > 0 ? '+' : '') + analysis.actualChange.toFixed(2) : 'N/A'} kg</div>
            <div class="stat-note">last 7 days</div>
          </div>
          <div class="stat-card ${analysis.isRetaining ? 'warning' : ''}">
            <div class="stat-label">Water Estimate</div>
            <div class="stat-value">${analysis.isRetaining ? '+' : ''}${analysis.waterRetention.toFixed(1)} kg</div>
            <div class="stat-note">${analysis.isRetaining ? 'likely retained' : 'normal range'}</div>
          </div>
        </div>

        ${analysis.wooshPotential ? `
          <div class="woosh-alert">
            <span class="alert-icon">⚡</span>
            <div class="alert-content">
              <strong>Woosh Effect Incoming?</strong>
              <p>You've been in deficit for ${analysis.daysInDeficit} days. Water weight often drops suddenly after sustained deficits.</p>
            </div>
          </div>
        ` : ''}

        ${analysis.recentSpike ? `
          <div class="spike-info">
            <span class="spike-icon">📊</span>
            <div class="spike-content">
              <strong>Recent Spike Detected</strong>
              <p>+${analysis.recentSpike.amount.toFixed(1)} kg after ~${Math.round(analysis.recentSpike.calorieExcess)} kcal excess</p>
            </div>
          </div>
        ` : ''}

        ${Object.keys(analysis.dayOfWeekVolatility).length > 0 ? `
          <div class="day-patterns">
            <h4>📅 Typical Day-to-Day Changes</h4>
            <div class="day-pattern-grid">
              ${dayNames.map(day => {
            const data = analysis.dayOfWeekVolatility[day];
            if (!data) return `<div class="day-box no-data"><span class="day-name">${day}</span><span class="day-change">-</span></div>`;
            const cls = data.avg > 0.1 ? 'up' : data.avg < -0.1 ? 'down' : 'neutral';
            return `
                  <div class="day-box ${cls}">
                    <span class="day-name">${day}</span>
                    <span class="day-change">${data.avg > 0 ? '+' : ''}${data.avg.toFixed(2)}</span>
                  </div>
                `;
        }).join('')}
            </div>
          </div>
        ` : ''}

        <div class="tips-section">
          <h4>💡 Tips</h4>
          ${analysis.tips.map(t => `
            <div class="tip-item">
              <span class="tip-icon">${t.icon}</span>
              <span class="tip-text">${t.tip}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more data</p>
        <small>At least 1 week required for water weight analysis</small>
      </div>
    `;
    }
};
