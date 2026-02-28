// js/ui/dashboardPresets.js
// Dashboard view presets — predefined collapse profiles for quick view switching.
// Depends on WidgetCollapser being already initialized.

import { WidgetCollapser } from './widgetCollapser.js';

const STORAGE_KEY = 'weightInsiderDashboardPresetV1';

// All known widget IDs from index.html
const ALL_WIDGET_IDS = [
  'hero-weight-widget',
  'executive-hub-card',
  'chart-section',
  'key-stats-widget',
  'analysis-settings-widget',
  'manual-trendlines-card',
  'rate-change-card',
  'manual-entry-widget',
  'goal-widget',
  'goal-simulator-card',
  'energy-balance-card',
  'energy-sankey-card',
  'macro-summary-card',
  'protein-adequacy-card',
  'weekly-review-card',
  'calorie-heatmap-card',
  'tdee-reconcile-card',
  'tdee-accuracy-card',
  'correlation-matrix-card',
  'scatter-card',
];

// IDs to KEEP expanded for each preset — everything else is collapsed.
const PRESET_EXPANDED = {
  'morning-checkin': new Set([
    'hero-weight-widget',
    'executive-hub-card',
    'chart-section',
    'key-stats-widget',
    'goal-widget',
  ]),
  'deep-dive': new Set(ALL_WIDGET_IDS), // nothing collapsed
  'nutrition-focus': new Set([
    'hero-weight-widget',
    'executive-hub-card',
    'chart-section',
    'macro-summary-card',
    'protein-adequacy-card',
    'energy-balance-card',
    'calorie-heatmap-card',
    'weekly-review-card',
    'goal-widget',
  ]),
};

export const PRESET_LABELS = {
  'morning-checkin': 'Morning Check-in',
  'deep-dive': 'Deep Dive',
  'nutrition-focus': 'Nutrition Focus',
};

function buildCollapsedSet(presetKey) {
  const expanded = PRESET_EXPANDED[presetKey] ?? new Set(ALL_WIDGET_IDS);
  const registeredIds = WidgetCollapser.getWidgetIds();
  const idsToUse = registeredIds.length > 0 ? registeredIds : ALL_WIDGET_IDS;
  return new Set(idsToUse.filter((id) => !expanded.has(id)));
}

export const DashboardPresets = {
  _currentPreset: null,

  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && PRESET_LABELS[saved]) {
      this._currentPreset = saved;
      this._apply(saved);
    }
    this._renderUI();
  },

  _apply(presetKey) {
    const collapsedSet = buildCollapsedSet(presetKey);
    WidgetCollapser.applyCollapsedSet(collapsedSet);
    this._currentPreset = presetKey;
    localStorage.setItem(STORAGE_KEY, presetKey);
    this._syncSelector();
  },

  applyPreset(presetKey) {
    if (!PRESET_LABELS[presetKey]) return;
    this._apply(presetKey);
  },

  resetToCustom() {
    this._currentPreset = null;
    localStorage.removeItem(STORAGE_KEY);
    this._syncSelector();
  },

  _syncSelector() {
    const sel = document.getElementById('dashboard-preset-select');
    if (!sel) return;
    sel.value = this._currentPreset ?? '';
  },

  _renderUI() {
    const container = document.getElementById('dashboard-preset-container');
    if (!container) return;

    const options = Object.entries(PRESET_LABELS)
      .map(([key, label]) => `<option value="${key}">${label}</option>`)
      .join('');

    container.innerHTML = `
      <select id="dashboard-preset-select" class="preset-select" title="Switch dashboard view" aria-label="Dashboard view preset">
        <option value="">Custom</option>
        ${options}
      </select>
    `;

    const sel = container.querySelector('#dashboard-preset-select');
    sel.value = this._currentPreset ?? '';
    sel.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) {
        this.resetToCustom();
      } else {
        this.applyPreset(val);
      }
    });
  },
};
