// js/ui/renderers/proteinAdequacyRenderer.js
// Tracks protein adequacy: g/kg bodyweight vs recommended range.
// Renders a labelled progress bar plus a sparkline of rolling protein intake.

import * as d3 from 'd3';
import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';

/** Recommended protein range per kg bodyweight */
const MIN_G_PER_KG = 1.6;
const OPT_G_PER_KG = 2.2;
/** Window for rolling-average sparkline (days) */
const SPARKLINE_WINDOW = 14;

export const ProteinAdequacyRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('protein-adequacy-content');
        if (!this._container) {
            console.warn('[ProteinAdequacyRenderer] Container not found.');
            return;
        }
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => this._render(stats));
        StateManager.subscribeToSpecificEvent('state:filteredDataChanged', () => {
            const s = StateManager.getState();
            this._render(s.displayStats || {});
        });
        StateManager.subscribeToSpecificEvent('state:initializationComplete', () => {
            const s = StateManager.getState();
            this._render(s.displayStats || {});
        });

        const s = StateManager.getState();
        if (s.isInitialized) this._render(s.displayStats || {});
    },

    _render(stats) {
        if (!this._container) return;

        const { avgProteinPerKg, avgDailyProtein, currentSma, currentWeight } = stats;

        if (avgProteinPerKg == null) {
            Utils.renderEmptyState(this._container, {
                title: 'No protein data',
                detail: 'Sync macros from Fitatu to track protein adequacy.',
                icon: '🥩',
            });
            return;
        }

        const refWeight = currentSma ?? currentWeight ?? 70;
        const minTarget = Math.round(MIN_G_PER_KG * refWeight);
        const optTarget = Math.round(OPT_G_PER_KG * refWeight);

        // Clamp bar fill to 0-100 where 100 = optimal target
        const fillPct = Math.min(Math.round(avgProteinPerKg / OPT_G_PER_KG * 100), 100);
        const statusCls = avgProteinPerKg >= OPT_G_PER_KG ? 'adequate'
                        : avgProteinPerKg >= MIN_G_PER_KG ? 'moderate'
                        : 'low';
        const statusLabel = avgProteinPerKg >= OPT_G_PER_KG ? '✓ Optimal'
                          : avgProteinPerKg >= MIN_G_PER_KG ? '⚠ Sufficient'
                          : '✗ Below minimum';

        this._container.innerHTML = `
            <div class="pa-header">
                <div class="pa-value ${statusCls}">${avgProteinPerKg}
                    <span class="pa-unit">g/kg</span>
                </div>
                <div class="pa-badge pa-badge-${statusCls}">${statusLabel}</div>
            </div>

            <div class="pa-bar-wrap" title="0 – ${OPT_G_PER_KG} g/kg range">
                <div class="pa-bar-track">
                    <!-- Minimum threshold marker -->
                    <div class="pa-marker pa-marker-min"
                         style="left:${Math.round(MIN_G_PER_KG / OPT_G_PER_KG * 100)}%"
                         title="Minimum ${MIN_G_PER_KG} g/kg"></div>
                    <div class="pa-bar-fill pa-fill-${statusCls}" style="width:${fillPct}%"></div>
                </div>
                <div class="pa-bar-labels">
                    <span>0</span>
                    <span>${MIN_G_PER_KG} (min)</span>
                    <span>${OPT_G_PER_KG} (opt)</span>
                </div>
            </div>

            <div class="pa-sub-row">
                <span class="pa-sub-item">
                    <span class="pa-sub-label">Avg daily</span>
                    <strong>${avgDailyProtein ?? '--'} g</strong>
                </span>
                <span class="pa-sub-item">
                    <span class="pa-sub-label">Target range</span>
                    <strong>${minTarget}–${optTarget} g</strong>
                </span>
            </div>

            <div id="pa-sparkline" class="pa-sparkline"></div>
        `;

        this._drawSparkline();
    },

    _drawSparkline() {
        const sparkEl = document.getElementById('pa-sparkline');
        if (!sparkEl) return;

        const state = StateManager.getState();
        const data = Selectors.selectFilteredData(state)
            .filter(d => d.protein != null && d.value != null)
            .slice(-60); // last 60 logged days

        if (data.length < 7) return;

        const refWeight = (state.displayStats?.currentSma ?? state.displayStats?.currentWeight ?? 70);
        const series = data.map(d => ({
            date: d.date,
            gPerKg: Math.round(d.protein / refWeight * 10) / 10,
        }));

        const width  = sparkEl.clientWidth || 280;
        const height = 60;
        const margin = { top: 4, right: 4, bottom: 16, left: 28 };

        sparkEl.innerHTML = '';
        const svg = d3.select(sparkEl).append('svg')
            .attr('width', width).attr('height', height);

        const x = d3.scaleTime()
            .domain(d3.extent(series, d => d.date))
            .range([margin.left, width - margin.right]);

        const maxY = Math.max(OPT_G_PER_KG * 1.3, d3.max(series, d => d.gPerKg));
        const y = d3.scaleLinear()
            .domain([0, maxY])
            .range([height - margin.bottom, margin.top]);

        // Min & optimal threshold lines
        [[MIN_G_PER_KG, 'var(--warning-color, #f59e0b)', 'min'],
         [OPT_G_PER_KG, 'var(--success-color)',          'opt']].forEach(([val, col]) => {
            svg.append('line')
                .attr('x1', margin.left).attr('x2', width - margin.right)
                .attr('y1', y(val)).attr('y2', y(val))
                .attr('stroke', col).attr('stroke-width', 1)
                .attr('stroke-dasharray', '3,3').attr('opacity', 0.7);
        });

        // Area
        const area = d3.area()
            .x(d => x(d.date))
            .y0(height - margin.bottom)
            .y1(d => y(d.gPerKg))
            .curve(d3.curveMonotoneX);

        svg.append('path').datum(series)
            .attr('fill', 'var(--primary-color)').attr('opacity', 0.15)
            .attr('d', area);

        // Line
        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.gPerKg))
            .curve(d3.curveMonotoneX);

        svg.append('path').datum(series)
            .attr('fill', 'none')
            .attr('stroke', 'var(--primary-color)')
            .attr('stroke-width', 1.5)
            .attr('d', line);

        // Y axis (minimal)
        svg.append('g').call(
            d3.axisLeft(y).ticks(3).tickSize(0).tickFormat(d => `${d}`)
        )
        .attr('transform', `translate(${margin.left},0)`)
        .call(g => g.select('.domain').remove())
        .call(g => g.selectAll('text').attr('font-size', '8px').attr('fill', 'var(--text-muted)'));
    },
};
