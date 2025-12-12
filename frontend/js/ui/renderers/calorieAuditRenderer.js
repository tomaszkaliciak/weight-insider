// js/ui/renderers/calorieAuditRenderer.js
// Audits calorie logging accuracy by comparing expected vs actual weight change

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

/**
 * Compares expected weight change (from logged calories) vs actual weight change:
 * - Identifies logging accuracy
 * - Shows TDEE estimation accuracy
 * - Highlights discrepancies
 */
export const CalorieAuditRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('calorie-audit-content');
        if (!this._container) {
            console.warn('[CalorieAuditRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                this._audit();
            }
        });

        setTimeout(() => this._audit(), 950);
        console.log('[CalorieAuditRenderer] Initialized.');
    },

    _audit() {
        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const filteredData = Selectors.selectFilteredData(state);

        if (!filteredData || filteredData.length < 14) {
            this._renderNoData();
            return;
        }

        const audit = this._performAudit(filteredData, displayStats);
        this._render(audit);
    },

    _performAudit(data, stats) {
        const KCALS_PER_KG = CONFIG.KCALS_PER_KG || 7700;

        // Get data points with both calories and weight
        const validDays = data.filter(d => d.calorieIntake != null && d.value != null);

        if (validDays.length < 7) {
            return { insufficient: true };
        }

        // Get estimated TDEE (use adaptive or trend-based)
        const estimatedTDEE = stats.adaptiveTDEE || stats.trendTDEE || stats.avgTDEE || 2500;

        // Calculate expected vs actual
        const totalCaloriesLogged = validDays.reduce((sum, d) => sum + d.calorieIntake, 0);
        const totalDeficit = (estimatedTDEE * validDays.length) - totalCaloriesLogged;
        const expectedWeightChange = -totalDeficit / KCALS_PER_KG; // Negative deficit = weight gain

        // Actual weight change
        const firstWeight = validDays[0].value;
        const lastWeight = validDays[validDays.length - 1].value;
        const actualWeightChange = lastWeight - firstWeight;

        // Discrepancy
        const discrepancy = actualWeightChange - expectedWeightChange;
        const dailyDiscrepancy = (discrepancy * KCALS_PER_KG) / validDays.length;

        // Accuracy score (100% = perfect match)
        const accuracy = expectedWeightChange !== 0
            ? Math.max(0, 100 - Math.abs(discrepancy / Math.abs(expectedWeightChange)) * 100)
            : (Math.abs(actualWeightChange) < 0.5 ? 100 : 50);

        // Possible explanations
        const explanations = [];
        if (dailyDiscrepancy > 200) {
            explanations.push('Underreporting calories (common with snacks, sauces, drinks)');
            explanations.push('TDEE estimate may be too high');
        } else if (dailyDiscrepancy < -200) {
            explanations.push('Overreporting calories');
            explanations.push('TDEE estimate may be too low');
            explanations.push('Increased water retention or muscle gain');
        }

        // Weekly breakdown
        const weeklyData = this._calculateWeeklyBreakdown(validDays, estimatedTDEE, KCALS_PER_KG);

        return {
            insufficient: false,
            daysAnalyzed: validDays.length,
            estimatedTDEE,
            avgCalories: totalCaloriesLogged / validDays.length,
            expectedWeightChange,
            actualWeightChange,
            discrepancy,
            dailyDiscrepancy,
            accuracy,
            explanations,
            weeklyData
        };
    },

    _calculateWeeklyBreakdown(data, tdee, kcalsPerKg) {
        const weeks = [];
        let weekData = [];
        let currentWeek = null;

        data.forEach(d => {
            const weekNum = Utils.getWeekNumber ? Utils.getWeekNumber(d.date) :
                Math.floor((d.date - new Date(d.date.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));

            if (currentWeek !== weekNum && weekData.length > 0) {
                weeks.push(this._analyzeWeek(weekData, tdee, kcalsPerKg));
                weekData = [];
            }
            currentWeek = weekNum;
            weekData.push(d);
        });

        if (weekData.length > 0) {
            weeks.push(this._analyzeWeek(weekData, tdee, kcalsPerKg));
        }

        return weeks.slice(-4); // Last 4 weeks
    },

    _analyzeWeek(weekData, tdee, kcalsPerKg) {
        const avgCalories = weekData.reduce((s, d) => s + d.calorieIntake, 0) / weekData.length;
        const expectedChange = ((avgCalories - tdee) * weekData.length) / kcalsPerKg;
        const actualChange = weekData.length >= 2
            ? weekData[weekData.length - 1].value - weekData[0].value
            : 0;

        return {
            startDate: weekData[0].date,
            days: weekData.length,
            avgCalories,
            expectedChange,
            actualChange,
            discrepancy: actualChange - expectedChange
        };
    },

    _render(audit) {
        if (!this._container) return;

        if (audit.insufficient) {
            this._renderNoData();
            return;
        }

        const accuracyClass = audit.accuracy >= 80 ? 'excellent' :
            audit.accuracy >= 60 ? 'good' :
                audit.accuracy >= 40 ? 'moderate' : 'poor';

        const formatChange = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} kg`;
        const formatCal = (v) => `${v > 0 ? '+' : ''}${Math.round(v)} kcal/day`;

        this._container.innerHTML = `
      <div class="calorie-audit">
        <div class="audit-summary">
          <div class="accuracy-meter ${accuracyClass}">
            <div class="accuracy-circle">
              <span class="accuracy-value">${audit.accuracy.toFixed(0)}%</span>
              <span class="accuracy-label">Accuracy</span>
            </div>
          </div>
          
          <div class="audit-comparison">
            <div class="comparison-row">
              <span class="comparison-label">Expected Change</span>
              <span class="comparison-value">${formatChange(audit.expectedWeightChange)}</span>
            </div>
            <div class="comparison-row">
              <span class="comparison-label">Actual Change</span>
              <span class="comparison-value">${formatChange(audit.actualWeightChange)}</span>
            </div>
            <div class="comparison-row highlight">
              <span class="comparison-label">Discrepancy</span>
              <span class="comparison-value ${audit.discrepancy > 0 ? 'negative' : 'positive'}">${formatChange(audit.discrepancy)}</span>
            </div>
            <div class="comparison-row small">
              <span class="comparison-label">Daily Cal Difference</span>
              <span class="comparison-value">${formatCal(audit.dailyDiscrepancy)}</span>
            </div>
          </div>
        </div>

        <div class="audit-details">
          <div class="detail-item">
            <span class="detail-label">Days Analyzed</span>
            <span class="detail-value">${audit.daysAnalyzed}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Est. TDEE Used</span>
            <span class="detail-value">${Math.round(audit.estimatedTDEE)} kcal</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Avg Logged</span>
            <span class="detail-value">${Math.round(audit.avgCalories)} kcal</span>
          </div>
        </div>

        ${audit.explanations.length > 0 ? `
          <div class="audit-explanations">
            <div class="explanations-title">🔍 Possible Reasons:</div>
            <ul class="explanations-list">
              ${audit.explanations.map(e => `<li>${e}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        ${audit.weeklyData.length > 0 ? `
          <div class="weekly-breakdown">
            <div class="breakdown-title">📅 Weekly Breakdown</div>
            <div class="breakdown-table">
              ${audit.weeklyData.map(w => `
                <div class="breakdown-row">
                  <span class="week-date">${w.startDate.getDate()}/${w.startDate.getMonth() + 1}</span>
                  <span class="week-calories">${Math.round(w.avgCalories)} kcal</span>
                  <span class="week-expected">${formatChange(w.expectedChange)}</span>
                  <span class="week-actual">${formatChange(w.actualChange)}</span>
                  <span class="week-diff ${Math.abs(w.discrepancy) > 0.3 ? 'warning' : ''}">${formatChange(w.discrepancy)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Insufficient calorie data</p>
        <small>Need at least 1 week with both calorie and weight data</small>
      </div>
    `;
    }
};
