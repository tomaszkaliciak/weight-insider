// js/ui/manualEntryWidget.js
// Renders and manages the manual weight / calorie entry form widget.

import { ManualEntryService } from '../core/manualEntryService.js';
import { Utils } from '../core/utils.js';

export const ManualEntryWidget = {
  _container: null,
  _form: null,

  init() {
    this._container = document.getElementById('manual-entry-widget');
    if (!this._container) return;

    this._render();
    this._attachHandlers();
  },

  _render() {
    // Default date to today
    const today = Utils.formatDate(new Date());

    this._container.innerHTML = `
      <div class="widget-header">Quick Entry</div>
      <form id="manual-entry-form" class="manual-entry-form" novalidate>
        <div class="manual-entry-row">
          <label class="manual-entry-label" for="me-date">Date</label>
          <input type="date" id="me-date" name="date" class="manual-entry-input"
                 value="${today}" max="${today}" required />
        </div>
        <div class="manual-entry-row">
          <label class="manual-entry-label" for="me-weight">Weight (kg)</label>
          <input type="number" id="me-weight" name="weight" class="manual-entry-input"
                 step="0.1" min="20" max="300" placeholder="e.g. 75.3" />
        </div>
        <div class="manual-entry-row">
          <label class="manual-entry-label" for="me-calories">Calories (kcal)</label>
          <input type="number" id="me-calories" name="calories" class="manual-entry-input"
                 step="1" min="0" max="20000" placeholder="e.g. 2500" />
        </div>
        <div class="manual-entry-actions">
          <button type="submit" class="btn-primary manual-entry-save">Save</button>
        </div>
        <p class="manual-entry-hint">
          Entries are saved locally and merged with your main data.
          They will be overwritten when the backend syncs the same date.
        </p>
      </form>
      <div id="manual-entry-recent" class="manual-entry-recent"></div>
    `;

    this._form = document.getElementById('manual-entry-form');
    this._refreshRecent();
  },

  _attachHandlers() {
    if (!this._form) return;
    this._form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._save();
    });
  },

  _save() {
    const dateVal  = document.getElementById('me-date')?.value?.trim();
    const weightVal = parseFloat(document.getElementById('me-weight')?.value);
    const calVal   = parseFloat(document.getElementById('me-calories')?.value);

    if (!dateVal) {
      Utils.showStatusMessage('Please select a date.', 'warn');
      return;
    }

    const hasWeight   = !isNaN(weightVal) && weightVal > 0;
    const hasCalories = !isNaN(calVal) && calVal >= 0;

    if (!hasWeight && !hasCalories) {
      Utils.showStatusMessage('Enter at least a weight or calorie value.', 'warn');
      return;
    }

    ManualEntryService.upsert(dateVal, {
      weight: hasWeight ? weightVal : null,
      calories: hasCalories ? calVal : null,
    });

    // Clear numeric fields, keep date
    if (document.getElementById('me-weight')) document.getElementById('me-weight').value = '';
    if (document.getElementById('me-calories')) document.getElementById('me-calories').value = '';

    Utils.showStatusMessage(
      `Saved entry for ${dateVal}. Reload the page to apply.`,
      'success',
    );

    this._refreshRecent();
  },

  _refreshRecent() {
    const container = document.getElementById('manual-entry-recent');
    if (!container) return;

    const entries = ManualEntryService.getAll();
    const dates = Object.keys(entries).sort().reverse().slice(0, 5);

    if (dates.length === 0) {
      container.innerHTML = '';
      return;
    }

    const rows = dates.map((d) => {
      const e = entries[d];
      const parts = [];
      if (e.weight != null) parts.push(`${e.weight} kg`);
      if (e.calories != null) parts.push(`${e.calories} kcal`);
      return `
        <div class="manual-entry-recent-row">
          <span class="me-recent-date">${d}</span>
          <span class="me-recent-vals">${parts.join(' · ')}</span>
          <button class="me-delete-btn" type="button" data-date="${d}"
                  aria-label="Delete entry for ${d}" title="Delete">✕</button>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="me-recent-title">Recent entries</div>
      ${rows}
    `;

    container.querySelectorAll('.me-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        ManualEntryService.remove(btn.dataset.date);
        Utils.showStatusMessage(`Removed entry for ${btn.dataset.date}.`, 'info');
        this._refreshRecent();
      });
    });
  },
};
