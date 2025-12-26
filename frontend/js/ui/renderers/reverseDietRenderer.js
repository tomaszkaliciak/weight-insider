// js/ui/renderers/reverseDietRenderer.js
// Calculator for reverse dieting after a cut phase

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { CONFIG } from '../../config.js';

/**
 * Reverse Dieting Calculator:
 * - Calculate optimal calorie increases post-cut
 * - Track maintenance phase progress
 * - Gradual calorie ramp-up recommendations
 */
export const ReverseDietRenderer = {
  _container: null,

  init() {
    this._container = document.getElementById('reverse-diet-content');
    if (!this._container) {
      console.warn('[ReverseDietRenderer] Container not found.');
      return;
    }

    StateManager.subscribe((stateChanges) => {
      if (stateChanges.action.type.includes('DISPLAY_STATS') ||
        stateChanges.action.type.includes('PERIODIZATION')) {
        this._analyze();
      }
    });

    setTimeout(() => this._analyze(), 1400);
    console.log('[ReverseDietRenderer] Initialized.');
  },

  _analyze() {
    const state = StateManager.getState();
    const displayStats = state.displayStats || {};
    const processedData = Selectors.selectProcessedData(state);
    const phases = Selectors.selectPeriodizationPhases(state);

    if (!processedData || processedData.length < 14) {
      this._renderNoData();
      return;
    }

    const analysis = this._calculateReverseDiet(processedData, displayStats, phases);
    this._render(analysis);
  },

  _calculateReverseDiet(data, stats, phases) {
    const KCALS_PER_KG = CONFIG.KCALS_PER_KG || 7700;

    // Find most recent cut phase
    const cutPhases = phases?.filter(p => p.type === 'cut') || [];
    const recentCut = cutPhases.length > 0 ? cutPhases[cutPhases.length - 1] : null;

    // Get current intake levels
    const recent14 = data.slice(-14);
    const recentCalories = recent14.filter(d => d.calorieIntake != null);
    const currentAvgCalories = recentCalories.length > 0 ?
      recentCalories.reduce((s, d) => s + d.calorieIntake, 0) / recentCalories.length : null;

    // Get current TDEE estimate
    const currentTdee = stats.adaptiveTDEE || stats.avgTDEE || 2200;

    // Calculate estimated true maintenance
    const recentWeights = recent14.filter(d => d.value != null);
    const recentRate = stats.latestWeeklyRate || 0;
    const isStable = Math.abs(recentRate) < 0.15;
    const isGaining = recentRate > 0.1;
    const isLosing = recentRate < -0.1;

    // Determine current phase
    let currentPhase = 'unknown';
    if (recentRate > 0.15) currentPhase = 'bulk';
    else if (recentRate < -0.15) currentPhase = 'cut';
    else currentPhase = 'maintenance';

    // Calculate reverse diet recommendations
    let recommendations = null;
    if (currentPhase === 'cut' || (recentCut && this._wasRecentCut(recentCut))) {
      const cutCalories = currentAvgCalories || recentCut?.avgCalories || 1800;
      const maintenanceTarget = currentTdee;
      const deficit = maintenanceTarget - cutCalories;

      // Gradual weekly increases
      const weeklyIncrease = Math.min(100, Math.round(deficit / 6)); // 6 weeks reverse
      const weeksToMaintenance = deficit > 0 ? Math.ceil(deficit / weeklyIncrease) : 0;

      // Build schedule
      const schedule = [];
      let cal = cutCalories;
      for (let week = 1; week <= Math.min(weeksToMaintenance, 8); week++) {
        cal += weeklyIncrease;
        schedule.push({
          week,
          calories: Math.round(cal),
          note: cal >= maintenanceTarget ? 'Maintenance reached!' : ''
        });
      }

      recommendations = {
        startCalories: Math.round(cutCalories),
        targetCalories: Math.round(maintenanceTarget),
        weeklyIncrease,
        weeksToMaintenance,
        schedule,
        currentDeficit: Math.round(deficit)
      };
    }

    // Track if already in reverse diet
    let reverseProgress = null;
    if (recommendations && currentPhase === 'maintenance') {
      const targetReached = currentAvgCalories >= recommendations.targetCalories * 0.95;
      reverseProgress = {
        currentCalories: Math.round(currentAvgCalories),
        targetCalories: recommendations.targetCalories,
        percentComplete: Math.min(100, Math.round(
          (currentAvgCalories - recommendations.startCalories) /
          (recommendations.targetCalories - recommendations.startCalories) * 100
        )),
        targetReached
      };
    }

    return {
      currentPhase,
      currentAvgCalories: Math.round(currentAvgCalories || 0),
      currentTdee: Math.round(currentTdee),
      recentCut,
      recommendations,
      reverseProgress,
      isAppropriate: currentPhase === 'cut' || currentPhase === 'maintenance',
      currentRate: recentRate
    };
  },

  _wasRecentCut(cutPhase) {
    if (!cutPhase?.endDate) return false;
    const daysSinceEnd = (new Date() - cutPhase.endDate) / (1000 * 60 * 60 * 24);
    return daysSinceEnd < 30; // Within last month
  },

  _render(analysis) {
    if (!this._container) return;

    if (!analysis.recommendations) {
      this._container.innerHTML = `
          <div class="reverse-diet-dashboard">
            <div class="info-box">
              <p>💡 Reverse dieting is most useful after a prolonged cut.</p>
              <p>It helps restore metabolic rate while minimizing fat regain.</p>
            </div>
          </div>
        `;
      return;
    }

    const phaseLabel = analysis.currentPhase === 'maintenance' ? 'Stabilization' : 'Post-Cut Transition';

    this._container.innerHTML = `
      <div class="reverse-diet-dashboard">
        <div class="current-status">
          <div class="status-header">
            <span class="phase-badge ${analysis.currentPhase}">${this._getPhaseLabel(analysis.currentPhase)}</span>
            <span class="plan-type">${phaseLabel}</span>
          </div>
        </div>

        <div class="reverse-plan">
          <h4>📊 Recommended Calorie Schedule</h4>
          
          <div class="plan-summary" title="Current TDEE estimate vs Final target intake">
            <div class="plan-stat">
              <span class="stat-value">${analysis.recommendations.startCalories}</span>
              <span class="stat-label">START (TDEE)</span>
            </div>
            <div class="plan-arrow">➜</div>
            <div class="plan-stat">
              <span class="stat-value">${analysis.recommendations.targetCalories}</span>
              <span class="stat-label">GOAL (INTAKE)</span>
            </div>
          </div>

          <div class="schedule-table">
            <div class="schedule-header">
              <span>Week</span>
              <span>Calories</span>
              <span>Primary Goal</span>
            </div>
            ${analysis.recommendations.schedule.map((week, idx) => `
              <div class="schedule-row">
                <span class="week-num">Week ${week.week}</span>
                <span class="week-cals">${week.calories} <small>kcal</small></span>
                <span class="week-desc">${week.note || `+${analysis.recommendations.weeklyIncrease} kcal`}</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${analysis.reverseProgress ? `
          <div class="progress-section">
            <h4>🎯 Optimization Progress</h4>
            <div class="progress-bar-container">
               <div class="progress-fill" style="width: ${analysis.reverseProgress.percentComplete}%"></div>
            </div>
            <div class="progress-detail">
               ${analysis.reverseProgress.percentComplete}% of target reached (${analysis.reverseProgress.currentCalories} / ${analysis.reverseProgress.targetCalories} kcal)
            </div>
          </div>
        ` : ''}

        <div class="tips-section">
          <h4>💡 How to Reverse Diet</h4>
          <ul>
            <li><strong>Weekly Increases:</strong> Aim for +50-100 kcal per week if weight is stable.</li>
            <li><strong>Metabolic Adaptation:</strong> The goal is to "walk up" your calories while minimizing fat gain.</li>
            <li><strong>Stabilization:</strong> If weight jumps >1% in a week, hold calories steady for 7 days.</li>
          </ul>
        </div>
      </div>
    `;
  },

  _getPhaseLabel(phase) {
    switch (phase) {
      case 'cut': return '📉 Cutting';
      case 'bulk': return '📈 Bulking';
      case 'maintenance': return '⚖️ Maintenance';
      default: return '❓ Unknown';
    }
  },

  _renderNoData() {
    if (!this._container) return;
    this._container.innerHTML = `
      <div class="empty-state-message">
        <p>Need more data</p>
        <small>At least 2 weeks of calorie data required</small>
      </div>
    `;
  }
};
