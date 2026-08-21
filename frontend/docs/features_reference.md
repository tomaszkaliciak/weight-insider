# Features Reference

This document provides technical details about all features in Weight Insider.

---

## Table of Contents

1. [Core Chart Features](#core-chart-features)
2. [Data Processing](#data-processing)
3. [State Management](#state-management)
4. [Analysis Features](#analysis-features)
5. [Nutrition & Macros](#nutrition--macros)
6. [Goal Management](#goal-management)
7. [Energy Analytics](#energy-analytics)
8. [Smart Coaching](#smart-coaching)
9. [Tracking & Consistency](#tracking--consistency)
10. [Infrastructure](#infrastructure)
11. [Configuration](#configuration)
12. [File Structure](#file-structure)

---

## Core Chart Features

### Weight Visualization

| Feature | File | Description |
|---------|------|-------------|
| Raw Data Points | `chartUpdaters.js` | Scatter plot of daily weights |
| SMA Line | `dataService.js` | 7-day Simple Moving Average |
| EMA Line | `dataService.js` | Exponential Moving Average (alpha=0.3) |
| Confidence Band | `chartUpdaters.js` | +/-1 std dev around SMA |
| Regression Line | `statsManager.js` | Linear regression with 95% CI |
| Manual Trendlines | `chartUpdaters.js` | Two user-configurable rate overlays |
| Goal Line | `chartUpdaters.js` | Target weight projection |

### Interaction Components

| Component | File | Purpose |
|-----------|------|---------|
| Context Brush | `chartSetup.js` | Quick date range selection |
| Regression Brush | `chartSetup.js` | Custom regression range |
| Zoom Behaviour | `chartSetup.js` | D3 zoom/pan |
| Tooltip System | `tooltipManager.js` | Hover/pin data display |
| Chart Controls | `chartControls.js` | Fullscreen toggle, chart options |

---

## Data Processing

### Pipeline (`dataService.js`)

```
Raw Data (data.json)
    |
    v
ManualEntryService.mergeInto() - Overlay localStorage entries
    |
    v
mergeRawData() - Combine all data sources (incl. macros)
    |
    v
calculateBodyComposition() - LBM/FM from body fat %
    |
    v
calculateSMAAndStdDev() - 7-day moving average + bounds
    |
    v
calculateEMA() - Exponential moving average
    |
    v
identifyOutliers() - Flag statistical outliers
    |
    v
calculateRollingVolatility() - Fluctuation measure
    |
    v
calculateDailyRatesAndTDEETrend() - Rate of change
    |
    v
calculateAdaptiveTDEE() - Dynamic TDEE estimation
    |
    v
smoothRatesAndTDEEDifference() - Noise reduction
    |
    v
calculateRateMovingAverage() - Weekly rate smoothing
    |
    v
Processed Data
```

### Data Sources

| Key in data.json | Type | Description |
|------------------|------|-------------|
| `weights` / `bodyWeight` | `{date: kg}` | Body weight measurements |
| `calorieIntake` | `{date: kcal}` | Daily calorie intake |
| `googleFitExpenditure` | `{date: kcal}` | Google Fit / Health Connect TDEE |
| `bodyFat` | `{date: %}` | Body fat percentage |
| `macroProtein` / `protein` | `{date: g}` | Protein intake |
| `macroCarbs` / `carbs` | `{date: g}` | Carbohydrate intake |
| `macroFat` / `fat` | `{date: g}` | Fat intake |
| `macroFiber` / `fiber` | `{date: g}` | Dietary fiber intake |
| `workouts` | `{date: object}` | Training data |

### Merged Data Point Structure

Each processed data point contains:

```javascript
{
  date: Date,
  value: number,           // raw weight (kg)
  calorieIntake: number,
  googleFitTDEE: number,
  bodyFatPercent: number,
  protein: number,         // grams
  carbs: number,           // grams
  fat: number,             // grams
  fiber: number,           // grams
  sma: number,             // 7-day SMA
  ema: number,             // EMA
  upperBound: number,      // SMA + 1 std dev
  lowerBound: number,      // SMA - 1 std dev
  isOutlier: boolean,
  rollingVolatility: number,
  dailyRate: number,       // kg/day
  smoothedWeeklyRate: number,
  adaptiveTDEE: number,
  trendTDEE: number,
  // ... additional computed fields
}
```

---

## State Management

### Architecture

`stateManager.js` implements a Redux-style state bus:

- **Shallow-clone reducer** for performance (no deep cloning)
- **Typed event subscriptions** via `subscribeToSpecificEvent(eventName, callback)` -- all renderers use this instead of generic `subscribe()`
- **Action-to-event mapping** converts dispatched action types to semantic events (e.g. `SET_FILTERED_DATA` -> `state:filteredDataChanged`)

### Action Types

| Action | Payload | Purpose |
|--------|---------|---------|
| `INITIALIZE_START` | -- | Mark init started |
| `SET_INITIAL_DATA` | `{rawData, processedData}` | Store fetched + processed data |
| `SET_PROCESSED_DATA` | `DataPoint[]` | Update processed data |
| `SET_FILTERED_DATA` | `DataPoint[]` | Update range-filtered data |
| `SET_WEEKLY_SUMMARY` | `WeekSummary[]` | Weekly aggregated data |
| `SET_CORRELATION_DATA` | `CorrelationPoint[]` | Scatter plot pairs |
| `SET_REGRESSION_RESULT` | `{slope, intercept, points}` | Regression output |
| `LOAD_GOAL` / `SET_GOAL` | `{weight, date, targetRate}` | Goal state |
| `LOAD_ANNOTATIONS` / `ADD_ANNOTATION` / `DELETE_ANNOTATION` | Annotation data | Annotation CRUD |
| `SET_ANALYSIS_RANGE` | `{start, end}` | Date range filter |
| `SET_INTERACTIVE_REGRESSION_RANGE` | `{start, end}` | Regression brush range |
| `SET_THEME` | `string` | Current theme name |
| `TOGGLE_SERIES_VISIBILITY` | `{seriesId, isVisible}` | Legend toggle |
| `UPDATE_TREND_CONFIG` | `{startDate, initialWeight, weeklyIncrease1, weeklyIncrease2}` | Manual trendlines |
| `SET_DISPLAY_STATS` | `object` | All derived statistics |
| `SET_PERIODIZATION_PHASES` | `Phase[]` | Detected phases |
| `SET_WORKOUT_CORRELATION` | `CorrelationResult` | Workout correlation |
| `INITIALIZATION_COMPLETE` | -- | Triggers initial renders |

### Key Events

| Event | Triggered By |
|-------|-------------|
| `state:filteredDataChanged` | `SET_FILTERED_DATA` |
| `state:initializationComplete` | `INITIALIZATION_COMPLETE` |
| `state:goalChanged` | `LOAD_GOAL`, `SET_GOAL` |
| `state:displayStatsUpdated` | `SET_DISPLAY_STATS` |
| `state:periodizationPhasesChanged` | `SET_PERIODIZATION_PHASES` |

### Initial State Shape

```javascript
{
  isInitialized: false,
  rawData: [],
  processedData: [],
  filteredData: [],
  goal: { weight: null, date: null, targetRate: null },
  annotations: [],
  analysisRange: { start: null, end: null },
  currentTheme: "light",
  seriesVisibility: { raw, smaLine, emaLine, smaBand, regression, trend1, trend2, goal, annotations, plateaus, trendChanges, rateMA },
  trendConfig: { startDate, initialWeight, weeklyIncrease1, weeklyIncrease2, isValid },
  displayStats: {},
  periodizationPhases: [],
  workoutCorrelation: { coefficient, weeklyData, interpretation, totalWeeks },
  // ... UI transient state (hover, tooltip, zoom, etc.)
}
```

---

## Analysis Features

### Periodization Analysis

**File:** `periodizationRenderer.js`
**Algorithm:** `dataService.detectPeriodizationPhases()`

| Phase | Rate Threshold |
|-------|-----------------|
| Bulk | > +0.15 kg/week |
| Cut | < -0.15 kg/week |
| Maintenance | -0.15 to +0.15 |

Minimum phase duration: 2 weeks.

### Workout Correlation

**File:** `workoutCorrelationRenderer.js`

Groups data by week, sums training volume, computes Pearson correlation coefficient against weekly rate.

| |r| Range | Interpretation |
|-----------|----------------|
| >= 0.7 | Strong correlation |
| 0.4-0.69 | Moderate correlation |
| 0.2-0.39 | Weak correlation |
| < 0.2 | No significant correlation |

### Period Comparison

**File:** `periodComparisonRenderer.js`

Quick-compare modes: Last 2 Weeks, Last 2 Months, Last 2 Phases. Entirely local computation from existing processed data.

### Rolling Averages

**File:** `rollingAveragesRenderer.js`

Windows: 7-day, 14-day, 30-day. Includes momentum indicator (7d vs 30d), reversal detection, and **macro rolling averages** (7-day and 14-day for protein, carbs, fat, fiber with delta indicators).

### Weekend vs Weekday Analysis

**File:** `weekendAnalysisRenderer.js`

Metrics: avg calories, avg daily change, volatility, workout rate. Calculates weekend impact as `(calorieDiff * 2) / 7700 * 7` kg/week.

### Prediction Bands

**File:** `predictionBandsRenderer.js`

```
expectedChange = currentRate * weeks
uncertainty = rateStdDev * sqrt(weeks) * 1.5
confidence = max(50, 95 - weeks * 3)
```

### Adaptive Rate Benchmarks

**File:** `adaptiveRateRenderer.js`

Percentile ranking against personal history. Classification: gaining (> 0.05), losing (< -0.05), maintenance.

### Calorie Accuracy Audit

**File:** `calorieAuditRenderer.js`

```
expectedChange = -totalDeficit / KCALS_PER_KG
accuracy = max(0, 100 - |discrepancy / expectedChange| * 100)
```

### Monthly / Quarterly Reports

**File:** `monthlyReportRenderer.js`

Monthly stats: days logged, consistency %, start/end weight, avg calories, avg rate. Quarterly aggregation. Best-month highlighting.

### Correlation Matrix

**File:** `correlationMatrixRenderer.js`

Uses `simple-statistics.sampleCorrelation()` for every pair of: Calories, Protein %, Carbs %, Fat %, Volatility, Weight Change, TDEE, Rate. Green/red/grey colour coding.

---

## Nutrition & Macros

### Macro Summary

**File:** `macroSummaryRenderer.js`

Displays latest-day macro breakdown (P/C/F/Fiber) as progress bars with gram counts and calorie percentages. Below the bars: 7-day average calorie split.

**Lazy loaded** via `IntersectionObserver` with catch-up render on late init.

### Protein Adequacy

**File:** `proteinAdequacyRenderer.js`

Prominent g/kg readout colour-coded against thresholds:
- >= 1.6 g/kg: Optimal (green)
- >= 1.2 g/kg: Sufficient (amber)
- < 1.2 g/kg: Low (red)

Includes threshold-marker progress bar and 14-day sparkline.

**Lazy loaded** via `IntersectionObserver` with catch-up render on late init.

### Stats Integration

`statsManager.js` computes macro-derived metrics during its calculation cycle:
- `avgDailyProtein`, `latestProtein`, `avgProteinPerKg`
- `avgDailyCarbs`, `avgDailyFat`, `avgDailyFiber`
- `latestCarbs`, `latestFat`, `latestFiber`

---

## Goal Management

### Goal State

**State Path:** `state.goal`

```javascript
{
  weight: number | null,
  date: Date | null,
  targetRate: number | null
}
```

### Goal Setting Form

**Location:** Inline `<form>` inside the Goal Progress widget in `index.html`.
**Handler:** `EventHandlers.handleGoalSubmit()` dispatches `LOAD_GOAL` and saves via `GoalManager`.

### Goal Simulator

**File:** `goalSimulatorRenderer.js`

Projects weight path to goal with confidence bands. Shows estimated arrival date and required calorie adjustment.

### Goal Alerts

**File:** `goalAlertRenderer.js`

Alert types: error (wrong direction), warning (off track / deadline passed), success (milestone / on track), info (deadline approaching). Milestone thresholds: 25%, 50%, 75%, 90%.

### Goal Suggestions

**File:** `goalSuggestionRenderer.js`

Generates cut/bulk/maintenance/continue-trend suggestions from historical rate analysis. "Apply Goal" button dispatches directly to state.

---

## Energy Analytics

### Energy Balance

**File:** `energyBalanceRenderer.js`

Goal-aware bar chart: dynamically assigns green/red colours based on whether the user is cutting or bulking. Uses `_getGoalAwareColors(goal)`.

**Lazy loaded** via `IntersectionObserver`.

### Energy Flow (Sankey)

**File:** `energySankeyRenderer.js`

D3-sankey diagram: Intake -> TDEE -> Deficit/Surplus -> Weight Change.

**Lazy loaded** via `IntersectionObserver`.

### TDEE Accuracy Dashboard

**File:** `tdeeAccuracyRenderer.js`

Compares Trend TDEE, Adaptive TDEE, and Google Fit TDEE. Accuracy = `100 - |Expected - Actual| / Actual * 100`.

### Metabolic Adaptation

**File:** `metabolicAdaptationRenderer.js`

Tracks how TDEE adapts over time relative to intake changes.

---

## Smart Coaching

### Smart Coach

**File:** `smartCoachRenderer.js`

Phase-aware recommendations. Tip categories: consistency, progress, obstacles, goals.

### Plateau Breaker

**File:** `plateauBreakerRenderer.js`

Detection: `avgAbsoluteRate < 0.15` for 14+ days. Historical plateau analysis and prioritised suggestions.

### What Worked

**File:** `whatWorkedRenderer.js`

Pattern detection: best cut/bulk calories, volume impact, longest phases, consistency impact.

### Rate Optimizer

**File:** `rateOptimizerRenderer.js`

Best performing rate ranges, rate vs adherence correlation, sustainability scoring.

---

## Tracking & Consistency

### Streak Tracker

**File:** `streakTrackerRenderer.js`

Streak types: logging, goal, combined. Persists visually (not to state).

### Calorie Heatmap

**File:** `calorieHeatmapRenderer.js`

Calendar-style D3 heatmap. **Lazy loaded** via `IntersectionObserver`.

### Water Weight Predictor

**File:** `waterWeightRenderer.js`

`waterWeight = (carbIntake - avgCarbIntake) * 3 / 1000`

### Reverse Dieting Calculator

**File:** `reverseDietRenderer.js`

Three phases: aggressive (4wk/+200), moderate (8wk/+100), conservative (12wk/+50).

### Event Countdown

**File:** `eventCountdownRenderer.js`
**Storage:** `localStorage` (key: `weight-insider-events`)

Categories: competition, photoshoot, vacation, wedding, other. Urgency indicators at 7, 14, 30 days. Milestone alerts (peak week, final prep).

### Executive Hub

**File:** `executiveHubRenderer.js`

KPIs: current weight/SMA, weekly rate, estimated TDEE, days to goal, consistency %.

### Vital Stats Enricher

**File:** `vitalStatsEnricher.js`

Augments the stats display with additional contextual data (e.g. BMI, weekly calorie average).

---

## Infrastructure

### Widget Collapser

**File:** `widgetCollapser.js`

Injects collapse/expand buttons into all `.bento-widget` headers. Collapsed state keyed by widget ID in `localStorage`.

### Mobile Navigation

**File:** `mobileNav.js`

Floating action button (bottom-right) with jump-to panel listing all widgets. Hidden on desktop viewports.

### Manual Entry Service

**File:** `manualEntryService.js`

CRUD for manual entries in `localStorage`. `mergeInto(rawData)` overlays entries onto fetched data before processing.

### Manual Entry Widget

**File:** `manualEntryWidget.js`

UI form for date, weight, and calorie input. Calls `ManualEntryService` on submit.

### Data Table Modal

**File:** `dataTableModal.js`

Modal with sortable 200-row table and CSV export button. Corrected field references: `d.value` (weight), `d.calorieIntake`, `d.adaptiveTDEE` / `d.googleFitTDEE`.

### Lazy Initialization

**File:** `main.js` (`lazyInit()`)

Uses `IntersectionObserver` with 300px root margin. Deferred renderers include a catch-up render block that checks `StateManager.getState().isInitialized` and renders immediately if the app already finished initializing.

### PWA / Service Worker

**File:** `public/sw.js`

Cache-first for static assets (HTML, JS, CSS, fonts). Network-first for `data.json`. Posts `DATA_UPDATED` and `SERVING_CACHED_DATA` messages to clients.

### Theme Manager

**File:** `themeManager.js`

Three-way cycle: light -> dark -> gruvbox -> light. Applies CSS classes `dark-theme` / `gruvbox-theme` to `<body>`. Icon updates to show the *next* theme. Persisted in `localStorage`.

---

## Configuration

### Thresholds (`config.js`)

```javascript
BULK_RATE_THRESHOLD_KG_WEEK: 0.15,
CUT_RATE_THRESHOLD_KG_WEEK: -0.15,
MIN_PHASE_DURATION_WEEKS: 2,

plateauRateThresholdKgWeek: 0.07,
plateauMinDurationWeeks: 3,

KCALS_PER_KG: 7700,
adaptiveTDEEWindow: 28,

MIN_WEEKS_FOR_CORRELATION: 4,

MIN_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.1,
MAX_RECOMMENDED_GAIN_RATE_KG_WEEK: 0.35,
```

---

## File Structure

### All Renderer Components (35 files)

```
js/ui/renderers/
├── statsDisplayRenderer.js          # Core stats display
├── annotationListRenderer.js        # Annotation list management
├── periodizationRenderer.js         # Phase detection
├── periodComparisonRenderer.js      # Period comparison
├── goalAlertRenderer.js             # Progress alerts
├── goalSuggestionRenderer.js        # Goal suggestions
├── goalSimulatorRenderer.js         # Goal projection chart
├── eventCountdownRenderer.js        # Event countdown
├── weekendAnalysisRenderer.js       # Weekend vs weekday
├── predictionBandsRenderer.js       # Weight predictions
├── adaptiveRateRenderer.js          # Personal benchmarks
├── calorieAuditRenderer.js          # Calorie accuracy
├── monthlyReportRenderer.js         # Monthly reports
├── whatWorkedRenderer.js            # Pattern analysis
├── plateauBreakerRenderer.js        # Plateau detection
├── rollingAveragesRenderer.js       # Rolling averages + macro averages
├── tdeeAccuracyRenderer.js          # TDEE accuracy dashboard
├── calorieHeatmapRenderer.js        # Calendar heatmap
├── streakTrackerRenderer.js         # Streak tracking
├── waterWeightRenderer.js           # Water weight prediction
├── reverseDietRenderer.js           # Reverse diet calculator
├── rateOptimizerRenderer.js         # Rate optimization
├── smartCoachRenderer.js            # Coaching tips
├── weeklyReviewRenderer.js          # Weekly summaries
├── executiveHubRenderer.js          # KPI dashboard
├── macroCorrelationRenderer.js      # Macro analysis
├── correlationMatrixRenderer.js     # Multi-variable heatmap
├── energyBalanceRenderer.js         # Deficit/surplus visual
├── energySankeyRenderer.js          # Energy flow Sankey diagram
├── macroSummaryRenderer.js          # Macro breakdown widget
├── proteinAdequacyRenderer.js       # Protein g/kg tracker
├── metabolicAdaptationRenderer.js   # Metabolic adaptation
├── vitalStatsEnricher.js            # Stats enrichment
├── quickStatsRenderer.js            # Quick stats widget
└── sparklineRenderer.js             # Mini charts
```

### Initialization Order (`main.js`)

```
Immediate (critical / above-fold / non-bento):
  MasterUpdater, ExecutiveHubRenderer, AnnotationListRenderer,
  StatsDisplayRenderer, GoalAlertRenderer, VitalStatsEnricher,
  GoalSuggestionRenderer, SmartCoachRenderer, TdeeAccuracyRenderer,
  WeeklySummaryUpdater, LegendManager, InsightsGenerator,
  ProgressRing, QuickStatsRenderer, KeyboardNav, SparklineRenderer,
  DataTableModal

Immediate (sidebar / always-init):
  MacroCorrelationRenderer, PeriodizationRenderer, PeriodComparisonRenderer,
  EventCountdownRenderer, WeekendAnalysisRenderer, PredictionBandsRenderer,
  AdaptiveRateRenderer, CalorieAuditRenderer, MonthlyReportRenderer,
  WhatWorkedRenderer, PlateauBreakerRenderer, RollingAveragesRenderer,
  StreakTrackerRenderer, WaterWeightRenderer, ReverseDietRenderer,
  RateOptimizerRenderer, MetabolicAdaptationRenderer, GoalSimulatorRenderer

Lazy (IntersectionObserver):
  EnergyBalanceRenderer, EnergySankeyRenderer, MacroSummaryRenderer,
  ProteinAdequacyRenderer, WeeklyReviewRenderer, CalorieHeatmapRenderer,
  CorrelationMatrixRenderer
```

---

*For user-facing documentation, see [user_guide.md](user_guide.md).*
*For program flow diagrams, see [program_flow.md](program_flow.md).*
