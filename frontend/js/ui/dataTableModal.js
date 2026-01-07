// js/ui/dataTableModal.js
// Handles the Data Table modal - opening, closing, and populating data

import { StateManager } from '../core/stateManager.js';
import { Utils } from '../core/utils.js';

export const DataTableModal = {
    _modal: null,
    _overlay: null,
    _tbody: null,
    _initialized: false,

    init() {
        this._modal = document.getElementById('data-modal');
        this._overlay = document.getElementById('modal-overlay');
        this._tbody = document.getElementById('data-table-body');

        const openBtn = document.getElementById('view-data-btn');
        const closeBtn = document.querySelector('.close-modal');

        if (!this._modal || !this._tbody) {
            console.warn('[DataTableModal] Modal elements not found.');
            return;
        }

        // Open button handler
        if (openBtn) {
            openBtn.addEventListener('click', () => this.open());
        }

        // Close button handler
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Click outside to close
        if (this._overlay) {
            this._overlay.addEventListener('click', () => this.close());
        }

        this._initialized = true;
        console.log('[DataTableModal] Initialized.');
    },

    open() {
        this._populateTable();
        if (this._modal) this._modal.classList.add('open');
        if (this._overlay) this._overlay.classList.add('visible');
    },

    close() {
        if (this._modal) this._modal.classList.remove('open');
        if (this._overlay) this._overlay.classList.remove('visible');
    },

    _populateTable() {
        if (!this._tbody) return;

        const state = StateManager.getState();
        const data = state.processedData || [];

        // Sort by date descending (most recent first)
        const sortedData = [...data].sort((a, b) => b.date - a.date);

        // Clear existing rows
        this._tbody.innerHTML = '';

        // Limit to 100 rows for performance
        const displayData = sortedData.slice(0, 100);

        displayData.forEach(d => {
            const row = document.createElement('tr');
            const fv = (v, decimals = 1) => v != null && !isNaN(v) ? v.toFixed(decimals) : '--';
            const formatDate = (date) => date instanceof Date ? Utils.formatDateDMY(date) : '--';

            row.innerHTML = `
                <td>${formatDate(d.date)}</td>
                <td>${fv(d.weight)}</td>
                <td>${fv(d.sma)}</td>
                <td>${d.calories != null ? Math.round(d.calories) : '--'}</td>
                <td>${d.expenditure != null ? Math.round(d.expenditure) : '--'}</td>
                <td class="${d.netBalance > 0 ? 'surplus' : 'deficit'}">${fv(d.netBalance, 0)}</td>
            `;
            this._tbody.appendChild(row);
        });

        if (displayData.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="6" style="text-align:center; color: var(--text-muted);">No data available</td>';
            this._tbody.appendChild(row);
        }
    }
};
