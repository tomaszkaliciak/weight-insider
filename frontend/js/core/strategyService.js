// js/core/strategyService.js
// MacroPhase Style Strategy & Phases Manager.
// Manages formal Cut, Bulk, and Maintenance phases, corridors, timelines, and macro distributions.

import { StateManager } from './stateManager.js';
import { SettingsService } from './settingsService.js';
import { AdaptiveMacroCoach } from './adaptiveMacroCoach.js';
import { Utils } from './utils.js';
import * as Selectors from './selectors.js';

const STRATEGY_STORAGE_KEY = 'weightInsiderStrategyV1';

export const StrategyService = {
  /**
   * Loads saved strategy or returns default maintenance strategy.
   * @returns {object} Active strategy object
   */
  getStrategy() {
    const state = StateManager.getState();
    const stats = Selectors.selectDisplayStats(state) || {};
    const settings = state.settings || {};
    const currentWeight = stats.currentWeight || stats.currentSma || 70.9;

    let saved = null;
    try {
      const raw = localStorage.getItem(STRATEGY_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = null;
    }

    const phase = saved?.phase || settings.dietPhase || 'maintenance';
    const targetWeight = saved?.targetWeight != null ? saved.targetWeight : (phase === 'maintenance' ? Math.round(currentWeight * 10) / 10 : 68.0);
    const corridor = saved?.corridor != null ? saved.corridor : 0.75;
    const targetRate = saved?.targetRate != null ? saved.targetRate : (phase === 'cut' ? -0.50 : phase === 'bulk' ? 0.25 : 0.0);
    const startDate = saved?.startDate || Utils.formatDate(new Date());
    const startWeight = saved?.startWeight != null ? saved.startWeight : currentWeight;
    const proteinPerKg = saved?.proteinPerKg != null ? saved.proteinPerKg : (settings.proteinPerKg || 2.0);
    const dietStyle = saved?.dietStyle || settings.dietStyle || 'balanced';

    return {
      phase,
      targetWeight,
      corridor,
      targetRate,
      startDate,
      startWeight,
      proteinPerKg,
      dietStyle,
    };
  },

  /**
   * Calculates progress and timelines for the active strategy.
   * @param {object} [strategyOverride]
   * @param {object} [stateSnapshot]
   * @returns {object} Strategy progress metrics
   */
  computeProgress(strategyOverride, stateSnapshot) {
    const state = stateSnapshot || StateManager.getState();
    const stats = Selectors.selectDisplayStats(state) || {};
    const strategy = strategyOverride || this.getStrategy();
    const currentWeight = stats.currentWeight || stats.currentSma || strategy.startWeight;
    const tdee = stats.avgTDEE_Adaptive || stats.avgTDEE_WgtChange || stats.avgExpenditureGFit || 2800;

    // Weeks in current phase
    let weeksInPhase = 1;
    if (strategy.startDate) {
      const startD = new Date(strategy.startDate);
      const now = new Date();
      const diffMs = now - startD;
      weeksInPhase = Math.max(0.1, Math.round((diffMs / (1000 * 60 * 60 * 24 * 7)) * 10) / 10);
    }

    const weightChange = Math.round((currentWeight - strategy.startWeight) * 10) / 10;

    // Phase-specific calculations
    let projectedFinishDate = null;
    let daysRemaining = null;
    let progressPct = 0;
    let statusText = '';
    let dailyCalorieTarget = Math.round(tdee);
    let dailyDeficitOrSurplus = 0;

    if (strategy.phase === 'maintenance') {
      const minBound = Math.round((strategy.targetWeight - strategy.corridor) * 10) / 10;
      const maxBound = Math.round((strategy.targetWeight + strategy.corridor) * 10) / 10;
      const inCorridor = currentWeight >= minBound && currentWeight <= maxBound;

      statusText = inCorridor
        ? `In Corridor (${minBound} – ${maxBound} kg)`
        : currentWeight < minBound
          ? `Below Corridor (${currentWeight} < ${minBound} kg)`
          : `Above Corridor (${currentWeight} > ${maxBound} kg)`;

      progressPct = inCorridor ? 100 : Math.max(0, 100 - Math.round(Math.abs(currentWeight - strategy.targetWeight) * 40));
      dailyCalorieTarget = Math.round(tdee);
      dailyDeficitOrSurplus = 0;
    } else if (strategy.phase === 'cut') {
      const totalToLose = strategy.startWeight - strategy.targetWeight;
      const lostSoFar = strategy.startWeight - currentWeight;
      progressPct = totalToLose > 0 ? Math.min(100, Math.max(0, Math.round((lostSoFar / totalToLose) * 100))) : 0;

      const remainingToLose = Math.max(0, currentWeight - strategy.targetWeight);
      const rateAbs = Math.abs(strategy.targetRate) || 0.5;
      const weeksLeft = remainingToLose / rateAbs;
      daysRemaining = Math.round(weeksLeft * 7);

      const finishD = new Date();
      finishD.setDate(finishD.getDate() + daysRemaining);
      projectedFinishDate = Utils.formatDate(finishD);

      dailyDeficitOrSurplus = Math.round((strategy.targetRate / 7) * 7700);
      dailyCalorieTarget = Math.max(1200, Math.round(tdee + dailyDeficitOrSurplus));
      statusText = `${progressPct}% complete • ${remainingToLose.toFixed(1)} kg left`;
    } else if (strategy.phase === 'bulk') {
      const totalToGain = strategy.targetWeight - strategy.startWeight;
      const gainedSoFar = currentWeight - strategy.startWeight;
      progressPct = totalToGain > 0 ? Math.min(100, Math.max(0, Math.round((gainedSoFar / totalToGain) * 100))) : 0;

      const remainingToGain = Math.max(0, strategy.targetWeight - currentWeight);
      const rate = strategy.targetRate || 0.25;
      const weeksLeft = remainingToGain / rate;
      daysRemaining = Math.round(weeksLeft * 7);

      const finishD = new Date();
      finishD.setDate(finishD.getDate() + daysRemaining);
      projectedFinishDate = Utils.formatDate(finishD);

      dailyDeficitOrSurplus = Math.round((strategy.targetRate / 7) * 7700);
      dailyCalorieTarget = Math.max(1200, Math.round(tdee + dailyDeficitOrSurplus));
      statusText = `${progressPct}% complete • ${remainingToGain.toFixed(1)} kg left`;
    }

    // Macro targets for strategy
    const proteinGrams = Math.round(currentWeight * strategy.proteinPerKg);
    let fatRatio = 0.25;
    if (strategy.dietStyle === 'low_carb') fatRatio = 0.40;
    else if (strategy.dietStyle === 'low_fat' || strategy.dietStyle === 'athletic') fatRatio = 0.20;

    const fatGrams = Math.round((dailyCalorieTarget * fatRatio) / 9);
    const carbGrams = Math.max(25, Math.round((dailyCalorieTarget - (proteinGrams * 4) - (fatGrams * 9)) / 4));
    const fiberGrams = Math.max(25, Math.round((dailyCalorieTarget / 1000) * 14));

    return {
      strategy,
      weeksInPhase,
      currentWeight,
      weightChange,
      progressPct,
      statusText,
      dailyCalorieTarget,
      dailyDeficitOrSurplus,
      projectedFinishDate,
      daysRemaining,
      macros: {
        protein: proteinGrams,
        fat: fatGrams,
        carbs: carbGrams,
        fiber: fiberGrams,
      },
    };
  },

  /**
   * Saves strategy, updates settings, synchronizes goal, and refreshes coach targets.
   * @param {object} newStrategy
   */
  saveStrategy(newStrategy) {
    if (!newStrategy) return;
    const sanitized = {
      phase: newStrategy.phase || 'maintenance',
      targetWeight: parseFloat(newStrategy.targetWeight) || 71.0,
      corridor: parseFloat(newStrategy.corridor) || 0.75,
      targetRate: parseFloat(newStrategy.targetRate) || 0.0,
      startDate: newStrategy.startDate || Utils.formatDate(new Date()),
      startWeight: parseFloat(newStrategy.startWeight) || (Selectors.selectDisplayStats(StateManager.getState())?.currentWeight ?? 70.9),
      proteinPerKg: parseFloat(newStrategy.proteinPerKg) || 2.0,
      dietStyle: newStrategy.dietStyle || 'balanced',
    };

    try {
      localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(sanitized));
    } catch (err) {
      console.warn('[StrategyService] Failed to persist strategy', err);
    }

    // Synchronize settings
    SettingsService.save({
      dietPhase: sanitized.phase,
      proteinPerKg: sanitized.proteinPerKg,
      dietStyle: sanitized.dietStyle,
    });

    StateManager.dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        dietPhase: sanitized.phase,
        proteinPerKg: sanitized.proteinPerKg,
        dietStyle: sanitized.dietStyle,
      },
    });

    // Synchronize Goal
    let goalDate = null;
    if (sanitized.phase !== 'maintenance') {
      const progress = this.computeProgress(sanitized);
      if (progress.projectedFinishDate) {
        goalDate = new Date(progress.projectedFinishDate + 'T00:00:00');
      }
    }

    StateManager.dispatch({
      type: 'LOAD_GOAL',
      payload: {
        weight: sanitized.targetWeight,
        date: goalDate,
        targetRate: sanitized.phase === 'maintenance' ? 0.0 : sanitized.targetRate,
      },
    });

    // Update MacroTargetService
    const plan = AdaptiveMacroCoach.calculatePlan();
    AdaptiveMacroCoach.applyPlan(plan);

    Utils.showStatusMessage(
      `Diet Strategy updated to ${sanitized.phase.toUpperCase()}! Target: ${plan.avgDailyCalorieTarget.toLocaleString()} kcal.`,
      'success',
      4500
    );
  },
};
