// js/core/adaptiveMacroCoach.js
// MacroFactor / Carbon Style Adaptive Macro & Calorie Coach.
// Calculates optimal weekly targets and split for Training vs Rest Days based on Adaptive TDEE,
// current body weight, and rate of change goals.

import { StateManager } from './stateManager.js';
import { MacroTargetService } from './macroTargetService.js';
import { UnitFormatter } from './unitFormatter.js';
import { CONFIG } from '../config.js';
import { Utils } from './utils.js';

export const AdaptiveMacroCoach = {
  /**
   * Calculates adaptive calorie and macro targets for the user.
   * @param {object} [stateSnapshot]
   * @returns {object|null} Coaching plan object or null if insufficient data.
   */
  calculatePlan(stateSnapshot) {
    const state = stateSnapshot || StateManager.getState();
    const stats = state.displayStats || {};
    const goal = state.goal || {};

    const tdee = stats.avgTDEE_Adaptive || stats.avgTDEE_WgtChange || stats.avgExpenditureGFit || 2200;
    const currentWeightKg = stats.currentWeight || stats.currentSma || 75;

    // Daily deficit/surplus based on target weekly rate
    const targetRateKgWk = goal.targetRate != null ? goal.targetRate : -0.5; // default 0.5kg cut
    const dailyAdjustment = (targetRateKgWk / 7) * CONFIG.KCALS_PER_KG;
    const avgDailyCalorieTarget = Math.max(1200, Math.round(tdee + dailyAdjustment));

    // Protein requirement: ~2.0g / kg bodyweight
    const proteinGrams = Math.round(currentWeightKg * 2.0);
    const proteinKcals = proteinGrams * 4;

    // Fat requirement: ~25% of daily calories
    const fatKcals = avgDailyCalorieTarget * 0.25;
    const fatGrams = Math.round(fatKcals / 9);

    // Remaining calories for carbs
    const carbKcals = Math.max(200, avgDailyCalorieTarget - proteinKcals - fatKcals);
    const carbGrams = Math.round(carbKcals / 4);

    // Training vs Rest day split (4 training, 3 rest days)
    const trainingDayBonusKcal = 200;
    const restDayReductionKcal = Math.round((trainingDayBonusKcal * 4) / 3);

    const trainingTargetKcal = avgDailyCalorieTarget + trainingDayBonusKcal;
    const trainingCarbGrams = Math.round(carbGrams + (trainingDayBonusKcal / 4));

    const restTargetKcal = avgDailyCalorieTarget - restDayReductionKcal;
    const restCarbGrams = Math.round(carbGrams - (restDayReductionKcal / 4));

    return {
      avgDailyCalorieTarget,
      targetRateKgWk,
      targets: {
        protein: proteinGrams,
        carbs: carbGrams,
        fat: fatGrams,
      },
      trainingDays: {
        calories: trainingTargetKcal,
        protein: proteinGrams,
        carbs: trainingCarbGrams,
        fat: fatGrams,
      },
      restDays: {
        calories: restTargetKcal,
        protein: proteinGrams,
        carbs: restCarbGrams,
        fat: fatGrams,
      },
      tdee: Math.round(tdee),
    };
  },

  /**
   * Applies the calculated plan targets into persistent MacroTargetService storage.
   */
  applyPlan(plan) {
    if (!plan || !plan.targets) return;
    const existing = MacroTargetService.load();
    MacroTargetService.save({ ...existing, ...plan.targets });
    StateManager.dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { macroTargetsAppliedAt: new Date().toISOString() },
    });
    Utils.showStatusMessage(
      `Adaptive Macro Plan applied! Target: ${plan.avgDailyCalorieTarget} kcal (${plan.targets.protein}g P / ${plan.targets.carbs}g C / ${plan.targets.fat}g F).`,
      'success',
      4000
    );
  }
};
