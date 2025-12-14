// js/ui/renderers/energyBalanceRenderer.js
// Visualizes Energy Balance (Intake vs TDEE) as a diverging bar chart

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

export const EnergyBalanceRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById('energy-balance-content');
        if (!this._container) {
            console.warn('[EnergyBalanceRenderer] Container not found.');
            return;
        }

        // Handle resize/visibility changes (e.g. when expanding card)
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0 && this._lastData) {
                    // Debounce slightly to ensure transition is done
                    requestAnimationFrame(() => this._renderChart(this._lastData));
                }
            }
        });
        resizeObserver.observe(this._container);

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                this._render();
            }
        });

        console.log('[EnergyBalanceRenderer] Initialized.');
    },

    _render() {
        const state = StateManager.getState();
        const data = Selectors.selectFilteredData(state);

        if (!data || data.length < 7) {
            this._renderNoData();
            return;
        }

        // Calculate daily balance
        const balanceData = data.map(d => {
            if (d.calorieIntake == null || isNaN(d.calorieIntake)) return null;

            // Prefer adaptive TDEE, fallback to GFit, fallback to rough estimate
            const tdee = d.adaptiveTDEE || d.googleFitTDEE;

            if (tdee == null || isNaN(tdee)) return null;

            return {
                date: d.date,
                balance: d.calorieIntake - tdee,
                intake: d.calorieIntake,
                tdee: tdee
            };
        }).filter(d => d != null);

        if (balanceData.length < 3) {
            this._renderNoData();
            return;
        }

        this._lastData = balanceData; // Store for resize re-rendering

        // Calculate Stats
        const validBalances = balanceData.map(d => d.balance);
        const avgBalance = d3.mean(validBalances);
        const totalSurplus = validBalances.filter(b => b > 0).reduce((a, b) => a + b, 0);
        const totalDeficit = validBalances.filter(b => b < 0).reduce((a, b) => a + b, 0);

        // Prepare DOM
        this._container.innerHTML = `
            <div class="energy-balance-summary">
                <div class="balance-stat">
                    <span class="label">Avg Daily Balance</span>
                    <span class="value ${avgBalance > 0 ? 'surplus' : 'deficit'}">
                        ${avgBalance > 0 ? '+' : ''}${Math.round(avgBalance)} kcal
                    </span>
                </div>
            </div>
            <div id="energy-balance-chart" class="energy-balance-chart"></div>
        `;

        this._renderChart(balanceData);
    },

    _renderChart(data) {
        const container = document.getElementById('energy-balance-chart');
        if (!container) return;

        // Clear previous chart
        container.innerHTML = '';

        const width = container.clientWidth;
        if (width === 0) return; // Don't try to render if hidden

        const height = 180;
        const margin = { top: 10, right: 10, bottom: 20, left: 40 };

        // Append SVG
        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        const x = d3.scaleBand()
            .range([margin.left, width - margin.right])
            .domain(data.map(d => d.date))
            .padding(0.2);

        const maxAbs = d3.max(data, d => Math.abs(d.balance)) || 500;
        const y = d3.scaleLinear()
            .range([height - margin.bottom, margin.top])
            .domain([-maxAbs, maxAbs]); // Symmetric domain centered on 0

        // Zero line
        svg.append("line")
            .attr("x1", margin.left)
            .attr("x2", width - margin.right)
            .attr("y1", y(0))
            .attr("y2", y(0))
            .attr("stroke", "var(--text-muted)")
            .attr("stroke-opacity", 0.3);

        // Bars
        svg.selectAll(".balance-bar")
            .data(data)
            .enter().append("rect")
            .attr("class", "balance-bar")
            .attr("x", d => x(d.date))
            .attr("y", d => d.balance > 0 ? y(d.balance) : y(0))
            .attr("width", x.bandwidth())
            .attr("height", d => Math.abs(y(d.balance) - y(0)))
            .attr("fill", d => d.balance > 0 ? "var(--success-color)" : "var(--danger-color)")
            .attr("opacity", 0.7)
            .append("title") // Tooltip
            .text(d => `${d.date.toLocaleDateString()}\nBalance: ${d.balance > 0 ? '+' : ''}${Math.round(d.balance)} kcal\n(In: ${Math.round(d.intake)} - Out: ${Math.round(d.tdee)})`);

        // Axis
        const yAxis = d3.axisLeft(y)
            .ticks(5)
            .tickFormat(d => Math.abs(d) >= 1000 ? `${(d / 1000).toFixed(1)}k` : d);

        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(yAxis)
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line").attr("stroke-opacity", 0.1));
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = '<p class="empty-state">Insufficient data to calculate energy balance.</p>';
    }
};
