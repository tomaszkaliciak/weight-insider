// js/ui/renderers/quickStatsRenderer.js
// Updates the Quick Stats Bar with key metrics at a glance

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

export const QuickStatsRenderer = {
    _elements: {},

    init() {
        this._elements = {
            currentWeight: document.getElementById('qs-current-weight'),
            weeklyChange: document.getElementById('qs-weekly-change'),
            daysTracked: document.getElementById('qs-days-tracked'),
            toGoal: document.getElementById('qs-to-goal')
        };

        if (!this._elements.currentWeight) {
            console.log('[QuickStatsRenderer] Container not found, skipping init.');
            return;
        }

        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => {
            this._render(stats);
        });

        console.log('[QuickStatsRenderer] Initialized.');
    },

    _render(stats) {
        const fv = Utils.formatValue;

        // Current weight (SMA preferred)
        if (this._elements.currentWeight) {
            const current = stats.currentSma ?? stats.currentWeight;
            this._elements.currentWeight.textContent = current != null
                ? fv(current, 1)
                : '--';
        }

        // Weekly change
        if (this._elements.weeklyChange) {
            const rate = stats.currentWeeklyRate ?? stats.regressionSlopeWeekly;
            if (rate != null) {
                const sign = rate > 0 ? '+' : '';
                this._elements.weeklyChange.textContent = `${sign}${fv(rate, 2)}`;
                this._elements.weeklyChange.style.color = rate > 0
                    ? 'var(--success-color)'
                    : rate < 0
                        ? 'var(--danger-color)'
                        : 'var(--text-primary)';
            } else {
                this._elements.weeklyChange.textContent = '--';
            }
        }

        // Days tracked
        if (this._elements.daysTracked) {
            const state = StateManager.getState();
            const data = Selectors.selectFilteredData(state);
            const days = data?.filter(d => d.value != null).length ?? 0;
            this._elements.daysTracked.textContent = days > 0 ? days : '--';
        }

        // To Goal
        if (this._elements.toGoal) {
            const toGoal = stats.weightToGoal;
            if (toGoal != null) {
                const sign = toGoal > 0 ? '+' : '';
                this._elements.toGoal.textContent = `${sign}${fv(toGoal, 1)}`;
            } else {
                this._elements.toGoal.textContent = '--';
            }
        }
    }
};
