// js/core/weeklyCheckinService.js
// MacroPhase / MacroFactor Style Weekly Check-In Engine.
// Evaluates actual rate of change vs phase targets, assesses TDEE adaptation,
// and recommends safe, capped weekly calorie and macro adjustments.

import { StateManager } from './stateManager.js';
import { MacroTargetService } from './macroTargetService.js';
import { AdaptiveMacroCoach } from './adaptiveMacroCoach.js';
import { Utils } from './utils.js';
import * as Selectors from './selectors.js';

const CHECKIN_HISTORY_KEY = 'weightInsiderWeeklyCheckinHistoryV1';

export const WeeklyCheckinService = {
  /**
   * Evaluates the current week and computes a coaching check-in report.
   * @param {object} [stateSnapshot]
   * @returns {object} Check-in evaluation model
   */
  evaluateCheckin(stateSnapshot) {
    const state = stateSnapshot || StateManager.getState();
    const stats = Selectors.selectDisplayStats(state) || {};
    const goal = Selectors.selectGoal(state) || {};
    const settings = state.settings || {};
    const processedData = Selectors.selectProcessedData(state) || [];

    const phase = settings.dietPhase || 'maintenance';
    const currentWeight = stats.currentWeight || stats.currentSma || 70.9;
    const currentSma = stats.currentSma || currentWeight;
    const tdee = stats.avgTDEE_Adaptive || stats.avgTDEE_WgtChange || stats.avgExpenditureGFit || 2800;
    const currentRate = stats.regressionSlopeWeekly ?? stats.currentWeeklyRate ?? 0.0;

    // Recent 7 days analysis
    const last7Days = processedData.slice(-7);
    const loggedDaysCount = last7Days.filter((d) => d.calorieIntake != null && d.calorieIntake > 0).length;
    const totalIntake = last7Days.reduce((sum, d) => sum + (d.calorieIntake || 0), 0);
    const avgIntake = loggedDaysCount > 0 ? Math.round(totalIntake / loggedDaysCount) : tdee;

    // Phase parameters & target rates
    let targetRate = 0.0;
    let rateTolerance = 0.12; // +/- 0.12 kg/wk counts as stable
    if (phase === 'cut') {
      targetRate = goal.targetRate != null && goal.targetRate < 0 ? goal.targetRate : -0.50;
      rateTolerance = 0.15;
    } else if (phase === 'bulk') {
      targetRate = goal.targetRate != null && goal.targetRate > 0 ? goal.targetRate : 0.25;
      rateTolerance = 0.10;
    }

    const rateDelta = currentRate - targetRate;
    let status = 'optimal';
    let adjustmentKcal = 0;
    let verdict = '';
    let actionTitle = '';

    if (phase === 'maintenance') {
      if (Math.abs(currentRate) <= rateTolerance) {
        status = 'optimal';
        adjustmentKcal = 0;
        actionTitle = 'Maintain Current Targets';
        verdict = `Weight is holding steady at ${currentWeight.toFixed(1)} kg (${currentRate >= 0 ? '+' : ''}${currentRate.toFixed(2)} kg/wk). Your calorie target perfectly matches your real energy expenditure.`;
      } else if (currentRate > rateTolerance) {
        status = 'gaining';
        // Gentle downward nudge capped at -150 kcal
        adjustmentKcal = -Math.min(150, Math.max(60, Math.round((currentRate - 0.05) * 800)));
        actionTitle = `Trim Calories by ${Math.abs(adjustmentKcal)} kcal/day`;
        verdict = `Weight has trended slightly above your maintenance corridor (+${currentRate.toFixed(2)} kg/wk). A slight adjustment will prevent gradual fat gain while keeping energy high.`;
      } else {
        status = 'losing';
        // Gentle upward nudge capped at +150 kcal
        adjustmentKcal = Math.min(150, Math.max(60, Math.round((Math.abs(currentRate) - 0.05) * 800)));
        actionTitle = `Increase Calories by +${adjustmentKcal} kcal/day`;
        verdict = `Weight has drifted down (${currentRate.toFixed(2)} kg/wk). Your metabolic expenditure is higher than your intake. Eat more to preserve lean muscle!`;
      }
    } else if (phase === 'cut') {
      if (Math.abs(rateDelta) <= rateTolerance) {
        status = 'optimal';
        adjustmentKcal = 0;
        actionTitle = 'Keep Fat Loss Pace';
        verdict = `Great progress! Weight is dropping at ${Math.abs(currentRate).toFixed(2)} kg/wk, right on track with your target of ${Math.abs(targetRate).toFixed(2)} kg/wk.`;
      } else if (rateDelta > 0) {
        // Losing too slowly
        status = 'stalled';
        adjustmentKcal = -Math.min(150, Math.max(70, Math.round(rateDelta * 700)));
        actionTitle = `Reduce Intake by ${Math.abs(adjustmentKcal)} kcal/day`;
        verdict = `Loss rate (${Math.abs(currentRate).toFixed(2)} kg/wk) is slower than your goal (${Math.abs(targetRate).toFixed(2)} kg/wk). A gentle reduction will restore momentum.`;
      } else {
        // Losing too fast
        status = 'aggressive';
        adjustmentKcal = Math.min(150, Math.max(70, Math.round(Math.abs(rateDelta) * 700)));
        actionTitle = `Add +${adjustmentKcal} kcal/day (Muscle Protection)`;
        verdict = `Losing ${Math.abs(currentRate).toFixed(2)} kg/wk is faster than planned. Adding calories protects muscle mass and metabolic rate.`;
      }
    } else if (phase === 'bulk') {
      if (Math.abs(rateDelta) <= rateTolerance) {
        status = 'optimal';
        adjustmentKcal = 0;
        actionTitle = 'Maintain Lean Growth Pace';
        verdict = `Optimal lean bulking! Weight is gaining at +${currentRate.toFixed(2)} kg/wk, minimizing excess fat storage.`;
      } else if (rateDelta > 0) {
        status = 'aggressive';
        adjustmentKcal = -Math.min(150, Math.max(60, Math.round(rateDelta * 700)));
        actionTitle = `Reduce Surplus by ${Math.abs(adjustmentKcal)} kcal/day`;
        verdict = `Weight is climbing faster than desired (+${currentRate.toFixed(2)} kg/wk). Trimming the surplus prevents excess body fat.`;
      } else {
        status = 'stalled';
        adjustmentKcal = Math.min(150, Math.max(60, Math.round(Math.abs(rateDelta) * 700)));
        actionTitle = `Increase Surplus by +${adjustmentKcal} kcal/day`;
        verdict = `Weight is not gaining at the target rate. Add calories to fuel muscle hypertrophy.`;
      }
    }

    // Current vs New Targets
    const currentPlan = AdaptiveMacroCoach.calculatePlan(state);
    const newCalorieTarget = Math.max(1200, currentPlan.avgDailyCalorieTarget + adjustmentKcal);

    const proteinPerKg = settings.proteinPerKg != null ? parseFloat(settings.proteinPerKg) : 2.0;
    const proteinGrams = Math.round(currentWeight * proteinPerKg);
    const proteinKcals = proteinGrams * 4;

    const dietStyle = settings.dietStyle || 'balanced';
    let fatRatio = 0.25;
    if (dietStyle === 'low_carb') fatRatio = 0.40;
    else if (dietStyle === 'low_fat' || dietStyle === 'athletic') fatRatio = 0.20;

    const fatGrams = Math.round((newCalorieTarget * fatRatio) / 9);
    const carbKcals = Math.max(100, newCalorieTarget - proteinKcals - (fatGrams * 9));
    const carbGrams = Math.round(carbKcals / 4);
    const fiberGrams = Math.max(25, Math.round((newCalorieTarget / 1000) * 14));

    const history = this.getHistory();
    const lastCheckin = history.length > 0 ? history[0] : null;

    return {
      timestamp: new Date().toISOString(),
      phase,
      currentWeight: Math.round(currentWeight * 10) / 10,
      currentSma: Math.round(currentSma * 10) / 10,
      currentRate,
      targetRate,
      tdee: Math.round(tdee),
      avgIntake,
      loggedDaysCount,
      status,
      adjustmentKcal,
      actionTitle,
      verdict,
      currentTargets: {
        calories: currentPlan.avgDailyCalorieTarget,
        protein: currentPlan.targets.protein,
        fat: currentPlan.targets.fat,
        carbs: currentPlan.targets.carbs,
        fiber: currentPlan.targets.fiber,
      },
      newTargets: {
        calories: newCalorieTarget,
        protein: proteinGrams,
        fat: fatGrams,
        carbs: carbGrams,
        fiber: fiberGrams,
      },
      lastCheckin,
    };
  },

  /**
   * Applies the check-in recommendation and saves history.
   * @param {object} checkin
   */
  applyCheckin(checkin) {
    if (!checkin || !checkin.newTargets) return;

    // 1. Save macro targets
    MacroTargetService.save({
      protein: checkin.newTargets.protein,
      carbs: checkin.newTargets.carbs,
      fat: checkin.newTargets.fat,
      fiber: checkin.newTargets.fiber,
    });

    // 2. Save history entry
    const history = this.getHistory();
    history.unshift({
      timestamp: checkin.timestamp,
      phase: checkin.phase,
      weight: checkin.currentWeight,
      rate: checkin.currentRate,
      oldCalories: checkin.currentTargets.calories,
      newCalories: checkin.newTargets.calories,
      adjustmentKcal: checkin.adjustmentKcal,
      verdict: checkin.verdict,
    });
    // Keep last 12 check-ins
    const trimmed = history.slice(0, 12);
    try {
      localStorage.setItem(CHECKIN_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.warn('[WeeklyCheckinService] Failed to persist history', err);
    }

    // 3. Update settings & global state
    StateManager.dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        lastCheckinTimestamp: checkin.timestamp,
        suggestedIntakeTarget: checkin.newTargets.calories,
      },
    });

    Utils.showStatusMessage(
      `Weekly Check-In Applied! Target: ${checkin.newTargets.calories.toLocaleString()} kcal (${checkin.adjustmentKcal >= 0 ? '+' : ''}${checkin.adjustmentKcal} kcal/day).`,
      'success',
      4500
    );
  },

  /**
   * Returns past check-in history.
   * @returns {Array} List of past check-ins
   */
  getHistory() {
    try {
      const raw = localStorage.getItem(CHECKIN_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
};
