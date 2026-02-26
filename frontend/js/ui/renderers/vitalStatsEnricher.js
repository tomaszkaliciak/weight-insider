// js/ui/renderers/vitalStatsEnricher.js
// Enriches the full-width Vital Stats strip with delta indicators and context badges.
// Injects .stat-delta spans dynamically — no HTML changes required.

import { StateManager } from '../../core/stateManager.js';

const STATS = [
    { parentId: 'current-sma', deltaId: 'vs-delta-sma' },
    { parentId: 'total-change', deltaId: 'vs-delta-change' },
    { parentId: 'current-tdee', deltaId: 'vs-delta-tdee' },
    { parentId: 'rolling-weekly-change-sma', deltaId: 'vs-delta-rate' },
];

export const VitalStatsEnricher = {
    init() {
        this._injectDeltaSpans();

        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => {
            this._update(stats);
        });
    },

    _injectDeltaSpans() {
        STATS.forEach(({ parentId, deltaId }) => {
            const el = document.getElementById(parentId);
            if (!el || document.getElementById(deltaId)) return;
            const delta = document.createElement('span');
            delta.id = deltaId;
            delta.className = 'stat-delta';
            // Insert after the value span, still inside .stat-group
            el.insertAdjacentElement('afterend', delta);
        });
    },

    _update(stats) {
        if (!stats) return;

        // ── SMA card: show weekly rate of change ──────────────────────
        const smaD = document.getElementById('vs-delta-sma');
        if (smaD) {
            const rate = stats.rollingWeeklyChangeSma ?? stats.regressionSlopeWeekly;
            if (rate != null && !isNaN(rate)) {
                const dir = rate > 0.03 ? '▲' : rate < -0.03 ? '▼' : '→';
                const cls = rate > 0.03 ? 'stat-delta--up' : rate < -0.03 ? 'stat-delta--down' : 'stat-delta--neutral';
                smaD.textContent = `${dir} ${Math.abs(rate).toFixed(2)} kg/wk`;
                smaD.className = `stat-delta ${cls}`;
            } else {
                smaD.textContent = '';
            }
        }

        // ── Change card: context label (new-low, streak, phase) ───────
        const changeD = document.getElementById('vs-delta-change');
        if (changeD) {
            const tc = stats.totalChange;
            if (tc != null) {
                if (stats.currentSma != null && stats.minWeight != null && Math.abs(stats.currentSma - stats.minWeight) < 0.3) {
                    changeD.textContent = '🎯 New low!';
                    changeD.className = 'stat-delta stat-delta--special';
                } else {
                    const direction = tc < -0.5 ? 'Cutting ↓' : tc > 0.5 ? 'Gaining ↑' : 'Steady →';
                    changeD.textContent = direction;
                    changeD.className = 'stat-delta stat-delta--neutral';
                }
            } else {
                changeD.textContent = '';
            }
        }

        // ── TDEE card: metabolic drift badge ─────────────────────────
        const tdeeD = document.getElementById('vs-delta-tdee');
        if (tdeeD) {
            const drift = stats.tdeeDrift14vs30;
            if (drift != null && !isNaN(drift)) {
                if (Math.abs(drift) > 50) {
                    const dir = drift > 0 ? '▲' : '▼';
                    const cls = drift > 0 ? 'stat-delta--up' : 'stat-delta--down';
                    tdeeD.textContent = `${dir} ${Math.round(Math.abs(drift))} kcal shift`;
                    tdeeD.className = `stat-delta ${cls}`;
                } else {
                    tdeeD.textContent = 'Stable';
                    tdeeD.className = 'stat-delta stat-delta--neutral';
                }
            } else {
                tdeeD.textContent = '';
            }
        }

        // ── Rate card: vs target feedback ─────────────────────────────
        const rateD = document.getElementById('vs-delta-rate');
        if (rateD) {
            const fb = stats.targetRateFeedback;
            if (fb && fb.text) {
                // Shorten to first clause before comma/period
                const shortText = fb.text.split(/[,.]/)[0].trim();
                const cls = fb.class === 'positive' ? 'stat-delta--down'
                    : fb.class === 'negative' ? 'stat-delta--up'
                        : 'stat-delta--neutral';
                rateD.textContent = shortText;
                rateD.className = `stat-delta ${cls}`;
            } else {
                const rate = stats.rollingWeeklyChangeSma;
                rateD.textContent = rate != null ? '' : '';
                rateD.className = 'stat-delta stat-delta--neutral';
            }
        }
    }
};
