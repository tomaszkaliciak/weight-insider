// js/ui/renderers/plateauBreakerRenderer.js
// Suggests strategies to break plateaus based on historical patterns

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/**
 * Detects plateaus and suggests strategies based on:
 * - What worked to break past plateaus
 * - General best practices
 * - User-specific patterns
 */
export const PlateauBreakerRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('plateau-breaker-content');
        if (!this._container) {
            console.warn('[PlateauBreakerRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                this._analyze();
            }
        });

        setTimeout(() => this._analyze(), 1100);
        console.log('[PlateauBreakerRenderer] Initialized.');
    },

    _analyze() {
        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const processedData = Selectors.selectProcessedData(state);
        const filteredData = Selectors.selectFilteredData(state);

        if (!processedData || processedData.length < 21) {
            this._renderNoData();
            return;
        }

        const analysis = this._detectAndAnalyzePlateaus(processedData, filteredData, displayStats);
        this._render(analysis);
    },

    _detectAndAnalyzePlateaus(allData, filteredData, stats) {
        // Check if currently in a plateau
        const currentPlateau = this._detectCurrentPlateau(filteredData);

        // Find historical plateaus and how they were broken
        const historicalPlateaus = this._findHistoricalPlateaus(allData);

        // Generate suggestions
        const suggestions = this._generateSuggestions(currentPlateau, historicalPlateaus, allData);

        return {
            inPlateau: currentPlateau.isInPlateau,
            plateauDuration: currentPlateau.duration,
            plateauWeight: currentPlateau.avgWeight,
            historicalPlateaus,
            suggestions,
            currentRate: stats.latestWeeklyRate
        };
    },

    _detectCurrentPlateau(data) {
        if (!data || data.length < 14) {
            return { isInPlateau: false };
        }

        // Look at last 2 weeks
        const recentData = data.slice(-14);
        const rates = recentData
            .filter(d => d.smoothedWeeklyRate != null)
            .map(d => Math.abs(d.smoothedWeeklyRate));

        // Plateau if avg absolute rate < 0.15 kg/week
        const avgAbsRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
        const isInPlateau = avgAbsRate < 0.15;

        if (!isInPlateau) {
            return { isInPlateau: false };
        }

        // Calculate how long the plateau has been going
        let plateauStart = recentData.length;
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].smoothedWeeklyRate != null && Math.abs(data[i].smoothedWeeklyRate) >= 0.15) {
                break;
            }
            plateauStart = data.length - i;
        }

        const weights = recentData.filter(d => d.value != null).map(d => d.value);
        const avgWeight = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : null;

        return {
            isInPlateau: true,
            duration: plateauStart,
            avgWeight,
            avgRate: avgAbsRate
        };
    },

    _findHistoricalPlateaus(data) {
        const plateaus = [];
        let inPlateau = false;
        let plateauStart = null;
        let plateauData = [];

        data.forEach((d, i) => {
            const rate = d.smoothedWeeklyRate;
            const isFlat = rate != null && Math.abs(rate) < 0.12;

            if (isFlat && !inPlateau) {
                inPlateau = true;
                plateauStart = i;
                plateauData = [d];
            } else if (isFlat && inPlateau) {
                plateauData.push(d);
            } else if (!isFlat && inPlateau && plateauData.length >= 14) {
                // Plateau ended - what broke it?
                const breakData = data.slice(i, Math.min(i + 7, data.length));
                const breakRate = breakData.length > 0 && breakData[0].smoothedWeeklyRate != null
                    ? breakData[0].smoothedWeeklyRate : null;

                const plateauCalories = plateauData
                    .filter(d => d.calorieIntake != null)
                    .map(d => d.calorieIntake);
                const avgPlateauCal = plateauCalories.length > 0
                    ? plateauCalories.reduce((a, b) => a + b, 0) / plateauCalories.length : null;

                const breakCalories = breakData
                    .filter(d => d.calorieIntake != null)
                    .map(d => d.calorieIntake);
                const avgBreakCal = breakCalories.length > 0
                    ? breakCalories.reduce((a, b) => a + b, 0) / breakCalories.length : null;

                plateaus.push({
                    startDate: plateauData[0].date,
                    endDate: plateauData[plateauData.length - 1].date,
                    duration: plateauData.length,
                    avgCalories: avgPlateauCal,
                    breakCalories: avgBreakCal,
                    breakRate,
                    calorieChange: avgBreakCal && avgPlateauCal ? avgBreakCal - avgPlateauCal : null
                });

                inPlateau = false;
                plateauData = [];
            } else {
                inPlateau = false;
                plateauData = [];
            }
        });

        return plateaus.slice(-5); // Last 5 plateaus
    },

    _generateSuggestions(currentPlateau, historicalPlateaus, data) {
        const suggestions = [];

        if (!currentPlateau.isInPlateau) {
            return [{
                icon: '✅',
                title: 'No Plateau Detected',
                description: 'Your weight is currently trending. Keep doing what works!',
                priority: 'low'
            }];
        }

        // Analyze what broke past plateaus
        const successfulBreaks = historicalPlateaus.filter(p => p.calorieChange != null);

        if (successfulBreaks.length > 0) {
            const avgCalorieChange = successfulBreaks.reduce((s, p) => s + p.calorieChange, 0) / successfulBreaks.length;

            suggestions.push({
                icon: '📊',
                title: 'Based on Your History',
                description: avgCalorieChange < -100
                    ? `You typically break plateaus by reducing calories ~${Math.abs(Math.round(avgCalorieChange))} kcal/day`
                    : avgCalorieChange > 100
                        ? `You typically break plateaus with a refeed of ~${Math.round(avgCalorieChange)} kcal/day`
                        : 'Your plateaus typically break after 2-3 weeks naturally',
                priority: 'high'
            });
        }

        // Duration-based suggestions
        if (currentPlateau.duration >= 21) {
            suggestions.push({
                icon: '🔄',
                title: 'Consider a Diet Break',
                description: `You\'ve been plateaued for ${currentPlateau.duration} days. A 1-2 week maintenance phase may help reset metabolic adaptation.`,
                priority: 'high'
            });
        } else if (currentPlateau.duration >= 14) {
            suggestions.push({
                icon: '⚡',
                title: 'Increase Activity',
                description: 'Try adding 2000-3000 extra steps daily or one additional training session per week.',
                priority: 'medium'
            });
        }

        // General suggestions
        suggestions.push({
            icon: '💧',
            title: 'Check Water Retention',
            description: 'High sodium, stress, or poor sleep can mask fat loss. Scale weight may drop suddenly after these normalize.',
            priority: 'medium'
        });

        suggestions.push({
            icon: '📝',
            title: 'Audit Your Tracking',
            description: 'Reweigh portions and check for calorie creep. Even small underestimates add up.',
            priority: 'medium'
        });

        return suggestions.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    },

    _render(analysis) {
        if (!this._container) return;

        const { inPlateau, plateauDuration, plateauWeight, suggestions, historicalPlateaus } = analysis;

        this._container.innerHTML = `
      <div class="plateau-status ${inPlateau ? 'in-plateau' : 'no-plateau'}">
        ${inPlateau ? `
          <div class="status-indicator warning">
            <span class="status-icon">⚠️</span>
            <span class="status-text">Plateau Detected</span>
          </div>
          <div class="plateau-details">
            <span class="plateau-duration">${plateauDuration} days</span>
            <span class="plateau-weight">at ~${plateauWeight?.toFixed(1) || 'N/A'} kg</span>
          </div>
        ` : `
          <div class="status-indicator good">
            <span class="status-icon">✅</span>
            <span class="status-text">No Plateau</span>
          </div>
        `}
      </div>

      <div class="suggestions-list">
        <h4 class="suggestions-title">${inPlateau ? '💡 Suggestions to Break It' : '📊 Prevention Tips'}</h4>
        ${suggestions.map(s => `
          <div class="suggestion-item priority-${s.priority}">
            <span class="suggestion-icon">${s.icon}</span>
            <div class="suggestion-content">
              <div class="suggestion-title">${s.title}</div>
              <div class="suggestion-description">${s.description}</div>
            </div>
          </div>
        `).join('')}
      </div>

      ${historicalPlateaus.length > 0 ? `
        <div class="historical-plateaus">
          <h4 class="history-title">📅 Past Plateaus</h4>
          <div class="plateau-history-list">
            ${historicalPlateaus.slice(-3).map(p => `
              <div class="history-item">
                <span class="history-date">${p.startDate.getDate()}/${p.startDate.getMonth() + 1}</span>
                <span class="history-duration">${p.duration} days</span>
                <span class="history-break">${p.calorieChange
                ? `${p.calorieChange > 0 ? '+' : ''}${Math.round(p.calorieChange)} kcal`
                : 'Natural'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more data</p>
        <small>At least 3 weeks of data needed for plateau detection</small>
      </div>
    `;
    }
};
