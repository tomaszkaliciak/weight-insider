// js/ui/renderers/whatWorkedRenderer.js
// Identifies patterns from most successful periods

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/**
 * Analyzes historical data to find what conditions led to best results:
 * - Optimal calorie ranges
 * - Best training volume correlation
 * - Successful phase characteristics
 */
export const WhatWorkedRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('what-worked-content');
        if (!this._container) {
            console.warn('[WhatWorkedRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('PROCESSED_DATA') ||
                stateChanges.action.type.includes('PERIODIZATION')) {
                this._analyze();
            }
        });

        setTimeout(() => this._analyze(), 1050);
        console.log('[WhatWorkedRenderer] Initialized.');
    },

    _analyze() {
        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state);
        const phases = Selectors.selectPeriodizationPhases(state);

        if (!processedData || processedData.length < 30) {
            this._renderNoData();
            return;
        }

        const insights = this._findWhatWorked(processedData, phases);
        this._render(insights);
    },

    _findWhatWorked(data, phases) {
        const insights = [];

        // 1. Find best calorie range for cuts (fastest sustainable loss)
        const cutPeriods = this._findCutPeriods(data);
        if (cutPeriods.length >= 2) {
            const bestCut = this._analyzeBestCut(cutPeriods);
            if (bestCut) insights.push(bestCut);
        }

        // 2. Find best calorie range for bulks (clean gains)
        const bulkPeriods = this._findBulkPeriods(data);
        if (bulkPeriods.length >= 2) {
            const bestBulk = this._analyzeBestBulk(bulkPeriods);
            if (bestBulk) insights.push(bestBulk);
        }

        // 3. Find optimal training volume correlation
        const volumeInsight = this._analyzeVolumePattern(data);
        if (volumeInsight) insights.push(volumeInsight);

        // 4. Analyze successful phase characteristics
        if (phases && phases.length >= 2) {
            const phaseInsight = this._analyzeSuccessfulPhases(phases);
            if (phaseInsight) insights.push(phaseInsight);
        }

        // 5. Find consistency patterns
        const consistencyInsight = this._analyzeConsistencyImpact(data);
        if (consistencyInsight) insights.push(consistencyInsight);

        return insights;
    },

    _findCutPeriods(data) {
        const periods = [];
        let currentPeriod = null;

        data.forEach(d => {
            const isCutting = d.smoothedWeeklyRate != null && d.smoothedWeeklyRate < -0.2;

            if (isCutting) {
                if (!currentPeriod) {
                    currentPeriod = { start: d.date, data: [] };
                }
                currentPeriod.data.push(d);
            } else if (currentPeriod && currentPeriod.data.length >= 14) {
                currentPeriod.end = currentPeriod.data[currentPeriod.data.length - 1].date;
                periods.push(currentPeriod);
                currentPeriod = null;
            } else {
                currentPeriod = null;
            }
        });

        return periods;
    },

    _findBulkPeriods(data) {
        const periods = [];
        let currentPeriod = null;

        data.forEach(d => {
            const isBulking = d.smoothedWeeklyRate != null && d.smoothedWeeklyRate > 0.1;

            if (isBulking) {
                if (!currentPeriod) {
                    currentPeriod = { start: d.date, data: [] };
                }
                currentPeriod.data.push(d);
            } else if (currentPeriod && currentPeriod.data.length >= 14) {
                currentPeriod.end = currentPeriod.data[currentPeriod.data.length - 1].date;
                periods.push(currentPeriod);
                currentPeriod = null;
            } else {
                currentPeriod = null;
            }
        });

        return periods;
    },

    _analyzeBestCut(periods) {
        // Rank cuts by effectiveness (rate while maintaining adherence)
        const analyzed = periods.map(p => {
            const calories = p.data.filter(d => d.calorieIntake != null).map(d => d.calorieIntake);
            const rates = p.data.filter(d => d.smoothedWeeklyRate != null).map(d => d.smoothedWeeklyRate);

            return {
                avgCalories: calories.length > 0 ? calories.reduce((a, b) => a + b, 0) / calories.length : null,
                avgRate: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
                duration: p.data.length
            };
        }).filter(p => p.avgCalories && p.avgRate);

        if (analyzed.length === 0) return null;

        // Best cut = most negative rate with sustainable duration (14+ days)
        const best = analyzed.reduce((b, p) => !b || p.avgRate < b.avgRate ? p : b, null);

        return {
            type: 'cut',
            icon: '🔥',
            title: 'Your Best Cut Calories',
            finding: `Around ${Math.round(best.avgCalories)} kcal/day`,
            detail: `Achieved ${best.avgRate.toFixed(2)} kg/week loss over ${best.duration} days`,
            recommendation: `For effective cutting, target ${Math.round(best.avgCalories - 100)} - ${Math.round(best.avgCalories + 100)} kcal/day`
        };
    },

    _analyzeBestBulk(periods) {
        const analyzed = periods.map(p => {
            const calories = p.data.filter(d => d.calorieIntake != null).map(d => d.calorieIntake);
            const rates = p.data.filter(d => d.smoothedWeeklyRate != null).map(d => d.smoothedWeeklyRate);

            return {
                avgCalories: calories.length > 0 ? calories.reduce((a, b) => a + b, 0) / calories.length : null,
                avgRate: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
                duration: p.data.length
            };
        }).filter(p => p.avgCalories && p.avgRate);

        if (analyzed.length === 0) return null;

        // Best bulk = moderate positive rate (0.15-0.3 kg/wk ideal for lean gains)
        const best = analyzed.reduce((b, p) => {
            if (!b) return p;
            const pScore = p.avgRate > 0.1 && p.avgRate < 0.4 ? 1 : 0.5;
            const bScore = b.avgRate > 0.1 && b.avgRate < 0.4 ? 1 : 0.5;
            return pScore > bScore ? p : b;
        }, null);

        return {
            type: 'bulk',
            icon: '💪',
            title: 'Your Best Bulk Calories',
            finding: `Around ${Math.round(best.avgCalories)} kcal/day`,
            detail: `Achieved ${best.avgRate.toFixed(2)} kg/week gain over ${best.duration} days`,
            recommendation: `For lean bulking, target ${Math.round(best.avgCalories - 100)} - ${Math.round(best.avgCalories + 100)} kcal/day`
        };
    },

    _analyzeVolumePattern(data) {
        const withVolume = data.filter(d => d.totalVolume != null && d.totalVolume > 0 && d.smoothedWeeklyRate != null);

        if (withVolume.length < 14) return null;

        // Group by volume quartiles
        const volumes = withVolume.map(d => d.totalVolume).sort((a, b) => a - b);
        const q1 = volumes[Math.floor(volumes.length * 0.25)];
        const q3 = volumes[Math.floor(volumes.length * 0.75)];

        const lowVolume = withVolume.filter(d => d.totalVolume <= q1);
        const highVolume = withVolume.filter(d => d.totalVolume >= q3);

        const avgRateLow = lowVolume.reduce((s, d) => s + d.smoothedWeeklyRate, 0) / lowVolume.length;
        const avgRateHigh = highVolume.reduce((s, d) => s + d.smoothedWeeklyRate, 0) / highVolume.length;

        const volumeDiff = avgRateHigh - avgRateLow;

        return {
            type: 'volume',
            icon: '🏋️',
            title: 'Training Volume Impact',
            finding: volumeDiff > 0.1
                ? 'Higher volume correlates with more weight gain'
                : volumeDiff < -0.1
                    ? 'Higher volume correlates with more weight loss'
                    : 'Volume has minimal impact on your weight trend',
            detail: `High volume days: ${avgRateHigh.toFixed(2)} kg/wk avg vs Low volume: ${avgRateLow.toFixed(2)} kg/wk`,
            recommendation: volumeDiff > 0.1
                ? 'Increase volume when bulking, reduce during aggressive cuts'
                : 'Your weight responds consistently regardless of volume'
        };
    },

    _analyzeSuccessfulPhases(phases) {
        // Find longest maintained phase
        const longestPhase = phases.reduce((longest, p) => {
            if (!longest || p.durationWeeks > longest.durationWeeks) return p;
            return longest;
        }, null);

        if (!longestPhase) return null;

        return {
            type: 'phase',
            icon: '📅',
            title: 'Your Longest Successful Phase',
            finding: `${longestPhase.durationWeeks} weeks of ${longestPhase.type}`,
            detail: `${longestPhase.avgRate?.toFixed(2) || 'N/A'} kg/week at ~${Math.round(longestPhase.avgCalories || 0)} kcal/day`,
            recommendation: `You can sustain ${longestPhase.type} phases for ${longestPhase.durationWeeks}+ weeks`
        };
    },

    _analyzeConsistencyImpact(data) {
        // Compare weeks with 7/7 logging vs fewer
        const weeks = {};

        data.forEach(d => {
            const weekKey = `${d.date.getFullYear()}-${Math.floor((d.date - new Date(d.date.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000))}`;
            if (!weeks[weekKey]) weeks[weekKey] = { logged: 0, total: 0, rates: [] };
            weeks[weekKey].total++;
            if (d.value != null) weeks[weekKey].logged++;
            if (d.smoothedWeeklyRate != null) weeks[weekKey].rates.push(d.smoothedWeeklyRate);
        });

        const weekStats = Object.values(weeks).filter(w => w.rates.length > 0);
        const consistentWeeks = weekStats.filter(w => w.logged >= 6);
        const inconsistentWeeks = weekStats.filter(w => w.logged < 5);

        if (consistentWeeks.length < 3 || inconsistentWeeks.length < 3) return null;

        const avgRateConsistent = consistentWeeks.flatMap(w => w.rates).reduce((a, b) => a + b, 0) /
            consistentWeeks.flatMap(w => w.rates).length;
        const avgRateInconsistent = inconsistentWeeks.flatMap(w => w.rates).reduce((a, b) => a + b, 0) /
            inconsistentWeeks.flatMap(w => w.rates).length;

        return {
            type: 'consistency',
            icon: '📊',
            title: 'Consistency Impact',
            finding: `Consistent weeks average ${avgRateConsistent.toFixed(2)} kg/wk vs ${avgRateInconsistent.toFixed(2)} kg/wk`,
            detail: `Based on ${consistentWeeks.length} consistent vs ${inconsistentWeeks.length} inconsistent weeks`,
            recommendation: 'Track daily for better data accuracy and trend detection'
        };
    },

    _render(insights) {
        if (!this._container) return;

        if (insights.length === 0) {
            this._container.innerHTML = `
        <div class="empty-state-message">
          <p>Analyzing your patterns...</p>
          <small>Need more varied data to identify successful patterns</small>
        </div>
      `;
            return;
        }

        this._container.innerHTML = `
      <div class="what-worked-list">
        ${insights.map(insight => `
          <div class="insight-card insight-${insight.type}">
            <div class="insight-header">
              <span class="insight-icon">${insight.icon}</span>
              <span class="insight-title">${insight.title}</span>
            </div>
            <div class="insight-finding">${insight.finding}</div>
            <div class="insight-detail">${insight.detail}</div>
            <div class="insight-recommendation">
              <strong>💡</strong> ${insight.recommendation}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more history</p>
        <small>At least 4 weeks of varied data needed to find patterns</small>
      </div>
    `;
    }
};
