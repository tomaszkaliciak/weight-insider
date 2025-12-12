// js/ui/renderers/tdeeAccuracyRenderer.js
// Compares logged calories vs Health Connect TDEE to show accuracy

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { CONFIG } from '../../config.js';

/**
 * TDEE Accuracy Dashboard:
 * - Compare logged calories vs Health Connect expenditure
 * - Calculate "true" TDEE from actual weight change
 * - Show accuracy metrics
 */
export const TdeeAccuracyRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('tdee-accuracy-content');
        if (!this._container) {
            console.warn('[TdeeAccuracyRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                this._analyze();
            }
        });

        setTimeout(() => this._analyze(), 1200);
        console.log('[TdeeAccuracyRenderer] Initialized.');
    },

    _analyze() {
        const state = StateManager.getState();
        const filteredData = Selectors.selectFilteredData(state);
        const displayStats = state.displayStats || {};

        if (!filteredData || filteredData.length < 14) {
            this._renderNoData();
            return;
        }

        const analysis = this._calculateAccuracy(filteredData, displayStats);
        this._render(analysis);
    },

    _calculateAccuracy(data, stats) {
        const KCALS_PER_KG = CONFIG.KCALS_PER_KG || 7700;

        // Get days with both calorie intake and Health Connect data
        const daysWithBoth = data.filter(d =>
            d.calorieIntake != null && d.googleFitExpenditure != null
        );

        const daysWithCalories = data.filter(d => d.calorieIntake != null);
        const daysWithTdee = data.filter(d => d.googleFitExpenditure != null);

        if (daysWithBoth.length < 7) {
            return { insufficient: true, reason: 'Need at least 7 days with both calorie and TDEE data' };
        }

        // Average logged calories
        const avgLoggedCalories = daysWithCalories.reduce((s, d) => s + d.calorieIntake, 0) / daysWithCalories.length;

        // Average Health Connect TDEE
        const avgHealthConnectTdee = daysWithTdee.reduce((s, d) => s + d.googleFitExpenditure, 0) / daysWithTdee.length;

        // Calculate "true" TDEE from actual weight change
        const weights = data.filter(d => d.value != null);
        const firstWeight = weights.length > 0 ? weights[0].value : null;
        const lastWeight = weights.length > 0 ? weights[weights.length - 1].value : null;
        const actualWeightChange = firstWeight && lastWeight ? lastWeight - firstWeight : null;

        // True TDEE = Avg Calories - (Weight Change in kg * KCALS_PER_KG / days)
        const daysSpan = (data[data.length - 1].date - data[0].date) / (1000 * 60 * 60 * 24);
        const dailyCalorieBalance = actualWeightChange != null ? (actualWeightChange * KCALS_PER_KG) / daysSpan : 0;
        const trueTdee = avgLoggedCalories - dailyCalorieBalance;

        // Accuracy of Health Connect TDEE
        const tdeeError = avgHealthConnectTdee - trueTdee;
        const tdeeAccuracyPct = trueTdee > 0 ? 100 - Math.abs(tdeeError / trueTdee * 100) : null;

        // Daily comparison
        const dailyDiffs = daysWithBoth.map(d => ({
            date: d.date,
            logged: d.calorieIntake,
            healthConnect: d.googleFitExpenditure,
            diff: d.calorieIntake - d.googleFitExpenditure
        }));

        const avgDailyDiff = dailyDiffs.reduce((s, d) => s + d.diff, 0) / dailyDiffs.length;

        return {
            insufficient: false,
            avgLoggedCalories: Math.round(avgLoggedCalories),
            avgHealthConnectTdee: Math.round(avgHealthConnectTdee),
            trueTdee: Math.round(trueTdee),
            tdeeError: Math.round(tdeeError),
            tdeeAccuracy: tdeeAccuracyPct,
            avgDailyDiff: Math.round(avgDailyDiff),
            daysAnalyzed: daysWithBoth.length,
            actualWeightChange,
            daysSpan: Math.round(daysSpan),
            isDeficit: avgDailyDiff < 0,
            isSurplus: avgDailyDiff > 0
        };
    },

    _render(analysis) {
        if (!this._container) return;

        if (analysis.insufficient) {
            this._container.innerHTML = `
        <div class="empty-state-message">
          <p>${analysis.reason || 'Insufficient data'}</p>
        </div>
      `;
            return;
        }

        const diffClass = analysis.avgDailyDiff > 100 ? 'surplus' :
            analysis.avgDailyDiff < -100 ? 'deficit' : 'balanced';
        const tdeeAccuracyClass = analysis.tdeeAccuracy >= 95 ? 'excellent' :
            analysis.tdeeAccuracy >= 90 ? 'good' :
                analysis.tdeeAccuracy >= 80 ? 'moderate' : 'poor';

        this._container.innerHTML = `
      <div class="tdee-dashboard">
        <div class="tdee-main-stats">
          <div class="tdee-stat-card">
            <div class="stat-icon">🍽️</div>
            <div class="stat-label">Avg Logged</div>
            <div class="stat-value">${analysis.avgLoggedCalories}</div>
            <div class="stat-unit">kcal/day</div>
          </div>
          <div class="tdee-stat-card">
            <div class="stat-icon">⌚</div>
            <div class="stat-label">Health Connect</div>
            <div class="stat-value">${analysis.avgHealthConnectTdee}</div>
            <div class="stat-unit">kcal/day</div>
          </div>
          <div class="tdee-stat-card highlight">
            <div class="stat-icon">🎯</div>
            <div class="stat-label">True TDEE</div>
            <div class="stat-value">${analysis.trueTdee}</div>
            <div class="stat-unit">from weight change</div>
          </div>
        </div>

        <div class="tdee-analysis">
          <div class="analysis-card ${diffClass}">
            <div class="analysis-title">Daily Balance</div>
            <div class="analysis-value">${analysis.avgDailyDiff > 0 ? '+' : ''}${analysis.avgDailyDiff} kcal</div>
            <div class="analysis-desc">
              ${analysis.isDeficit ? '📉 In a calorie deficit' :
                analysis.isSurplus ? '📈 In a calorie surplus' : '⚖️ Near maintenance'}
            </div>
          </div>
          <div class="analysis-card ${tdeeAccuracyClass}">
            <div class="analysis-title">Device Accuracy</div>
            <div class="analysis-value">${analysis.tdeeAccuracy?.toFixed(0) || 'N/A'}%</div>
            <div class="analysis-desc">
              ${analysis.tdeeError > 0 ? `Overestimates by ~${analysis.tdeeError} kcal` :
                analysis.tdeeError < 0 ? `Underestimates by ~${Math.abs(analysis.tdeeError)} kcal` :
                    'Highly accurate'}
            </div>
          </div>
        </div>

        <div class="tdee-details">
          <div class="detail-row">
            <span class="detail-label">Days Analyzed</span>
            <span class="detail-value">${analysis.daysAnalyzed} days</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Weight Change</span>
            <span class="detail-value">${analysis.actualWeightChange?.toFixed(2) || 'N/A'} kg over ${analysis.daysSpan} days</span>
          </div>
        </div>

        <div class="tdee-tip">
          💡 <strong>Tip:</strong> Your "True TDEE" is calculated from actual weight results and is more accurate than device estimates. 
          Use ${analysis.trueTdee} kcal as your maintenance baseline.
        </div>
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more data</p>
        <small>Requires at least 2 weeks with calorie and Health Connect data</small>
      </div>
    `;
    }
};
