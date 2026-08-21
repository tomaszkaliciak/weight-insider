// js/core/outlierExplainer.js
// Provides human-readable explanations for flagged outlier data points.

/**
 * Given a single data point flagged as an outlier, analyzes the surrounding
 * context (calorie intake vs. average, deviation magnitude) and returns a
 * plain-language explanation of the likely cause.
 *
 * @param {object} dataPoint - A single processed data point from dataService.
 * @param {number|null} avgCalories - The recent average calorie intake (for comparison).
 * @returns {{ severity: string, narrative: string }}
 */
export function explainOutlier(dataPoint, avgCalories = null) {
    if (!dataPoint || !dataPoint.isOutlier) {
        return { severity: 'none', narrative: '' };
    }

    const { value, sma, stdDev, calorieIntake, anomalyScore, outlierThresholdKg } = dataPoint;
    if (value == null || sma == null) {
        return { severity: 'low', narrative: 'Statistical anomaly detected.' };
    }

    const effectiveSigma = stdDev != null && stdDev > 0
        ? stdDev
        : outlierThresholdKg != null && anomalyScore != null && anomalyScore > 0
            ? outlierThresholdKg / anomalyScore
            : 0;
    const deviationSigma = effectiveSigma > 0 ? (value - sma) / effectiveSigma : 0;
    const absDeviation = Math.abs(value - sma).toFixed(2);
    const sigmaLabel = Math.abs(deviationSigma).toFixed(1);
    const isAbove = deviationSigma > 0;
    const direction = isAbove ? 'above' : 'below';

    // Determine severity from Z-score magnitude
    const absSigma = Math.abs(deviationSigma);
    let severity = 'low';
    if (absSigma >= 3) severity = 'high';
    else if (absSigma >= 2) severity = 'medium';

    // Context: compare calories to average
    const hasCalories = calorieIntake != null && calorieIntake > 0;
    const hasAvgCal = avgCalories != null && avgCalories > 0;
    const calorieDeltaPct = (hasCalories && hasAvgCal)
        ? ((calorieIntake - avgCalories) / avgCalories) * 100
        : null;

    const highCalorieDay = calorieDeltaPct != null && calorieDeltaPct > 15;
    const lowCalorieDay = calorieDeltaPct != null && calorieDeltaPct < -15;

    let narrative = '';

    if (isAbove) {
        if (highCalorieDay) {
            narrative = `Weight ${absDeviation} kg above trend (${sigmaLabel}σ). High calorie intake (+${Math.round(calorieDeltaPct)}% vs. avg) may explain this spike.`;
        } else if (hasCalories && !highCalorieDay) {
            narrative = `Weight ${absDeviation} kg above trend (${sigmaLabel}σ) despite normal calorie intake. Likely caused by water retention, high sodium, or sleep disruption.`;
        } else {
            narrative = `Weight ${absDeviation} kg above trend (${sigmaLabel}σ). No calorie data available — possible water retention or measurement error.`;
        }
    } else {
        if (lowCalorieDay) {
            narrative = `Weight ${absDeviation} kg below trend (${sigmaLabel}σ). Low calorie intake (${Math.round(calorieDeltaPct)}% vs. avg) may have caused a temporary drop.`;
        } else if (hasCalories && !lowCalorieDay) {
            narrative = `Weight ${absDeviation} kg below trend (${sigmaLabel}σ) with normal intake. Possibly excess prior-day activity, dehydration, or reduced sodium.`;
        } else {
            narrative = `Weight ${absDeviation} kg below trend (${sigmaLabel}σ). Possible dehydration, high prior-day activity, or measurement timing.`;
        }
    }

    return { severity, narrative };
}
