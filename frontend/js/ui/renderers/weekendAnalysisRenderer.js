// js/ui/renderers/weekendAnalysisRenderer.js
// Analyzes weekend vs weekday patterns in weight, calories, and behaviors

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/**
 * Compares weekend (Sat-Sun) vs weekday (Mon-Fri) patterns:
 * - Average calorie intake
 * - Weight fluctuation patterns
 * - Training frequency
 */
export const WeekendAnalysisRenderer = {
  _container: null,

  init() {
    this._container = document.getElementById('weekend-analysis-content');
    if (!this._container) {
      console.warn('[WeekendAnalysisRenderer] Container not found.');
      return;
    }

    StateManager.subscribe((stateChanges) => {
      if (stateChanges.action.type.includes('FILTERED_DATA') ||
        stateChanges.action.type.includes('PROCESSED_DATA')) {
        this._analyze();
      }
    });

    setTimeout(() => this._analyze(), 800);
    console.log('[WeekendAnalysisRenderer] Initialized.');
  },

  _analyze() {
    const state = StateManager.getState();
    const filteredData = Selectors.selectFilteredData(state);

    if (!filteredData || filteredData.length < 14) {
      this._renderNoData();
      return;
    }

    const analysis = this._calculatePatterns(filteredData);
    this._render(analysis);
  },

  _calculatePatterns(data) {
    const weekdays = { calories: [], weights: [], changes: [], days: 0 };
    const weekends = { calories: [], weights: [], changes: [], days: 0 };

    data.forEach((d, i) => {
      const dayOfWeek = d.date.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const bucket = isWeekend ? weekends : weekdays;

      bucket.days++;
      if (d.calorieIntake != null) bucket.calories.push(d.calorieIntake);
      if (d.value != null) bucket.weights.push(d.value);

      // Calculate day-to-day change
      if (i > 0 && d.value != null && data[i - 1].value != null) {
        bucket.changes.push(d.value - data[i - 1].value);
      }
    });

    const mean = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const stdDev = arr => {
      if (arr.length < 2) return null;
      const m = mean(arr);
      return Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length);
    };

    return {
      weekday: {
        avgCalories: mean(weekdays.calories),
        avgChange: mean(weekdays.changes),
        volatility: stdDev(weekdays.changes),
        daysAnalyzed: weekdays.days
      },
      weekend: {
        avgCalories: mean(weekends.calories),
        avgChange: mean(weekends.changes),
        volatility: stdDev(weekends.changes),
        daysAnalyzed: weekends.days
      },
      calorieDiff: mean(weekends.calories) != null && mean(weekdays.calories) != null
        ? mean(weekends.calories) - mean(weekdays.calories) : null,
      weeklyWeekendImpact: mean(weekends.calories) != null && mean(weekdays.calories) != null
        ? ((mean(weekends.calories) - mean(weekdays.calories)) * 2) / 7 : null // Avg daily impact spread over week
    };
  },

  _render(analysis) {
    if (!this._container) return;

    const formatVal = (v, dec = 0, suffix = '') => v != null ? `${v.toFixed(dec)}${suffix}` : 'N/A';
    const formatDiff = (v, dec = 0, suffix = '') => {
      if (v == null) return 'N/A';
      const sign = v > 0 ? '+' : '';
      const cls = v > 50 ? 'warning' : v < -50 ? 'good' : 'neutral';
      return `<span class="${cls}">${sign}${v.toFixed(dec)}${suffix}</span>`;
    };

    const weekendDamage = analysis.calorieDiff != null
      ? (analysis.calorieDiff * 2 / 7700 * 7).toFixed(2) // kg/week impact
      : null;

    this._container.innerHTML = `
      <div class="weekend-analysis-grid">
        <div class="analysis-column">
          <h4 class="column-title">📅 Weekdays (Mon-Fri)</h4>
          <div class="stat-row">
            <span class="stat-label">Average Intake</span>
            <span class="stat-value">${formatVal(analysis.weekday.avgCalories, 0, ' kcal')}</span>
          </div>
          <div class="stat-row" title="Average weight change per day during the week">
            <span class="stat-label">Avg Daily Δ</span>
            <span class="stat-value">${formatVal(analysis.weekday.avgChange, 2, ' kg')}</span>
          </div>
          <div class="stat-row" title="Typical daily fluctuation (standard deviation)">
            <span class="stat-label">Typical Bounce</span>
            <span class="stat-value">±${formatVal(analysis.weekday.volatility, 2, ' kg')}</span>
          </div>
        </div>
        
        <div class="analysis-column">
          <h4 class="column-title">🎉 Weekends (Sat-Sun)</h4>
          <div class="stat-row">
            <span class="stat-label">Average Intake</span>
            <span class="stat-value">${formatVal(analysis.weekend.avgCalories, 0, ' kcal')}</span>
          </div>
          <div class="stat-row" title="Average weight change per day during the weekend">
            <span class="stat-label">Avg Daily Δ</span>
            <span class="stat-value">${formatVal(analysis.weekend.avgChange, 2, ' kg')}</span>
          </div>
          <div class="stat-row" title="Typical daily fluctuation (standard deviation)">
            <span class="stat-label">Typical Bounce</span>
            <span class="stat-value">±${formatVal(analysis.weekend.volatility, 2, ' kg')}</span>
          </div>
        </div>
      </div>
      
      <div class="weekend-summary">
        <div class="summary-card ${analysis.calorieDiff > 200 ? 'warning' : analysis.calorieDiff < -100 ? 'good' : ''}">
          <div class="summary-title">Weekend Calorie Impact</div>
          <div class="summary-value">${formatDiff(analysis.calorieDiff, 0, ' kcal / day')}</div>
          <div class="summary-note">
            ${analysis.calorieDiff > 200
        ? `⚠️ Higher weekend intake slows progress by ~${weekendDamage} kg / week.`
        : analysis.calorieDiff < -100
          ? '✅ Exceptional discipline! You stay tighter on weekends.'
          : '👍 Consistent intake maintained throughout the entire week.'
      }
          </div>
        </div>
        
        ${analysis.calorieDiff > 300 ? `
          <div class="suggestion-box">
            <strong>💡 Optimization Tip:</strong> Since your weekend intake is significantly higher, consider creating a ${Math.round(analysis.calorieDiff * 2 / 5)} kcal "buffer" on weekdays. This keeps your weekly average on track while allowing for more flexibility.
          </div>
        ` : ''}
      </div>
    `;
  },

  _renderNoData() {
    if (!this._container) return;
    this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Not enough data</p>
        <small>Need at least 2 weeks of data for analysis</small>
      </div>
    `;
  }
};
