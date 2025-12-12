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

## Advanced Analytics Features

### Weekend vs Weekday Analysis

**File:** `weekendAnalysisRenderer.js`

**Analysis Method:**
1. Classify each day by `date.getDay()` (0=Sun, 6=Sat)
2. Separate weekday (Mon-Fri) vs weekend (Sat-Sun) buckets
3. Calculate mean and standard deviation for each

**Metrics Calculated:**
| Metric | Formula |
|--------|---------|
| Avg Calories | Sum(calories) / count |
| Avg Daily Change | Mean of day-to-day weight differences |
| Volatility | Standard deviation of daily changes |
| Workout Rate | Days with volume > 0 / total days × 100 |

**Weekend Impact Calculation:**
```javascript
weekendDamage = (calorieDiff * 2) / 7700 * 7  // kg/week impact
```

---

### Prediction Bands

**File:** `predictionBandsRenderer.js`

**Prediction Algorithm:**
```javascript
expectedChange = currentRate × weeks
uncertainty = rateStdDev × sqrt(weeks) × 1.5
expected = currentWeight + expectedChange
optimistic = expected ± uncertainty (depending on rate direction)
```

**Confidence Calculation:**
```javascript
confidence = max(50, 95 - weeks × 3)  // Decreases over time
```

---

### Adaptive Rate Benchmarks

**File:** `adaptiveRateRenderer.js`

**Percentile Calculation:**
```javascript
percentile = (belowCount / totalCount) × 100
```

**Classification Thresholds:**
- Gaining: rate > 0.05 kg/week
- Losing: rate < -0.05 kg/week
- Maintenance: |rate| ≤ 0.05 kg/week

**Benchmark Data:**
- `bulkRates`: All weeks with rate > 0.1
- `cutRates`: All weeks with rate < -0.1
- Average, median, and max for each category

---

### Calorie Accuracy Audit

**File:** `calorieAuditRenderer.js`

**Accuracy Calculation:**
```javascript
expectedChange = -totalDeficit / KCALS_PER_KG
totalDeficit = (TDEE × days) - totalCaloriesLogged
discrepancy = actualChange - expectedChange
dailyDiscrepancy = (discrepancy × KCALS_PER_KG) / days
accuracy = max(0, 100 - |discrepancy / expectedChange| × 100)
```

**Accuracy Thresholds:**
| Score | Classification |
|-------|----------------|
| ≥ 80% | Excellent |
| 60-79% | Good |
| 40-59% | Moderate |
| < 40% | Poor |

---

### Monthly/Quarterly Reports

**File:** `monthlyReportRenderer.js`

**Monthly Stats Structure:**
```javascript
{
  key: "2024-01",
  monthName: "Jan",
  daysLogged: number,
  consistency: (logged / daysInMonth) × 100,
  startWeight: first weight in month,
  endWeight: last weight in month,
  avgCalories: mean(calories),
  avgRate: mean(smoothedWeeklyRate)
}
```

**Quarterly Aggregation:**
- Groups months by quarter (Q1=Jan-Mar, etc.)
- Calculates combined weight change
- Averages consistency across months

---

### What Worked Analysis

**File:** `whatWorkedRenderer.js`

**Pattern Detection:**
1. **Find cut periods**: consecutive days with rate < -0.2
2. **Find bulk periods**: consecutive days with rate > 0.1
3. **Minimum period length**: 14 days

**Insights Generated:**
| Insight | Algorithm |
|---------|-----------|
| Best Cut Calories | Avg calories for period with most negative rate |
| Best Bulk Calories | Avg calories for period with rate 0.1-0.4 |
| Volume Impact | Compare high vs low volume quartile rates |
| Longest Phase | Max duration across detected phases |
| Consistency Impact | Compare 6+ logged days vs <5 logged days |

---

### Plateau Breaker

**File:** `plateauBreakerRenderer.js`

**Plateau Detection:**
```javascript
isInPlateau = avgAbsoluteRate < 0.15 (last 14 days)
```

**Historical Plateau Analysis:**
- Detects periods where |rate| < 0.12 for 14+ days
- Records how plateau ended (calorie change)
- Stores break pattern for suggestions

**Suggestion Priority:**
| Priority | Suggestion Type |
|----------|-----------------|
| High | Based on user history |
| High | Diet break (if > 21 days) |
| Medium | Increase activity |
| Medium | Water retention check |
| Low | Tracking audit |

---

### Rolling Averages

**File:** `rollingAveragesRenderer.js`

**Moving Average Windows:**
| Window | Data Points |
|--------|-------------|
| 7-day | Last 7 weight entries |
| 14-day | Last 14 weight entries |
| 30-day | Last 30 weight entries |

**Trend Calculation:**
```javascript
trend = secondHalfAvg - firstHalfAvg  // For each window
```

**Momentum:**
```javascript
momentum = avg7day - avg30day
```

**Reversal Detection:**
```javascript
bullishReversal = shortTrend > 0.1 && longTrend < -0.1
bearishReversal = shortTrend < -0.1 && longTrend > 0.1
```

---

## File Structure

### All Renderer Components

```
js/ui/renderers/
├── periodizationRenderer.js         # Phase detection
├── workoutCorrelationRenderer.js    # Correlation analysis
├── periodComparisonRenderer.js      # Period comparison
├── goalAlertRenderer.js             # Progress alerts
├── goalSuggestionRenderer.js        # Goal suggestions
├── eventCountdownRenderer.js        # Event countdown
├── weekendAnalysisRenderer.js       # Weekend vs weekday
├── predictionBandsRenderer.js       # Weight predictions
├── adaptiveRateRenderer.js          # Personal benchmarks
├── calorieAuditRenderer.js          # Calorie accuracy
├── monthlyReportRenderer.js         # Monthly reports
├── whatWorkedRenderer.js            # Pattern analysis
├── plateauBreakerRenderer.js        # Plateau detection
└── rollingAveragesRenderer.js       # Rolling averages
```

### Initialization Order (`main.js`)

```javascript
// UI Modules initialization
MasterUpdater.init();
AnnotationListRenderer.init();
StatsDisplayRenderer.init();
PeriodizationRenderer.init();
WorkoutCorrelationRenderer.init();
PeriodComparisonRenderer.init();
GoalAlertRenderer.init();
GoalSuggestionRenderer.init();
EventCountdownRenderer.init();
WeekendAnalysisRenderer.init();      // Advanced
PredictionBandsRenderer.init();      // Advanced
AdaptiveRateRenderer.init();         // Advanced
CalorieAuditRenderer.init();         // Advanced
MonthlyReportRenderer.init();        // Advanced
WhatWorkedRenderer.init();           // Advanced
PlateauBreakerRenderer.init();       // Advanced
RollingAveragesRenderer.init();      // Advanced
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
