// js/ui/renderers/sparklineRenderer.js
// Manages sparklines for key statistics by tracking value history

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Sparkline } from '../components/sparkline.js';

// Stats that should have sparklines
const SPARKLINE_STATS = {
    'currentSma': { historyKey: 'weight', selector: '#current-sma' },
    'currentWeeklyRate': { historyKey: 'rate', selector: '#rolling-weekly-change-sma' },
    'avgIntake': { historyKey: 'intake', selector: '#avg-intake' }
};

export const SparklineRenderer = {
    _maxHistory: 14, // Keep last 14 data points

    init() {
        // Update sparklines when stats update
        StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', (stats) => {
            this._renderSparklines(stats);
        });

        console.log('[SparklineRenderer] Initialized.');
    },

    _renderSparklines(stats) {
        // Pull latest data directly from state
        const state = StateManager.getState();
        const data = Selectors.selectFilteredData(state);

        if (!data || data.length < 2) {
            // console.log('[SparklineRenderer] Not enough data to render.');
            return;
        }

        // Get recent data history
        const recentData = data.slice(-this._maxHistory);

        // 1. Weight Sparkline (SMA)
        const weightHistory = recentData
            .map(d => d.sma ?? d.value)
            .filter(v => v != null);

        this._tryRender('#current-sma', weightHistory);

        // 2. Rate Sparkline (Smoothed Weekly Rate)
        // Note: 'rate' is the smoothed weekly rate property in processed data
        const rateHistory = recentData
            .map(d => d.smoothedWeeklyRate) // Use 'smoothedWeeklyRate' property
            .filter(v => v != null);

        this._tryRender('#rolling-weekly-change-sma', rateHistory);

        // 3. Intake Sparkline
        const intakeHistory = recentData
            .map(d => d.calorieIntake) // Use 'calorieIntake' property
            .filter(v => v != null);

        this._tryRender('#avg-intake', intakeHistory);

        // 4. Total Change Sparkline (Weight trend relative to start)
        // Uses the same weight history but contextually meaningful
        this._tryRender('#total-change', weightHistory);

        // 5. Rolling Volatility Sparkline
        const volatilityHistory = recentData
            .map(d => d.rollingVolatility)
            .filter(v => v != null);

        this._tryRender('#rolling-volatility', volatilityHistory);

        // 6. Expenditure Sparkline (Adaptive TDEE or GFit)
        const expenditureHistory = recentData
            .map(d => d.adaptiveTDEE || d.googleFitTDEE)
            .filter(v => v != null);

        this._tryRender('#avg-expenditure', expenditureHistory);
    },

    _tryRender(selector, history) {
        const element = document.querySelector(selector);
        if (element && history.length >= 2) {
            this._addSparklineToStat(element, history);
        }
    },

    _addSparklineToStat(element, data) {
        // Check if sparkline container already exists
        let sparklineContainer = element.parentElement.querySelector('.sparkline-wrapper');

        if (!sparklineContainer) {
            // Create wrapper for sparkline next to stat
            sparklineContainer = document.createElement('span');
            sparklineContainer.className = 'sparkline-wrapper';
            // Insert after the unit if it exists, or append to parent
            const unit = element.nextElementSibling;
            if (unit && unit.classList.contains('stat-unit')) {
                unit.after(sparklineContainer);
            } else {
                element.parentElement.appendChild(sparklineContainer);
            }
        }

        Sparkline.render(sparklineContainer, data, {
            width: 50,
            height: 16,
            strokeWidth: 2
        });
    }
};
