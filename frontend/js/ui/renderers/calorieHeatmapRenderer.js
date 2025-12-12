// js/ui/renderers/calorieHeatmapRenderer.js
// Visual calendar with color-coded calorie adherence

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';

/**
 * Calorie Heatmap Calendar:
 * - Color-coded days based on calorie target adherence
 * - Click to see day details
 * - Monthly view
 */
export const CalorieHeatmapRenderer = {
    _container: null,
    _currentMonth: null,
    _currentYear: null,
    _targetCalories: 2000, // Default, will be calculated

    init() {
        this._container = document.getElementById('calorie-heatmap-content');
        if (!this._container) {
            console.warn('[CalorieHeatmapRenderer] Container not found.');
            return;
        }

        const now = new Date();
        this._currentMonth = now.getMonth();
        this._currentYear = now.getFullYear();

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('PROCESSED_DATA') ||
                stateChanges.action.type.includes('DISPLAY_STATS')) {
                this._render();
            }
        });

        setTimeout(() => this._render(), 1250);
        console.log('[CalorieHeatmapRenderer] Initialized.');
    },

    _render() {
        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state);
        const displayStats = state.displayStats || {};

        if (!processedData || processedData.length < 7) {
            this._renderNoData();
            return;
        }

        // Calculate target from adaptive TDEE or average
        this._targetCalories = displayStats.adaptiveTDEE || displayStats.avgTDEE ||
            this._calculateAverageCalories(processedData);

        const calendarData = this._buildCalendarData(processedData);
        this._renderCalendar(calendarData);
    },

    _calculateAverageCalories(data) {
        const withCalories = data.filter(d => d.calorieIntake != null);
        if (withCalories.length === 0) return 2000;
        return withCalories.reduce((s, d) => s + d.calorieIntake, 0) / withCalories.length;
    },

    _buildCalendarData(data) {
        // Build a map of date -> data
        const dataMap = {};
        data.forEach(d => {
            const key = `${d.date.getFullYear()}-${d.date.getMonth()}-${d.date.getDate()}`;
            dataMap[key] = d;
        });
        return dataMap;
    },

    _getDayClass(calories) {
        if (calories == null) return 'no-data';
        const diff = calories - this._targetCalories;
        const pct = (diff / this._targetCalories) * 100;

        if (pct <= -15) return 'very-low';
        if (pct <= -5) return 'low';
        if (pct <= 5) return 'on-target';
        if (pct <= 15) return 'high';
        return 'very-high';
    },

    _renderCalendar(dataMap) {
        if (!this._container) return;

        const year = this._currentYear;
        const month = this._currentMonth;
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        let calendarHtml = `
      <div class="heatmap-header">
        <button class="nav-btn" id="prev-month">◀</button>
        <span class="month-title">${monthNames[month]} ${year}</span>
        <button class="nav-btn" id="next-month">▶</button>
      </div>
      <div class="heatmap-legend">
        <span class="legend-item very-low">Very Low</span>
        <span class="legend-item low">Low</span>
        <span class="legend-item on-target">On Target</span>
        <span class="legend-item high">High</span>
        <span class="legend-item very-high">Very High</span>
      </div>
      <div class="heatmap-grid">
        <div class="day-header">Sun</div>
        <div class="day-header">Mon</div>
        <div class="day-header">Tue</div>
        <div class="day-header">Wed</div>
        <div class="day-header">Thu</div>
        <div class="day-header">Fri</div>
        <div class="day-header">Sat</div>
    `;

        // Empty cells for days before month starts
        for (let i = 0; i < startDayOfWeek; i++) {
            calendarHtml += `<div class="day-cell empty"></div>`;
        }

        // Render each day
        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${month}-${day}`;
            const dayData = dataMap[key];
            const calories = dayData?.calorieIntake;
            const weight = dayData?.value;
            const dayClass = this._getDayClass(calories);

            calendarHtml += `
        <div class="day-cell ${dayClass}" data-date="${key}" 
             title="${calories ? calories + ' kcal' : 'No data'}${weight ? ' | ' + weight.toFixed(1) + ' kg' : ''}">
          <span class="day-num">${day}</span>
          ${calories ? `<span class="day-cal">${Math.round(calories)}</span>` : ''}
        </div>
      `;
        }

        calendarHtml += `</div>`;

        // Day detail panel
        calendarHtml += `<div id="day-detail" class="day-detail hidden"></div>`;

        this._container.innerHTML = calendarHtml;

        // Event listeners
        this._container.querySelector('#prev-month')?.addEventListener('click', () => {
            this._currentMonth--;
            if (this._currentMonth < 0) {
                this._currentMonth = 11;
                this._currentYear--;
            }
            this._render();
        });

        this._container.querySelector('#next-month')?.addEventListener('click', () => {
            this._currentMonth++;
            if (this._currentMonth > 11) {
                this._currentMonth = 0;
                this._currentYear++;
            }
            this._render();
        });

        // Click on day
        this._container.querySelectorAll('.day-cell:not(.empty)').forEach(cell => {
            cell.addEventListener('click', (e) => {
                const dateKey = e.currentTarget.dataset.date;
                const dayData = dataMap[dateKey];
                this._showDayDetail(dayData, dateKey);
            });
        });
    },

    _showDayDetail(dayData, dateKey) {
        const detailEl = this._container.querySelector('#day-detail');
        if (!detailEl) return;

        if (!dayData) {
            detailEl.innerHTML = '<p>No data for this day</p>';
        } else {
            const [y, m, d] = dateKey.split('-').map(Number);
            const dateStr = `${d}/${m + 1}/${y}`;
            detailEl.innerHTML = `
        <div class="detail-header">${dateStr}</div>
        <div class="detail-stats">
          <div class="detail-stat">
            <span class="label">Weight</span>
            <span class="value">${dayData.value?.toFixed(1) || 'N/A'} kg</span>
          </div>
          <div class="detail-stat">
            <span class="label">Calories</span>
            <span class="value">${dayData.calorieIntake || 'N/A'} kcal</span>
          </div>
          <div class="detail-stat">
            <span class="label">vs Target</span>
            <span class="value ${dayData.calorieIntake > this._targetCalories ? 'over' : 'under'}">
              ${dayData.calorieIntake ? (dayData.calorieIntake - this._targetCalories > 0 ? '+' : '') +
                    Math.round(dayData.calorieIntake - this._targetCalories) + ' kcal' : 'N/A'}
            </span>
          </div>
        </div>
      `;
        }
        detailEl.classList.remove('hidden');
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more data</p>
        <small>At least 1 week of calorie data required</small>
      </div>
    `;
    }
};
