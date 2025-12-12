// js/ui/renderers/periodComparisonRenderer.js
// Renders multi-period comparison analysis

import { StateManager, ActionTypes } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { DataService } from '../../core/dataService.js';

/**
 * Renders the multi-period comparison panel allowing users to compare 
 * statistics between two selected time periods.
 */
export const PeriodComparisonRenderer = {
    _container: null,
    _period1: { start: null, end: null },
    _period2: { start: null, end: null },

    init() {
        this._container = document.getElementById('period-comparison-content');
        if (!this._container) {
            console.warn('[PeriodComparisonRenderer] Container #period-comparison-content not found.');
            return;
        }

        this._setupEventListeners();
        this._render();
        console.log('[PeriodComparisonRenderer] Initialized.');
    },

    _setupEventListeners() {
        // Setup date input listeners
        const applyBtn = document.getElementById('compare-periods-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this._handleCompare());
        }

        // Quick compare buttons
        const quickBtns = document.querySelectorAll('.quick-compare-btn');
        quickBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this._handleQuickCompare(e.target.dataset.compare));
        });
    },

    _handleQuickCompare(compareType) {
        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state);

        if (!processedData || processedData.length < 14) {
            Utils.showStatusMessage('Not enough data for comparison', 'warning');
            return;
        }

        const now = new Date();
        let period1Start, period1End, period2Start, period2End;

        switch (compareType) {
            case 'last-2-weeks':
                period2End = processedData[processedData.length - 1].date;
                period2Start = new Date(period2End);
                period2Start.setDate(period2Start.getDate() - 7);
                period1End = new Date(period2Start);
                period1End.setDate(period1End.getDate() - 1);
                period1Start = new Date(period1End);
                period1Start.setDate(period1Start.getDate() - 7);
                break;
            case 'last-2-months':
                period2End = processedData[processedData.length - 1].date;
                period2Start = new Date(period2End);
                period2Start.setMonth(period2Start.getMonth() - 1);
                period1End = new Date(period2Start);
                period1End.setDate(period1End.getDate() - 1);
                period1Start = new Date(period1End);
                period1Start.setMonth(period1Start.getMonth() - 1);
                break;
            case 'phases':
                // Compare last two detected phases
                const phases = Selectors.selectPeriodizationPhases(state);
                if (phases.length >= 2) {
                    const [phase1, phase2] = phases.slice(-2);
                    period1Start = phase1.startDate;
                    period1End = phase1.endDate;
                    period2Start = phase2.startDate;
                    period2End = phase2.endDate;
                } else {
                    Utils.showStatusMessage('Need at least 2 phases for comparison', 'warning');
                    return;
                }
                break;
            default:
                return;
        }

        this._period1 = { start: period1Start, end: period1End };
        this._period2 = { start: period2Start, end: period2End };

        // Update input fields
        this._updateDateInputs();
        this._performComparison();
    },

    _handleCompare() {
        const p1Start = document.getElementById('period1-start');
        const p1End = document.getElementById('period1-end');
        const p2Start = document.getElementById('period2-start');
        const p2End = document.getElementById('period2-end');

        if (!p1Start || !p1End || !p2Start || !p2End) return;

        // Parse dates (DD-MM-YYYY format)
        const parseDate = (str) => {
            const parts = str.split('-');
            if (parts.length !== 3) return null;
            const [day, month, year] = parts.map(Number);
            return new Date(year, month - 1, day);
        };

        this._period1 = {
            start: parseDate(p1Start.value),
            end: parseDate(p1End.value)
        };
        this._period2 = {
            start: parseDate(p2Start.value),
            end: parseDate(p2End.value)
        };

        if (!this._period1.start || !this._period1.end ||
            !this._period2.start || !this._period2.end) {
            Utils.showStatusMessage('Please enter valid dates (DD-MM-YYYY)', 'error');
            return;
        }

        this._performComparison();
    },

    _updateDateInputs() {
        const formatDate = (d) => {
            if (!d) return '';
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        };

        const p1Start = document.getElementById('period1-start');
        const p1End = document.getElementById('period1-end');
        const p2Start = document.getElementById('period2-start');
        const p2End = document.getElementById('period2-end');

        if (p1Start) p1Start.value = formatDate(this._period1.start);
        if (p1End) p1End.value = formatDate(this._period1.end);
        if (p2Start) p2Start.value = formatDate(this._period2.start);
        if (p2End) p2End.value = formatDate(this._period2.end);
    },

    _performComparison() {
        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state);

        const stats1 = this._calculatePeriodStats(processedData, this._period1);
        const stats2 = this._calculatePeriodStats(processedData, this._period2);

        this._renderComparison(stats1, stats2);
    },

    _calculatePeriodStats(data, period) {
        if (!period.start || !period.end || !data || data.length === 0) {
            return null;
        }

        const periodData = data.filter(d =>
            d.date >= period.start && d.date <= period.end
        );

        if (periodData.length === 0) return null;

        const validWeights = periodData.filter(d => d.value != null).map(d => d.value);
        const validRates = periodData.filter(d => d.smoothedWeeklyRate != null).map(d => d.smoothedWeeklyRate);
        const validCalories = periodData.filter(d => d.calorieIntake != null).map(d => d.calorieIntake);
        const validVolume = periodData.filter(d => d.totalVolume != null && d.totalVolume > 0).map(d => d.totalVolume);

        const mean = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

        const startWeight = validWeights.length > 0 ? validWeights[0] : null;
        const endWeight = validWeights.length > 0 ? validWeights[validWeights.length - 1] : null;
        const weightChange = startWeight != null && endWeight != null ? endWeight - startWeight : null;

        const daysInPeriod = Math.round((period.end - period.start) / (1000 * 60 * 60 * 24)) + 1;

        return {
            startDate: period.start,
            endDate: period.end,
            days: daysInPeriod,
            startWeight,
            endWeight,
            weightChange,
            avgWeight: mean(validWeights),
            avgRate: mean(validRates),
            avgCalories: mean(validCalories),
            avgVolume: mean(validVolume),
            dataPoints: periodData.length,
        };
    },

    _renderComparison(stats1, stats2) {
        const resultsContainer = document.getElementById('comparison-results');
        if (!resultsContainer) return;

        if (!stats1 || !stats2) {
            resultsContainer.innerHTML = `
        <div class="empty-state-message">
          <p>Select two periods to compare</p>
          <small>Use the date inputs above or quick compare buttons</small>
        </div>
      `;
            return;
        }

        const formatChange = (val1, val2, unit = '', decimals = 1) => {
            if (val1 == null || val2 == null) return 'N/A';
            const diff = val2 - val1;
            const sign = diff > 0 ? '+' : '';
            const className = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';
            return `<span class="${className}">${sign}${diff.toFixed(decimals)}${unit}</span>`;
        };

        const formatValue = (val, decimals = 1, unit = '') => {
            if (val == null) return 'N/A';
            return `${val.toFixed(decimals)}${unit}`;
        };

        const formatDateShort = (d) => {
            if (!d) return 'N/A';
            return `${d.getDate()}/${d.getMonth() + 1}`;
        };

        resultsContainer.innerHTML = `
      <div class="comparison-table">
        <div class="comparison-header-row">
          <div class="comparison-metric-label"></div>
          <div class="comparison-period-header">
            <span class="period-label">Period 1</span>
            <span class="period-dates">${formatDateShort(stats1.startDate)} - ${formatDateShort(stats1.endDate)}</span>
          </div>
          <div class="comparison-period-header">
            <span class="period-label">Period 2</span>
            <span class="period-dates">${formatDateShort(stats2.startDate)} - ${formatDateShort(stats2.endDate)}</span>
          </div>
          <div class="comparison-diff-header">Δ Change</div>
        </div>
        
        ${this._renderComparisonRow('Duration', `${stats1.days} days`, `${stats2.days} days`, '')}
        ${this._renderComparisonRow('Weight Change', formatValue(stats1.weightChange, 2, ' kg'), formatValue(stats2.weightChange, 2, ' kg'), formatChange(stats1.weightChange, stats2.weightChange, ' kg', 2))}
        ${this._renderComparisonRow('Avg Rate', formatValue(stats1.avgRate, 2, ' kg/wk'), formatValue(stats2.avgRate, 2, ' kg/wk'), formatChange(stats1.avgRate, stats2.avgRate, ' kg/wk', 2))}
        ${this._renderComparisonRow('Avg Calories', formatValue(stats1.avgCalories, 0, ' kcal'), formatValue(stats2.avgCalories, 0, ' kcal'), formatChange(stats1.avgCalories, stats2.avgCalories, ' kcal', 0))}
        ${this._renderComparisonRow('Avg Volume', formatValue(stats1.avgVolume, 0, ' kg'), formatValue(stats2.avgVolume, 0, ' kg'), formatChange(stats1.avgVolume, stats2.avgVolume, ' kg', 0))}
      </div>
    `;
    },

    _renderComparisonRow(label, val1, val2, diff) {
        return `
      <div class="comparison-row">
        <div class="comparison-metric-label">${label}</div>
        <div class="comparison-value">${val1}</div>
        <div class="comparison-value">${val2}</div>
        <div class="comparison-diff">${diff}</div>
      </div>
    `;
    },

    _render() {
        if (!this._container) return;

        this._container.innerHTML = `
      <div class="period-comparison-controls">
        <div class="quick-compare-buttons">
          <button class="quick-compare-btn btn-small" data-compare="last-2-weeks">Last 2 Weeks</button>
          <button class="quick-compare-btn btn-small" data-compare="last-2-months">Last 2 Months</button>
          <button class="quick-compare-btn btn-small" data-compare="phases">Last 2 Phases</button>
        </div>
        
        <div class="period-inputs-grid">
          <div class="period-input-group">
            <label class="period-label">Period 1</label>
            <div class="date-range-inputs">
              <input type="text" id="period1-start" placeholder="DD-MM-YYYY" class="date-input" />
              <span class="date-separator">to</span>
              <input type="text" id="period1-end" placeholder="DD-MM-YYYY" class="date-input" />
            </div>
          </div>
          <div class="period-input-group">
            <label class="period-label">Period 2</label>
            <div class="date-range-inputs">
              <input type="text" id="period2-start" placeholder="DD-MM-YYYY" class="date-input" />
              <span class="date-separator">to</span>
              <input type="text" id="period2-end" placeholder="DD-MM-YYYY" class="date-input" />
            </div>
          </div>
        </div>
        
        <button id="compare-periods-btn" class="btn-primary">Compare Periods</button>
      </div>
      
      <div id="comparison-results" class="comparison-results">
        <div class="empty-state-message">
          <p>Select two periods to compare</p>
          <small>Use quick buttons or enter custom date ranges</small>
        </div>
      </div>
    `;

        // Re-attach event listeners after rendering
        this._setupEventListeners();
    }
};
