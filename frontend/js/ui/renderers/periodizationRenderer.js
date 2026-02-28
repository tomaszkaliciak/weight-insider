// js/ui/renderers/periodizationRenderer.js
// Renders periodization phases (bulk/cut/maintenance) in the sidebar panel.

import * as d3 from 'd3';
import { StateManager } from "../../core/stateManager.js";
import * as Selectors from "../../core/selectors.js";
import { Utils } from "../../core/utils.js";


const container = () => d3.select("#periodization-list");

function getPhaseLabel(type) {
    switch (type) {
        case "bulk":
            return "Bulk";
        case "cut":
            return "Cut";
        case "maintenance":
            return "Maintenance";
        default:
            return type;
    }
}

function render(phases) {
    const containerEl = container();
    if (!containerEl || containerEl.empty()) {
        console.warn("[PeriodizationRenderer] Container #periodization-list not found.");
        return;
    }

    containerEl.html(""); // Clear existing content

    if (!phases || phases.length === 0) {
        containerEl.html(`
            <div class="empty-state-message">
                <p>No phases detected</p>
                <small>Need at least 2 weeks of data with consistent trends.</small>
            </div>
        `);
        return;
    }

    // Render each phase as a card
    phases.forEach((phase, index) => {
        const phaseCard = containerEl.append("div")
            .attr("class", `phase-card phase-${phase.type}`)
            .attr("title", `${Utils.formatDateDMY(phase.startDate)} - ${Utils.formatDateDMY(phase.endDate)}`);

        // Phase header with badge
        const header = phaseCard.append("div")
            .attr("class", "phase-header");

        header.append("span")
            .attr("class", `phase-badge phase-badge--${phase.type}`)
            .text(getPhaseLabel(phase.type));

        header.append("span")
            .attr("class", "phase-duration")
            .text(`${phase.durationWeeks} weeks`);

        // Phase stats
        const stats = phaseCard.append("div")
            .attr("class", "phase-stats");

        // Weight change
        if (phase.weightChange != null) {
            const changeClass = phase.weightChange > 0 ? "positive" : phase.weightChange < 0 ? "negative" : "neutral";
            stats.append("div")
                .attr("class", "phase-stat")
                .html(`<span class="stat-label">Weight Δ:</span> <span class="stat-value ${changeClass}">${phase.weightChange > 0 ? "+" : ""}${phase.weightChange.toFixed(1)} kg</span>`);
        }

        // Average rate
        if (phase.avgRate != null) {
            stats.append("div")
                .attr("class", "phase-stat")
                .html(`<span class="stat-label">Avg Rate:</span> <span class="stat-value">${phase.avgRate > 0 ? "+" : ""}${phase.avgRate.toFixed(2)} kg/wk</span>`);
        }

        // Average calories
        if (phase.avgCalories != null) {
            stats.append("div")
                .attr("class", "phase-stat")
                .html(`<span class="stat-label">Avg Intake:</span> <span class="stat-value">${phase.avgCalories} kcal</span>`);
        }

        // Date range
        stats.append("div")
            .attr("class", "phase-stat phase-dates")
            .html(`<span class="stat-value">${Utils.formatDateShort(phase.startDate)} → ${Utils.formatDateShort(phase.endDate)}</span>`);
    });
}

export const PeriodizationRenderer = {
    init() {
        StateManager.subscribeToSpecificEvent("state:periodizationPhasesChanged", ({ phases }) => {
            render(phases);
        });

        StateManager.subscribeToSpecificEvent("state:initializationComplete", () => {
            const state = StateManager.getState();
            render(Selectors.selectPeriodizationPhases(state));
        });
    },
};
