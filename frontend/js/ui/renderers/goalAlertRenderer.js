// js/ui/renderers/goalAlertRenderer.js
// Renders goal progress alerts and notifications

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

/**
 * Monitors goal progress and displays alerts when:
 * - User is off-track from goal rate
 * - Weight trend is moving away from goal
 * - Goal deadline is approaching
 * - Milestone achievements
 */
export const GoalAlertRenderer = {
    _container: null,
    _alerts: [],

    init() {
        this._container = document.getElementById('goal-alerts-list');
        if (!this._container) {
            console.warn('[GoalAlertRenderer] Container #goal-alerts-list not found.');
            return;
        }

        StateManager.subscribeToSpecificEvent('state:goalChanged', () => this._checkAlerts());
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', () => this._checkAlerts());
        StateManager.subscribeToSpecificEvent('state:filteredDataChanged', () => this._checkAlerts());

        // Initial check
        setTimeout(() => this._checkAlerts(), 500);
    },

    _checkAlerts() {
        const state = StateManager.getState();
        const goal = Selectors.selectGoal(state);
        const displayStats = state.displayStats || {};
        const filteredData = Selectors.selectFilteredData(state);

        this._alerts = [];

        // No goal set
        if (!goal.weight || !goal.date) {
            this._render();
            return;
        }

        // Get current weight from latest data
        const currentWeight = this._getCurrentWeight(filteredData);
        if (!currentWeight) {
            this._render();
            return;
        }

        const now = new Date();
        const goalDate = goal.date instanceof Date ? goal.date : new Date(goal.date);
        const daysToGoal = Math.ceil((goalDate - now) / (1000 * 60 * 60 * 24));
        const weightToGoal = goal.weight - currentWeight;
        const isGaining = weightToGoal > 0;

        // Check for various alert conditions
        this._checkDeadlineAlert(daysToGoal, goalDate);
        this._checkProgressAlert(displayStats, goal, weightToGoal, daysToGoal, isGaining);
        this._checkRateAlert(displayStats, goal, isGaining);
        this._checkMilestoneAlert(currentWeight, goal.weight, weightToGoal);
        this._checkGoalAchievedAlert(currentWeight, goal.weight);
        this._checkTDEEDriftAlert(displayStats);

        this._render();
    },

    _getCurrentWeight(filteredData) {
        if (!filteredData || filteredData.length === 0) return null;

        // Get the most recent weight value
        for (let i = filteredData.length - 1; i >= 0; i--) {
            if (filteredData[i].value != null) {
                return filteredData[i].value;
            }
        }
        return null;
    },

    _checkDeadlineAlert(daysToGoal, goalDate) {
        if (daysToGoal <= 0) {
            this._alerts.push({
                type: 'warning',
                icon: '⏰',
                title: 'Goal Deadline Passed',
                message: `Your goal deadline was ${Utils.formatDateShort(goalDate)}. Consider updating your goal.`,
                priority: 1
            });
        } else if (daysToGoal <= 7) {
            this._alerts.push({
                type: 'info',
                icon: '📅',
                title: 'Goal Deadline Approaching',
                message: `Only ${daysToGoal} days left to reach your goal!`,
                priority: 2
            });
        } else if (daysToGoal <= 14) {
            this._alerts.push({
                type: 'info',
                icon: '📆',
                title: '2 Weeks Until Deadline',
                message: `${daysToGoal} days remaining. Time for a final push!`,
                priority: 4
            });
        }
    },

    _checkProgressAlert(displayStats, goal, weightToGoal, daysToGoal, isGaining) {
        const currentRate = displayStats.latestWeeklyRate;
        if (currentRate == null || daysToGoal <= 0) return;

        const weeksRemaining = daysToGoal / 7;
        const requiredRate = weightToGoal / weeksRemaining;

        // Check if current trajectory will hit goal
        const projectedWeightChange = currentRate * weeksRemaining;
        const projectedFinalWeight = (displayStats.latestWeight || 0) + projectedWeightChange;

        const willHitGoal = isGaining
            ? projectedFinalWeight >= goal.weight
            : projectedFinalWeight <= goal.weight;

        if (!willHitGoal) {
            const deficit = Math.abs(goal.weight - projectedFinalWeight).toFixed(1);
            this._alerts.push({
                type: 'warning',
                icon: '📉',
                title: 'Off Track',
                message: `At current rate, you'll miss your goal by ${deficit} kg. Required: ${requiredRate.toFixed(2)} kg/week.`,
                priority: 2
            });
        } else {
            this._alerts.push({
                type: 'success',
                icon: '✅',
                title: 'On Track',
                message: `Great progress! You're projected to reach your goal.`,
                priority: 5
            });
        }
    },

    _checkRateAlert(displayStats, goal, isGaining) {
        const currentRate = displayStats.latestWeeklyRate;
        if (currentRate == null) return;

        // Check if rate direction matches goal direction
        const rateMatchesGoal = isGaining ? currentRate > 0 : currentRate < 0;

        if (!rateMatchesGoal && Math.abs(currentRate) > 0.1) {
            const direction = currentRate > 0 ? 'gaining' : 'losing';
            const goalDirection = isGaining ? 'gain' : 'lose';
            this._alerts.push({
                type: 'error',
                icon: '⚠️',
                title: 'Wrong Direction',
                message: `You're ${direction} weight but need to ${goalDirection}. Current rate: ${currentRate.toFixed(2)} kg/week.`,
                priority: 1
            });
        }

        // Check for extreme rates
        if (Math.abs(currentRate) > 1.0) {
            const rateType = Math.abs(currentRate) > 1.5 ? 'dangerously' : 'quite';
            this._alerts.push({
                type: 'warning',
                icon: '🏃',
                title: 'Rapid Change',
                message: `Your weight is changing ${rateType} fast (${currentRate.toFixed(2)} kg/week). Consider moderating.`,
                priority: 3
            });
        }
    },

    _checkMilestoneAlert(currentWeight, goalWeight, weightToGoal) {
        const totalDistance = Math.abs(goalWeight - currentWeight + weightToGoal);
        if (totalDistance === 0) return;

        const progress = 1 - (Math.abs(weightToGoal) / totalDistance);

        // Check milestone achievements
        const milestones = [
            { threshold: 0.25, message: '25% of the way to your goal!' },
            { threshold: 0.50, message: 'Halfway to your goal! 🎉' },
            { threshold: 0.75, message: '75% complete! Almost there!' },
            { threshold: 0.90, message: 'Just 10% left! Final stretch!' },
        ];

        for (const milestone of milestones) {
            if (progress >= milestone.threshold && progress < milestone.threshold + 0.05) {
                this._alerts.push({
                    type: 'success',
                    icon: '🏆',
                    title: 'Milestone Reached',
                    message: milestone.message,
                    priority: 3
                });
                break;
            }
        }
    },

    _checkGoalAchievedAlert(currentWeight, goalWeight) {
        const tolerance = 0.3; // Within 0.3 kg of goal
        if (Math.abs(currentWeight - goalWeight) <= tolerance) {
            this._alerts.push({
                type: 'success',
                icon: '🎯',
                title: 'Goal Achieved!',
                message: `Congratulations! You've reached your goal weight of ${goalWeight} kg!`,
                priority: 0
            });
        }
    },

    _render() {
        if (!this._container) return;

        // Goal Projection panel always renders at top when goal is set
        const state = StateManager.getState();
        const goal = Selectors.selectGoal(state);
        const displayStats = state.displayStats || {};
        this._renderProjection(goal, displayStats);

        if (this._alerts.length === 0) {
            const state = StateManager.getState();
            const goal = Selectors.selectGoal(state);

            if (!goal.weight || !goal.date) {
                this._container.innerHTML = `
          <div class="empty-state-message">
            <p>No goal set</p>
            <small>Set a weight goal to receive progress alerts</small>
          </div>
        `;
            } else {
                this._container.innerHTML = `
          <div class="empty-state-message">
            <p>No alerts</p>
            <small>Everything looks good!</small>
          </div>
        `;
            }
            return;
        }

        // Sort alerts by priority (lower = more important)
        this._alerts.sort((a, b) => a.priority - b.priority);

        this._container.innerHTML = this._alerts.map(alert => `
      <div class="goal-alert goal-alert--${alert.type}">
        <div class="alert-icon">${alert.icon}</div>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-message">${alert.message}</div>
        </div>
      </div>
    `).join('');
    },

    _renderProjection(goal, displayStats) {
        // Find or create the projection panel (rendered outside the alerts list, in parent)
        const parent = this._container?.parentElement;
        if (!parent) return;

        let panel = parent.querySelector('#goal-projection-panel');

        if (!goal.weight || !goal.date) {
            if (panel) panel.remove();
            return;
        }

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'goal-projection-panel';
            panel.className = 'goal-projection-panel';
            parent.insertBefore(panel, this._container);
        }

        const eta = displayStats.estimatedTimeToGoal || 'N/A';
        const requiredRate = displayStats.requiredRateForGoal;
        const currentRate = displayStats.currentWeeklyRate ?? displayStats.regressionSlopeWeekly;
        const weightToGoal = displayStats.weightToGoal;
        const goalWeight = parseFloat(goal.weight);
        const goalDate = goal.date instanceof Date ? goal.date : new Date(goal.date);
        const daysToGoal = Math.ceil((goalDate - new Date()) / (1000 * 60 * 60 * 24));

        // Determine on-track/off-track status
        let verdict = '';
        let verdictClass = '';
        if (currentRate != null && requiredRate != null) {
            const isGaining = weightToGoal > 0;
            const onTrack = isGaining ? currentRate >= requiredRate * 0.85 : currentRate <= requiredRate * 0.85;
            verdict = onTrack ? '✅ On track' : '⚠️ Off track';
            verdictClass = onTrack ? 'on-track' : 'off-track';
        }

        const formatRate = (r) => r != null ? `${r > 0 ? '+' : ''}${r.toFixed(2)} kg/wk` : '—';
        const formatKg = (v) => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)} kg` : '—';

        panel.innerHTML = `
          <div class="goal-projection-header">
            <span class="goal-projection-title">🎯 Goal Forecast</span>
            <span class="goal-projection-verdict ${verdictClass}">${verdict}</span>
          </div>
          <div class="goal-projection-stats">
            <div class="gp-stat">
              <div class="gp-label">ETA at current rate</div>
              <div class="gp-value">${eta}</div>
            </div>
            <div class="gp-stat">
              <div class="gp-label">Days to deadline</div>
              <div class="gp-value">${daysToGoal > 0 ? daysToGoal : 'Passed'}</div>
            </div>
            <div class="gp-stat">
              <div class="gp-label">Remaining</div>
              <div class="gp-value">${formatKg(weightToGoal)}</div>
            </div>
            <div class="gp-stat">
              <div class="gp-label">Required rate</div>
              <div class="gp-value">${formatRate(requiredRate)}</div>
            </div>
            <div class="gp-stat">
              <div class="gp-label">Current rate</div>
              <div class="gp-value">${formatRate(currentRate)}</div>
            </div>
          </div>
        `;
    },

    _checkTDEEDriftAlert(displayStats) {
        const drift = displayStats.tdeeDrift14vs30;
        if (drift == null || Math.abs(drift) < 150) return;

        const direction = drift > 0 ? 'increased' : 'decreased';
        const emoji = drift > 0 ? '🔥' : '🧊';
        const implication = drift > 0
            ? 'Your metabolism may be speeding up — consider increasing your calorie target to stay on pace.'
            : 'Your metabolism may be adapting (slowing down) — you may need to reduce your intake or take a diet break.';

        this._alerts.push({
            type: 'info',
            icon: emoji,
            title: `TDEE Shifted ${drift > 0 ? '+' : ''}${drift} kcal`,
            message: `Your estimated TDEE has ${direction} by ${Math.abs(drift)} kcal over the last 2 weeks vs. the past month. ${implication}`,
            priority: 3
        });
    },
};
