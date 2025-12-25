// js/ui/renderers/goalSimulatorRenderer.js
// Visualizes future weight projections based on different scenarios

import { StateManager } from '../../core/stateManager.js';
import { Utils } from '../../core/utils.js';
import { VisibilityManager } from '../visibilityManager.js';
import * as Selectors from '../../core/selectors.js';
import * as d3 from 'd3';

export const GoalSimulatorRenderer = {
    _container: null,
    _isVisible: false,

    init() {
        this._container = document.getElementById('goal-simulator-content');
        if (!this._container) {
            console.warn('[GoalSimulatorRenderer] Container not found.');
            return;
        }

        VisibilityManager.observe(this._container.parentElement, (isVisible) => {
            this._isVisible = isVisible;
            if (isVisible) {
                this._render();
            }
        });

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('GOAL')) {
                if (this._isVisible) this._render();
            }
        });

        // Trigger initial render check
        if (this._isVisible) {
            this._render();
        }

        console.log('[GoalSimulatorRenderer] Initialized.');
    },

    /**
     * Generate projection data for a given rate (kg/week)
     */
    _projectScenario(startDate, startWeight, rateKgWeek, days = 90, volatility = 0) {
        const points = [];
        const rateKgDay = rateKgWeek / 7;

        for (let i = 0; i <= days; i += 7) { // Weekly points
            const date = d3.timeDay.offset(startDate, i);
            const expectedWeight = startWeight + (rateKgDay * i);

            // Confidence interval expands over time (Square root of time law)
            const weeks = i / 7;
            const errorMargin = volatility * Math.sqrt(weeks || 1);

            points.push({
                date: date,
                weight: expectedWeight,
                upper: expectedWeight + errorMargin,
                lower: expectedWeight - errorMargin
            });
        }
        return points;
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const currentRate = displayStats.currentWeeklyRate || 0;
        const currentWeight = displayStats.currentWeight;
        const volatility = displayStats.volatility || 0.5;

        if (!currentWeight) {
            this._container.innerHTML = '<p class="empty-state">No weight data available for projection.</p>';
            return;
        }

        const startDate = new Date();
        const projectionDays = 90;

        // Define Scenarios
        const scenarios = [
            {
                label: "Current Trend",
                rate: currentRate,
                color: "var(--primary-color)",
                data: this._projectScenario(startDate, currentWeight, currentRate, projectionDays, volatility)
            },
            {
                label: "Conservative (-0.5kg)",
                rate: -0.5,
                color: "var(--info-color)",
                data: this._projectScenario(startDate, currentWeight, -0.5, projectionDays, volatility)
            },
            {
                label: "Aggressive (-1.0kg)",
                rate: -1.0,
                color: "var(--warning-color)",
                data: this._projectScenario(startDate, currentWeight, -1.0, projectionDays, volatility)
            }
        ];

        // Layout
        this._container.innerHTML = `
            <div class="sim-legend">
                ${scenarios.map(s => `
                    <div class="sim-legend-item">
                        <span class="dot" style="background:${s.color}"></span>
                        <span class="label">${s.label} (${s.rate > 0 ? '+' : ''}${s.rate.toFixed(1)}/wk)</span>
                        <span class="value">➜ ${s.data[s.data.length - 1].weight.toFixed(1)}kg</span>
                    </div>
                `).join('')}
            </div>
            <div id="goal-sim-chart"></div>
        `;

        this._renderChart(scenarios, projectionDays);
    },

    _renderChart(scenarios, days) {
        const chartContainer = document.getElementById('goal-sim-chart');
        if (!chartContainer) return;

        const width = chartContainer.offsetWidth - 20;
        const height = 180;
        if (width <= 0) return;

        const margin = { top: 20, right: 40, bottom: 20, left: 40 };

        d3.select('#goal-sim-chart').selectAll('*').remove();

        const svg = d3.select('#goal-sim-chart')
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const allPoints = scenarios.flatMap(s => s.data);

        const x = d3.scaleTime()
            .domain(d3.extent(allPoints, d => d.date))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([
                d3.min(allPoints, d => d.lower),
                d3.max(allPoints, d => d.upper)
            ])
            .range([height, 0]);

        const area = d3.area()
            .x(d => x(d.date))
            .y0(d => y(d.lower))
            .y1(d => y(d.upper))
            .curve(d3.curveMonotoneX);

        scenarios.forEach(s => {
            svg.append("path")
                .datum(s.data)
                .attr("fill", s.color)
                .attr("fill-opacity", 0.1)
                .attr("d", area);
        });

        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.weight))
            .curve(d3.curveMonotoneX);

        scenarios.forEach(s => {
            svg.append("path")
                .datum(s.data)
                .attr("fill", "none")
                .attr("stroke", s.color)
                .attr("stroke-width", 2)
                .attr("d", line);
        });

        svg.append("g")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%b %d")));

        svg.append("g")
            .call(d3.axisLeft(y).ticks(5));

        svg.append("line")
            .attr("x1", x(new Date()))
            .attr("x2", x(new Date()))
            .attr("y1", 0)
            .attr("y2", height)
            .attr("stroke", "var(--text-muted)")
            .attr("stroke-dasharray", "4")
            .attr("opacity", 0.5);

        svg.append("text")
            .attr("x", x(new Date()) + 5)
            .attr("y", 10)
            .text("Today")
            .attr("font-size", "10px")
            .attr("fill", "var(--text-muted)");
    }
};
