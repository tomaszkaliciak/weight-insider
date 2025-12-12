# Features Reference

This document provides technical details about all features in Weight Insider.

---

## Table of Contents

1. [Core Chart Features](#core-chart-features)
2. [Data Processing](#data-processing)
3. [Analysis Features](#analysis-features)
4. [Goal Management](#goal-management)
5. [Event Tracking](#event-tracking)
6. [State Management](#state-management)

---

## Core Chart Features

### Weight Visualization

| Feature | File | Description |
|---------|------|-------------|
| Raw Data Points | `chartUpdaters.js` | Scatter plot of daily weights |
| SMA Line | `dataService.js` | 7-day Simple Moving Average |
| EMA Line | `dataService.js` | Exponential Moving Average (α=0.3) |
| Confidence Band | `chartUpdaters.js` | ±1 std dev around SMA |
| Regression Line | `statsManager.js` | Linear regression with 95% CI |

### Interaction Components

| Component | File | Purpose |
|-----------|------|---------|
| Context Brush | `chartSetup.js` | Quick date range selection |
| Regression Brush | `chartSetup.js` | Custom regression range |
| Zoom Behavior | `chartSetup.js` | D3 zoom/pan |
| Tooltip System | `tooltipManager.js` | Hover/pin data display |

---

## Data Processing

### Pipeline (`dataService.js`)

```
Raw Data (data.json)
    ↓
mergeRawData() - Combine all data sources
    ↓
calculateBodyComposition() - LBM/FM from body fat %
    ↓
calculateSMAAndStdDev() - 7-day moving average + bounds
    ↓
calculateEMA() - Exponential moving average
    ↓
identifyOutliers() - Flag statistical outliers
    ↓
calculateRollingVolatility() - Fluctuation measure
    ↓
calculateDailyRatesAndTDEETrend() - Rate of change
    ↓
calculateAdaptiveTDEE() - Dynamic TDEE estimation
    ↓
smoothRatesAndTDEEDifference() - Noise reduction
    ↓
calculateRateMovingAverage() - Weekly rate smoothing
    ↓
Processed Data
```

### Data Sources

| Key in data.json | Type | Description |
|------------------|------|-------------|
| `weights` | `{date: kg}` | Body weight measurements |
| `calorieIntake` | `{date: kcal}` | Daily calorie intake |
| `googleFitExpenditure` | `{date: kcal}` | Google Fit TDEE |
| `bodyFat` | `{date: %}` | Body fat percentage |
| `protein` | `{date: g}` | Protein intake |
| `carbs` | `{date: g}` | Carbohydrate intake |
| `fat` | `{date: g}` | Fat intake |
| `workouts` | `{date: object}` | Training data |

### Workout Data Structure

```javascript
{
  "2024-01-15": {
    "workoutCount": 1,      // Number of sessions
    "totalSets": 25,        // Total sets performed
    "totalVolume": 15000,   // Sets × Weight × Reps (kg)
    "isRestDay": false      // Rest day flag
  }
}
```

---

## Analysis Features

### Periodization Analysis

**File:** `periodizationRenderer.js`  
**Algorithm:** `dataService.detectPeriodizationPhases()`

**Classification Thresholds (from `config.js`):**
| Phase | Rate Threshold |
|-------|-----------------|
| Bulk | > +0.15 kg/week |
| Cut | < -0.15 kg/week |
| Maintenance | -0.15 to +0.15 |

**Minimum Phase Duration:** 2 weeks

**Output Structure:**
```javascript
{
  type: 'bulk' | 'cut' | 'maintenance',
  startDate: Date,
  endDate: Date,
  durationWeeks: number,
  avgRate: number,        // kg/week
  avgCalories: number,    // kcal/day
  weightChange: number    // total kg
}
```

---

### Workout Correlation

**File:** `workoutCorrelationRenderer.js`  
**Algorithm:** `dataService.calculateWorkoutCorrelation()`

**Method:**
1. Group data by week (Monday-based)
2. Sum weekly training volume
3. Calculate average weekly rate (smoothed)
4. Compute Pearson correlation coefficient

**Interpretation Bands:**
| |r| Range | Interpretation |
|-----------|----------------|
| ≥ 0.7 | Strong correlation |
| 0.4 - 0.69 | Moderate correlation |
| 0.2 - 0.39 | Weak correlation |
| < 0.2 | No significant correlation |

---

### Period Comparison

**File:** `periodComparisonRenderer.js`

**Quick Compare Modes:**
| Mode | Period 1 | Period 2 |
|------|----------|----------|
| Last 2 Weeks | Week before last | Last week |
| Last 2 Months | Month before last | Last month |
| Last 2 Phases | Second-to-last phase | Last phase |

**Comparison Metrics:**
- Duration (days)
- Weight change (kg)
- Average rate (kg/week)
- Average calorie intake
- Average training volume

---

## Goal Management

### Goal State

**State Path:** `state.goal`

```javascript
{
  weight: number | null,    // Target weight in kg
  date: Date | null,        // Target date
  targetRate: number | null // Optional desired rate
}
```

### Goal Alerts

**File:** `goalAlertRenderer.js`

**Alert Types:**

| Type | Priority | Condition |
|------|----------|-----------|
| `error` | 1 | Rate moving opposite to goal |
| `warning` | 2 | Off track / Deadline passed |
| `success` | 3-5 | Milestone / On track |
| `info` | 2-4 | Deadline approaching |

**Milestone Thresholds:** 25%, 50%, 75%, 90%

---

### Goal Suggestions

**File:** `goalSuggestionRenderer.js`

**Historical Analysis:**
- Calculates average positive rates (bulk phases)
- Calculates average negative rates (cut phases)
- Determines sustainable rates from median performance
- Measures rate consistency (standard deviation)

**Suggestions Generated:**

| Type | Duration | Rate Basis |
|------|----------|------------|
| Moderate Cut | 12 weeks | Sustainable loss rate |
| Aggressive Cut | 8 weeks | 1.5× sustainable rate |
| Lean Bulk | 16 weeks | Sustainable gain rate |
| Maintenance | 4 weeks | 0 kg/week |
| Continue Trend | 8 weeks | Current rate |

---

## Event Tracking

### Event Countdown

**File:** `eventCountdownRenderer.js`  
**Storage:** `localStorage` (key: `weight-insider-events`)

**Event Structure:**
```javascript
{
  id: number,           // Timestamp-based ID
  name: string,         // Event name
  date: Date,           // Event date
  targetWeight: number, // Optional target weight
  category: string      // competition|photoshoot|vacation|wedding|other
}
```

**Category Icons:**
| Category | Icon |
|----------|------|
| competition | 🏆 |
| photoshoot | 📸 |
| vacation | 🏖️ |
| wedding | 💍 |
| other | 📅 |

**Urgency Classes:**
| Days Remaining | CSS Class | Visual |
|----------------|-----------|--------|
| ≤ 7 | `.urgent` | Red highlight |
| ≤ 14 | `.soon` | Yellow highlight |
| ≤ 30 | `.upcoming` | Blue highlight |

**Milestones (automatic):**
| Days | Milestone |
|------|-----------|
| ≤ 1 | Event day! |
| ≤ 7 | Peak week |
| ≤ 14 | Final prep phase |
| ≤ 30 | Training intensification |

---

## State Management

### Action Types (`stateManager.js`)

**New Actions for Features:**

| Action | Payload | Purpose |
|--------|---------|---------|
| `SET_PERIODIZATION_PHASES` | `Phase[]` | Store detected phases |
| `SET_WORKOUT_CORRELATION` | `CorrelationResult` | Store correlation data |

### Selectors (`selectors.js`)

| Selector | Returns |
|----------|---------|
| `selectPeriodizationPhases` | `Phase[]` |
| `selectWorkoutCorrelation` | `CorrelationResult` |

### State Shape Extensions

```javascript
{
  // ... existing state ...
  periodizationPhases: [],
  workoutCorrelation: {
    coefficient: number | null,
    weeklyData: [],
    interpretation: string,
    totalWeeks: number
  }
}
```

---

## File Structure

### New Renderer Components

```
js/ui/renderers/
├── periodizationRenderer.js    # Phase detection display
├── workoutCorrelationRenderer.js    # Correlation analysis
├── periodComparisonRenderer.js # Period comparison tool
├── goalAlertRenderer.js        # Progress alerts
├── goalSuggestionRenderer.js   # Adaptive suggestions
└── eventCountdownRenderer.js   # Event countdown
```

### Initialization Order (`main.js`)

```javascript
// UI Modules initialization
MasterUpdater.init();
AnnotationListRenderer.init();
StatsDisplayRenderer.init();
PeriodizationRenderer.init();        // NEW
WorkoutCorrelationRenderer.init();   // NEW
PeriodComparisonRenderer.init();     // NEW
GoalAlertRenderer.init();            // NEW
GoalSuggestionRenderer.init();       // NEW
EventCountdownRenderer.init();       // NEW
WeeklySummaryUpdater.init();
LegendManager.init();
InsightsGenerator.init();
```

---

## Configuration

### Thresholds (`config.js`)

```javascript
// Periodization
BULK_RATE_THRESHOLD_KG_WEEK: 0.15,
CUT_RATE_THRESHOLD_KG_WEEK: -0.15,
MIN_PHASE_DURATION_WEEKS: 2,

// Plateau Detection
plateauRateThresholdKgWeek: 0.1,
plateauMinDurationWeeks: 2,

// TDEE Calculation
KCALS_PER_KG: 7700,
```

---

*For user-facing documentation, see [user_guide.md](user_guide.md).*  
*For program flow diagrams, see [program_flow.md](program_flow.md).*
