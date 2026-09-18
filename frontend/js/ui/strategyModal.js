// js/ui/strategyModal.js
// Modal dialog for managing Diet Strategies & Phases (Maintenance, Cut, Bulk).

import { StrategyService } from '../core/strategyService.js';
import { StateManager } from '../core/stateManager.js';
import * as Selectors from '../core/selectors.js';

export const StrategyModal = {
  _modal: null,
  _overlay: null,
  _contentContainer: null,
  _isOpen: false,
  _currentForm: null,

  init() {
    this._createDOM();
    this._bindEvents();
  },

  _createDOM() {
    if (document.getElementById('strategy-modal')) {
      this._modal = document.getElementById('strategy-modal');
      this._overlay = document.getElementById('modal-overlay');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'strategy-modal';
    modal.className = 'modal strategy-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'strategy-title');

    modal.innerHTML = `
      <div class="strategy-modal-content">
        <div class="strategy-modal-header">
          <h2 id="strategy-title">🎯 Diet Strategy & Phase Setup</h2>
          <button type="button" class="close-modal" id="close-strategy-modal" aria-label="Close Modal">×</button>
        </div>
        <div class="strategy-modal-body" id="strategy-modal-body">
          <!-- Populated by JS -->
        </div>
        <div class="strategy-modal-footer">
          <button type="button" class="btn-checkin-cancel" id="strategy-cancel-btn">Cancel</button>
          <button type="button" class="btn-strategy-save" id="strategy-save-btn">✓ Activate Strategy</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this._modal = modal;
    this._overlay = document.getElementById('modal-overlay');
    this._contentContainer = document.getElementById('strategy-modal-body');
  },

  _bindEvents() {
    const closeBtn = document.getElementById('close-strategy-modal');
    const cancelBtn = document.getElementById('strategy-cancel-btn');
    const saveBtn = document.getElementById('strategy-save-btn');

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (this._currentForm) {
          StrategyService.saveStrategy(this._currentForm);
          this.close();
        }
      });
    }

    // Overlay click
    if (this._overlay) {
      this._overlay.addEventListener('click', () => {
        if (this._isOpen) this.close();
      });
    }

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) {
        this.close();
      }
    });
  },

  open() {
    const current = StrategyService.getStrategy();
    this._currentForm = { ...current };
    this._renderBody();

    if (this._modal) {
      this._modal.classList.add('open');
      this._modal.setAttribute('aria-hidden', 'false');
    }
    if (this._overlay) {
      this._overlay.classList.add('visible');
      this._overlay.setAttribute('aria-hidden', 'false');
    }
    this._isOpen = true;
  },

  close() {
    if (this._modal) {
      this._modal.classList.remove('open');
      this._modal.setAttribute('aria-hidden', 'true');
    }
    if (this._overlay) {
      this._overlay.classList.remove('visible');
      this._overlay.setAttribute('aria-hidden', 'true');
    }
    this._isOpen = false;
  },

  _renderBody() {
    if (!this._contentContainer) return;

    const progress = StrategyService.computeProgress(this._currentForm);
    const { strategy, dailyCalorieTarget, dailyDeficitOrSurplus, projectedFinishDate, macros } = progress;
    const currentWeight = Selectors.selectDisplayStats(StateManager.getState())?.currentWeight ?? 70.9;

    let finishText = 'Continuous (No End Date)';
    if (strategy.phase !== 'maintenance' && projectedFinishDate) {
      finishText = `${projectedFinishDate} (~${progress.daysRemaining} days)`;
    }

    let diffText = '100% Adaptive TDEE (0 kcal/day)';
    if (dailyDeficitOrSurplus < 0) {
      diffText = `${dailyDeficitOrSurplus} kcal/day Deficit`;
    } else if (dailyDeficitOrSurplus > 0) {
      diffText = `+${dailyDeficitOrSurplus} kcal/day Surplus`;
    }

    this._contentContainer.innerHTML = `
      <!-- Phase Selector Tabs -->
      <div class="strategy-phase-tabs">
        <button type="button" class="strategy-tab-btn ${strategy.phase === 'maintenance' ? 'active' : ''}" data-phase="maintenance">
          ⚖️ Maintenance
        </button>
        <button type="button" class="strategy-tab-btn ${strategy.phase === 'cut' ? 'active' : ''}" data-phase="cut">
          📉 Cutting
        </button>
        <button type="button" class="strategy-tab-btn ${strategy.phase === 'bulk' ? 'active' : ''}" data-phase="bulk">
          📈 Bulking
        </button>
      </div>

      <!-- Phase Parameter Inputs -->
      <div class="strategy-section">
        <div class="strategy-section-title">1. Weight & Target Parameters</div>
        <div class="strategy-row">
          <div class="strategy-field">
            <label>Target Weight (kg)</label>
            <input type="number" id="strat-target-weight" step="0.1" value="${strategy.targetWeight}" />
            <small style="font-size:0.72rem; color:var(--text-muted);">Current weight: ${currentWeight} kg</small>
          </div>

          ${strategy.phase === 'maintenance' ? `
          <div class="strategy-field">
            <label>Tolerance Corridor</label>
            <div class="strategy-preset-group">
              <button type="button" class="strategy-preset-btn ${strategy.corridor === 0.5 ? 'active' : ''}" data-corridor="0.5">±0.5 kg</button>
              <button type="button" class="strategy-preset-btn ${strategy.corridor === 0.75 ? 'active' : ''}" data-corridor="0.75">±0.75 kg (Standard)</button>
              <button type="button" class="strategy-preset-btn ${strategy.corridor === 1.0 ? 'active' : ''}" data-corridor="1.0">±1.0 kg</button>
            </div>
          </div>
          ` : `
          <div class="strategy-field">
            <label>Weekly Rate Goal</label>
            <div class="strategy-preset-group">
              ${strategy.phase === 'cut' ? `
                <button type="button" class="strategy-preset-btn ${strategy.targetRate === -0.25 ? 'active' : ''}" data-rate="-0.25">-0.25 kg/wk</button>
                <button type="button" class="strategy-preset-btn ${strategy.targetRate === -0.50 ? 'active' : ''}" data-rate="-0.50">-0.50 kg/wk</button>
                <button type="button" class="strategy-preset-btn ${strategy.targetRate === -0.75 ? 'active' : ''}" data-rate="-0.75">-0.75 kg/wk</button>
              ` : `
                <button type="button" class="strategy-preset-btn ${strategy.targetRate === 0.20 ? 'active' : ''}" data-rate="0.20">+0.20 kg/wk</button>
                <button type="button" class="strategy-preset-btn ${strategy.targetRate === 0.35 ? 'active' : ''}" data-rate="0.35">+0.35 kg/wk</button>
              `}
            </div>
          </div>
          `}
        </div>
      </div>

      <!-- Nutrition Strategy Section -->
      <div class="strategy-section">
        <div class="strategy-section-title">2. Macronutrient Strategy</div>
        <div class="strategy-row">
          <div class="strategy-field">
            <label>Protein Target (g per kg)</label>
            <div class="strategy-preset-group">
              <button type="button" class="strategy-preset-btn ${strategy.proteinPerKg === 1.8 ? 'active' : ''}" data-protein="1.8">1.8 g/kg</button>
              <button type="button" class="strategy-preset-btn ${strategy.proteinPerKg === 2.0 ? 'active' : ''}" data-protein="2.0">2.0 g/kg (Muscle Safe)</button>
              <button type="button" class="strategy-preset-btn ${strategy.proteinPerKg === 2.2 ? 'active' : ''}" data-protein="2.2">2.2 g/kg</button>
            </div>
          </div>

          <div class="strategy-field">
            <label>Diet Style Split</label>
            <div class="strategy-preset-group">
              <button type="button" class="strategy-preset-btn ${strategy.dietStyle === 'balanced' ? 'active' : ''}" data-style="balanced">Balanced (25% F)</button>
              <button type="button" class="strategy-preset-btn ${strategy.dietStyle === 'low_carb' ? 'active' : ''}" data-style="low_carb">Low Carb (40% F)</button>
              <button type="button" class="strategy-preset-btn ${strategy.dietStyle === 'athletic' ? 'active' : ''}" data-style="athletic">High Carb (20% F)</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Strategy Preview Card -->
      <div class="strategy-preview-card">
        <div class="strategy-preview-header">
          <span>Strategy Forecast</span>
          <span style="color:var(--primary-color);">${diffText}</span>
        </div>

        <div class="strategy-preview-metrics">
          <div class="strategy-preview-item">
            <div class="label">Daily Calorie Target</div>
            <div class="val">${dailyCalorieTarget.toLocaleString()} <span style="font-size:0.85rem; font-weight:500;">kcal</span></div>
          </div>

          <div class="strategy-preview-item">
            <div class="label">Estimated Timeline</div>
            <div class="val" style="font-size:0.95rem; font-weight:700; margin-top:6px;">${finishText}</div>
          </div>

          <div class="strategy-preview-item">
            <div class="label">Macro Targets</div>
            <div class="val" style="font-size:0.9rem; font-weight:700; margin-top:6px;">
              ${macros.protein}g P • ${macros.fat}g F • ${macros.carbs}g C
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindFormEvents();
  },

  _bindFormEvents() {
    // Phase tabs
    const tabBtns = this._contentContainer.querySelectorAll('.strategy-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const phase = btn.dataset.phase;
        this._currentForm.phase = phase;
        if (phase === 'maintenance') {
          this._currentForm.targetRate = 0.0;
        } else if (phase === 'cut') {
          this._currentForm.targetRate = -0.50;
        } else if (phase === 'bulk') {
          this._currentForm.targetRate = 0.25;
        }
        this._renderBody();
      });
    });

    // Target weight input
    const weightInput = document.getElementById('strat-target-weight');
    if (weightInput) {
      weightInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
          this._currentForm.targetWeight = val;
          // Refresh preview without full re-render
          const progress = StrategyService.computeProgress(this._currentForm);
          const valEl = this._contentContainer.querySelector('.strategy-preview-metrics .val');
          if (valEl) valEl.textContent = progress.dailyCalorieTarget.toLocaleString() + ' kcal';
        }
      });
    }

    // Corridor buttons
    const corridorBtns = this._contentContainer.querySelectorAll('[data-corridor]');
    corridorBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._currentForm.corridor = parseFloat(btn.dataset.corridor);
        this._renderBody();
      });
    });

    // Rate buttons
    const rateBtns = this._contentContainer.querySelectorAll('[data-rate]');
    rateBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._currentForm.targetRate = parseFloat(btn.dataset.rate);
        this._renderBody();
      });
    });

    // Protein buttons
    const proteinBtns = this._contentContainer.querySelectorAll('[data-protein]');
    proteinBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._currentForm.proteinPerKg = parseFloat(btn.dataset.protein);
        this._renderBody();
      });
    });

    // Style buttons
    const styleBtns = this._contentContainer.querySelectorAll('[data-style]');
    styleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this._currentForm.dietStyle = btn.dataset.style;
        this._renderBody();
      });
    });
  },
};
