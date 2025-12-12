// js/ui/renderers/goalSuggestionRenderer.js
// Renders adaptive goal suggestions based on historical data patterns

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

/**
 * Analyzes historical data and suggests realistic goals based on:
 * - Past performance (average rates achieved)
 * - Current trends
 * - Sustainable rate recommendations
 */
export const GoalSuggestionRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('goal-suggestions-list');
        if (!this._container) {
            console.warn('[GoalSuggestionRenderer] Container #goal-suggestions-list not found.');
            return;
        }

        // Subscribe to relevant state changes
        StateManager.subscribe((stateChanges) => {
            const relevantTypes = ['SET_DISPLAY_STATS', 'SET_PROCESSED_DATA', 'SET_FILTERED_DATA'];
            if (relevantTypes.some(t => stateChanges.action.type.includes(t))) {
                this._generateSuggestions();
            }
        });

        // Initial generation after a delay
        setTimeout(() => this._generateSuggestions(), 1000);
        console.log('[GoalSuggestionRenderer] Initialized.');
    },

    _generateSuggestions() {
        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state);
        const displayStats = state.displayStats || {};
        const currentGoal = Selectors.selectGoal(state);

        if (!processedData || processedData.length < 14) {
            this._renderNoData();
            return;
        }

        // Analyze historical patterns
        const analysis = this._analyzeHistoricalPatterns(processedData);

        // Generate suggestions based on analysis
        const suggestions = this._createSuggestions(analysis, displayStats, currentGoal);

        this._render(suggestions, analysis);
    },

    _analyzeHistoricalPatterns(processedData) {
        // Get current weight
        let currentWeight = null;
        for (let i = processedData.length - 1; i >= 0; i--) {
            if (processedData[i].value != null) {
                currentWeight = processedData[i].value;
                break;
            }
        }

        // Calculate average rates from different periods
        const rates = processedData
            .filter(d => d.smoothedWeeklyRate != null)
            .map(d => d.smoothedWeeklyRate);

        // Split into positive (bulk) and negative (cut) phases
        const positiveRates = rates.filter(r => r > 0.05);
        const negativeRates = rates.filter(r => r < -0.05);

        const avgPositiveRate = positiveRates.length > 0
            ? positiveRates.reduce((a, b) => a + b, 0) / positiveRates.length
            : null;
        const avgNegativeRate = negativeRates.length > 0
            ? negativeRates.reduce((a, b) => a + b, 0) / negativeRates.length
            : null;

        // Calculate sustainable rates (50th percentile of achieved rates)
        const sortedPositive = [...positiveRates].sort((a, b) => a - b);
        const sortedNegative = [...negativeRates].sort((a, b) => a - b);

        const sustainableGainRate = sortedPositive.length > 2
            ? sortedPositive[Math.floor(sortedPositive.length * 0.5)]
            : 0.25;
        const sustainableLossRate = sortedNegative.length > 2
            ? sortedNegative[Math.floor(sortedNegative.length * 0.5)]
            : -0.5;

        // Calculate best achieved rates
        const maxGainRate = positiveRates.length > 0 ? Math.max(...positiveRates) : 0.5;
        const maxLossRate = negativeRates.length > 0 ? Math.min(...negativeRates) : -1.0;

        // Overall variance/consistency
        const rateStdDev = rates.length > 2
            ? Math.sqrt(rates.reduce((sum, r) => sum + Math.pow(r - (rates.reduce((a, b) => a + b, 0) / rates.length), 2), 0) / rates.length)
            : 0.3;

        return {
            currentWeight,
            avgPositiveRate,
            avgNegativeRate,
            sustainableGainRate,
            sustainableLossRate,
            maxGainRate,
            maxLossRate,
            rateConsistency: 1 - Math.min(rateStdDev / 0.5, 1), // Higher = more consistent
            dataWeeks: Math.floor(processedData.length / 7),
        };
    },

    _createSuggestions(analysis, displayStats, currentGoal) {
        const suggestions = [];
        const { currentWeight, sustainableGainRate, sustainableLossRate, avgPositiveRate, avgNegativeRate } = analysis;

        if (!currentWeight) return suggestions;

        // Suggestion 1: Conservative Weight Loss (12 weeks)
        const conservativeLossRate = Math.max(sustainableLossRate, -0.5);
        const conservativeLossTarget = currentWeight + (conservativeLossRate * 12);
        suggestions.push({
            type: 'cut',
            title: 'Moderate Cut',
            description: 'Sustainable weight loss based on your history',
            targetWeight: Math.round(conservativeLossTarget * 10) / 10,
            rate: conservativeLossRate,
            duration: 12,
            confidence: avgNegativeRate != null ? 'Based on your past performance' : 'General recommendation',
            icon: '🎯'
        });

        // Suggestion 2: Aggressive Weight Loss (8 weeks)
        const aggressiveLossRate = Math.max(sustainableLossRate * 1.5, -1.0);
        const aggressiveLossTarget = currentWeight + (aggressiveLossRate * 8);
        suggestions.push({
            type: 'cut',
            title: 'Aggressive Cut',
            description: 'Faster results, requires more discipline',
            targetWeight: Math.round(aggressiveLossTarget * 10) / 10,
            rate: aggressiveLossRate,
            duration: 8,
            confidence: 'Challenging but achievable',
            icon: '🔥'
        });

        // Suggestion 3: Lean Bulk (16 weeks)
        const leanBulkRate = Math.min(sustainableGainRate, 0.25);
        const leanBulkTarget = currentWeight + (leanBulkRate * 16);
        suggestions.push({
            type: 'bulk',
            title: 'Lean Bulk',
            description: 'Slow, controlled muscle building',
            targetWeight: Math.round(leanBulkTarget * 10) / 10,
            rate: leanBulkRate,
            duration: 16,
            confidence: avgPositiveRate != null ? 'Based on your past gains' : 'Conservative approach',
            icon: '💪'
        });

        // Suggestion 4: Maintenance (4 weeks)
        suggestions.push({
            type: 'maintenance',
            title: 'Maintenance Phase',
            description: 'Hold current weight, focus on recomposition',
            targetWeight: currentWeight,
            rate: 0,
            duration: 4,
            confidence: 'Great for consolidation',
            icon: '⚖️'
        });

        // Suggestion 5: Custom suggestion based on recent trend
        const recentRate = displayStats.latestWeeklyRate;
        if (recentRate != null && Math.abs(recentRate) > 0.1) {
            const trendTarget = currentWeight + (recentRate * 8);
            suggestions.push({
                type: recentRate > 0 ? 'bulk' : 'cut',
                title: 'Continue Current Trend',
                description: `Based on your recent ${recentRate > 0 ? 'gains' : 'losses'}`,
                targetWeight: Math.round(trendTarget * 10) / 10,
                rate: recentRate,
                duration: 8,
                confidence: 'Following your current trajectory',
                icon: '📈'
            });
        }

        return suggestions;
    },

    _render(suggestions, analysis) {
        if (!this._container) return;

        if (!suggestions || suggestions.length === 0) {
            this._renderNoData();
            return;
        }

        const formatGoalDate = (weeks) => {
            const date = new Date();
            date.setDate(date.getDate() + weeks * 7);
            return Utils.formatDateShort(date);
        };

        this._container.innerHTML = `
      <div class="suggestions-header">
        <div class="analysis-summary">
          <span class="summary-item">📊 ${analysis.dataWeeks} weeks of data</span>
          <span class="summary-item">⚡ ${(analysis.rateConsistency * 100).toFixed(0)}% consistency</span>
        </div>
      </div>
      <div class="suggestions-grid">
        ${suggestions.map(s => `
          <div class="suggestion-card suggestion-card--${s.type}" data-suggestion='${JSON.stringify(s)}'>
            <div class="suggestion-header">
              <span class="suggestion-icon">${s.icon}</span>
              <span class="suggestion-title">${s.title}</span>
            </div>
            <div class="suggestion-body">
              <div class="suggestion-target">
                <span class="target-weight">${s.targetWeight} kg</span>
                <span class="target-change">${s.rate >= 0 ? '+' : ''}${(s.rate * s.duration).toFixed(1)} kg</span>
              </div>
              <div class="suggestion-details">
                <span class="detail-item">📅 ${s.duration} weeks</span>
                <span class="detail-item">📉 ${s.rate.toFixed(2)} kg/wk</span>
              </div>
              <div class="suggestion-confidence">${s.confidence}</div>
            </div>
            <button class="apply-suggestion-btn" onclick="window.applySuggestion(${s.targetWeight}, ${s.duration})">
              Apply Goal
            </button>
          </div>
        `).join('')}
      </div>
    `;

        // Add global function to apply suggestions
        window.applySuggestion = (targetWeight, weeks) => {
            const goalDate = new Date();
            goalDate.setDate(goalDate.getDate() + weeks * 7);

            // Dispatch goal update
            StateManager.dispatch({
                type: 'SET_GOAL',
                payload: {
                    weight: targetWeight,
                    date: goalDate,
                    targetRate: null // Will be calculated
                }
            });

            Utils.showStatusMessage(`Goal set: ${targetWeight} kg by ${Utils.formatDateShort(goalDate)}`, 'success');
        };
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Not enough data</p>
        <small>Need at least 2 weeks of data for suggestions</small>
      </div>
    `;
    }
};
