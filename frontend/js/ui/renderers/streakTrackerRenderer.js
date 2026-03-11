// js/ui/renderers/streakTrackerRenderer.js
// Tracks consecutive days of logging, target hits, and adherence

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { MacroTargetService } from '../../core/macroTargetService.js';
import { bindCrossWidgetHoverDate } from '../../interactions/crossWidgetHoverLink.js';

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

    StateManager.subscribeToSpecificEvent('state:filteredDataChanged', () => this._analyze());
    StateManager.subscribeToSpecificEvent('state:initializationComplete', () => this._analyze());

    setTimeout(() => this._analyze(), 1300);
  },

  _analyze() {
    const state = StateManager.getState();
    const processedData = Selectors.selectProcessedData(state);

    if (!processedData || processedData.length < 7) {
      this._renderNoData();
      return;
    }

    const streaks = this._calculateStreaks(processedData);

    // Macro target streak
    const targets = MacroTargetService.load();
    const adherence = MacroTargetService.computeAdherence(processedData, targets);
    streaks.macroStreak = adherence.streak;
    streaks.macroTargetsSet = adherence.hasTargets;
    streaks.anchors.current.macro = this._findLatestMacroHitDate(processedData, targets);
    streaks.habit = this._calculateHabitScore(processedData, adherence);

    this._render(streaks);
  },

  _findLatestMacroHitDate(data, targets) {
    if (!MacroTargetService.hasAnyTarget(targets)) return null;
    const sorted = [...data].sort((a, b) => a.date - b.date);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (MacroTargetService.dayMeetsTargets(sorted[i], targets)) {
        return sorted[i].date;
      }
    }
    return null;
  },

  _calculateHabitScore(data, adherence) {
    const sorted = [...data].sort((a, b) => a.date - b.date);
    const totalDays = sorted.length || 1;
    const daysLogged = sorted.filter((d) => d.value != null).length;
    const calorieDays = sorted.filter((d) => d.calorieIntake != null).length;
    const macroDays = sorted.filter(
      (d) => d.protein != null && d.carbs != null && d.fat != null,
    ).length;

    const lastLoggedDate = [...sorted].reverse().find((d) => d.value != null)?.date ?? null;
    const daysSinceLogged = lastLoggedDate
      ? Math.round((new Date() - lastLoggedDate) / 86400000)
      : null;
    const recencyScore =
      daysSinceLogged == null ? 0
        : daysSinceLogged <= 1 ? 100
          : daysSinceLogged <= 3 ? 78
            : daysSinceLogged <= 7 ? 52
              : 25;

    let maxWeightGap = 0;
    let prevWeightDate = null;
    sorted.forEach((d) => {
      if (d.value == null) return;
      if (prevWeightDate) {
        const gap = Math.round((d.date - prevWeightDate) / 86400000);
        maxWeightGap = Math.max(maxWeightGap, gap);
      }
      prevWeightDate = d.date;
    });
    const cadenceScore =
      maxWeightGap <= 1 ? 100
        : maxWeightGap <= 2 ? 86
          : maxWeightGap <= 4 ? 64
            : 38;

    const metrics = [
      { label: 'Weight', score: (daysLogged / totalDays) * 100, weight: 0.34 },
      { label: 'Calories', score: (calorieDays / totalDays) * 100, weight: 0.28 },
      { label: 'Recency', score: recencyScore, weight: 0.18 },
      { label: 'Cadence', score: cadenceScore, weight: 0.20 },
    ];
    if (macroDays > 0) {
      metrics.push({ label: 'Macros', score: (macroDays / totalDays) * 100, weight: 0.14 });
    }
    if (adherence?.hasTargets && adherence?.weekAdherence != null) {
      metrics.push({ label: 'Targets', score: adherence.weekAdherence, weight: 0.16 });
    }

    const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0) || 1;
    const score = Math.round(
      metrics.reduce((sum, metric) => sum + metric.score * metric.weight, 0) / totalWeight,
    );
    const label = score >= 85 ? 'Excellent' : score >= 70 ? 'Strong' : score >= 55 ? 'Building' : 'Fragile';
    return { score, label, metrics };
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
    let currentLoggingEndDate = null;
    let currentTargetEndDate = null;
    let currentDirectionEndDate = null;
    let bestLoggingEndDate = null;
    let bestTargetEndDate = null;
    let bestDeficitEndDate = null;
    let bestSurplusEndDate = null;

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
        currentLoggingEndDate = d.date;
        if (loggingStreak >= bestLoggingStreak) {
          bestLoggingStreak = loggingStreak;
          bestLoggingEndDate = d.date;
        }
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
        currentTargetEndDate = d.date;
        if (targetStreak >= bestTargetStreak) {
          bestTargetStreak = targetStreak;
          bestTargetEndDate = d.date;
        }
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
          currentDirectionEndDate = d.date;
          if (deficitStreak >= bestDeficitStreak) {
            bestDeficitStreak = deficitStreak;
            bestDeficitEndDate = d.date;
          }
        } else if (balance > 100) { // In surplus
          if (isConsecutive || lastDate === null) {
            surplusStreak++;
          } else {
            surplusStreak = 1;
          }
          deficitStreak = 0;
          currentDirectionEndDate = d.date;
          if (surplusStreak >= bestSurplusStreak) {
            bestSurplusStreak = surplusStreak;
            bestSurplusEndDate = d.date;
          }
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
      anchors: {
        current: {
          logging: currentLoggingStreak > 0 ? currentLoggingEndDate : null,
          target: currentTargetStreak > 0 ? currentTargetEndDate : null,
          direction: currentDirectionStreak > 0 ? currentDirectionEndDate : null,
          macro: null,
        },
        best: {
          logging: bestLoggingEndDate,
          target: bestTargetEndDate,
          deficit: bestDeficitEndDate,
          surplus: bestSurplusEndDate,
        },
      },
      achievements
    };
  },

  _render(streaks) {
    if (!this._container) return;

    this._container.innerHTML = `
      <div class="streak-dashboard">
        <div class="current-streaks">
          <h4>🔥 Active Streaks</h4>
          <div class="streak-grid">
            <div class="streak-card streak-linkable ${streaks.current.logging >= 7 ? 'hot' : ''}" data-highlight-date="${streaks.anchors.current.logging?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
              <div class="streak-value">${streaks.current.logging}</div>
              <div class="streak-label">Days Logged</div>
              <div class="streak-fire">${'🔥'.repeat(Math.min(Math.floor(streaks.current.logging / 7), 5))}</div>
            </div>
            <div class="streak-card streak-linkable" data-highlight-date="${streaks.anchors.current.target?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
              <div class="streak-value">${streaks.current.target}</div>
              <div class="streak-label">On Target</div>
            </div>
            ${streaks.current.directionType ? `
              <div class="streak-card streak-linkable ${streaks.current.directionType}" data-highlight-date="${streaks.anchors.current.direction?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
                <div class="streak-value">${streaks.current.direction}</div>
                <div class="streak-label">${streaks.current.directionType === 'deficit' ? 'Days in Deficit' : 'Days in Surplus'}</div>
              </div>
            ` : ''}
            ${streaks.macroTargetsSet ? `
              <div class="streak-card streak-linkable ${streaks.macroStreak >= 3 ? 'hot' : ''}" data-highlight-date="${streaks.anchors.current.macro?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
                <div class="streak-value">${streaks.macroStreak}</div>
                <div class="streak-label">Macro Target</div>
                <div class="streak-fire">${'🥗'.repeat(Math.min(Math.floor(streaks.macroStreak / 3), 3))}</div>
              </div>
            ` : `
              <div class="streak-card streak-card-muted">
                <div class="streak-value" style="font-size:1.1rem">🥗</div>
                <div class="streak-label">Macro Target</div>
                <div class="streak-fire" style="font-size:0.65rem;color:var(--text-muted)">Set targets in<br>Macro Breakdown</div>
              </div>
            `}
          </div>
        </div>

        <div class="best-streaks">
          <h4>🏆 Personal Hall of Fame</h4>
          <div class="best-grid">
            <div class="best-item streak-linkable" data-highlight-date="${streaks.anchors.best.logging?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
              <span class="best-icon">📊</span>
              <span class="best-value">${streaks.best.logging} days</span>
              <span class="best-label">LOGGING</span>
            </div>
            <div class="best-item streak-linkable" data-highlight-date="${streaks.anchors.best.target?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
              <span class="best-icon">🎯</span>
              <span class="best-value">${streaks.best.target} days</span>
              <span class="best-label">TARGET</span>
            </div>
            <div class="best-item streak-linkable" data-highlight-date="${streaks.anchors.best.deficit?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
              <span class="best-icon">📉</span>
              <span class="best-value">${streaks.best.deficit} days</span>
              <span class="best-label">DEFICIT</span>
            </div>
            <div class="best-item streak-linkable" data-highlight-date="${streaks.anchors.best.surplus?.toISOString?.().slice(0, 10) || ''}" tabindex="0">
              <span class="best-icon">💪</span>
              <span class="best-value">${streaks.best.surplus} days</span>
              <span class="best-label">BULK</span>
            </div>
          </div>
        </div>

        <div class="consistency-card">
           <h4>📈 Habit Consistency</h4>
           <div class="habit-score-row">
             <div class="habit-score-value">${streaks.habit.score}</div>
             <div class="habit-score-copy">
               <div class="habit-score-label">${streaks.habit.label}</div>
               <div class="habit-score-sub">Weighted from logging, calories, cadence, recency${streaks.habit.metrics.some(m => m.label === 'Macros') ? ', and macros' : ''}.</div>
             </div>
           </div>
           <div class="habit-metrics">
             ${streaks.habit.metrics.map(metric => `
               <span class="habit-chip">${metric.label} ${Math.round(metric.score)}%</span>
             `).join('')}
           </div>
           <div class="consistency-bar">
             <div class="consistency-label">Logging Rate: ${streaks.stats.consistency.toFixed(0)}%</div>
             <div class="progress-bar">
               <div class="progress-fill" style="width: ${streaks.stats.consistency}%"></div>
             </div>
             <div class="consistency-detail">${streaks.stats.daysLogged} of ${streaks.stats.totalDays} total days tracked</div>
           </div>
        </div>

        ${streaks.achievements.length > 0 ? `
          <div class="achievements">
            <h4>🎖️ Earned Badges</h4>
            <div class="achievement-list">
              ${streaks.achievements.map(a => `
                <div class="achievement-badge" title="${a.desc}">
                  <span class="badge-icon">${a.icon}</span>
                  <span class="badge-name">${a.name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    this._bindHoverLinks();
  },

  _bindHoverLinks() {
    this._container.querySelectorAll('.streak-linkable').forEach((el) => {
      bindCrossWidgetHoverDate(el, () => {
        const iso = el.dataset.highlightDate;
        return iso ? new Date(iso + 'T00:00:00') : null;
      });
    });
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
