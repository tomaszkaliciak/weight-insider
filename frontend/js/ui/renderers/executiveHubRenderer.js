// js/ui/renderers/executiveHubRenderer.js
// High-impact glassmorphism executive summary hub with milestone achievements.

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { UnitFormatter } from '../../core/unitFormatter.js';
import { MilestoneDetector } from '../../core/milestoneDetector.js';

export const ExecutiveHubRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('executive-hub-content');
        if (!this._container) {
            console.warn('[ExecutiveHubRenderer] Container #executive-hub-content not found.');
            return;
        }

        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => {
            this._render(stats);
        });
        StateManager.subscribeToSpecificEvent('state:settingsChanged', () => {
            const state = StateManager.getState();
            if (state.displayStats) this._render(state.displayStats);
        });
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
        const isCutting = weightToGoal < 0;

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

        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state) || [];
        const goal = state.goal || {};

        const fv = Utils.formatValue;
        const trend = stats.regressionSlopeWeekly ?? stats.currentWeeklyRate;
        const status = this._getStrategicStatus(stats);
        const unitLabel = UnitFormatter.getUnitLabel();
        const rateLabel = UnitFormatter.getRateLabel();

        if (stats.currentSma == null || trend == null) {
            Utils.renderEmptyState(this._container, {
                title: "Insufficient data",
                detail: "Need at least 7 days of recent weight entries.",
                icon: "📊",
            });
            return;
        }

        const tdee = stats.avgTDEE_Adaptive || stats.avgTDEE_WgtChange || stats.avgExpenditureGFit;
        const goalWeight = stats.targetWeight;

        const currentSmaStr = UnitFormatter.formatWeight(stats.currentSma, 1);
        const currentWeightStr = UnitFormatter.formatWeight(stats.currentWeight, 1);
        const trendStr = UnitFormatter.formatRate(trend, 2);
        const goalWeightStr = goalWeight ? UnitFormatter.formatWeight(goalWeight, 1) : '---';

        // Detect achievements
        const milestones = MilestoneDetector.detectMilestones(processedData, goal);

        this._container.innerHTML = `
            <div class="executive-hub-metrics-grid">
                <!-- Metric 1: Current SMA -->
                <div class="hub-metric">
                    <div class="hub-label">Current SMA</div>
                    <div class="hub-value">
                        ${currentSmaStr}
                        <span class="hub-unit">${unitLabel}</span>
                    </div>
                    <div class="hub-status neutral">
                       Latest: ${currentWeightStr} ${unitLabel}
                    </div>
                </div>

                <!-- Metric 2: Primary Trend -->
                <div class="hub-metric">
                    <div class="hub-label">Weekly Trend</div>
                    <div class="hub-value">
                        ${trendStr}
                        <span class="hub-unit">${rateLabel}</span>
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
                        ${goalWeightStr}
                        <span class="hub-unit">${goalWeight ? unitLabel : ''}</span>
                    </div>
                    <div class="hub-status neutral">
                        ${stats.estimatedTimeToGoal || 'No goal set'}
                    </div>
                </div>
            </div>

            ${milestones.length > 0 ? `
                <div class="hub-milestones-strip">
                    <div class="milestones-title">🏆 Journey Achievements</div>
                    <div class="milestones-list">
                        ${milestones.map(m => `
                            <div class="milestone-chip ${m.badgeClass}" title="${m.description}">
                                <span class="milestone-icon">${m.icon}</span>
                                <span class="milestone-text">${m.title}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }
};
