// js/ui/renderers/waterWeightRenderer.js
// Detects and predicts water weight fluctuations, scale noise decomposition,
// and provides Scale Noise Shield alerts when scale weight spikes.

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { UnitFormatter } from '../../core/unitFormatter.js';

export const WaterWeightRenderer = {
  _container: null,

  init() {
    this._container = document.getElementById('water-weight-content');
    if (!this._container) {
      console.warn('[WaterWeightRenderer] Container not found.');
      return;
    }

    StateManager.subscribeToSpecificEvent('state:filteredDataChanged', () => this._analyze());
    StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', () => this._analyze());
    StateManager.subscribeToSpecificEvent('state:settingsChanged', () => this._analyze());

    setTimeout(() => this._analyze(), 1350);
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

    // Calculate baseline volatility
    const weights = recent.filter(d => d.value != null).map(d => d.value);
    const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 70;
    const volatility = Math.sqrt(
      weights.reduce((sum, w) => sum + Math.pow(w - avgWeight, 2), 0) / (weights.length || 1)
    );

    // Detect calorie spikes (potential water retention trigger)
    const withCalories = data.filter(d => d.calorieIntake != null);
    const avgCalories = withCalories.length > 0 ?
      withCalories.reduce((s, d) => s + d.calorieIntake, 0) / withCalories.length : 2000;

    let refeedDetected = false;
    let recentSpike = null;
    let noiseShieldAlert = null;

    // Check latest 2 days for Scale Noise Shield
    const validWeights = recent.filter(d => d.value != null);
    if (validWeights.length >= 2) {
      const prev = validWeights[validWeights.length - 2];
      const curr = validWeights[validWeights.length - 1];
      const jumpKg = curr.value - prev.value;

      if (jumpKg >= 0.35) { // ~0.8 lbs spike
        const prevExpenditure = prev.googleFitExpenditure || prev.adaptiveTDEE || 2200;
        const prevIntake = prev.calorieIntake || avgCalories;
        const netDeficitSurplus = prevIntake - prevExpenditure;
        const fatChangeKg = netDeficitSurplus / 7700;
        const fluidRetentionKg = Math.max(0, jumpKg - fatChangeKg);
        const waterPct = Math.min(98, Math.max(75, Math.round((fluidRetentionKg / jumpKg) * 100)));

        noiseShieldAlert = {
          jumpFormatted: UnitFormatter.formatWeightDiff(jumpKg, 1, true),
          waterPercent: waterPct,
          estimatedFatFormatted: UnitFormatter.formatWeightDiff(fatChangeKg, 2, true),
          fluidAmountFormatted: UnitFormatter.formatWeight(fluidRetentionKg, 1, true),
        };
      }
    }

    // Look for high calorie days followed by weight spike
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];

      if (prev.calorieIntake != null && prev.calorieIntake > avgCalories * 1.25) {
        if (curr.value != null && prev.value != null) {
          const jump = curr.value - prev.value;
          if (jump > volatility * 1.3) {
            refeedDetected = true;
            recentSpike = {
              date: curr.date,
              amountKg: jump,
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
      if (d.calorieIntake != null && (d.googleFitExpenditure || d.adaptiveTDEE)) {
        const exp = d.googleFitExpenditure || d.adaptiveTDEE;
        if (d.calorieIntake < exp - 200) {
          daysInDeficit++;
        }
      }
    }

    if (daysInDeficit >= 5) wooshPotential = true;

    // Calculate expected vs actual based on calorie balance
    const last7 = recent.slice(-7);
    let totalDeficit = 0;
    let daysWithData = 0;

    last7.forEach(d => {
      const exp = d.googleFitExpenditure || d.adaptiveTDEE;
      if (d.calorieIntake != null && exp != null) {
        totalDeficit += exp - d.calorieIntake;
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

    const dayOfWeekVolatility = this._analyzeDayOfWeekPatterns(data);

    return {
      currentStatus: this._getWaterStatus(waterRetention, wooshPotential, refeedDetected),
      waterRetentionKg: Math.abs(waterRetention),
      isRetaining: waterRetention > 0.2,
      wooshPotential,
      daysInDeficit,
      refeedDetected,
      recentSpike,
      noiseShieldAlert,
      volatility,
      expectedChangeKg: expectedWeeklyChange,
      actualChangeKg: actualWeeklyChange,
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
          avgKg: changes.reduce((a, b) => a + b, 0) / changes.length,
          count: changes.length
        };
      }
    }

    return result;
  },

  _generateTips(woosh, refeed, retention) {
    const tips = [];

    if (retention > 0.3) {
      tips.push({ icon: '💧', tip: 'Check sodium intake - high salt causes temporary fluid retention' });
      tips.push({ icon: '😴', tip: 'Poor sleep increases cortisol and water retention' });
    }

    if (woosh) {
      tips.push({ icon: '⏰', tip: 'A "woosh" drop may come soon - stay consistent!' });
    }

    if (refeed) {
      tips.push({ icon: '⏳', tip: 'Post-refeed water weight typically flushes in 2-4 days' });
    }

    if (tips.length === 0) {
      tips.push({ icon: '👍', tip: 'Weight is tracking normally within expected fluctuation bounds' });
    }

    return tips;
  },

  _render(analysis) {
    if (!this._container) return;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const unitLabel = UnitFormatter.getUnitLabel().toUpperCase();

    const expectedStr = UnitFormatter.formatWeightDiff(analysis.expectedChangeKg, 2);
    const actualStr = analysis.actualChangeKg != null ? UnitFormatter.formatWeightDiff(analysis.actualChangeKg, 2) : 'N/A';
    const retentionStr = UnitFormatter.formatWeight(analysis.waterRetentionKg, 1);

    this._container.innerHTML = `
      <div class="water-weight-dashboard">
        <div class="status-banner ${analysis.currentStatus.class}">
          <span class="status-icon">${analysis.currentStatus.icon}</span>
          <span class="status-text">${analysis.currentStatus.text}</span>
        </div>

        ${analysis.noiseShieldAlert ? `
          <div class="woosh-alert" style="background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3);">
            <span class="alert-icon">🛡️</span>
            <div class="alert-content">
              <strong>Scale Noise Shield</strong>
              <p>Recent scale increase of <strong>${analysis.noiseShieldAlert.jumpFormatted}</strong> is <strong>${analysis.noiseShieldAlert.waterPercent}% fluid retention</strong> (${analysis.noiseShieldAlert.fluidAmountFormatted}). Estimated true fat change: ${analysis.noiseShieldAlert.estimatedFatFormatted}.</p>
            </div>
          </div>
        ` : ''}

        <div class="water-stats">
          <div class="stat-card">
            <div class="stat-label">Expected Δ</div>
            <div class="stat-value">${expectedStr}</div>
            <div class="stat-note">${unitLabel} FROM BALANCE</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Actual Δ</div>
            <div class="stat-value">${actualStr}</div>
            <div class="stat-note">${unitLabel} LAST 7 DAYS</div>
          </div>
          <div class="stat-card ${analysis.isRetaining ? 'warning' : ''}">
            <div class="stat-label">Water Est.</div>
            <div class="stat-value">${analysis.isRetaining ? '+' : ''}${retentionStr}</div>
            <div class="stat-note">${analysis.isRetaining ? 'LIKELY RETAINED' : 'NORMAL RANGE'}</div>
          </div>
        </div>

        ${analysis.wooshPotential ? `
          <div class="woosh-alert">
            <span class="alert-icon">⚡</span>
            <div class="alert-content">
              <strong>Woosh Effect Potential</strong>
              <p>You've been in a consistent deficit for ${analysis.daysInDeficit} days. Stay patient; a sudden drop in water weight often follows sustained discipline.</p>
            </div>
          </div>
        ` : ''}

        ${analysis.recentSpike ? `
          <div class="spike-info">
            <span class="spike-icon">📊</span>
            <div class="spike-content">
              <strong>Post-Feeding Spike</strong>
              <p>Weight jumped by ${UnitFormatter.formatWeight(analysis.recentSpike.amountKg, 1, true)} after a ~${Math.round(analysis.recentSpike.calorieExcess)} kcal surplus. This is typical glycogen and water restoration.</p>
            </div>
          </div>
        ` : ''}

        ${Object.keys(analysis.dayOfWeekVolatility).length > 0 ? `
          <div class="day-patterns">
            <h4>📅 Weekly Volatility Patterns</h4>
            <div class="day-pattern-grid">
              ${dayNames.map(day => {
                const d = analysis.dayOfWeekVolatility[day];
                if (!d) return `<div class="day-box no-data"><span class="day-name">${day}</span><span class="day-change">-</span></div>`;
                const changeVal = UnitFormatter.convert(d.avgKg);
                const cls = changeVal > 0.3 ? 'up' : changeVal < -0.3 ? 'down' : 'neutral';
                const sign = changeVal > 0 ? '+' : '';
                return `
                  <div class="day-box ${cls}">
                    <span class="day-name">${day}</span>
                    <span class="day-change">${sign}${changeVal.toFixed(2)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <div class="tips-section">
          <h4>💡 Personalized Insights</h4>
          <div class="tip-list">
            ${analysis.tips.map(t => `
              <div class="tip-item">
                <span class="tip-icon">${t.icon}</span>
                <span class="tip-text">${t.tip}</span>
              </div>
            `).join('')}
          </div>
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
