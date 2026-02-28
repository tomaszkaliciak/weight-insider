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

        const renderIfVisible = () => { if (this._isVisible) this._render(); };
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', renderIfVisible);
        StateManager.subscribeToSpecificEvent('state:goalChanged', renderIfVisible);

        // Trigger initial render check
        if (this._isVisible) {
            this._render();
        }

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

    _normalCdf(z) {
        // Abramowitz-Stegun approximation; precise enough for UI confidence display.
        const sign = z < 0 ? -1 : 1;
        const x = Math.abs(z) / Math.sqrt(2);
        const t = 1 / (1 + 0.3275911 * x);
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const erf =
            1 -
            (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
            Math.exp(-x * x);
        const erfSigned = sign * erf;
        return 0.5 * (1 + erfSigned);
    },

    _calculateGoalConfidence(state, displayStats) {
        const goal = Selectors.selectGoal(state);
        const goalAchievedDate = state.goalAchievedDate;

        const referenceWeight = displayStats.currentSma ?? displayStats.currentWeight;
        const currentRate = displayStats.currentWeeklyRate;
        const requiredRate = displayStats.requiredRateForGoal;
        const volatility = displayStats.rollingVolatility ?? displayStats.volatility ?? 0.25;

        if (goalAchievedDate instanceof Date) {
            return {
                scorePct: 100,
                label: 'Achieved',
                currentRate,
                requiredRate: null,
                uncertaintyKgWeek: null,
            };
        }

        if (
            !goal ||
            goal.weight == null ||
            !(goal.date instanceof Date) ||
            referenceWeight == null ||
            currentRate == null ||
            requiredRate == null
        ) {
            return null;
        }

        // Convert day-level volatility in kg into uncertainty of weekly rate estimate.
        const uncertaintyKgWeek = Math.max(0.05, volatility * Math.sqrt(7) * 0.6);

        // Probability that the "realized rate" is sufficient to hit the goal date.
        const goalIsLoss = goal.weight < referenceWeight;
        const z = (requiredRate - currentRate) / uncertaintyKgWeek;
        const pHit = goalIsLoss
            ? this._normalCdf(z) // P(rate <= requiredRate)
            : 1 - this._normalCdf(z); // P(rate >= requiredRate)

        const scorePct = Math.max(0, Math.min(100, Math.round(pHit * 100)));
        const label = scorePct >= 80 ? 'High' : scorePct >= 55 ? 'Moderate' : 'Low';

        return {
            scorePct,
            label,
            currentRate,
            requiredRate,
            uncertaintyKgWeek,
        };
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const displayStats = state.displayStats || {};
        const currentRate = displayStats.currentWeeklyRate || 0;
        const currentWeight = displayStats.currentWeight;
        const volatility = displayStats.volatility || 0.5;
        const confidence = this._calculateGoalConfidence(state, displayStats);

        if (!currentWeight) {
            this._container.innerHTML = `
                <div class="empty-state-message">
                    <p>No weight data</p>
                    <small>Available for projection</small>
                </div>
            `;
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
            ${confidence ? `
                <div class="goal-confidence-meter">
                    <div class="gcm-header">
                        <span class="gcm-title">Goal Confidence</span>
                        <span class="gcm-badge gcm-${confidence.label.toLowerCase()}">${confidence.scorePct}% ${confidence.label}</span>
                    </div>
                    <div class="gcm-bar">
                        <div class="gcm-fill gcm-${confidence.label.toLowerCase()}" style="width:${confidence.scorePct}%"></div>
                    </div>
                    <div class="gcm-details">
                        <span>Current: ${confidence.currentRate != null ? `${confidence.currentRate > 0 ? '+' : ''}${confidence.currentRate.toFixed(2)} kg/wk` : 'N/A'}</span>
                        <span>Required: ${confidence.requiredRate != null ? `${confidence.requiredRate > 0 ? '+' : ''}${confidence.requiredRate.toFixed(2)} kg/wk` : 'N/A'}</span>
                    </div>
                </div>
            ` : ''}
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
