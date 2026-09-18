// js/core/adaptiveMacroCoach.js
// MacroFactor / Carbon Style Adaptive Macro & Calorie Coach.
// Calculates optimal weekly targets and split for Training vs Rest Days based on Adaptive TDEE,
// current body weight, and rate of change goals. Supports Cut, Bulk, and Maintenance phases.

import { StateManager } from './stateManager.js';
import { MacroTargetService } from './macroTargetService.js';
import { CONFIG } from '../config.js';
import { Utils } from './utils.js';
import * as Selectors from './selectors.js';

export const AdaptiveMacroCoach = {
  /**
   * Calculates adaptive calorie and macro targets for the user.
   * @param {object} [stateSnapshot]
   * @returns {object} Coaching plan object.
   */
  calculatePlan(stateSnapshot) {
    const state = stateSnapshot || StateManager.getState();
    const stats = Selectors.selectDisplayStats(state) || {};
    const goal = Selectors.selectGoal(state) || {};
    const settings = state.settings || {};

    const tdee = stats.avgTDEE_Adaptive || stats.avgTDEE_WgtChange || stats.avgExpenditureGFit || 2200;
    const currentWeightKg = stats.currentWeight || stats.currentSma || 70.9;

    // Detect or resolve active diet phase: 'maintenance' | 'cut' | 'bulk'
    let phase = settings.dietPhase;
    if (!phase) {
      if (goal.targetRate === 0 || (goal.weight != null && Math.abs(goal.weight - currentWeightKg) < 0.2)) {
        phase = 'maintenance';
      } else if (goal.targetRate != null) {
        phase = goal.targetRate < 0 ? 'cut' : 'bulk';
      } else {
        phase = 'maintenance';
      }
    }

    // Weekly rate of change based on phase
    let targetRateKgWk = 0;
    if (phase === 'maintenance') {
      targetRateKgWk = 0;
    } else if (phase === 'cut') {
      targetRateKgWk = goal.targetRate != null && goal.targetRate < 0 ? goal.targetRate : -0.5;
    } else if (phase === 'bulk') {
      targetRateKgWk = goal.targetRate != null && goal.targetRate > 0 ? goal.targetRate : 0.25;
    }

    // Daily deficit/surplus based on target weekly rate
    const dailyAdjustment = (targetRateKgWk / 7) * CONFIG.KCALS_PER_KG;
    const avgDailyCalorieTarget = Math.max(1200, Math.round(tdee + dailyAdjustment));

    // Protein requirement: configurable g/kg bodyweight (default 2.0g / kg)
    const proteinPerKg = settings.proteinPerKg != null ? parseFloat(settings.proteinPerKg) : 2.0;
    const proteinGrams = Math.round(currentWeightKg * proteinPerKg);
    const proteinKcals = proteinGrams * 4;

    // Fat requirement based on diet style
    const dietStyle = settings.dietStyle || 'balanced';
    let fatRatio = 0.25;
    if (dietStyle === 'low_carb') fatRatio = 0.40;
    else if (dietStyle === 'low_fat' || dietStyle === 'athletic') fatRatio = 0.20;

    const fatKcals = avgDailyCalorieTarget * fatRatio;
    const fatGrams = Math.round(fatKcals / 9);

    // Remaining calories for carbs
    const carbKcals = Math.max(100, avgDailyCalorieTarget - proteinKcals - fatKcals);
    const carbGrams = Math.round(carbKcals / 4);

    // Recommended daily fiber (14g per 1000 kcal)
    const fiberGrams = Math.max(25, Math.round((avgDailyCalorieTarget / 1000) * 14));

    // Maintenance corridor (e.g. ±0.75 kg around target or current SMA)
    const corridorCenter = (phase === 'maintenance' && goal.weight != null)
      ? goal.weight
      : (stats.currentSma || currentWeightKg);
    const maintenanceCorridor = {
      center: Math.round(corridorCenter * 10) / 10,
      min: Math.round((corridorCenter - 0.75) * 10) / 10,
      max: Math.round((corridorCenter + 0.75) * 10) / 10,
    };

    // Training vs Rest day split (4 training, 3 rest days)
    const trainingDayBonusKcal = 150;
    const restDayReductionKcal = Math.round((trainingDayBonusKcal * 4) / 3);

    const trainingTargetKcal = avgDailyCalorieTarget + trainingDayBonusKcal;
    const trainingCarbGrams = Math.round(carbGrams + (trainingDayBonusKcal / 4));

    const restTargetKcal = avgDailyCalorieTarget - restDayReductionKcal;
    const restCarbGrams = Math.round(carbGrams - (restDayReductionKcal / 4));

    return {
      phase,
      dietStyle,
      proteinPerKg,
      avgDailyCalorieTarget,
      targetRateKgWk,
      targets: {
        protein: proteinGrams,
        carbs: carbGrams,
        fat: fatGrams,
        fiber: fiberGrams,
      },
      maintenanceCorridor,
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
      currentWeightKg: Math.round(currentWeightKg * 10) / 10,
    };
  },

  /**
   * Returns current day or latest logged day status compared to adaptive coaching targets.
   * @param {object} [stateSnapshot]
   * @returns {object} Today's live glance model.
   */
  getTodayGlance(stateSnapshot) {
    const state = stateSnapshot || StateManager.getState();
    const plan = this.calculatePlan(state);
    const processedData = Selectors.selectProcessedData(state) || [];
    const stats = Selectors.selectDisplayStats(state) || {};

    const todayStr = Utils.formatDate(new Date());
    let latestPoint = [...processedData].reverse().find((d) => d.dateString === todayStr);
    let isToday = true;

    if (!latestPoint && processedData.length > 0) {
      latestPoint = processedData[processedData.length - 1];
      isToday = latestPoint.dateString === todayStr;
    }

    const currentWeight = latestPoint?.value ?? stats.currentWeight ?? stats.currentSma ?? 70.9;
    const loggedCalories = latestPoint?.calorieIntake ?? 0;
    const loggedProtein = latestPoint?.protein ?? 0;
    const loggedCarbs = latestPoint?.carbs ?? 0;
    const loggedFat = latestPoint?.fat ?? 0;
    const loggedFiber = latestPoint?.fiber ?? 0;

    const remainingCalories = plan.avgDailyCalorieTarget - loggedCalories;
    const remainingProtein = Math.max(0, plan.targets.protein - loggedProtein);
    const remainingCarbs = Math.max(0, plan.targets.carbs - loggedCarbs);
    const remainingFat = Math.max(0, plan.targets.fat - loggedFat);
    const remainingFiber = Math.max(0, plan.targets.fiber - loggedFiber);

    // Maintenance corridor checking
    let corridorStatus = 'in_corridor';
    if (plan.maintenanceCorridor && currentWeight != null) {
      if (currentWeight < plan.maintenanceCorridor.min) {
        corridorStatus = 'below_corridor';
      } else if (currentWeight > plan.maintenanceCorridor.max) {
        corridorStatus = 'above_corridor';
      }
    }

    return {
      dateString: latestPoint?.dateString || todayStr,
      isToday,
      plan,
      weight: currentWeight != null ? Math.round(currentWeight * 10) / 10 : null,
      currentSma: stats.currentSma != null ? Math.round(stats.currentSma * 10) / 10 : null,
      rate: stats.regressionSlopeWeekly ?? stats.currentWeeklyRate ?? 0,
      intake: {
        calories: loggedCalories,
        protein: loggedProtein,
        carbs: loggedCarbs,
        fat: loggedFat,
        fiber: loggedFiber,
      },
      remaining: {
        calories: remainingCalories,
        protein: remainingProtein,
        carbs: remainingCarbs,
        fat: remainingFat,
        fiber: remainingFiber,
      },
      percentages: {
        calories: Math.min(200, Math.round((loggedCalories / (plan.avgDailyCalorieTarget || 1)) * 100)),
        protein: Math.min(200, Math.round((loggedProtein / (plan.targets.protein || 1)) * 100)),
        carbs: Math.min(200, Math.round((loggedCarbs / (plan.targets.carbs || 1)) * 100)),
        fat: Math.min(200, Math.round((loggedFat / (plan.targets.fat || 1)) * 100)),
        fiber: Math.min(200, Math.round((loggedFiber / (plan.targets.fiber || 1)) * 100)),
      },
      corridorStatus,
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
      payload: {
        macroTargetsAppliedAt: new Date().toISOString(),
        dietPhase: plan.phase,
        proteinPerKg: plan.proteinPerKg,
        dietStyle: plan.dietStyle,
      },
    });
    Utils.showStatusMessage(
      `Adaptive Macro Plan applied! Target: ${plan.avgDailyCalorieTarget} kcal (${plan.targets.protein}g P / ${plan.targets.carbs}g C / ${plan.targets.fat}g F).`,
      'success',
      4000
    );
  }
};
