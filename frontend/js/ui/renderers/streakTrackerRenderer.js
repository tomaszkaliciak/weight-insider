// js/ui/renderers/streakTrackerRenderer.js
// Tracks consecutive days of logging, target hits, and adherence

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';

/**
 * Streak Tracker:
 * - Track consecutive logging days
 * - Track calorie target hits
 * - Track deficit/surplus consistency
 * - Gamification elements
 */
export const StreakTrackerRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('streak-tracker-content');
        if (!this._container) {
            console.warn('[StreakTrackerRenderer] Container not found.');
            return;
        }

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('PROCESSED_DATA') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                this._analyze();
            }
        });

        setTimeout(() => this._analyze(), 1300);
        console.log('[StreakTrackerRenderer] Initialized.');
    },

    _analyze() {
        const state = StateManager.getState();
        const processedData = Selectors.selectProcessedData(state);

        if (!processedData || processedData.length < 7) {
            this._renderNoData();
            return;
        }

        const streaks = this._calculateStreaks(processedData);
        this._render(streaks);
    },

    _calculateStreaks(data) {
        // Sort by date
        const sorted = [...data].sort((a, b) => a.date - b.date);

        // Current streaks
        let currentLoggingStreak = 0;
        let currentTargetStreak = 0;
        let currentDirectionStreak = 0;
        let currentDirection = null;

        // Best streaks
        let bestLoggingStreak = 0;
        let bestTargetStreak = 0;
        let bestDeficitStreak = 0;
        let bestSurplusStreak = 0;

        // Temporary counters
        let loggingStreak = 0;
        let targetStreak = 0;
        let deficitStreak = 0;
        let surplusStreak = 0;

        // Calculate average calories as target
        const withCalories = sorted.filter(d => d.calorieIntake != null);
        const avgCalories = withCalories.length > 0 ?
            withCalories.reduce((s, d) => s + d.calorieIntake, 0) / withCalories.length : 2000;
        const targetRange = avgCalories * 0.1; // 10% tolerance

        let lastDate = null;

        sorted.forEach(d => {
            const isConsecutive = lastDate &&
                (d.date - lastDate) <= 1000 * 60 * 60 * 24 * 1.5; // 1.5 days

            // Logging streak
            if (d.value != null) {
                if (isConsecutive || lastDate === null) {
                    loggingStreak++;
                } else {
                    loggingStreak = 1;
                }
                bestLoggingStreak = Math.max(bestLoggingStreak, loggingStreak);
            } else {
                loggingStreak = 0;
            }

            // Target hit streak
            if (d.calorieIntake != null && Math.abs(d.calorieIntake - avgCalories) <= targetRange) {
                if (isConsecutive || lastDate === null) {
                    targetStreak++;
                } else {
                    targetStreak = 1;
                }
                bestTargetStreak = Math.max(bestTargetStreak, targetStreak);
            } else {
                targetStreak = 0;
            }

            // Deficit streak
            if (d.calorieIntake != null && d.googleFitExpenditure != null) {
                const balance = d.calorieIntake - d.googleFitExpenditure;
                if (balance < -100) { // In deficit
                    if (isConsecutive || lastDate === null) {
                        deficitStreak++;
                    } else {
                        deficitStreak = 1;
                    }
                    surplusStreak = 0;
                    bestDeficitStreak = Math.max(bestDeficitStreak, deficitStreak);
                } else if (balance > 100) { // In surplus
                    if (isConsecutive || lastDate === null) {
                        surplusStreak++;
                    } else {
                        surplusStreak = 1;
                    }
                    deficitStreak = 0;
                    bestSurplusStreak = Math.max(bestSurplusStreak, surplusStreak);
                } else {
                    deficitStreak = 0;
                    surplusStreak = 0;
                }
            }

            if (d.value != null) {
                lastDate = d.date;
            }
        });

        // Current streaks (from end of data)
        currentLoggingStreak = loggingStreak;
        currentTargetStreak = targetStreak;
        currentDirectionStreak = Math.max(deficitStreak, surplusStreak);
        currentDirection = deficitStreak > surplusStreak ? 'deficit' :
            surplusStreak > 0 ? 'surplus' : null;

        // Calculate total days logged
        const totalDays = sorted.length;
        const daysLogged = sorted.filter(d => d.value != null).length;
        const consistency = (daysLogged / totalDays * 100);

        // Achievements
        const achievements = [];
        if (bestLoggingStreak >= 30) achievements.push({ icon: '🏆', name: '30 Day Logger', desc: 'Logged weight for 30+ consecutive days' });
        else if (bestLoggingStreak >= 14) achievements.push({ icon: '🥈', name: '2 Week Warrior', desc: 'Logged for 2+ weeks straight' });
        else if (bestLoggingStreak >= 7) achievements.push({ icon: '🥉', name: 'Week Champion', desc: 'Logged for a full week' });

        if (consistency >= 90) achievements.push({ icon: '⭐', name: 'Consistent', desc: '90%+ logging rate' });
        if (bestDeficitStreak >= 14) achievements.push({ icon: '🔥', name: 'Cut Master', desc: '14+ days in deficit' });
        if (bestSurplusStreak >= 14) achievements.push({ icon: '💪', name: 'Bulk King', desc: '14+ days in surplus' });

        return {
            current: {
                logging: currentLoggingStreak,
                target: currentTargetStreak,
                direction: currentDirectionStreak,
                directionType: currentDirection
            },
            best: {
                logging: bestLoggingStreak,
                target: bestTargetStreak,
                deficit: bestDeficitStreak,
                surplus: bestSurplusStreak
            },
            stats: {
                totalDays,
                daysLogged,
                consistency
            },
            achievements
        };
    },

    _render(streaks) {
        if (!this._container) return;

        this._container.innerHTML = `
      <div class="streak-dashboard">
        <div class="current-streaks">
          <h4>🔥 Current Streaks</h4>
          <div class="streak-grid">
            <div class="streak-card ${streaks.current.logging >= 7 ? 'hot' : ''}">
              <div class="streak-value">${streaks.current.logging}</div>
              <div class="streak-label">Days Logging</div>
              <div class="streak-fire">${'🔥'.repeat(Math.min(Math.floor(streaks.current.logging / 7), 5))}</div>
            </div>
            <div class="streak-card">
              <div class="streak-value">${streaks.current.target}</div>
              <div class="streak-label">On Target</div>
            </div>
            ${streaks.current.directionType ? `
              <div class="streak-card ${streaks.current.directionType}">
                <div class="streak-value">${streaks.current.direction}</div>
                <div class="streak-label">${streaks.current.directionType === 'deficit' ? '📉 In Deficit' : '📈 In Surplus'}</div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="best-streaks">
          <h4>🏆 Personal Bests</h4>
          <div class="best-grid">
            <div class="best-item">
              <span class="best-icon">📊</span>
              <span class="best-value">${streaks.best.logging} days</span>
              <span class="best-label">Logging</span>
            </div>
            <div class="best-item">
              <span class="best-icon">🎯</span>
              <span class="best-value">${streaks.best.target} days</span>
              <span class="best-label">On Target</span>
            </div>
            <div class="best-item">
              <span class="best-icon">📉</span>
              <span class="best-value">${streaks.best.deficit} days</span>
              <span class="best-label">Deficit</span>
            </div>
            <div class="best-item">
              <span class="best-icon">📈</span>
              <span class="best-value">${streaks.best.surplus} days</span>
              <span class="best-label">Surplus</span>
            </div>
          </div>
        </div>

        <div class="consistency-bar">
          <div class="consistency-label">Overall Consistency: ${streaks.stats.consistency.toFixed(0)}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${streaks.stats.consistency}%"></div>
          </div>
          <div class="consistency-detail">${streaks.stats.daysLogged} of ${streaks.stats.totalDays} days logged</div>
        </div>

        ${streaks.achievements.length > 0 ? `
          <div class="achievements">
            <h4>🎖️ Achievements</h4>
            <div class="achievement-list">
              ${streaks.achievements.map(a => `
                <div class="achievement-badge">
                  <span class="badge-icon">${a.icon}</span>
                  <span class="badge-name">${a.name}</span>
                  <span class="badge-desc">${a.desc}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Start logging to build streaks!</p>
        <small>Track your weight daily to unlock achievements</small>
      </div>
    `;
    }
};
