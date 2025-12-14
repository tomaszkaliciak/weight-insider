// js/ui/renderers/smartCoachRenderer.js
// Provides dynamic calorie targets based on TDEE and Goal Rate

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

export const SmartCoachRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('smart-coach-content');
        if (!this._container) {
            console.warn('[SmartCoachRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('GOAL')) {
                this._render();
            }
        });

        // Initial check
        setTimeout(() => this._render(), 1100);

        console.log('[SmartCoachRenderer] Initialized.');
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const goal = Selectors.selectGoal(state);

        // We need TDEE and a Goal
        // Use calculated averages from StatsManager (displayStats)
        const tdee = displayStats.avgTDEE_Adaptive ||
            displayStats.avgTDEE_WgtChange ||
            displayStats.avgExpenditureGFit;

        if (!tdee) {
            this._renderNoData("Calculating TDEE...");
            return;
        }

        // Calculate Target Rate
        // If user set a specific goal weight + date, we can infer rate.
        // For now, let's look for 'targetRate' in displayStats or goal.
        // Or assume a default "Sustainable" rate if no goal set? 
        // Let's use the 'current weekly rate' as baseline if no goal? 
        // No, that's descriptive. We need Prescriptive.

        // Ideally, we'd have a 'Target Rate' setting. 
        // For this MVP, let's assume a standard -0.5kg/week cut if no specific rate is found,
        // OR better: use the Suggested Goal logic if active?

        // Let's use a "Goal Selection" logic:
        // If current rate < -0.2 => "Cutting Mode" (Stick to current or Optimize)
        // If current rate > 0.1 => "Bulking Mode"

        // Let's simplify: Show targets for 3 scenarios:
        // 1. Maintenance
        // 2. Mild Cut (-0.5kg)
        // 3. Current Trend (Keep doing what you're doing)

        // Current Trend Rate
        const currentTrendRate = displayStats.latestWeeklyRate || 0;

        // Calculate Calories for rates
        const kcalPerKg = 7700;
        const calcTarget = (kgPerWeek) => Math.round(tdee + (kgPerWeek * kcalPerKg / 7));

        const maintCals = Math.round(tdee);
        const cutCals = calcTarget(-0.5); // Moderate Cut
        const aggressiveCutCals = calcTarget(-1.0); // Aggressive
        const bulkCals = calcTarget(0.25); // Lean Bulk

        // Determine "Recommended" based on Current Trend or Phase
        let header = "Calorie Targets";
        let subtext = "Based on your adaptive TDEE";

        this._container.innerHTML = `
            <div class="coach-grid">
                <div class="coach-card recommended">
                    <div class="coach-label">To Maintain</div>
                    <div class="coach-value">${maintCals} <small>kcal</small></div>
                </div>
                
                <div class="coach-card ${currentTrendRate < -0.3 ? 'active' : ''}">
                    <div class="coach-label">To Lose 0.5kg/wk</div>
                    <div class="coach-value">${cutCals} <small>kcal</small></div>
                </div>

                <div class="coach-card ${currentTrendRate > 0.1 ? 'active' : ''}">
                    <div class="coach-label">To Gain 0.25kg/wk</div>
                    <div class="coach-value">${bulkCals} <small>kcal</small></div>
                </div>
            </div>
            <div class="coach-footer">
                TDEE: <strong>${maintCals}</strong> kcal
            </div>
        `;
    },

    _renderNoData(msg) {
        if (this._container) this._container.innerHTML = `<p class="empty-state">${msg}</p>`;
    }
};
