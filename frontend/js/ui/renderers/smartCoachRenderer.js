// js/ui/renderers/smartCoachRenderer.js
// Provides dynamic calorie targets AND personalized actionable recommendations

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';
import { VisibilityManager } from '../visibilityManager.js';

export const SmartCoachRenderer = {
    _container: null,
    _isVisible: false,

    init() {
        this._container = document.getElementById('smart-coach-container');
        if (!this._container) {
            console.warn('[SmartCoachRenderer] Container not found.');
            return;
        }

        VisibilityManager.observe(this._container.parentElement, (isVisible) => {
            this._isVisible = isVisible;
            if (isVisible) {
                this._render();
            }
        });

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('GOAL') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                if (this._isVisible) this._render();
            }
        });

        // Initial render check
        if (this._isVisible) {
            this._render();
        }

        console.log('[SmartCoachRenderer] Initialized.');
    },

    /**
     * Detect current phase based on rate and consistency
     */
    _detectPhase(displayStats) {
        const rate = displayStats.currentWeeklyRate || 0;
        const avgRate = displayStats.avgWeeklyRate || rate;
        const plateauDays = displayStats.plateauDays || 0;

        if (plateauDays >= 14 || (Math.abs(avgRate) < 0.1 && Math.abs(rate) < 0.15)) {
            return { phase: 'plateau', label: 'Plateau', icon: '⏸️', color: 'var(--warning)' };
        }
        if (rate < -0.3) {
            return { phase: 'cutting', label: 'Cutting', icon: '📉', color: 'var(--danger)' };
        }
        if (rate > 0.15) {
            return { phase: 'bulking', label: 'Bulking', icon: '📈', color: 'var(--success)' };
        }
        return { phase: 'maintenance', label: 'Maintenance', icon: '⚖️', color: 'var(--primary)' };
    },

    /**
     * Generate personalized recommendations based on current metrics
     */
    _generateRecommendations(displayStats, goal) {
        const recommendations = [];
        const rate = displayStats.currentWeeklyRate || 0;
        const avgRate = displayStats.avgWeeklyRate || rate;
        const tdee = displayStats.avgTDEE_Adaptive || displayStats.avgTDEE_WgtChange || displayStats.avgExpenditureGFit;
        const avgIntake = displayStats.avgIntake || 0;
        const volatility = displayStats.volatility || 0;
        const consistency = displayStats.rateConsistencyStdDev;
        const weekendSpike = displayStats.weekendCalorieSpike || 0;

        // 1. Rate Assessment
        if (rate < -1.0) {
            recommendations.push({
                priority: 1,
                type: 'warning',
                icon: '⚠️',
                title: 'Rate Too Aggressive',
                detail: `Losing ${Math.abs(rate).toFixed(2)} kg/wk risks muscle loss. Consider adding ~${Math.round(Math.abs(rate + 0.5) * 7700 / 7)} kcal daily.`
            });
        } else if (rate < -0.7 && rate >= -1.0) {
            recommendations.push({
                priority: 2,
                type: 'caution',
                icon: '🔶',
                title: 'Aggressive Cut',
                detail: `Your rate of ${Math.abs(rate).toFixed(2)} kg/wk is on the aggressive side. Monitor energy levels closely.`
            });
        } else if (rate >= -0.1 && rate <= 0.1 && goal?.weight && displayStats.currentWeight) {
            const diff = displayStats.currentWeight - goal.weight;
            if (diff > 2) {
                recommendations.push({
                    priority: 2,
                    type: 'info',
                    icon: '📊',
                    title: 'Stalled Progress',
                    detail: `You're ${diff.toFixed(1)} kg from goal but not losing. Reduce intake by ~300 kcal to restart progress.`
                });
            }
        }

        // 2. Consistency Check
        if (consistency !== null && consistency > 0.3) {
            recommendations.push({
                priority: 3,
                type: 'tip',
                icon: '🎯',
                title: 'Improve Consistency',
                detail: 'Your rate varies significantly week-to-week. More consistent calorie intake will yield steadier results.'
            });
        }

        // 3. Weekend Pattern
        if (weekendSpike > 300) {
            recommendations.push({
                priority: 3,
                type: 'tip',
                icon: '📅',
                title: 'Weekend Surplus',
                detail: `You eat ~${Math.round(weekendSpike)} kcal more on weekends. Aim to stay within 200 kcal of weekday averages.`
            });
        }

        // 4. Volatility Check
        if (volatility > 0.8) {
            recommendations.push({
                priority: 4,
                type: 'info',
                icon: '💧',
                title: 'High Water Weight Fluctuation',
                detail: 'Your weight fluctuates significantly. Focus on weekly averages rather than daily readings.'
            });
        }

        // 5. Positive Reinforcement
        if (rate >= -0.6 && rate <= -0.3 && (consistency === null || consistency < 0.2)) {
            recommendations.push({
                priority: 5,
                type: 'success',
                icon: '✅',
                title: 'Optimal Progress',
                detail: 'Great work! Your rate is sustainable and consistent. Keep up the current approach.'
            });
        }

        // 6. Bulking Check
        if (rate > 0.4) {
            recommendations.push({
                priority: 2,
                type: 'caution',
                icon: '🔶',
                title: 'Rapid Gain',
                detail: `Gaining ${rate.toFixed(2)} kg/wk may add excess fat. Consider reducing surplus by ~${Math.round((rate - 0.25) * 7700 / 7)} kcal.`
            });
        }

        // 7. Goal Progress
        if (goal?.weight && goal?.date && displayStats.currentWeight) {
            const daysToGoal = Math.max(1, (new Date(goal.date) - new Date()) / (1000 * 60 * 60 * 24));
            const weightToLose = displayStats.currentWeight - goal.weight;
            const requiredRate = weightToLose / (daysToGoal / 7);

            if (requiredRate < -1.2) {
                recommendations.push({
                    priority: 1,
                    type: 'warning',
                    icon: '📆',
                    title: 'Goal Unrealistic',
                    detail: `Reaching ${goal.weight} kg by target date requires ${Math.abs(requiredRate).toFixed(1)} kg/wk - not sustainable. Consider extending timeline.`
                });
            } else if (Math.abs(requiredRate - rate) > 0.3 && weightToLose > 0) {
                const direction = requiredRate < rate ? 'reducing' : 'increasing';
                recommendations.push({
                    priority: 3,
                    type: 'info',
                    icon: '🎯',
                    title: 'Adjust to Hit Goal',
                    detail: `To reach goal on time, try ${direction} intake by ~${Math.abs(Math.round((requiredRate - rate) * 7700 / 7))} kcal/day.`
                });
            }
        }

        // Sort by priority and limit to top 4
        return recommendations.sort((a, b) => a.priority - b.priority).slice(0, 4);
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const goal = Selectors.selectGoal(state);

        const tdee = displayStats.avgTDEE_Adaptive ||
            displayStats.avgTDEE_WgtChange ||
            displayStats.avgExpenditureGFit;

        if (!tdee) {
            this._renderNoData("Calculating TDEE...");
            return;
        }

        const phase = this._detectPhase(displayStats);
        const recommendations = this._generateRecommendations(displayStats, goal);
        const currentRate = displayStats.currentWeeklyRate || 0;

        // Calculate Calories for different targets
        const kcalPerKg = 7700;
        const calcTarget = (kgPerWeek) => Math.round(tdee + (kgPerWeek * kcalPerKg / 7));
        const maintCals = Math.round(tdee);
        const cutCals = calcTarget(-0.5);
        const bulkCals = calcTarget(0.25);

        // Build recommendations HTML
        const recsHtml = recommendations.length > 0
            ? recommendations.map(r => `
                <div class="recommendation-item recommendation--${r.type}">
                    <span class="rec-icon">${r.icon}</span>
                    <div class="rec-content">
                        <div class="rec-title">${r.title}</div>
                        <div class="rec-detail">${r.detail}</div>
                    </div>
                </div>
            `).join('')
            : '<p class="empty-state">Looking good! No specific recommendations right now.</p>';

        this._container.innerHTML = `
            <div class="coach-phase-badge" style="border-left: 3px solid ${phase.color}">
                <span class="phase-icon">${phase.icon}</span>
                <span class="phase-label">Current Phase: <strong>${phase.label}</strong></span>
                <span class="phase-rate">(${currentRate >= 0 ? '+' : ''}${currentRate.toFixed(2)} kg/wk)</span>
            </div>

            <div class="coach-grid">
                <div class="coach-card ${phase.phase === 'maintenance' ? 'active' : ''}">
                    <div class="coach-label">Maintain</div>
                    <div class="coach-value">${maintCals} <small>kcal</small></div>
                </div>
                <div class="coach-card ${phase.phase === 'cutting' ? 'active' : ''}">
                    <div class="coach-label">Lose 0.5kg/wk</div>
                    <div class="coach-value">${cutCals} <small>kcal</small></div>
                </div>
                <div class="coach-card ${phase.phase === 'bulking' ? 'active' : ''}">
                    <div class="coach-label">Gain 0.25kg/wk</div>
                    <div class="coach-value">${bulkCals} <small>kcal</small></div>
                </div>
            </div>

            <div class="coach-recommendations">
                <h4>💡 Smart Recommendations</h4>
                ${recsHtml}
            </div>
        `;
    },

    _renderNoData(msg) {
        if (this._container) this._container.innerHTML = `<p class="empty-state">${msg}</p>`;
    }
};
