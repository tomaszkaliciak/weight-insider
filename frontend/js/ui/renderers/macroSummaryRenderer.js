// js/ui/renderers/macroSummaryRenderer.js
// Shows a daily macro breakdown: latest-day grams + % split bars + 7-day averages.
// Also provides a compact target-setting form and adherence tracking.

import { StateManager } from '../../core/stateManager.js';
import { Utils } from '../../core/utils.js';
import { MacroTargetService } from '../../core/macroTargetService.js';
import * as Selectors from '../../core/selectors.js';

export const MacroSummaryRenderer = {
    _container: null,
    _targets: null,
    _showTargetForm: false,

    init() {
        this._container = document.getElementById('macro-summary-content');
        if (!this._container) {
            console.warn('[MacroSummaryRenderer] Container not found.');
            return;
        }
        this._targets = MacroTargetService.load();

        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', () => this._renderFull());
        StateManager.subscribeToSpecificEvent('state:initializationComplete', () => this._renderFull());
        StateManager.subscribeToSpecificEvent('state:filteredDataChanged',    () => this._renderFull());

        // Catch-up
        const s = StateManager.getState();
        if (s.isInitialized) this._renderFull();
    },

    _renderFull() {
        const state = StateManager.getState();
        const stats = state.displayStats || {};
        const processedData = Selectors.selectProcessedData(state) || [];
        this._render(stats, processedData);
    },

    _render(stats, processedData) {
        if (!this._container) return;

        const { latestProtein, latestCarbs, latestFat,
                avgDailyProtein, avgDailyCarbs, avgDailyFat,
                macroSplit, latestMacroDate } = stats;

        if (latestProtein == null || latestCarbs == null || latestFat == null) {
            Utils.renderEmptyState(this._container, {
                title: 'No macro data yet',
                detail: 'Sync macros from Fitatu to unlock nutrition analytics.',
                icon: '🥗',
            });
            return;
        }

        const totalKcal = latestProtein * 4 + latestCarbs * 4 + latestFat * 9;
        const pPct = totalKcal > 0 ? Math.round(latestProtein * 4 / totalKcal * 100) : 0;
        const cPct = totalKcal > 0 ? Math.round(latestCarbs   * 4 / totalKcal * 100) : 0;
        const fPct = totalKcal > 0 ? Math.round(latestFat     * 9 / totalKcal * 100) : 0;

        const dateLabel = latestMacroDate
            ? Utils.formatDateShort(new Date(latestMacroDate + 'T00:00:00'))
            : 'Latest';

        const adherence = MacroTargetService.computeAdherence(processedData, this._targets);
        const periodInsights = this._computePeriodInsights(processedData);

        this._container.innerHTML = `
            <div class="macro-summary-header-row">
                <div class="macro-summary-date">${dateLabel}</div>
                <button class="btn-macro-targets-toggle" title="Set daily macro targets" aria-expanded="${this._showTargetForm}">
                    ${this._showTargetForm ? '▲ Targets' : '⚙ Targets'}
                </button>
            </div>

            ${this._showTargetForm ? this._targetFormHTML() : ''}

            ${adherence.hasTargets ? this._adherenceHTML(adherence) : ''}
            ${periodInsights ? this._periodInsightsHTML(periodInsights) : ''}

            <div class="macro-bars">
                ${this._bar('Protein', latestProtein, pPct, avgDailyProtein, 'macro-protein', 'g', this._targets.protein)}
                ${this._bar('Carbs',   latestCarbs,   cPct, avgDailyCarbs,   'macro-carbs',   'g', this._targets.carbs)}
                ${this._bar('Fat',     latestFat,     fPct, avgDailyFat,     'macro-fat',     'g', this._targets.fat)}
            </div>

            ${macroSplit ? `
            <div class="macro-split-row" title="7-day average calorie split">
                <div class="macro-split-segment macro-protein" style="flex:${macroSplit.protein}"
                     title="Protein ${macroSplit.protein}%">${macroSplit.protein}%</div>
                <div class="macro-split-segment macro-carbs"   style="flex:${macroSplit.carbs}"
                     title="Carbs ${macroSplit.carbs}%">${macroSplit.carbs}%</div>
                <div class="macro-split-segment macro-fat"     style="flex:${macroSplit.fat}"
                     title="Fat ${macroSplit.fat}%">${macroSplit.fat}%</div>
            </div>
            <div class="macro-split-legend">
                <span>P ${macroSplit.protein}%</span>
                <span>C ${macroSplit.carbs}%</span>
                <span>F ${macroSplit.fat}%</span>
                <span class="macro-split-legend-sub">7-day avg split</span>
            </div>
            ` : ''}
        `;

        this._bindEvents();
    },

    _targetFormHTML() {
        const t = this._targets;
        const v = (n) => (n != null ? n : '');
        return `
            <form class="macro-targets-form" id="macro-targets-form">
                <div class="macro-targets-fields">
                    <label class="mf-label">
                        <span class="mf-name macro-protein-text">Protein (g)</span>
                        <input type="number" name="protein" min="0" max="1000" step="1" value="${v(t.protein)}" placeholder="–">
                    </label>
                    <label class="mf-label">
                        <span class="mf-name macro-carbs-text">Carbs (g)</span>
                        <input type="number" name="carbs" min="0" max="1500" step="1" value="${v(t.carbs)}" placeholder="–">
                    </label>
                    <label class="mf-label">
                        <span class="mf-name macro-fat-text">Fat (g)</span>
                        <input type="number" name="fat" min="0" max="500" step="1" value="${v(t.fat)}" placeholder="–">
                    </label>
                </div>
                <div class="macro-targets-actions">
                    <button type="submit" class="btn-primary btn-sm">Save</button>
                    <button type="button" class="btn-secondary btn-sm" id="macro-targets-clear">Clear</button>
                </div>
            </form>
        `;
    },

    _adherenceHTML(adherence) {
        const todayLabel = adherence.todayHit == null ? 'N/A'
            : adherence.todayHit ? '<span class="adh-hit">✔ Hit</span>'
                                 : '<span class="adh-miss">✘ Miss</span>';
        const weekLabel = adherence.weekAdherence == null ? 'N/A'
            : `${adherence.weekAdherence}%`;
        const streakLabel = adherence.streak > 0
            ? `${adherence.streak} day${adherence.streak !== 1 ? 's' : ''} 🔥`
            : '0 days';

        return `
            <div class="macro-adherence-row">
                <div class="adh-item" title="Did latest day meet all targets?">
                    <span class="adh-label">Today</span>
                    <span class="adh-value">${todayLabel}</span>
                </div>
                <div class="adh-item" title="% of last 7 days meeting targets">
                    <span class="adh-label">7-day</span>
                    <span class="adh-value">${weekLabel}</span>
                </div>
                <div class="adh-item" title="Consecutive days on target (streak)">
                    <span class="adh-label">Streak</span>
                    <span class="adh-value">${streakLabel}</span>
                </div>
            </div>
        `;
    },

    _computePeriodInsights(processedData) {
        if (!Array.isArray(processedData) || processedData.length < 7) return null;
        const valid = processedData
            .filter((d) =>
                d?.date instanceof Date &&
                d.protein != null && !isNaN(d.protein) &&
                d.carbs != null && !isNaN(d.carbs) &&
                d.fat != null && !isNaN(d.fat),
            )
            .sort((a, b) => a.date - b.date);
        if (valid.length < 7) return null;

        const latest7 = valid.slice(-7);
        const prev7 = valid.slice(-14, -7);
        const avg = (arr, field) => arr.length ? arr.reduce((s, d) => s + (d[field] ?? 0), 0) / arr.length : null;
        const kcal = (d) => (d.protein * 4) + (d.carbs * 4) + (d.fat * 9);
        const kcalAvg7 = avg(latest7.map((d) => ({ v: kcal(d) })), 'v');
        const kcalAvgPrev7 = avg(prev7.map((d) => ({ v: kcal(d) })), 'v');

        const protein7 = avg(latest7, 'protein');
        const carbs7 = avg(latest7, 'carbs');
        const fat7 = avg(latest7, 'fat');
        const proteinPrev = avg(prev7, 'protein');
        const carbsPrev = avg(prev7, 'carbs');
        const fatPrev = avg(prev7, 'fat');

        const dailyKcals = latest7.map(kcal);
        const meanKcal = dailyKcals.reduce((s, x) => s + x, 0) / dailyKcals.length;
        const stdKcal = Math.sqrt(
            dailyKcals.reduce((s, x) => s + (x - meanKcal) ** 2, 0) / dailyKcals.length,
        );
        const consistencyPct = meanKcal > 0 ? Math.max(0, Math.round(100 - (stdKcal / meanKcal) * 100)) : null;

        const deltas = [
            { key: 'Protein', value: proteinPrev != null ? (protein7 - proteinPrev) : null, unit: 'g' },
            { key: 'Carbs', value: carbsPrev != null ? (carbs7 - carbsPrev) : null, unit: 'g' },
            { key: 'Fat', value: fatPrev != null ? (fat7 - fatPrev) : null, unit: 'g' },
        ].filter((d) => d.value != null && !isNaN(d.value));

        const strongest = deltas.length
            ? [...deltas].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]
            : null;

        return {
            kcalDelta: kcalAvgPrev7 != null ? Math.round(kcalAvg7 - kcalAvgPrev7) : null,
            protein7: protein7 != null ? Math.round(protein7) : null,
            carbs7: carbs7 != null ? Math.round(carbs7) : null,
            fat7: fat7 != null ? Math.round(fat7) : null,
            consistencyPct,
            strongest,
        };
    },

    _periodInsightsHTML(insights) {
        const kcalTrend = insights.kcalDelta == null
            ? 'N/A'
            : `${insights.kcalDelta > 0 ? '+' : ''}${insights.kcalDelta} kcal/d vs prev 7d`;
        const macroMix = (insights.protein7 == null || insights.carbs7 == null || insights.fat7 == null)
            ? 'N/A'
            : `P ${insights.protein7}g • C ${insights.carbs7}g • F ${insights.fat7}g`;
        const consistency = insights.consistencyPct == null
            ? 'N/A'
            : `${insights.consistencyPct}% stable intake`;
        const strongest = insights.strongest
            ? `${insights.strongest.key} shift: ${insights.strongest.value > 0 ? '+' : ''}${Math.round(insights.strongest.value)}${insights.strongest.unit}`
            : 'No strong macro shift detected';

        return `
            <div class="macro-period-insights">
                <div class="mpi-title">Period Insights</div>
                <div class="mpi-grid">
                    <div class="mpi-item"><span class="mpi-label">Energy</span><span class="mpi-value">${kcalTrend}</span></div>
                    <div class="mpi-item"><span class="mpi-label">7-day Mix</span><span class="mpi-value">${macroMix}</span></div>
                    <div class="mpi-item"><span class="mpi-label">Consistency</span><span class="mpi-value">${consistency}</span></div>
                </div>
                <div class="mpi-note">${strongest}</div>
            </div>
        `;
    },

    _bar(label, grams, pct, avgGrams, cls, unit, target) {
        const avgLabel = avgGrams != null ? `avg ${avgGrams}${unit}` : '';
        const targetLabel = target != null ? `target ${target}${unit}` : '';
        const targetPct = target != null ? Math.min(Math.round(grams / target * 100), 150) : null;
        const hitClass = target != null
            ? (Math.abs(grams - target) / target <= 0.10 ? 'target-hit' : grams < target * 0.9 ? 'target-low' : 'target-high')
            : '';
        return `
            <div class="macro-bar-row ${hitClass}">
                <div class="macro-bar-label ${cls}-text">${label}</div>
                <div class="macro-bar-track">
                    <div class="macro-bar-fill ${cls}" style="width:${pct}%"></div>
                    ${target != null ? `<div class="macro-target-tick" style="left:${Math.min(Math.round(target / (grams || 1) * pct), 100)}%" title="Target: ${target}g"></div>` : ''}
                </div>
                <div class="macro-bar-values">
                    <span class="macro-bar-grams">${grams}<span class="macro-unit">${unit}</span></span>
                    <span class="macro-bar-pct">${pct}%</span>
                    ${avgLabel ? `<span class="macro-bar-avg">${avgLabel}</span>` : ''}
                    ${targetLabel ? `<span class="macro-bar-target ${hitClass}">${targetPct}% of ${targetLabel}</span>` : ''}
                </div>
            </div>
        `;
    },

    _bindEvents() {
        // Toggle target form
        this._container.querySelector('.btn-macro-targets-toggle')?.addEventListener('click', () => {
            this._showTargetForm = !this._showTargetForm;
            this._renderFull();
        });

        // Save targets form
        const form = this._container.querySelector('#macro-targets-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const data = new FormData(form);
                const parse = (key) => {
                    const v = data.get(key);
                    if (v === '' || v == null) return null;
                    const n = parseFloat(v);
                    return isNaN(n) ? null : n;
                };
                this._targets = {
                    protein: parse('protein'),
                    carbs:   parse('carbs'),
                    fat:     parse('fat'),
                };
                MacroTargetService.save(this._targets);
                this._showTargetForm = false;
                this._renderFull();
            });

            this._container.querySelector('#macro-targets-clear')?.addEventListener('click', () => {
                this._targets = { protein: null, carbs: null, fat: null };
                MacroTargetService.save(this._targets);
                this._showTargetForm = false;
                this._renderFull();
            });
        }
    },
};
