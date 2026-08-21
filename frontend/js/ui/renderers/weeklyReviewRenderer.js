import { StateManager } from "../../core/stateManager.js";
import { Utils } from "../../core/utils.js";
import * as Selectors from "../../core/selectors.js";
import { UnitFormatter } from "../../core/unitFormatter.js";
import { MacroTargetService } from "../../core/macroTargetService.js";
import { computeWeeklyReviewMetrics } from "../../core/weeklyReviewMetrics.js";

export const WeeklyReviewRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById("weekly-review-content");
        if (!this._container) {
            console.warn("WeeklyReviewRenderer: Container #weekly-review-content not found.");
            return;
        }

        StateManager.subscribeToSpecificEvent("state:filteredDataChanged", () => this._render());
        StateManager.subscribeToSpecificEvent("state:displayStatsUpdated", () => this._render());
        StateManager.subscribeToSpecificEvent("state:initializationComplete", () => this._render());

        const s = StateManager.getState();
        if (s.isInitialized) this._render();
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const data = Selectors.selectProcessedData(state);
        const goal = Selectors.selectGoal(state);
        const stats = Selectors.selectDisplayStats(state) || {};

        if (!data || data.length < 2) {
            Utils.renderEmptyState(this._container, {
                title: "Not enough data",
                detail: "Need at least 2 days of weight entries for a weekly review.",
                icon: "📅",
            });
            return;
        }

        const sortedData = [...data].sort((a, b) => a.date - b.date);
        const lastDay = sortedData[sortedData.length - 1];
        const lastDate = lastDay.date;
        const sevenDaysAgo = new Date(lastDate);
        sevenDaysAgo.setDate(lastDate.getDate() - 6);

        const weekData = sortedData.filter((d) => d.date >= sevenDaysAgo && d.date <= lastDate);
        if (weekData.length === 0) return;

        const isCutting = (goal.targetRate || 0) < 0 || (goal.weight != null && lastDay.value != null && goal.weight < lastDay.value);
        const targets = MacroTargetService.load();
        const calorieTarget = stats.suggestedIntakeTarget ?? Selectors.selectBaselineTdee(stats);
        const metrics = computeWeeklyReviewMetrics({
            weekData,
            isCutting,
            calorieTarget,
            proteinTarget: targets.protein,
            weeklyRate: stats.currentWeeklyRate ?? stats.latestWeeklyRate,
        });

        let totalIntake = 0;
        let totalTDEE = 0;
        weekData.forEach((d) => {
            if (d.calorieIntake) totalIntake += d.calorieIntake;
            const tdee = d.adaptiveTDEE || d.googleFitTDEE;
            if (tdee) totalTDEE += tdee;
        });
        const netBal = totalIntake - totalTDEE;

        let sentiment = "neutral";
        if (isCutting) {
            if ((metrics.smaChange ?? 0) < -0.2) sentiment = "positive";
            else if ((metrics.smaChange ?? 0) > 0.2) sentiment = "negative";
        }

        const smaStr = metrics.smaChange == null
            ? "—"
            : `${metrics.smaChange > 0 ? "+" : ""}${metrics.smaChange.toFixed(1)} ${UnitFormatter.getUnitLabel()}`;
        const rateStr = metrics.weeklyRate == null
            ? "—"
            : `${metrics.weeklyRate > 0 ? "+" : ""}${metrics.weeklyRate.toFixed(2)} ${UnitFormatter.getRateLabel()}`;

        this._container.innerHTML = `
        <div class="weekly-review-card ${sentiment}">
            <div class="review-header">
                <h3>Weekly Snapshot</h3>
                <span class="review-dates">${Utils.formatDateShort(weekData[0].date)} - ${Utils.formatDateShort(lastDate)}</span>
            </div>
            <div class="review-split">
                <section class="review-split-col">
                    <h4>Process</h4>
                    <div class="review-metrics">
                        <div class="metric">
                            <span class="label">Logged</span>
                            <span class="value">${metrics.loggingCount}/7</span>
                        </div>
                        <div class="metric">
                            <span class="label">Calorie days</span>
                            <span class="value">${metrics.calorieTargetDays}/7</span>
                        </div>
                        ${metrics.proteinDays != null ? `
                        <div class="metric">
                            <span class="label">Protein days</span>
                            <span class="value">${metrics.proteinDays}/7</span>
                        </div>` : ""}
                    </div>
                </section>
                <section class="review-split-col">
                    <h4>Outcome</h4>
                    <div class="review-metrics">
                        <div class="metric">
                            <span class="label">SMA</span>
                            <span class="value ${(metrics.smaChange ?? 0) < 0 ? "good" : "warn"}">${smaStr}</span>
                        </div>
                        <div class="metric">
                            <span class="label">Rate</span>
                            <span class="value">${rateStr}</span>
                        </div>
                    </div>
                </section>
            </div>
            <div class="review-summary">
                <p>${metrics.verdict}</p>
                <p>
                    You logged <strong>${metrics.loggingCount}</strong> days this week.
                    Net balance was <strong>${netBal > 0 ? "+" : ""}${Math.round(netBal)} kcal</strong>.
                </p>
            </div>
        </div>
    `;
    },
};
