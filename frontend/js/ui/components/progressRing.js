// js/ui/components/progressRing.js
// SVG-based circular progress indicator for goal tracking

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';

/**
 * ProgressRing component displays a circular progress indicator
 * showing percentage progress toward goal weight.
 */
export const ProgressRing = {
    _container: null,
    _radius: 50,
    _strokeWidth: 8,

    init(containerId = 'goal-progress-ring') {
        this._container = document.getElementById(containerId);
        if (!this._container) {
            console.log('[ProgressRing] Container not found, skipping init.');
            return;
        }

        // Subscribe to display stats updates
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => {
            this._render(stats);
        });

        // Initial render
        this._render({});
        console.log('[ProgressRing] Initialized.');
    },

    _calculateProgress(stats) {
        const state = StateManager.getState();
        const goal = Selectors.selectGoal(state);

        if (!goal.weight || !stats.startingWeight || !stats.currentSma) {
            return { progress: 0, label: 'No goal set' };
        }

        const startWeight = stats.startingWeight;
        const currentWeight = stats.currentSma;
        const goalWeight = goal.weight;

        // Calculate total distance and current progress
        const totalDistance = Math.abs(goalWeight - startWeight);
        if (totalDistance < 0.1) {
            return { progress: 100, label: 'At goal!' };
        }

        const currentDistance = Math.abs(goalWeight - currentWeight);
        const progress = Math.max(0, Math.min(100, ((totalDistance - currentDistance) / totalDistance) * 100));

        // Check if trending in right direction
        const isGaining = goalWeight > startWeight;
        const isMovingRight = isGaining
            ? currentWeight >= startWeight
            : currentWeight <= startWeight;

        return {
            progress: isMovingRight ? progress : 0,
            label: `${progress.toFixed(0)}%`,
            toGo: currentDistance.toFixed(1)
        };
    },

    _render(stats) {
        if (!this._container) return;

        const { progress, label, toGo } = this._calculateProgress(stats);
        const circumference = 2 * Math.PI * this._radius;
        const offset = circumference - (progress / 100) * circumference;

        // Color based on progress
        const progressColor = progress >= 75 ? 'var(--success-color)' :
            progress >= 50 ? 'var(--primary-color)' :
                progress >= 25 ? 'var(--warning-color)' : 'var(--text-muted)';

        this._container.innerHTML = `
            <div class="progress-ring-wrapper">
                <svg class="progress-ring" viewBox="0 0 ${(this._radius + this._strokeWidth) * 2} ${(this._radius + this._strokeWidth) * 2}">
                    <circle class="progress-ring-bg"
                        cx="${this._radius + this._strokeWidth}"
                        cy="${this._radius + this._strokeWidth}"
                        r="${this._radius}"
                        stroke-width="${this._strokeWidth}"
                        fill="none"
                    />
                    <circle class="progress-ring-fill"
                        cx="${this._radius + this._strokeWidth}"
                        cy="${this._radius + this._strokeWidth}"
                        r="${this._radius}"
                        stroke-width="${this._strokeWidth}"
                        fill="none"
                        stroke="${progressColor}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}"
                        stroke-linecap="round"
                        transform="rotate(-90 ${this._radius + this._strokeWidth} ${this._radius + this._strokeWidth})"
                    />
                </svg>
                <div class="progress-ring-content">
                    <span class="progress-ring-label">${label}</span>
                    ${toGo ? `<span class="progress-ring-detail">${toGo} kg to go</span>` : ''}
                </div>
            </div>
        `;
    }
};
