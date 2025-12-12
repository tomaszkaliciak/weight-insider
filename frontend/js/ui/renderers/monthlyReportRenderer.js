// js/ui/renderers/monthlyReportRenderer.js
// Generates monthly/quarterly progress reports

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/**
 * Generates periodic reports summarizing:
 * - Total progress
 * - Best/worst periods
 * - Consistency metrics
 * - Phase breakdown
 */
export const MonthlyReportRenderer = {
    _container: null,
    _currentView: 'monthly', // 'monthly' or 'quarterly'

    init() {
        this._container = document.getElementById('monthly-report-content');
        if (!this._container) {
            console.warn('[MonthlyReportRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('PROCESSED_DATA')) {
                this._generate();
            }
        });

        setTimeout(() => this._generate(), 1000);
        console.log('[MonthlyReportRenderer] Initialized.');
    },

    _generate() {
        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state);

        if (!processedData || processedData.length < 30) {
            this._renderNoData();
            return;
        }

        const report = this._generateReport(processedData);
        this._render(report);
    },

    _generateReport(data) {
        // Group by month
        const months = {};
        data.forEach(d => {
            const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`;
            if (!months[key]) {
                months[key] = {
                    key,
                    year: d.date.getFullYear(),
                    month: d.date.getMonth(),
                    data: []
                };
            }
            months[key].data.push(d);
        });

        // Calculate monthly stats
        const monthlyStats = Object.values(months).map(m => this._calculateMonthStats(m));

        // Sort chronologically
        monthlyStats.sort((a, b) => a.key.localeCompare(b.key));

        // Get last 3 months for main report
        const recentMonths = monthlyStats.slice(-3);

        // Calculate quarterly stats
        const quarters = this._calculateQuarters(monthlyStats);

        // Overall stats
        const overall = this._calculateOverallStats(data, monthlyStats);

        return {
            recentMonths,
            quarters,
            overall,
            bestMonth: this._findBestMonth(monthlyStats),
            worstMonth: this._findWorstMonth(monthlyStats)
        };
    },

    _calculateMonthStats(monthData) {
        const { data, key, year, month } = monthData;

        const weights = data.filter(d => d.value != null).map(d => d.value);
        const calories = data.filter(d => d.calorieIntake != null).map(d => d.calorieIntake);
        const rates = data.filter(d => d.smoothedWeeklyRate != null).map(d => d.smoothedWeeklyRate);

        const mean = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

        const startWeight = weights.length > 0 ? weights[0] : null;
        const endWeight = weights.length > 0 ? weights[weights.length - 1] : null;
        const weightChange = startWeight != null && endWeight != null ? endWeight - startWeight : null;

        // Consistency score: % of days with weight logged
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const loggedDays = data.filter(d => d.value != null).length;
        const consistency = (loggedDays / daysInMonth) * 100;

        return {
            key,
            year,
            month,
            monthName: new Date(year, month, 1).toLocaleString('default', { month: 'short' }),
            daysLogged: loggedDays,
            daysInMonth,
            consistency,
            startWeight,
            endWeight,
            weightChange,
            avgCalories: mean(calories),
            avgRate: mean(rates),
            minWeight: weights.length > 0 ? Math.min(...weights) : null,
            maxWeight: weights.length > 0 ? Math.max(...weights) : null
        };
    },

    _calculateQuarters(monthlyStats) {
        const quarters = {};

        monthlyStats.forEach(m => {
            const qNum = Math.floor(m.month / 3) + 1;
            const qKey = `${m.year}-Q${qNum}`;

            if (!quarters[qKey]) {
                quarters[qKey] = {
                    key: qKey,
                    year: m.year,
                    quarter: qNum,
                    months: []
                };
            }
            quarters[qKey].months.push(m);
        });

        return Object.values(quarters).map(q => {
            const allMonths = q.months;
            const startWeight = allMonths[0]?.startWeight;
            const endWeight = allMonths[allMonths.length - 1]?.endWeight;

            return {
                ...q,
                startWeight,
                endWeight,
                weightChange: startWeight && endWeight ? endWeight - startWeight : null,
                avgConsistency: allMonths.reduce((s, m) => s + m.consistency, 0) / allMonths.length
            };
        }).slice(-2); // Last 2 quarters
    },

    _calculateOverallStats(data, monthlyStats) {
        const weights = data.filter(d => d.value != null).map(d => d.value);
        const totalDays = data.length;
        const loggedDays = weights.length;

        return {
            totalMonths: monthlyStats.length,
            totalDays,
            loggedDays,
            overallConsistency: (loggedDays / totalDays) * 100,
            startWeight: weights.length > 0 ? weights[0] : null,
            currentWeight: weights.length > 0 ? weights[weights.length - 1] : null,
            totalChange: weights.length > 1 ? weights[weights.length - 1] - weights[0] : null,
            lowestWeight: weights.length > 0 ? Math.min(...weights) : null,
            highestWeight: weights.length > 0 ? Math.max(...weights) : null
        };
    },

    _findBestMonth(monthlyStats) {
        // "Best" = most progress toward typical goal (most negative change during cut, most positive during bulk)
        // For simplicity, use month with most consistent adherence
        return monthlyStats.reduce((best, m) =>
            !best || m.consistency > best.consistency ? m : best, null);
    },

    _findWorstMonth(monthlyStats) {
        return monthlyStats.reduce((worst, m) =>
            !worst || m.consistency < worst.consistency ? m : worst, null);
    },

    _render(report) {
        if (!this._container) return;

        const formatWeight = (w) => w != null ? `${w.toFixed(1)} kg` : 'N/A';
        const formatChange = (c) => c != null ? `${c > 0 ? '+' : ''}${c.toFixed(1)} kg` : 'N/A';
        const formatPct = (p) => p != null ? `${p.toFixed(0)}%` : 'N/A';

        this._container.innerHTML = `
      <div class="report-tabs">
        <button class="report-tab ${this._currentView === 'monthly' ? 'active' : ''}" data-view="monthly">Monthly</button>
        <button class="report-tab ${this._currentView === 'quarterly' ? 'active' : ''}" data-view="quarterly">Quarterly</button>
      </div>

      <div class="report-content">
        ${this._currentView === 'monthly' ? `
          <div class="monthly-reports">
            ${report.recentMonths.map(m => `
              <div class="month-card">
                <div class="month-header">
                  <span class="month-name">${m.monthName} ${m.year}</span>
                  <span class="month-change ${m.weightChange > 0 ? 'gain' : 'loss'}">${formatChange(m.weightChange)}</span>
                </div>
                <div class="month-stats">
                  <div class="stat-row">
                    <span class="stat-label">Start → End</span>
                    <span class="stat-value">${formatWeight(m.startWeight)} → ${formatWeight(m.endWeight)}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Avg Calories</span>
                    <span class="stat-value">${m.avgCalories ? Math.round(m.avgCalories) + ' kcal' : 'N/A'}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Avg Rate</span>
                    <span class="stat-value">${m.avgRate ? m.avgRate.toFixed(2) + ' kg/wk' : 'N/A'}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Consistency</span>
                    <span class="stat-value">${formatPct(m.consistency)} (${m.daysLogged}/${m.daysInMonth} days)</span>
                  </div>
                </div>
                <div class="month-range">
                  Range: ${formatWeight(m.minWeight)} - ${formatWeight(m.maxWeight)}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="quarterly-reports">
            ${report.quarters.map(q => `
              <div class="quarter-card">
                <div class="quarter-header">
                  <span class="quarter-name">Q${q.quarter} ${q.year}</span>
                  <span class="quarter-change ${q.weightChange > 0 ? 'gain' : 'loss'}">${formatChange(q.weightChange)}</span>
                </div>
                <div class="quarter-stats">
                  <div class="stat-row">
                    <span class="stat-label">Months</span>
                    <span class="stat-value">${q.months.map(m => m.monthName).join(', ')}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Weight Journey</span>
                    <span class="stat-value">${formatWeight(q.startWeight)} → ${formatWeight(q.endWeight)}</span>
                  </div>
                  <div class="stat-row">
                    <span class="stat-label">Avg Consistency</span>
                    <span class="stat-value">${formatPct(q.avgConsistency)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}

        <div class="report-highlights">
          <div class="highlight-card best">
            <span class="highlight-icon">🏆</span>
            <span class="highlight-label">Best Month</span>
            <span class="highlight-value">${report.bestMonth ? `${report.bestMonth.monthName} ${report.bestMonth.year}` : 'N/A'}</span>
            <span class="highlight-detail">${formatPct(report.bestMonth?.consistency)} consistency</span>
          </div>
          <div class="highlight-card overall">
            <span class="highlight-icon">📊</span>
            <span class="highlight-label">Total Progress</span>
            <span class="highlight-value">${formatChange(report.overall.totalChange)}</span>
            <span class="highlight-detail">${report.overall.totalMonths} months tracked</span>
          </div>
        </div>
      </div>
    `;

        // Setup tab listeners
        this._container.querySelectorAll('.report-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this._currentView = e.target.dataset.view;
                this._render(report);
            });
        });
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need at least 1 month of data</p>
        <small>Monthly reports will appear once you have 30+ days of data</small>
      </div>
    `;
    }
};
