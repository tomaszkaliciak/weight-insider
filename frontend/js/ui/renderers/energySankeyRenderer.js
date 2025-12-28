// js/ui/renderers/energySankeyRenderer.js
// Visualizes Energy Flow as a Sankey diagram: Intake → TDEE → Deficit/Surplus → Weight Change

import * as d3 from 'd3';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { CONFIG } from '../../config.js';

export const EnergySankeyRenderer = {
    _container: null,
    _lastData: null,

    init() {
        this._container = document.getElementById('energy-sankey-content');
        if (!this._container) {
            console.warn('[EnergySankeyRenderer] Container not found.');
            return;
        }

        // Handle resize/visibility changes
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.contentRect.width > 0 && this._lastData) {
                    requestAnimationFrame(() => this._renderSankey(this._lastData));
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

        console.log('[EnergySankeyRenderer] Initialized.');
    },

    _render() {
        const state = StateManager.getState();
        const data = Selectors.selectFilteredData(state);
        const displayStats = Selectors.selectDisplayStats(state);

        if (!data || data.length < 7) {
            this._renderNoData();
            return;
        }

        // Calculate averages for the Sankey flow
        const validData = data.filter(d =>
            d.calorieIntake != null && !isNaN(d.calorieIntake) &&
            (d.adaptiveTDEE != null || d.googleFitTDEE != null)
        );

        if (validData.length < 7) {
            this._renderNoData();
            return;
        }

        const avgIntake = d3.mean(validData, d => d.calorieIntake);
        const avgTDEE = d3.mean(validData, d => d.adaptiveTDEE || d.googleFitTDEE);
        const avgBalance = avgIntake - avgTDEE;

        // Calculate weight change from the period
        const sortedData = [...validData].sort((a, b) => a.date - b.date);
        const startWeight = sortedData[0].sma || sortedData[0].weight;
        const endWeight = sortedData[sortedData.length - 1].sma || sortedData[sortedData.length - 1].weight;
        const totalWeightChange = endWeight - startWeight;
        const daysInPeriod = (sortedData[sortedData.length - 1].date - sortedData[0].date) / (1000 * 60 * 60 * 24);
        const weeklyChange = daysInPeriod > 0 ? (totalWeightChange / daysInPeriod) * 7 : 0;

        // Convert weight change to estimated kcal
        const estimatedKcalFromWeight = (weeklyChange / 7) * CONFIG.KCALS_PER_KG;

        this._lastData = {
            avgIntake: Math.round(avgIntake),
            avgTDEE: Math.round(avgTDEE),
            avgBalance: Math.round(avgBalance),
            weeklyChange: weeklyChange,
            estimatedKcalFromWeight: Math.round(estimatedKcalFromWeight),
            daysInPeriod: Math.round(daysInPeriod),
            isDeficit: avgBalance < 0
        };

        // Prepare DOM
        this._container.innerHTML = `
            <div class="energy-sankey-summary">
                <div class="sankey-stat ${avgBalance < 0 ? 'deficit' : 'surplus'}"
                     title="Net energy balance: ${avgBalance > 0 ? '+' : ''}${Math.round(avgBalance)} kcal/day over ${Math.round(daysInPeriod)} days">
                    <span class="label">Avg Daily Balance</span>
                    <span class="value">${avgBalance > 0 ? '+' : ''}${Math.round(avgBalance)} kcal</span>
                </div>
                <div class="sankey-stat"
                     title="Weight change rate over ${Math.round(daysInPeriod)} days">
                    <span class="label">Weekly Change</span>
                    <span class="value ${weeklyChange < 0 ? 'deficit' : weeklyChange > 0 ? 'surplus' : ''}">${weeklyChange >= 0 ? '+' : ''}${weeklyChange.toFixed(2)} kg</span>
                </div>
            </div>
            <div id="energy-sankey-chart" class="energy-sankey-container"></div>
        `;

        this._renderSankey(this._lastData);
    },

    _renderSankey(data) {
        const container = document.getElementById('energy-sankey-chart');
        if (!container) return;

        container.innerHTML = '';

        const width = container.clientWidth;
        if (width === 0) return;

        const height = 200;
        const margin = { top: 10, right: 100, bottom: 10, left: 10 };

        // Create SVG
        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Define the nodes and links for Sankey
        // Flow: Intake → [TDEE, Balance] → Weight Impact
        const isDeficit = data.isDeficit;

        // All values need to be positive for Sankey
        const absBalance = Math.abs(data.avgBalance);
        const absKcalImpact = Math.abs(data.estimatedKcalFromWeight);

        // Build nodes
        const nodes = [
            { name: "Intake", id: 0 },
            { name: "TDEE", id: 1 },
            { name: isDeficit ? "Deficit" : "Surplus", id: 2 },
            { name: isDeficit ? "Fat Loss" : "Fat Gain", id: 3 }
        ];

        // Build links - all values must be positive
        // Link values represent the flow magnitude
        const links = [
            { source: 0, target: 1, value: data.avgTDEE, label: `${data.avgTDEE} kcal → TDEE` },
            { source: isDeficit ? 1 : 0, target: 2, value: Math.max(absBalance, 50), label: `${isDeficit ? '-' : '+'}${absBalance} kcal ${isDeficit ? 'deficit' : 'surplus'}` },
            { source: 2, target: 3, value: Math.max(absBalance, 50), label: `≈ ${data.weeklyChange >= 0 ? '+' : ''}${data.weeklyChange.toFixed(2)} kg/week` }
        ];

        // Add surplus flow from intake if in surplus
        if (!isDeficit) {
            links[0].value = data.avgTDEE;
        }

        // Configure Sankey
        const sankeyGenerator = d3Sankey()
            .nodeId(d => d.id)
            .nodeWidth(20)
            .nodePadding(30)
            .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);

        const sankeyData = sankeyGenerator({
            nodes: nodes.map(d => ({ ...d })),
            links: links.map(d => ({ ...d }))
        });

        // Color scale
        const getNodeColor = (node) => {
            switch (node.name) {
                case "Intake": return "var(--primary-color)";
                case "TDEE": return "var(--info-color)";
                case "Deficit": return "var(--success-color)";
                case "Surplus": return "var(--warning-color)";
                case "Fat Loss": return "var(--success-color)";
                case "Fat Gain": return "var(--warning-color)";
                default: return "var(--text-muted)";
            }
        };

        const getLinkColor = (link) => {
            if (link.target.name === "Deficit" || link.target.name === "Fat Loss") {
                return "var(--success-color)";
            }
            if (link.target.name === "Surplus" || link.target.name === "Fat Gain") {
                return "var(--warning-color)";
            }
            return "var(--primary-color)";
        };

        // Draw links
        svg.append("g")
            .attr("class", "sankey-links")
            .selectAll("path")
            .data(sankeyData.links)
            .enter()
            .append("path")
            .attr("class", "sankey-link")
            .attr("d", sankeyLinkHorizontal())
            .attr("stroke", d => getLinkColor(d))
            .attr("stroke-width", d => Math.max(2, d.width))
            .append("title")
            .text(d => d.label);

        // Draw nodes
        const nodeGroup = svg.append("g")
            .attr("class", "sankey-nodes")
            .selectAll("g")
            .data(sankeyData.nodes)
            .enter()
            .append("g");

        nodeGroup.append("rect")
            .attr("class", "sankey-node")
            .attr("x", d => d.x0)
            .attr("y", d => d.y0)
            .attr("height", d => Math.max(d.y1 - d.y0, 4))
            .attr("width", d => d.x1 - d.x0)
            .attr("fill", d => getNodeColor(d))
            .attr("rx", 3)
            .append("title")
            .text(d => d.name);

        // Add labels
        nodeGroup.append("text")
            .attr("class", "sankey-label")
            .attr("x", d => d.x1 + 6)
            .attr("y", d => (d.y0 + d.y1) / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "start")
            .text(d => {
                switch (d.name) {
                    case "Intake": return `Intake: ${data.avgIntake}`;
                    case "TDEE": return `TDEE: ${data.avgTDEE}`;
                    case "Deficit": return `Deficit: -${Math.abs(data.avgBalance)}`;
                    case "Surplus": return `Surplus: +${Math.abs(data.avgBalance)}`;
                    case "Fat Loss": return `${data.weeklyChange.toFixed(2)} kg/wk`;
                    case "Fat Gain": return `+${data.weeklyChange.toFixed(2)} kg/wk`;
                    default: return d.name;
                }
            })
            .attr("fill", "var(--text-primary)")
            .style("font-size", "11px")
            .style("font-weight", "500");
    },

    _renderNoData() {
        if (!this._container) return;
        this._container.innerHTML = '<p class="empty-state">Insufficient data. Need at least 7 days with calorie intake and TDEE data.</p>';
    }
};
