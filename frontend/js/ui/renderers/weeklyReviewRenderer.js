import { StateManager } from "../../core/stateManager.js";
import { Utils } from "../../core/utils.js";
import * as Selectors from "../../core/selectors.js";
import { CONFIG } from "../../config.js";

export const WeeklyReviewRenderer = {
    _container: null,

    init() {
        this._container = document.getElementById("weekly-review-content"); // Expects container in index.html
        if (!this._container) {
            console.warn("WeeklyReviewRenderer: Container #weekly-review-content not found.");
            return;
        }

        // Subscribe to data changes
        StateManager.subscribeToSpecificEvent("state:processedDataChanged", () => this._render()); // Use correct event name
        // Actually, processedDataChanged isn't a mapped event in StateManager exactly like this?
        // Check StateManager mappings: SET_PROCESSED_DATA -> state:processedDataChanged?
        // Mappings: SET_FILTERED_DATA -> state:filteredDataChanged.
        // I should listen to state:filteredDataChanged (visible data) or general state change?
        // SET_PROCESSED_DATA -> not explicitly mapped in snippet I saw.
        // BUT SET_FILTERED_DATA is usually triggered after processing.
        // I'll listen to "state:filteredDataChanged".

        StateManager.subscribeToSpecificEvent("state:filteredDataChanged", () => this._render());

        // Also listen to initial load
        StateManager.subscribeToSpecificEvent("state:initializationComplete", () => this._render());

        console.log("WeeklyReviewRenderer initialized.");
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const data = Selectors.selectProcessedData(state); // Use full processed data for history
        const goal = Selectors.selectGoal(state);

        if (!data || data.length < 2) {
            this._container.innerHTML = `<p class="empty-state">Not enough data for weekly review.</p>`;
            return;
        }

        // Get last 7 days ending at the last data point
        // Sort by date ascending to be sure
        const sortedData = [...data].sort((a, b) => a.date - b.date);
        const lastDay = sortedData[sortedData.length - 1];

        // Filter last 7 days relative to last logged day
        const lastDate = lastDay.date;
        const sevenDaysAgo = new Date(lastDate);
        sevenDaysAgo.setDate(lastDate.getDate() - 6); // inclusive

        const weekData = sortedData.filter(d => d.date >= sevenDaysAgo && d.date <= lastDate);

        if (weekData.length === 0) return;

        // Calculate Metrics

        // 1. Deficit/Surplus Consistency
        // Count days with TDEE calc available where (TDEE - Intake) > 0 (Deficit) or < 0 (Surplus)
        // Goal dependant? If goal is lose weight, deficit is "good".
        const isCutting = (goal.targetRate || 0) < 0;
        let goodDays = 0;

        // 2. Logging Consistency
        const loggingCount = weekData.filter(d => d.calorieIntake > 0).length;
        const consistencyPct = Math.round((loggingCount / 7) * 100);

        // 3. Weight Trend Change
        // Change in SMA over the period.
        // Start of period SMA vs End of period SMA.
        const startSMA = weekData[0].sma;
        const endSMA = weekData[weekData.length - 1].sma;
        const trendChange = (startSMA != null && endSMA != null) ? (endSMA - startSMA) : 0;

        // 4. Net Energy
        let totalIntake = 0;
        let totalTDEE = 0;
        let validTDEEDays = 0;

        weekData.forEach(d => {
            if (d.calorieIntake) totalIntake += d.calorieIntake;
            const tdee = d.adaptiveTDEE || d.googleFitTDEE; // Prefer adaptive
            if (tdee) {
                totalTDEE += tdee;
                validTDEEDays++;

                const balance = d.calorieIntake - tdee;
                if (isCutting) {
                    if (balance < 0) goodDays++;
                } else {
                    if (balance > 0) goodDays++; // Bulking
                }
            }
        });

        const netBal = totalIntake - totalTDEE;

        // Generate Story
        let sentiment = "neutral";
        let title = "Weekly Snapshot";
        let message = "";

        if (isCutting) {
            if (trendChange < -0.2) sentiment = "positive";
            else if (trendChange > 0.2) sentiment = "negative";
        }

        const changeStr = trendChange > 0 ? `+${trendChange.toFixed(1)}` : trendChange.toFixed(1);

        // HTML Construction
        this._container.innerHTML = `
        <div class="weekly-review-card ${sentiment}">
            <div class="review-header">
                <h3>${title}</h3>
                <span class="review-dates">${Utils.formatDateShort(weekData[0].date)} - ${Utils.formatDateShort(lastDate)}</span>
            </div>
            <div class="review-metrics">
                <div class="metric">
                    <span class="label">Trend</span>
                    <span class="value ${trendChange < 0 ? 'good' : 'warn'}">${changeStr} kg</span>
                </div>
                <div class="metric">
                    <span class="label">Adherence</span>
                    <span class="value">${goodDays}/7 Days</span>
                </div>
                <div class="metric">
                    <span class="label">Consistency</span>
                    <span class="value">${consistencyPct}%</span>
                </div>
            </div>
            <div class="review-summary">
                <p>
                    You logged <strong>${loggingCount}</strong> days this week. 
                    Net balance was <strong>${netBal > 0 ? '+' : ''}${Math.round(netBal)} kcal</strong>.
                    ${goodDays >= 5 ? "Great adherence to your goal!" : "Keep pushing for consistency."}
                </p>
            </div>
        </div>
    `;
    }
};
