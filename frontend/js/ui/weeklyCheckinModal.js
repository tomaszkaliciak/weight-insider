// js/ui/weeklyCheckinModal.js
// Modal dialog presenting the Weekly Coach Check-In, analysis, and actionable target updates.

import { WeeklyCheckinService } from '../core/weeklyCheckinService.js';

export const WeeklyCheckinModal = {
  _modal: null,
  _overlay: null,
  _contentContainer: null,
  _isOpen: false,
  _currentEvaluation: null,

  init() {
    this._createDOM();
    this._bindEvents();
  },

  _createDOM() {
    if (document.getElementById('weekly-checkin-modal')) {
      this._modal = document.getElementById('weekly-checkin-modal');
      this._overlay = document.getElementById('modal-overlay');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'weekly-checkin-modal';
    modal.className = 'modal checkin-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'checkin-title');

    modal.innerHTML = `
      <div class="checkin-modal-content">
        <div class="checkin-modal-header">
          <h2 id="checkin-title">📋 Weekly Coach Check-In</h2>
          <button type="button" class="close-modal" id="close-checkin-modal" aria-label="Close Modal">×</button>
        </div>
        <div class="checkin-modal-body" id="checkin-modal-body">
          <!-- Populated by JS -->
        </div>
        <div class="checkin-modal-footer">
          <button type="button" class="btn-checkin-cancel" id="checkin-dismiss-btn">Keep Current Targets</button>
          <button type="button" class="btn-checkin-apply" id="checkin-apply-btn">✓ Apply Recommendation</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this._modal = modal;
    this._overlay = document.getElementById('modal-overlay');
    this._contentContainer = document.getElementById('checkin-modal-body');
  },

  _bindEvents() {
    const closeBtn = document.getElementById('close-checkin-modal');
    const dismissBtn = document.getElementById('checkin-dismiss-btn');
    const applyBtn = document.getElementById('checkin-apply-btn');

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (dismissBtn) dismissBtn.addEventListener('click', () => this.close());
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        if (this._currentEvaluation) {
          WeeklyCheckinService.applyCheckin(this._currentEvaluation);
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
    const evaluation = WeeklyCheckinService.evaluateCheckin();
    this._currentEvaluation = evaluation;
    this._renderBody(evaluation);

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

  _renderBody(evalData) {
    if (!this._contentContainer) return;

    const phaseNames = {
      maintenance: 'Maintenance',
      cut: 'Cutting',
      bulk: 'Bulking',
    };
    const phaseName = phaseNames[evalData.phase] || 'Maintenance';

    const rateSign = evalData.currentRate >= 0 ? '+' : '';
    const rateText = `${rateSign}${evalData.currentRate.toFixed(2)} kg/wk`;
    const rateStatusText = evalData.status === 'optimal'
      ? 'Optimal Stability'
      : evalData.status === 'gaining' ? 'Gaining' : 'Losing';

    // Diff label
    const diff = evalData.adjustmentKcal;
    const diffBadge = diff === 0
      ? '<span class="checkin-diff-badge zero">0 kcal/day (On Track)</span>'
      : diff > 0
        ? `<span class="checkin-diff-badge">+${diff} kcal/day</span>`
        : `<span class="checkin-diff-badge neg">${diff} kcal/day</span>`;

    this._contentContainer.innerHTML = `
      <!-- 3-KPI Overview -->
      <div class="checkin-kpi-grid">
        <div class="checkin-kpi-card">
          <div class="checkin-kpi-label">Weight Trend</div>
          <div class="checkin-kpi-val">${evalData.currentWeight} <span style="font-size:0.85rem; font-weight:500;">kg</span></div>
          <div class="checkin-kpi-sub">${rateText} (${rateStatusText})</div>
        </div>

        <div class="checkin-kpi-card">
          <div class="checkin-kpi-label">Average Intake</div>
          <div class="checkin-kpi-val">${evalData.avgIntake.toLocaleString()} <span style="font-size:0.85rem; font-weight:500;">kcal</span></div>
          <div class="checkin-kpi-sub">${evalData.loggedDaysCount}/7 days logged</div>
        </div>

        <div class="checkin-kpi-card">
          <div class="checkin-kpi-label">Calculated TDEE</div>
          <div class="checkin-kpi-val">${evalData.tdee.toLocaleString()} <span style="font-size:0.85rem; font-weight:500;">kcal</span></div>
          <div class="checkin-kpi-sub">Phase: ${phaseName}</div>
        </div>
      </div>

      <!-- Coach Verdict Box -->
      <div class="checkin-verdict-box ${evalData.status}">
        <div class="checkin-verdict-title">
          <span>🧠 ${evalData.actionTitle}</span>
        </div>
        <div class="checkin-verdict-text">
          ${evalData.verdict}
        </div>
      </div>

      <!-- Comparison Section -->
      <div class="checkin-comparison-card">
        <div class="checkin-comp-header">
          <span>Target Adjustments</span>
          ${diffBadge}
        </div>

        <div class="checkin-comp-row">
          <div class="checkin-target-block">
            <span class="target-label">Current Target</span>
            <span class="target-val">${evalData.currentTargets.calories.toLocaleString()} <span style="font-size:0.9rem;">kcal</span></span>
          </div>

          <div class="checkin-arrow">➔</div>

          <div class="checkin-target-block">
            <span class="target-label">Recommended Target</span>
            <span class="target-val" style="color:var(--primary-color);">${evalData.newTargets.calories.toLocaleString()} <span style="font-size:0.9rem;">kcal</span></span>
          </div>
        </div>

        <div class="checkin-macro-row">
          <div class="checkin-macro-pill">
            🥩 Protein
            <strong>${evalData.newTargets.protein} g</strong>
          </div>
          <div class="checkin-macro-pill">
            🥑 Fat
            <strong>${evalData.newTargets.fat} g</strong>
          </div>
          <div class="checkin-macro-pill">
            🍚 Carbs
            <strong>${evalData.newTargets.carbs} g</strong>
          </div>
        </div>
      </div>
    `;
  },
};
