// js/ui/renderers/todayGlanceRenderer.js
// Cockpit widget at the top of the dashboard providing an instant overview of Today:
// Weight & Maintenance corridor, Calories vs Adaptive TDEE, and Live Fitatu Macros.

import { StateManager } from '../../core/stateManager.js';
import { AdaptiveMacroCoach } from '../../core/adaptiveMacroCoach.js';
import { SyncController } from '../syncController.js';
import { SettingsService } from '../../core/settingsService.js';
import { Utils } from '../../core/utils.js';
import { WeeklyCheckinModal } from '../weeklyCheckinModal.js';
import { StrategyModal } from '../strategyModal.js';

export const TodayGlanceRenderer = {
  _container: null,
  _showSettingsPopover: false,

  init() {
    this._container = document.getElementById('today-glance-content');
    if (!this._container) {
      console.warn('[TodayGlanceRenderer] Container #today-glance-content not found.');
      return;
    }

    const render = () => this._render();
    StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', render);
    StateManager.subscribeToSpecificEvent('state:filteredDataChanged', render);
    StateManager.subscribeToSpecificEvent('state:settingsChanged', render);
    StateManager.subscribeToSpecificEvent('state:initializationComplete', render);

    const s = StateManager.getState();
    if (s.isInitialized) {
      this._render();
    }
  },

  _formatNumber(val) {
    if (val == null || isNaN(val)) return '—';
    return Math.round(val).toLocaleString();
  },

  _render() {
    if (!this._container) return;

    const glance = AdaptiveMacroCoach.getTodayGlance();
    if (!glance || !glance.plan) return;

    const { plan, intake, remaining, percentages, corridorStatus, isToday, dateString } = glance;
    const settings = StateManager.getState().settings || {};
    const lastSync = SyncController.getLastSync();

    // Friendly date label
    let dateDisplay = 'Today';
    if (dateString) {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        dateDisplay = isToday ? `Today, ${Utils.formatDateShort(d)}` : Utils.formatDateShort(d);
      }
    }

    // Phase label
    const phaseLabels = {
      maintenance: '⚖️ Maintenance',
      cut: '📉 Cutting',
      bulk: '📈 Bulking',
    };
    const phaseLabel = phaseLabels[plan.phase] || '⚖️ Maintenance';

    // Corridor status badge
    let corridorBadge = '';
    if (plan.phase === 'maintenance' && plan.maintenanceCorridor) {
      const corridorText = `${plan.maintenanceCorridor.min} – ${plan.maintenanceCorridor.max} kg`;
      if (corridorStatus === 'in_corridor') {
        corridorBadge = `<div class="glance-corridor-status in_corridor">✓ In corridor (${corridorText})</div>`;
      } else if (corridorStatus === 'below_corridor') {
        corridorBadge = `<div class="glance-corridor-status below_corridor">↓ Below corridor (${corridorText})</div>`;
      } else {
        corridorBadge = `<div class="glance-corridor-status above_corridor">↑ Above corridor (${corridorText})</div>`;
      }
    } else if (plan.phase === 'cut') {
      corridorBadge = `<div class="glance-corridor-status below_corridor">Target rate: ${plan.targetRateKgWk.toFixed(2)} kg/wk</div>`;
    } else if (plan.phase === 'bulk') {
      corridorBadge = `<div class="glance-corridor-status above_corridor">Target rate: +${plan.targetRateKgWk.toFixed(2)} kg/wk</div>`;
    }

    // Remaining Calories callout
    const remainingKcal = remaining.calories;
    const remainingPill = remainingKcal >= 0
      ? `<span class="glance-remaining-pill positive">Remaining: ${this._formatNumber(remainingKcal)} kcal</span>`
      : `<span class="glance-remaining-pill surplus">Surplus: +${this._formatNumber(Math.abs(remainingKcal))} kcal</span>`;

    // Sync info
    let syncInfo = '';
    if (lastSync?.timestamp) {
      try {
        const syncDate = new Date(lastSync.timestamp);
        const timeStr = syncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        syncInfo = `Sync: ${timeStr}`;
      } catch {
        syncInfo = 'Sync active';
      }
    }

    const currentWeightDisplay = glance.weight != null ? glance.weight.toFixed(1) : '—';
    const smaDisplay = glance.currentSma != null ? glance.currentSma.toFixed(1) : '—';
    const rateSign = glance.rate > 0 ? '+' : '';
    const rateDisplay = `${rateSign}${(glance.rate || 0).toFixed(2)} kg/wk`;

    this._container.innerHTML = `
      <div class="today-glance-header">
        <div class="glance-title-wrap">
          <div class="glance-pulse" title="Live data tracking active"></div>
          <div class="glance-title">
            <span class="highlight">Today's Live Glance</span>
          </div>
          <button class="glance-badge glance-badge-phase" id="glance-phase-toggle" title="Switch diet phase or adjust target protein">
            ${phaseLabel} ▾
          </button>
          <span class="glance-badge glance-badge-date">${dateDisplay}</span>
        </div>
        <div class="glance-meta">
          ${syncInfo ? `<span class="glance-badge glance-badge-date" title="Last sync timestamp">${syncInfo}</span>` : ''}
          <button class="glance-btn-checkin" id="glance-checkin-btn" title="Open Weekly Coach Check-In">
            📋 Check-In
          </button>
          <button class="glance-btn-sync" id="glance-sync-btn" title="Sync latest Fitatu meals & scale weight">
            🔄 Sync
          </button>
        </div>
      </div>

      ${this._showSettingsPopover ? this._renderPopoverHTML(settings) : ''}

      <div class="today-glance-grid">
        <!-- Column 1: Weight & Corridor -->
        <div class="glance-col">
          <div class="glance-col-label">
            <span>Weight & Stability</span>
            <span>Trend</span>
          </div>
          <div>
            <div class="glance-weight-val">
              ${currentWeightDisplay} <span class="unit">kg</span>
            </div>
            ${corridorBadge}
          </div>
          <div class="glance-col-subtext">
            SMA: <strong>${smaDisplay} kg</strong> • Trend: <strong>${rateDisplay}</strong>
          </div>
        </div>

        <!-- Column 2: Calories vs Dynamic TDEE -->
        <div class="glance-col">
          <div class="glance-col-label">
            <span>Energy Balance</span>
            <span>${percentages.calories}% of goal</span>
          </div>
          <div>
            <div class="glance-calories-header">
              <span class="glance-calories-consumed">${this._formatNumber(intake.calories)}</span>
              <span class="glance-calories-target">/ ${this._formatNumber(plan.avgDailyCalorieTarget)} kcal</span>
            </div>
            ${remainingPill}
            <div class="glance-progress-track" title="${percentages.calories}% of daily expenditure">
              <div class="glance-progress-fill ${percentages.calories > 110 ? 'over' : ''}" style="width: ${Math.min(100, percentages.calories)}%"></div>
            </div>
          </div>
          <div class="glance-col-subtext">
            Goal based on <strong>100% Adaptive TDEE</strong> (${this._formatNumber(plan.tdee)} kcal)
          </div>
        </div>

        <!-- Column 3: Macronutrients Live from Fitatu -->
        <div class="glance-col">
          <div class="glance-col-label">
            <span>Macronutrients (Fitatu)</span>
            <span>Target: ${plan.proteinPerKg}g/kg</span>
          </div>
          <div class="glance-macro-list">
            <!-- Protein -->
            <div class="glance-macro-item">
              <div class="glance-macro-row">
                <span class="glance-macro-name">🥩 Protein</span>
                <span class="glance-macro-stats">
                  <strong>${this._formatNumber(intake.protein)}</strong> / ${plan.targets.protein} g (${percentages.protein}%)
                </span>
              </div>
              <div class="glance-macro-track">
                <div class="glance-macro-fill protein" style="width: ${Math.min(100, percentages.protein)}%"></div>
              </div>
            </div>

            <!-- Fat -->
            <div class="glance-macro-item">
              <div class="glance-macro-row">
                <span class="glance-macro-name">🥑 Fat</span>
                <span class="glance-macro-stats">
                  <strong>${this._formatNumber(intake.fat)}</strong> / ${plan.targets.fat} g (${percentages.fat}%)
                </span>
              </div>
              <div class="glance-macro-track">
                <div class="glance-macro-fill fat" style="width: ${Math.min(100, percentages.fat)}%"></div>
              </div>
            </div>

            <!-- Carbs -->
            <div class="glance-macro-item">
              <div class="glance-macro-row">
                <span class="glance-macro-name">🍚 Carbs</span>
                <span class="glance-macro-stats">
                  <strong>${this._formatNumber(intake.carbs)}</strong> / ${plan.targets.carbs} g (${percentages.carbs}%)
                </span>
              </div>
              <div class="glance-macro-track">
                <div class="glance-macro-fill carbs" style="width: ${Math.min(100, percentages.carbs)}%"></div>
              </div>
            </div>

            ${intake.fiber != null && intake.fiber > 0 ? `
            <!-- Fiber -->
            <div class="glance-macro-item">
              <div class="glance-macro-row">
                <span class="glance-macro-name">🌾 Fiber</span>
                <span class="glance-macro-stats">
                  <strong>${this._formatNumber(intake.fiber)}</strong> / ${plan.targets.fiber || 30} g
                </span>
              </div>
              <div class="glance-macro-track">
                <div class="glance-macro-fill fiber" style="width: ${Math.min(100, percentages.fiber)}%"></div>
              </div>
            </div>
            ` : ''}
          </div>
          <div class="glance-col-subtext">
            Protein: <strong>${plan.targets.protein}g</strong> • Need <strong>${remaining.protein}g</strong> more
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  },

  _renderPopoverHTML(settings) {
    const currentPhase = settings.dietPhase || 'maintenance';
    const currentProtein = settings.proteinPerKg != null ? parseFloat(settings.proteinPerKg) : 2.0;
    const currentStyle = settings.dietStyle || 'balanced';

    return `
      <div class="glance-popover" id="glance-settings-popover">
        <div class="glance-popover-title">⚙️ Coaching & Goals Setup</div>
        
        <div class="glance-popover-group">
          <label>Diet Phase</label>
          <div class="glance-btn-group">
            <button class="glance-btn-option ${currentPhase === 'maintenance' ? 'active' : ''}" data-setting="dietPhase" data-val="maintenance">Maintenance</button>
            <button class="glance-btn-option ${currentPhase === 'cut' ? 'active' : ''}" data-setting="dietPhase" data-val="cut">Cutting</button>
            <button class="glance-btn-option ${currentPhase === 'bulk' ? 'active' : ''}" data-setting="dietPhase" data-val="bulk">Bulking</button>
          </div>
        </div>

        <div class="glance-popover-group">
          <label>Target Protein (per kg body weight)</label>
          <div class="glance-btn-group">
            <button class="glance-btn-option ${currentProtein === 1.8 ? 'active' : ''}" data-setting="proteinPerKg" data-val="1.8">1.8 g/kg</button>
            <button class="glance-btn-option ${currentProtein === 2.0 ? 'active' : ''}" data-setting="proteinPerKg" data-val="2.0">2.0 g/kg</button>
            <button class="glance-btn-option ${currentProtein === 2.2 ? 'active' : ''}" data-setting="proteinPerKg" data-val="2.2">2.2 g/kg</button>
          </div>
        </div>

        <div class="glance-popover-group">
          <label>Macronutrient Split</label>
          <div class="glance-btn-group">
            <button class="glance-btn-option ${currentStyle === 'balanced' ? 'active' : ''}" data-setting="dietStyle" data-val="balanced">Balanced</button>
            <button class="glance-btn-option ${currentStyle === 'low_carb' ? 'active' : ''}" data-setting="dietStyle" data-val="low_carb">Low Carb</button>
            <button class="glance-btn-option ${currentStyle === 'athletic' ? 'active' : ''}" data-setting="dietStyle" data-val="athletic">High Carb</button>
          </div>
        </div>

        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color); text-align: center;">
          <button type="button" class="glance-btn-checkin" id="glance-open-strategy-btn" style="width: 100%; justify-content: center; font-size: 0.82rem; padding: 7px 12px;">
            🎯 Strategy & Phase Setup
          </button>
        </div>
      </div>
    `;
  },

  _bindEvents() {
    const phaseBtn = document.getElementById('glance-phase-toggle');
    if (phaseBtn) {
      phaseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showSettingsPopover = !this._showSettingsPopover;
        this._render();
      });
    }

    const strategyBtn = document.getElementById('glance-open-strategy-btn');
    if (strategyBtn) {
      strategyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showSettingsPopover = false;
        this._render();
        StrategyModal.open();
      });
    }

    const syncBtn = document.getElementById('glance-sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        SyncController.triggerSync();
      });
    }

    const checkinBtn = document.getElementById('glance-checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', () => {
        WeeklyCheckinModal.open();
      });
    }

    // Handle setting option clicks
    const optionBtns = this._container.querySelectorAll('.glance-btn-option');
    optionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const settingKey = btn.dataset.setting;
        let val = btn.dataset.val;
        if (settingKey === 'proteinPerKg') val = parseFloat(val);

        SettingsService.save({ [settingKey]: val });
        StateManager.dispatch({
          type: 'UPDATE_SETTINGS',
          payload: { [settingKey]: val },
        });

        // Apply new targets to coach plan as well
        const newPlan = AdaptiveMacroCoach.calculatePlan();
        AdaptiveMacroCoach.applyPlan(newPlan);

        this._showSettingsPopover = false;
        this._render();
      });
    });

    // Close popover when clicking outside
    const closeListener = (e) => {
      if (this._showSettingsPopover && !e.target.closest('#glance-settings-popover') && !e.target.closest('#glance-phase-toggle')) {
        this._showSettingsPopover = false;
        this._render();
        document.removeEventListener('click', closeListener);
      }
    };
    if (this._showSettingsPopover) {
      setTimeout(() => document.addEventListener('click', closeListener), 10);
    }
  },
};
