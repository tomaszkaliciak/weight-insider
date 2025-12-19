// js/ui/renderers/executiveHubRenderer.js
// High-impact glassmorphism executive summary hub

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

export const ExecutiveHubRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('executive-hub-content');
        if (!this._container) {
            console.warn('[ExecutiveHubRenderer] Container #executive-hub-content not found.');
            return;
        }

        // Subscribe to display stats updates
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => {
            this._render(stats);
        });

        console.log('[ExecutiveHubRenderer] Initialized.');
    },

    /**
     * Determines the strategic status based on current performance vs goal.
     */
    _getStrategicStatus(stats) {
        if (!stats.currentSma) return { label: 'Analysing...', class: 'neutral' };

        const trend = stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
        const goal = stats.targetWeight;

        if (!goal) return { label: 'No Goal Set', class: 'neutral' };

        const weightToGoal = stats.weightToGoal;
        const isCutting = weightToGoal < 0; // Negative distance means we want to lose weight

        // Check if trend matches goal direction
        const trendingRight = isCutting ? trend < -0.05 : trend > 0.05;
        const isStable = Math.abs(trend) <= 0.05;

        if (isStable) return { label: 'Maintaining / Flat', class: 'neutral' };

        if (trendingRight) {
            return { label: 'Optimal Progress', class: 'optimal' };
        } else {
            return { label: 'Off-Track / Counter-Trend', class: 'warning' };
        }
    },

    _render(stats) {
        if (!this._container) return;

        const fv = Utils.formatValue;
        const trend = stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
        const status = this._getStrategicStatus(stats);

        const tdee = stats.avgTDEE_Adaptive || stats.avgTDEE_WgtChange || stats.avgExpenditureGFit;
        const goalWeight = stats.targetWeight;

        this._container.innerHTML = `
            <!-- Metric 1: Current SMA -->
            <div class="hub-metric">
                <div class="hub-label">Current SMA</div>
                <div class="hub-value">
                    ${fv(stats.currentSma, 1)}
                    <span class="hub-unit">kg</span>
                </div>
                <div class="hub-status neutral">
                   Latest entry: ${fv(stats.currentWeight, 1)} kg
                </div>
            </div>

            <!-- Metric 2: Primary Trend -->
            <div class="hub-metric">
                <div class="hub-label">Weekly Trend</div>
                <div class="hub-value">
                    ${trend > 0 ? '+' : ''}${fv(trend, 2)}
                    <span class="hub-unit">kg/wk</span>
                </div>
                <div class="hub-status ${status.class}">
                    ${status.label}
                </div>
            </div>

            <!-- Metric 3: Adaptive TDEE -->
            <div class="hub-metric">
                <div class="hub-label">Est. Daily TDEE</div>
                <div class="hub-value">
                    ${fv(tdee, 0)}
                    <span class="hub-unit">kcal</span>
                </div>
                <div class="hub-status optimal">
                    ${stats.baselineTDEESource || 'Adaptive'}
                </div>
            </div>

            <!-- Metric 4: Goal Status -->
            <div class="hub-metric">
                <div class="hub-label">Goal Target</div>
                <div class="hub-value">
                    ${goalWeight ? fv(goalWeight, 1) : '---'}
                    <span class="hub-unit">${goalWeight ? 'kg' : ''}</span>
                </div>
                <div class="hub-status neutral">
                    ${stats.estimatedTimeToGoal || 'No goal set'}
                </div>
            </div>
        `;
    }
};
