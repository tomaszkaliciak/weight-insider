// js/ui/dataTableModal.js
// Handles the Data Table modal - opening, closing, populating data, and CSV export.

import { StateManager } from '../core/stateManager.js';
import { Utils } from '../core/utils.js';

export const DataTableModal = {
    _modal: null,
    _overlay: null,
    _tbody: null,
    _exportBtn: null,
    _initialized: false,

    init() {
        this._modal = document.getElementById('data-modal');
        this._overlay = document.getElementById('modal-overlay');
        this._tbody = document.getElementById('data-table-body');

        const openBtn = document.getElementById('view-data-btn');
        const closeBtn = this._modal?.querySelector('.close-modal');

        if (!this._modal || !this._tbody) {
            console.warn('[DataTableModal] Modal elements not found.');
            return;
        }

        // Inject Export CSV button into the modal header
        const modalHeader = this._modal.querySelector('.modal-header');
        if (modalHeader) {
            this._exportBtn = document.createElement('button');
            this._exportBtn.className = 'btn-secondary export-csv-btn';
            this._exportBtn.textContent = '↓ Export CSV';
            this._exportBtn.setAttribute('type', 'button');
            this._exportBtn.setAttribute('title', 'Download data as CSV file');
            this._exportBtn.addEventListener('click', () => this._exportCSV());
            // Insert before the close button
            const closeEl = modalHeader.querySelector('.close-modal');
            if (closeEl) {
                modalHeader.insertBefore(this._exportBtn, closeEl);
            } else {
                modalHeader.appendChild(this._exportBtn);
            }
        }

        if (openBtn) {
            openBtn.addEventListener('click', () => this.open());
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        if (this._overlay) {
            this._overlay.addEventListener('click', () => this.close());
        }

        this._initialized = true;
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

    /** Returns the full data array sorted by date ascending for export. */
    _getData() {
        const state = StateManager.getState();
        return [...(state.processedData || [])].sort((a, b) => a.date - b.date);
    },

    _populateTable() {
        if (!this._tbody) return;

        // Sort by date descending (most recent first) for reading
        const sortedData = this._getData().reverse();

        this._tbody.innerHTML = '';

        // Limit to 200 rows for rendering performance
        const displayData = sortedData.slice(0, 200);

        const fv = (v, decimals = 1) =>
            v != null && !isNaN(v) ? Number(v).toFixed(decimals) : '--';
        const fd = (date) =>
            date instanceof Date ? Utils.formatDateDMY(date) : '--';

        displayData.forEach((d) => {
            const row = document.createElement('tr');
            const balanceClass =
                d.netBalance == null
                    ? ''
                    : d.netBalance > 0
                        ? 'surplus'
                        : 'deficit';
            row.innerHTML = `
                <td>${fd(d.date)}</td>
                <td>${fv(d.value)}</td>
                <td>${fv(d.sma)}</td>
                <td>${d.calorieIntake != null ? Math.round(d.calorieIntake) : '--'}</td>
                <td>${d.adaptiveTDEE != null ? Math.round(d.adaptiveTDEE) : d.googleFitTDEE != null ? Math.round(d.googleFitTDEE) : '--'}</td>
                <td class="${balanceClass}">${d.netBalance != null ? Math.round(d.netBalance) : '--'}</td>
            `;
            this._tbody.appendChild(row);
        });

        if (displayData.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML =
                '<td colspan="6" style="text-align:center; color: var(--text-muted);">No data available</td>';
            this._tbody.appendChild(row);
        }
    },

    _exportCSV() {
        const data = this._getData();
        if (data.length === 0) {
            Utils.showStatusMessage('No data to export.', 'warn');
            return;
        }

        const headers = [
            'Date',
            'Weight (kg)',
            'SMA (kg)',
            'Calorie Intake (kcal)',
            'TDEE Estimate (kcal)',
            'Energy Balance (kcal)',
            'EMA (kg)',
            'Body Fat (%)',
            'LBM (kg)',
            'FM (kg)',
        ];

        const escape = (v) => {
            if (v == null || (typeof v === 'number' && isNaN(v))) return '';
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        };

        const rows = data.map((d) => {
            const tdee = d.adaptiveTDEE ?? d.googleFitTDEE ?? null;
            return [
                escape(d.date instanceof Date ? Utils.formatDate(d.date) : ''),
                escape(d.value != null ? d.value.toFixed(2) : ''),
                escape(d.sma != null ? d.sma.toFixed(2) : ''),
                escape(d.calorieIntake != null ? Math.round(d.calorieIntake) : ''),
                escape(tdee != null ? Math.round(tdee) : ''),
                escape(d.netBalance != null ? Math.round(d.netBalance) : ''),
                escape(d.ema != null ? d.ema.toFixed(2) : ''),
                escape(d.bfPercent != null ? d.bfPercent.toFixed(1) : ''),
                escape(d.lbm != null ? d.lbm.toFixed(2) : ''),
                escape(d.fm != null ? d.fm.toFixed(2) : ''),
            ].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `weight-insider-${Utils.formatDate(new Date())}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Utils.showStatusMessage(`Exported ${data.length} rows to CSV.`, 'success');
    },
};
