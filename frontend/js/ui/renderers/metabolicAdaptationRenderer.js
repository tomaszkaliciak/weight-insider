// js/ui/renderers/metabolicAdaptationRenderer.js
// Detects and visualizes metabolic adaptation (TDEE decline/surge & NEAT flux)
// across Cut, Bulk, and Maintenance phases.

import { StateManager } from '../../core/stateManager.js';
import { StrategyService } from '../../core/strategyService.js';
import { VisibilityManager } from '../visibilityManager.js';
import * as d3 from 'd3';
import * as ss from 'simple-statistics';

export const MetabolicAdaptationRenderer = {
    _container: null,
    _isVisible: false,
    _resizeObserver: null,

    init() {
        this._container = document.getElementById('metabolic-adaptation-content');
        if (!this._container) {
            console.warn('[MetabolicAdaptationRenderer] Container not found.');
            return;
        }

        VisibilityManager.observe(this._container.parentElement, (isVisible) => {
            this._isVisible = isVisible;
            if (isVisible) {
                this._render();
            }
        });

        const renderIfVisible = () => { if (this._isVisible) this._render(); };
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', renderIfVisible);
        StateManager.subscribeToSpecificEvent('state:filteredDataChanged', renderIfVisible);

        // Responsive resize
        if (typeof ResizeObserver !== 'undefined' && this._container.parentElement) {
            this._resizeObserver = new ResizeObserver(() => {
                if (this._isVisible) this._render();
            });
            this._resizeObserver.observe(this._container.parentElement);
        }

        // Initial render check
        if (this._isVisible) {
            this._render();
        }
    },

    /**
     * Calculates metabolic adaptation by comparing baseline vs current rolling TDEE.
     * Uses 'value' or 'sma' for weight, and 'calorieIntake' for nutrition.
     * @param {Array} data
     * @returns {object|null}
     */
    _calculateAdaptation(data) {
        if (!data || data.length < 14) {
            return null;
        }

        const windowSize = Math.min(14, Math.max(7, Math.floor(data.length / 3)));
        const tdeeSeries = [];

        for (let i = windowSize; i <= data.length; i++) {
            const windowData = data.slice(i - windowSize, i);

            const validIntakes = windowData
                .filter(d => d.calorieIntake != null && !isNaN(d.calorieIntake))
                .map(d => d.calorieIntake);

            if (validIntakes.length < windowSize * 0.4) continue;

            const avgIntake = d3.mean(validIntakes);

            const regressionPoints = windowData
                .filter(d => (d.sma != null || d.value != null))
                .map((d, idx) => [idx, d.sma ?? d.value]);

            if (regressionPoints.length < 2) continue;

            const line = ss.linearRegression(regressionPoints);
            const rateKgPerDay = line.m;

            // Raw TDEE = Intake - (Rate * 7700 kcal/kg)
            const rawTdee = avgIntake - (rateKgPerDay * 7700);
            const tdee = Math.min(5000, Math.max(1200, rawTdee));

            const currentPoint = data[i - 1];
            const currentWeight = currentPoint.sma ?? currentPoint.value;
            if (currentWeight == null) continue;

            const pointDate = currentPoint.date instanceof Date
                ? currentPoint.date
                : new Date(currentPoint.dateString || currentPoint.date);

            tdeeSeries.push({
                date: pointDate,
                tdee: Math.round(tdee),
                weight: currentWeight
            });
        }

        if (tdeeSeries.length < 7) {
            return null;
        }

        const baselineSpan = Math.min(14, Math.max(5, Math.floor(tdeeSeries.length * 0.35)));
        const currentSpan = Math.min(14, Math.max(5, Math.floor(tdeeSeries.length * 0.35)));

        const baselineTDEE = Math.round(d3.mean(tdeeSeries.slice(0, baselineSpan), d => d.tdee));
        const currentTDEE = Math.round(d3.mean(tdeeSeries.slice(-currentSpan), d => d.tdee));

        const initialWeight = tdeeSeries[0].weight;
        const currentWeight = tdeeSeries[tdeeSeries.length - 1].weight;
        const weightLost = initialWeight - currentWeight;
        const expectedDrop = Math.round(weightLost * 25); // ~25 kcal/kg tissue mass

        const actualDrop = baselineTDEE - currentTDEE;
        const adaptiveDrop = actualDrop - expectedDrop;
        const adaptationPct = baselineTDEE > 0 ? (adaptiveDrop / baselineTDEE) * 100 : 0;

        return {
            baselineTDEE,
            currentTDEE,
            weightLost,
            expectedDrop,
            actualDrop,
            adaptiveDrop: Math.round(adaptiveDrop),
            adaptationPct: Math.round(adaptationPct * 10) / 10,
            tdeeSeries
        };
    },

    _render() {
        if (!this._container) return;
        const state = StateManager.getState();
        const strategy = StrategyService.getStrategy();
        const phase = strategy?.phase || 'maintenance';

        // Prefer filteredData, fall back to processedData if range is too narrow
        let data = state.filteredData;
        if (!data || data.length < 14) {
            data = state.processedData;
        }

        if (!data || data.length < 14) {
            this._container.innerHTML = `
                <div class="empty-state-message">
                    <p>Need more data</p>
                    <small>At least 2–4 weeks of calorie and weight data are needed to detect metabolic adaptation. (Current: ${data ? data.length : 0} days)</small>
                </div>
            `;
            return;
        }

        const validData = data.filter(d => d.calorieIntake != null && (d.value != null || d.sma != null));
        if (validData.length < 10) {
            this._container.innerHTML = `
                <div class="empty-state-message">
                    <p>Insufficient daily logs</p>
                    <small>Both daily calorie intake and scale weight entries are required to calculate energy flux.</small>
                </div>
            `;
            return;
        }

        const metrics = this._calculateAdaptation(data);
        if (!metrics) {
            this._container.innerHTML = `
                <div class="empty-state-message">
                    <p>Calculating baseline</p>
                    <small>Need additional consecutive days with weight and calorie logs to establish rolling TDEE trend.</small>
                </div>
            `;
            return;
        }

        const { baselineTDEE, currentTDEE, adaptiveDrop, adaptationPct, tdeeSeries } = metrics;
        const diffFromBaseline = currentTDEE - baselineTDEE;

        // Status and insights determined by phase and adaptation
        let statusColor;
        let statusIcon;
        let statusTitle;
        let statusDetail;
        let recommendationTip = '';

        if (phase === 'maintenance') {
            if (Math.abs(diffFromBaseline) <= 100) {
                statusColor = 'var(--success-color, #10b981)';
                statusIcon = '⚖️';
                statusTitle = 'Optimal Maintenance Flux';
                statusDetail = `Your daily expenditure is holding steady at <strong>${currentTDEE.toLocaleString()} kcal/day</strong> (±${Math.abs(diffFromBaseline)} kcal vs baseline). Your maintenance corridor is well calibrated.`;
            } else if (diffFromBaseline > 100) {
                statusColor = 'var(--info-color, #3b82f6)';
                statusIcon = '🔥';
                statusTitle = `Elevated Energy Flux (+${diffFromBaseline} kcal)`;
                statusDetail = `Your expenditure is running higher than baseline. Your metabolic capacity has expanded by <strong>+${diffFromBaseline} kcal/day</strong>.`;
            } else {
                statusColor = 'var(--warning-color, #f59e0b)';
                statusIcon = '📉';
                statusTitle = `Slight Flux Dip (${diffFromBaseline} kcal)`;
                statusDetail = `Your expenditure has dipped slightly below baseline. Keep spontaneous movement (NEAT) and daily step counts consistent.`;
            }
        } else if (phase === 'cut') {
            if (adaptiveDrop > 150) {
                statusColor = 'var(--danger-color, #ef4444)';
                statusIcon = '⚠️';
                statusTitle = 'High NEAT Downregulation';
                statusDetail = `Your metabolism has slowed by <strong>-${adaptiveDrop} kcal/day</strong> (${adaptationPct}% drop) beyond what is expected from tissue mass loss alone.`;
                recommendationTip = `<strong>💡 Coach Tip:</strong> Consider a 1–2 week "diet break" at maintenance calories (~${currentTDEE.toLocaleString()} kcal) to restore NEAT, leptin, and training intensity.`;
            } else if (adaptiveDrop > 60) {
                statusColor = 'var(--warning-color, #f59e0b)';
                statusIcon = '🔶';
                statusTitle = 'Mild Adaptation';
                statusDetail = `Your metabolism has adapted by <strong>-${adaptiveDrop} kcal/day</strong>. This is a normal physiological conservation response to a calorie deficit.`;
                recommendationTip = `<strong>💡 Coach Tip:</strong> Keep daily step counts intentional to prevent subconscious movement reduction.`;
            } else {
                statusColor = 'var(--success-color, #10b981)';
                statusIcon = '✅';
                statusTitle = 'Metabolism Robust';
                statusDetail = `Minimal metabolic slowdown detected (adaptive drop: <strong>${Math.max(0, adaptiveDrop)} kcal</strong>). Your current deficit is well-tolerated.`;
            }
        } else { // bulk
            if (diffFromBaseline >= 50) {
                statusColor = 'var(--info-color, #3b82f6)';
                statusIcon = '🔥';
                statusTitle = 'Adaptive Thermogenesis Surge';
                statusDetail = `Your body is burning surplus energy through spontaneous physical activity (NEAT surge: <strong>+${diffFromBaseline} kcal/day</strong>).`;
                recommendationTip = `<strong>💡 Coach Tip:</strong> High energy flux detected. You may need an extra 100–150 kcal to hit target muscle gain velocity.`;
            } else {
                statusColor = 'var(--success-color, #10b981)';
                statusIcon = '📈';
                statusTitle = 'Steady Bulking Flux';
                statusDetail = `Expenditure is tracking within expected boundaries for controlled mass accretion.`;
            }
        }

        const thirdCardLabel = phase === 'cut' ? 'Adaptive Drop' : phase === 'maintenance' ? 'Flux Stability' : 'NEAT Surge';
        const thirdCardValue = phase === 'cut'
            ? `${adaptiveDrop > 0 ? '-' + adaptiveDrop : '0'} <span style="font-size:0.8rem; font-weight:500;">kcal</span>`
            : phase === 'maintenance'
                ? `${diffFromBaseline >= 0 ? '+' : ''}${diffFromBaseline} <span style="font-size:0.8rem; font-weight:500;">kcal</span>`
                : `+${Math.max(0, diffFromBaseline)} <span style="font-size:0.8rem; font-weight:500;">kcal</span>`;

        const html = `
            <div class="adaptation-status" style="border-left: 4px solid ${statusColor}">
                <div class="status-header">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="status-title">${statusTitle}</span>
                    <span style="margin-left:auto; font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.05em;">
                        ${phase.toUpperCase()}
                    </span>
                </div>
                <div class="status-detail">
                    ${statusDetail}
                </div>
            </div>

            <div class="adaptation-metrics">
                <div class="metric-box">
                    <span class="label">Baseline TDEE</span>
                    <span class="value">${baselineTDEE.toLocaleString()} <span style="font-size:0.78rem; font-weight:500;">kcal</span></span>
                </div>

                <div class="metric-box">
                    <span class="label">Current TDEE</span>
                    <div class="value-group">
                        <span class="value">${currentTDEE.toLocaleString()} <span style="font-size:0.78rem; font-weight:500;">kcal</span></span>
                        <span class="diff ${diffFromBaseline < 0 ? 'negative' : 'positive'}">
                            ${diffFromBaseline >= 0 ? '+' : ''}${diffFromBaseline} kcal
                        </span>
                    </div>
                </div>

                <div class="metric-box">
                    <span class="label">${thirdCardLabel}</span>
                    <span class="value" style="color: ${statusColor}">
                        ${thirdCardValue}
                    </span>
                </div>
            </div>

            <div class="adaptation-chart-container" id="tdee-trend-chart"></div>

            ${recommendationTip ? `<div class="recommendation-tip">${recommendationTip}</div>` : ''}
        `;

        this._container.innerHTML = html;
        this._renderMiniChart(tdeeSeries, baselineTDEE);
    },

    _renderMiniChart(data, baseline) {
        const chartContainer = document.getElementById('tdee-trend-chart');
        if (!chartContainer || !data || data.length === 0) return;

        const width = chartContainer.clientWidth || chartContainer.offsetWidth || 300;
        const height = 110;
        if (width <= 40) return;

        const margin = { top: 12, right: 14, bottom: 22, left: 42 };
        const innerWidth = Math.max(20, width - margin.left - margin.right);
        const innerHeight = Math.max(20, height - margin.top - margin.bottom);

        d3.select('#tdee-trend-chart').selectAll('*').remove();

        const svg = d3.select('#tdee-trend-chart')
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, innerWidth]);

        const minVal = Math.min(baseline - 80, d3.min(data, d => d.tdee) - 50);
        const maxVal = Math.max(baseline + 80, d3.max(data, d => d.tdee) + 50);

        const y = d3.scaleLinear()
            .domain([minVal, maxVal])
            .range([innerHeight, 0])
            .nice();

        // Area under TDEE curve
        const area = d3.area()
            .x(d => x(d.date))
            .y0(innerHeight)
            .y1(d => y(d.tdee))
            .curve(d3.curveMonotoneX);

        // Defs for gradient
        const defs = svg.append('defs');
        const gradient = defs.append('linearGradient')
            .attr('id', 'tdee-area-gradient')
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');

        gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', 'var(--primary-color, #4f46e5)')
            .attr('stop-opacity', 0.28);

        gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', 'var(--primary-color, #4f46e5)')
            .attr('stop-opacity', 0.02);

        svg.append('path')
            .datum(data)
            .attr('fill', 'url(#tdee-area-gradient)')
            .attr('d', area);

        // Baseline reference line
        svg.append('line')
            .attr('x1', 0)
            .attr('x2', innerWidth)
            .attr('y1', y(baseline))
            .attr('y2', y(baseline))
            .attr('stroke', 'var(--text-muted, #94a3b8)')
            .attr('stroke-width', 1.2)
            .attr('stroke-dasharray', '4 3')
            .attr('opacity', 0.7);

        // Baseline label
        svg.append('text')
            .attr('x', innerWidth - 2)
            .attr('y', y(baseline) - 4)
            .attr('text-anchor', 'end')
            .attr('fill', 'var(--text-muted, #94a3b8)')
            .attr('font-size', '10px')
            .attr('font-weight', '600')
            .text(`Base: ${baseline.toLocaleString()}`);

        // Rolling TDEE line
        svg.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', 'var(--primary-color, #4f46e5)')
            .attr('stroke-width', 2.2)
            .attr('d', d3.line()
                .x(d => x(d.date))
                .y(d => y(d.tdee))
                .curve(d3.curveMonotoneX)
            );

        // End point circle
        const lastPoint = data[data.length - 1];
        svg.append('circle')
            .attr('cx', x(lastPoint.date))
            .attr('cy', y(lastPoint.tdee))
            .attr('r', 4)
            .attr('fill', 'var(--primary-color, #4f46e5)')
            .attr('stroke', 'var(--panel-bg, #ffffff)')
            .attr('stroke-width', 2);

        // X Axis
        svg.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(x).ticks(Math.min(4, data.length)).tickFormat(d3.timeFormat('%b %d')))
            .call(g => g.select('.domain').attr('stroke', 'var(--border-color)'))
            .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border-color)'))
            .call(g => g.selectAll('.tick text')
                .attr('fill', 'var(--text-muted)')
                .attr('font-size', '9px')
            );

        // Y Axis
        svg.append('g')
            .call(d3.axisLeft(y).ticks(3).tickFormat(d => `${Math.round(d)}`))
            .call(g => g.select('.domain').remove())
            .call(g => g.selectAll('.tick line').attr('stroke', 'var(--border-color)').attr('stroke-dasharray', '2 2').attr('x2', innerWidth))
            .call(g => g.selectAll('.tick text')
                .attr('fill', 'var(--text-muted)')
                .attr('font-size', '9px')
            );
    }
};
