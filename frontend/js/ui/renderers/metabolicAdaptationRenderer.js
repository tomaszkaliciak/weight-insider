// js/ui/renderers/metabolicAdaptationRenderer.js
// Detects and visualizes metabolic adaptation (TDEE decline) during cutting phases

import { StateManager } from '../../core/stateManager.js';
import { VisibilityManager } from '../visibilityManager.js';
import * as d3 from 'd3';
import * as ss from 'simple-statistics';

export const MetabolicAdaptationRenderer = {
    _container: null,
    _isVisible: false,

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

        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('DISPLAY_STATS') ||
                stateChanges.action.type.includes('FILTERED_DATA')) {
                if (this._isVisible) {
                    this._render();
                }
            }
        });

        // Initial render check
        if (this._isVisible) {
            this._render();
        }

        console.log('[MetabolicAdaptationRenderer] Initialized.');
    },

    /**
     * Calculates metabolic adaptation by comparing start vs end TDEE of current phase
     * Uses correct property names: 'value' for weight, 'calorieIntake' for calories
     */
    _calculateAdaptation(data) {
        if (!data || data.length < 28) {
            return null;
        }

        // 1. Calculate TDEE time series (rolling 14-day average)
        const tdeeSeries = [];
        const windowSize = 14;

        for (let i = windowSize; i < data.length; i++) {
            const windowData = data.slice(i - windowSize, i);

            // Use correct property names: calorieIntake and value (for weight)
            const validIntakes = windowData
                .filter(d => d.calorieIntake != null && !isNaN(d.calorieIntake))
                .map(d => d.calorieIntake);

            if (validIntakes.length < windowSize * 0.5) continue; // Need at least 50% valid intake data

            const avgIntake = d3.mean(validIntakes);

            // Calculate rate of weight change (kg/day) using linear regression
            // Use 'value' for weight, or 'sma' if available for smoother results
            const regressionPoints = windowData
                .filter(d => (d.sma != null || d.value != null))
                .map((d, idx) => [idx, d.sma ?? d.value]);

            if (regressionPoints.length < 2) continue;

            const line = ss.linearRegression(regressionPoints);
            const rateKgPerDay = line.m; // slope is kg/day

            // TDEE = Intake - (Rate * 7700 kcal/kg)
            const tdee = avgIntake - (rateKgPerDay * 7700);

            // Get current weight using 'value' or 'sma'
            const currentWeight = data[i].sma ?? data[i].value;
            if (currentWeight == null) continue;

            tdeeSeries.push({
                date: data[i].date,
                tdee: tdee,
                weight: currentWeight
            });
        }

        if (tdeeSeries.length < 14) {
            console.log('[MetabolicAdaptationRenderer] Insufficient TDEE series length:', tdeeSeries.length);
            return null;
        }

        // 2. Identify "Initial Baseline" (Avg of first 14 days of series)
        const baselineTDEE = d3.mean(tdeeSeries.slice(0, 14), d => d.tdee);

        // 3. Identify "Current TDEE" (Avg of last 14 days)
        const currentTDEE = d3.mean(tdeeSeries.slice(-14), d => d.tdee);

        // 4. Calculate Expected TDEE drop just due to weight loss
        const initialWeight = tdeeSeries[0].weight;
        const currentWeight = tdeeSeries[tdeeSeries.length - 1].weight;
        const weightLost = initialWeight - currentWeight;
        const expectedDrop = weightLost * 25; // 25kcal/kg estimate

        const actualDrop = baselineTDEE - currentTDEE;
        const adaptiveDrop = actualDrop - expectedDrop;

        return {
            baselineTDEE,
            currentTDEE,
            weightLost,
            expectedDrop,
            actualDrop,
            adaptiveDrop: Math.max(0, adaptiveDrop),
            adaptationPct: (Math.max(0, adaptiveDrop) / baselineTDEE) * 100,
            tdeeSeries
        };
    },

    _render() {
        if (!this._container) return;
        const state = StateManager.getState();
        const data = state.filteredData;

        if (!data || data.length < 28) {
            this._container.innerHTML = `<p class="empty-state">Need at least 4 weeks of data to detect adaptation. (Current: ${data ? data.length : 0} days)</p>`;
            return;
        }

        const metrics = this._calculateAdaptation(data);
        if (!metrics) {
            this._container.innerHTML = '<p class="empty-state">Insufficient calorie/weight data for TDEE calculation.</p>';
            return;
        }

        const { adaptationPct, adaptiveDrop, currentTDEE, baselineTDEE } = metrics;
        const isSignificant = adaptationPct > 5;

        let statusColor = 'var(--success-color)';
        let statusIcon = '✅';
        let statusMsg = 'Metabolism Healthy';

        if (adaptationPct > 10) {
            statusColor = 'var(--danger-color)';
            statusIcon = '⚠️';
            statusMsg = 'High Adaptation';
        } else if (adaptationPct > 5) {
            statusColor = 'var(--warning-color)';
            statusIcon = '🔶';
            statusMsg = 'Mild Adaptation';
        }

        const html = `
            <div class="adaptation-status" style="border-left: 4px solid ${statusColor}">
                <div class="status-header">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="status-title">${statusMsg}</span>
                </div>
                <div class="status-detail">
                    Your metabolism has slowed by <strong>-${Math.round(adaptiveDrop)} kcal</strong> 
                    beyond what is expected from weight loss alone.
                </div>
            </div>

            <div class="adaptation-metrics">
                <div class="metric-box">
                    <span class="label">Initial TDEE</span>
                    <span class="value">${Math.round(baselineTDEE)}</span>
                </div>
                <div class="metric-box">
                    <span class="label">Current TDEE</span>
                    <div class="value-group">
                        <span class="value">${Math.round(currentTDEE)}</span>
                        <span class="diff ${currentTDEE < baselineTDEE ? 'negative' : 'positive'}">
                            ${(currentTDEE - baselineTDEE).toFixed(0)}
                        </span>
                    </div>
                </div>
                <div class="metric-box">
                    <span class="label">Adaptation</span>
                    <span class="value" style="color: ${statusColor}">${adaptationPct.toFixed(1)}%</span>
                </div>
            </div>

            <div class="adaptation-chart-container" id="tdee-trend-chart"></div>
            
            ${isSignificant ? `
                <div class="recommendation-tip">
                    <strong>💡 Tip:</strong> Consider a 1-2 week "diet break" at maintenance calories to restore metabolic rate.
                </div>
            ` : ''}
        `;

        this._container.innerHTML = html;
        this._renderMiniChart(metrics.tdeeSeries);
    },

    _renderMiniChart(data) {
        const chartContainer = document.getElementById('tdee-trend-chart');
        if (!chartContainer) return;

        const width = chartContainer.offsetWidth - 40;
        const height = 100;
        if (width <= 0) return;

        const margin = { top: 10, right: 10, bottom: 20, left: 30 };

        d3.select('#tdee-trend-chart').selectAll('*').remove();

        const svg = d3.select('#tdee-trend-chart')
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.date))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([d3.min(data, d => d.tdee) - 100, d3.max(data, d => d.tdee) + 100])
            .range([height, 0]);

        // Line
        svg.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', 'var(--primary-color)')
            .attr('stroke-width', 2)
            .attr('d', d3.line()
                .x(d => x(d.date))
                .y(d => y(d.tdee))
                .curve(d3.curveBasis)
            );

        // Baseline reference line
        svg.append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', y(data[0].tdee))
            .attr('y2', y(data[0].tdee))
            .attr('stroke', 'var(--text-muted)')
            .attr('stroke-dasharray', '4')
            .attr('opacity', 0.5);

        // Axes (minimal)
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(3).tickFormat(d3.timeFormat('%b %d')));

        svg.append('g')
            .call(d3.axisLeft(y).ticks(3));
    }
};
