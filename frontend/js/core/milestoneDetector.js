// js/core/milestoneDetector.js
// Detects personal achievements, weight loss milestones, logging streaks,
// and historical all-time lows.

import { UnitFormatter } from './unitFormatter.js';

export const MilestoneDetector = {
  /**
   * Detects milestones and achievements from processed data and goal state.
   * @param {Array<object>} processedData
   * @param {object} goal
   * @returns {Array<object>} List of milestone achievement objects.
   */
  detectMilestones(processedData, goal) {
    if (!Array.isArray(processedData) || processedData.length < 5) return [];

    const milestones = [];
    const validWeights = processedData
      .filter((d) => d.value != null && !isNaN(d.value) && !d.isOutlier)
      .sort((a, b) => a.date - b.date);

    if (validWeights.length < 2) return [];

    const firstWeight = validWeights[0].value;
    const latestObj = validWeights[validWeights.length - 1];
    const currentWeight = latestObj.value;
    const netChangeKg = currentWeight - firstWeight;

    // 1. All-time low weight check
    let minWeight = Infinity;
    let minDate = null;
    validWeights.forEach((d) => {
      if (d.value < minWeight) {
        minWeight = d.value;
        minDate = d.date;
      }
    });

    if (Math.abs(currentWeight - minWeight) < 0.2) {
      milestones.push({
        id: 'achievement-all-time-low',
        icon: '🏆',
        title: 'All-Time Low Weight',
        date: minDate,
        description: `Achieved ${UnitFormatter.formatWeight(currentWeight, 1, true)} — your lowest recorded weight!`,
        badgeClass: 'badge-gold',
      });
    }

    // 2. Weight Loss Milestones (-5 kg / -11 lbs increments)
    if (netChangeKg < 0) {
      const absLossKg = Math.abs(netChangeKg);
      const milestoneStepKg = 5; // 5kg increments
      const milestoneCount = Math.floor(absLossKg / milestoneStepKg);

      if (milestoneCount > 0) {
        const achievedAmountKg = milestoneCount * milestoneStepKg;
        milestones.push({
          id: `achievement-${achievedAmountKg}kg-loss`,
          icon: '🎉',
          title: `${UnitFormatter.formatWeightDiff(-achievedAmountKg, 0, true)} Milestone`,
          date: latestObj.date,
          description: `Total weight lost has surpassed ${UnitFormatter.formatWeight(-achievedAmountKg, 0, true)}!`,
          badgeClass: 'badge-emerald',
        });
      }
    }

    // 3. Goal Progress % Milestones (25%, 50%, 75%, 100%)
    if (goal && goal.weight && firstWeight !== goal.weight) {
      const totalGoalDiffKg = goal.weight - firstWeight;
      const progressRatio = (currentWeight - firstWeight) / totalGoalDiffKg;

      if (progressRatio >= 1.0) {
        milestones.push({
          id: 'achievement-goal-achieved',
          icon: '👑',
          title: 'Goal Achieved!',
          date: latestObj.date,
          description: `You have successfully reached your target weight of ${UnitFormatter.formatWeight(goal.weight, 1, true)}!`,
          badgeClass: 'badge-gold',
        });
      } else if (progressRatio >= 0.75) {
        milestones.push({
          id: 'achievement-75-pct-goal',
          icon: '⭐',
          title: '75% Goal Progress',
          date: latestObj.date,
          description: `Over 3/4 of the way to your target weight of ${UnitFormatter.formatWeight(goal.weight, 1, true)}.`,
          badgeClass: 'badge-blue',
        });
      } else if (progressRatio >= 0.50) {
        milestones.push({
          id: 'achievement-50-pct-goal',
          icon: '🎯',
          title: 'Halfway Milestone (50%)',
          date: latestObj.date,
          description: `Halfway point unlocked on your goal to ${UnitFormatter.formatWeight(goal.weight, 1, true)}.`,
          badgeClass: 'badge-blue',
        });
      }
    }

    // 4. Logging Consistency Streak
    let streak = 0;
    for (let i = processedData.length - 1; i >= 0; i--) {
      if (processedData[i].value != null || processedData[i].calorieIntake != null) {
        streak++;
      } else {
        break;
      }
    }

    if (streak >= 7) {
      milestones.push({
        id: 'achievement-streak',
        icon: '🔥',
        title: `${streak}-Day Logging Streak`,
        date: latestObj.date,
        description: `Logged weight or calories for ${streak} consecutive days!`,
        badgeClass: 'badge-purple',
      });
    }

    return milestones;
  },
};
