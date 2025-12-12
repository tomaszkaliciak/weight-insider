// js/ui/renderers/workoutCorrelationRenderer.js
// Renders workout correlation analysis results

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';

/**
 * Renders the workout-weight correlation analysis panel.
 */
export const WorkoutCorrelationRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('workout-correlation-list');
        if (!this._container) {
            console.warn('[WorkoutCorrelationRenderer] Container #workout-correlation-list not found.');
            return;
        }

        // Subscribe to state changes
        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('WORKOUT_CORRELATION')) {
                this._render();
            }
        });

        // Initial render
        this._render();
        console.log('[WorkoutCorrelationRenderer] Initialized.');
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const correlation = Selectors.selectWorkoutCorrelation(state);

        if (!correlation || correlation.coefficient === null) {
            this._container.innerHTML = `
        <div class="empty-state-message">
          <p>No workout correlation data available</p>
          <small>${correlation?.interpretation || 'No data'}</small>
        </div>
      `;
            return;
        }

        const { coefficient, interpretation, totalWeeks, weeklyData } = correlation;

        // Determine correlation strength color
        const absCoef = Math.abs(coefficient);
        let strengthClass = 'correlation-weak';
        if (absCoef >= 0.7) {
            strengthClass = 'correlation-strong';
        } else if (absCoef >= 0.4) {
            strengthClass = 'correlation-moderate';
        }

        // Calculate summary stats from weekly data
        const avgVolume = weeklyData.length > 0
            ? Math.round(weeklyData.reduce((sum, w) => sum + w.weeklyVolume, 0) / weeklyData.length)
            : 0;
        const avgTrainingDays = weeklyData.length > 0
            ? (weeklyData.reduce((sum, w) => sum + w.trainingDays, 0) / weeklyData.length).toFixed(1)
            : 0;

        this._container.innerHTML = `
      <div class="correlation-card">
        <div class="correlation-header">
          <span class="correlation-badge ${strengthClass}">
            r = ${coefficient.toFixed(3)}
          </span>
          <span class="correlation-interpretation">${interpretation}</span>
        </div>
        <div class="correlation-stats">
          <div class="correlation-stat">
            <span class="stat-label">Weeks Analyzed</span>
            <span class="stat-value">${totalWeeks}</span>
          </div>
          <div class="correlation-stat">
            <span class="stat-label">Avg Weekly Volume</span>
            <span class="stat-value">${avgVolume.toLocaleString()} kg</span>
          </div>
          <div class="correlation-stat">
            <span class="stat-label">Avg Training Days/Week</span>
            <span class="stat-value">${avgTrainingDays}</span>
          </div>
        </div>
        <div class="correlation-explanation">
          <small>
            ${this._getExplanationText(coefficient)}
          </small>
        </div>
      </div>
    `;
    },

    _getExplanationText(coefficient) {
        if (coefficient > 0.3) {
            return 'Higher training volume is associated with weight gain. This could indicate muscle building during a bulk phase.';
        } else if (coefficient < -0.3) {
            return 'Higher training volume is associated with weight loss. Exercise may be contributing to calorie deficit.';
        } else {
            return 'Training volume and weight change show no strong relationship. Other factors (diet, rest) may be more influential.';
        }
    }
};
