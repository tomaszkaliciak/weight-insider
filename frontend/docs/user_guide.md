# Weight Insider User Guide

Welcome to **Weight Insider** -- an advanced weight-tracking and body-composition analysis application that helps you understand your body's response to diet and exercise.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Layout](#dashboard-layout)
3. [Core Features](#core-features)
4. [Nutrition & Macros](#nutrition--macros)
5. [Goal Management](#goal-management)
6. [Analysis Features](#analysis-features)
7. [Energy Analytics](#energy-analytics)
8. [Smart Coaching](#smart-coaching)
9. [Tracking & Consistency](#tracking--consistency)
10. [Data Management](#data-management)
11. [Themes](#themes)
12. [Tips for Best Results](#tips-for-best-results)
13. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Running the Application

```bash
cd frontend
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

For a production build:

```bash
npm run build        # outputs to dist/
npm run preview      # preview the build locally
```

### Offline / PWA Support

Weight Insider installs as a Progressive Web App. Once loaded, static assets are cached so the app loads instantly on repeat visits -- even offline. If you go offline, a toast appears and the last-cached `data.json` is used.

---

## Dashboard Layout

The interface uses a **bento-grid** dashboard. Every feature lives inside its own collapsible widget card. The layout is designed to put the most critical information at the top and group related analytics together.

### Widget Collapse / Expand

Click the **collapse button** (top-right of any widget header) to shrink it to a single row. The collapsed state is saved to `localStorage` so it persists across sessions.

### Mobile Navigation

On small screens, a **floating action button** (FAB) appears in the bottom-right corner. Tap it to open a jump-to panel listing all widgets for quick navigation.

---

## Core Features

### Weight Chart

The main chart displays your weight data over time with multiple overlays:

| Element | Description |
|---------|-------------|
| **Raw Data Points** | Individual weight measurements (dots) |
| **SMA Line** | Simple Moving Average -- smooths daily fluctuations |
| **EMA Line** | Exponential Moving Average -- more responsive to recent changes |
| **SMA Band** | Standard deviation range around the SMA |
| **Regression Line** | Linear trend with confidence interval |
| **Manual Trendlines** | Two user-defined rate overlays |

**Interacting with the chart:**
- **Hover** over dots to see detailed information
- **Click** a dot to pin its tooltip
- **Drag** to zoom into a specific date range
- **Use mouse wheel** to zoom in/out
- Click the **background** to reset selections

### Analysis Range

Set custom date ranges to focus your analysis:

- **Quick presets:** 7D, 30D, 90D, All
- **Custom:** Enter Start Date and End Date, then click Apply Range
- All statistics recalculate for the selected period

The context brush below the main chart provides a quick visual selection method.

### Trendlines

Configure up to two manual trendlines by setting a start date, initial weight, and weekly rate. These overlay the chart so you can visualise "what if" scenarios or compare against your actual trajectory.

### Annotations

Add notes to mark important events:

1. Enter a date and note text
2. Click **Add Annotation**
3. Annotations appear as markers on the chart
4. Click annotations in the list to jump to that date

---

## Nutrition & Macros

### Macro Breakdown

The **Macro Summary** widget shows your latest-day macronutrient intake:

| Metric | Display |
|--------|---------|
| Protein | grams + % of calories, progress bar |
| Carbs | grams + % of calories, progress bar |
| Fat | grams + % of calories, progress bar |
| Fiber | grams, progress bar |

Below the bars, a **7-day average calorie split** (P/C/F percentages) is shown.

### Protein Adequacy

The dedicated **Protein Adequacy** widget tracks protein relative to bodyweight:

- Large **g/kg** readout colour-coded as Optimal (green), Sufficient (amber), or Low (red)
- Threshold-marker progress bar (target: 1.6 g/kg)
- 14-day sparkline showing g/kg trends over time

### Macro Rolling Averages

The **Rolling Averages** widget includes a macro section showing 7-day and 14-day averages for protein, carbs, fat, and fiber with delta indicators.

---

## Goal Management

### Setting Goals

The **Goal Progress** widget contains an inline form:

1. Enter **Target Weight** (kg)
2. Enter **Target Date**
3. Optionally set **Target Rate** (kg/week)
4. Click **Set Goal**

A goal line appears on the main chart and all goal-related widgets activate.

### Goal Simulator

The **Goal Simulator** widget projects your path to the goal using current trends, displayed as a chart with confidence bands. It shows estimated arrival date and required calorie adjustments.

### Goal Alerts

The Goal Alerts panel monitors progress and shows contextual notifications:

| Alert Type | When it Appears |
|------------|-----------------|
| Goal Achieved | Within 0.3 kg of target |
| On Track | Current trajectory will reach goal |
| Off Track | Current rate won't reach goal in time |
| Wrong Direction | Gaining when you need to lose (or vice versa) |
| Deadline Approaching | Less than 2 weeks remaining |
| Milestone | 25%, 50%, 75%, or 90% progress reached |

### Goal Suggestions

Analyzes your historical data and recommends realistic goals:

| Suggestion Type | Description |
|-----------------|-------------|
| Moderate Cut | Sustainable 12-week weight loss based on your history |
| Aggressive Cut | Faster 8-week cut requiring more discipline |
| Lean Bulk | Slow 16-week muscle building phase |
| Maintenance | 4-week weight stable phase |
| Continue Trend | Follow your current trajectory |

Click **Apply Goal** on any suggestion card to set it immediately.

---

## Analysis Features

### Periodization Analysis

Automatically detects and classifies your training phases:

| Phase | Rate | Meaning |
|-------|------|---------|
| Bulk | > +0.15 kg/week | Weight gaining phase |
| Cut | < -0.15 kg/week | Weight loss phase |
| Maintenance | -0.15 to +0.15 kg/week | Weight stable |

### Period Comparison

Compare any two time periods side-by-side.

**Quick Compare Options:**

| Button | Comparison |
|--------|------------|
| Last 2 Weeks | This week vs previous week |
| Last 2 Months | This month vs previous month |
| Last 2 Phases | Compare your last two detected phases |

**Metrics Compared:** Duration, total weight change, average rate, average calories, average training volume.

### Rolling Averages

Displays 7-day, 14-day, and 30-day rolling averages for trend comparison:

| Average | Purpose |
|---------|---------|
| 7-Day | Short-term trend, responsive |
| 14-Day | Medium-term, balances noise |
| 30-Day | Long-term trend, stable |

Also shows momentum indicators and reversal detection when the short-term trend crosses the long-term.

### Weekend vs Weekday Analysis

Compares your eating and training patterns between weekdays and weekends, showing average calories, daily weight change, volatility, and a weekend calorie buffer suggestion.

### Weight Predictions

Projects your future weight based on current trends with confidence intervals for 4, 8, and 12 week horizons.

### Adaptive Benchmarks

Compares your current rate to your **personal** history -- not generic standards. Shows percentile ranking and personal records.

### Calorie Accuracy Audit

Compares expected weight change (from logged calories) vs actual change to identify logging accuracy issues. Score ranges from Excellent (80-100%) to Poor (<40%).

### Monthly / Quarterly Reports

Periodic summaries showing start/end weight, average calories, consistency score, and weight range per month. Quarterly view aggregates three months. Best month is highlighted.

### Correlation Matrix

Multi-variable correlation heatmap showing relationships between calories, macros, volatility, and weight outcomes. Green = positive correlation, red = negative, grey = none.

### Scatter Plot

Paired with the correlation matrix, provides a visual two-variable scatter plot for deeper investigation of any relationship.

---

## Energy Analytics

### Energy Balance

Daily bar chart showing calorie deficit or surplus with goal-aware colouring:

- **Cutting:** green = deficit (on-track), red = surplus (off-track)
- **Bulking:** green = surplus (on-track), red = deficit (off-track)

### Energy Flow (Sankey)

A Sankey diagram visualising the flow from calorie intake through TDEE to deficit/surplus and ultimately to weight change.

### TDEE Accuracy Dashboard

Compares different TDEE estimation methods:

| Method | Source |
|--------|--------|
| Trend-Based | Calculated from intake vs weight change |
| Adaptive | 28-day rolling calculation |
| Google Fit | Device-based estimation |

### TDEE vs Intake

Reconciliation chart showing daily TDEE and calorie intake overlaid to visualise gaps.

---

## Smart Coaching

### Smart Coach

Provides personalised coaching tips based on your current phase (cut, bulk, or maintenance). Tip categories include consistency, progress, obstacles, and goal pacing.

### Plateau Breaker

Detects weight plateaus (stagnant rate for 14+ days) and suggests strategies prioritised by your own history:

1. What broke past plateaus for you
2. Diet break (if > 21 days)
3. Increase activity
4. Water retention check
5. Tracking audit

### What Worked

Analyses your most successful periods to identify winning patterns -- best cut/bulk calories, volume impact, longest sustainable phases, and consistency impact.

### Rate Optimizer

Finds your personal optimal gain/loss rates based on historical adherence and sustainability data.

---

## Tracking & Consistency

### Streak Tracker

Gamifies consistency by tracking logging, deficit/surplus, and combined streaks.

### Calorie Heatmap

Calendar-style heatmap showing daily calorie intake patterns. Light = deficit, medium = maintenance, dark = surplus.

### Water Weight Predictor

Estimates water retention based on carb and sodium intake, explaining sudden scale jumps.

### Reverse Dieting Calculator

Plans gradual calorie increases after a cut:

| Phase | Duration | Weekly Increase |
|-------|----------|-----------------|
| Aggressive | 4 weeks | +200 kcal/week |
| Moderate | 8 weeks | +100 kcal/week |
| Conservative | 12 weeks | +50 kcal/week |

### Event Countdown

Track upcoming competitions, photoshoots, or special occasions with countdown timers, progress bars, and milestone alerts (Peak Week, Final Prep).

### Executive Hub

Top-of-page KPI dashboard showing current weight (raw and SMA), weekly rate, estimated TDEE, and time-to-goal for quick morning check-ins.

---

## Data Management

### Quick Entry

Log weight and calorie data directly from the dashboard without editing `data.json`:

1. Open the **Quick Entry** widget
2. Enter date, weight, and/or calories
3. Click **Save**

Entries are stored in `localStorage` and automatically merged with `data.json` at runtime.

### CSV Export

Open the **Data Table** (via the table icon) and click **Export CSV** to download the full processed dataset.

### Data Table

The data table modal shows up to 200 rows of your processed data with all computed fields (SMA, EMA, rate, TDEE, macros). Columns are sortable.

---

## Themes

Weight Insider ships three themes, cycled via the toggle button in the header:

| Theme | Description |
|-------|-------------|
| **Light** | Clean white background, blue accents |
| **Dark** | Deep slate background, teal accents |
| **Gruvbox** | Warm charcoal background, orange and amber accents |

Your preference is saved in `localStorage`.

---

## Tips for Best Results

### Weighing Consistency

For accurate trend analysis:
- Weigh at the **same time** each day (morning after bathroom, before eating)
- Use the **same scale** on a hard, flat surface
- Weigh **daily** for best SMA/EMA smoothing, or at minimum 3x per week

### Understanding Data Noise

Daily weight fluctuates due to water retention, sodium intake, carbohydrate intake, bowel movements, and hormonal cycles. **Don't panic over single-day changes.** Focus on the SMA line for true trends.

### Setting Realistic Goals

| Goal Type | Recommended Rate |
|-----------|------------------|
| Fat Loss | -0.5 to -1.0 kg/week |
| Lean Bulk | +0.1 to +0.25 kg/week |
| Aggressive Cut | -0.75 to -1.0 kg/week |
| Competition Prep | Consult a coach |

### Macro Targets

| Macro | Guideline |
|-------|-----------|
| Protein | 1.6-2.2 g/kg bodyweight for muscle retention |
| Fat | Minimum ~0.7 g/kg for hormonal health |
| Carbs | Fill remaining calories after protein and fat targets |
| Fiber | 25-35 g/day for satiety and gut health |

---

## Data Format

Your data is stored in `data.json` with the following structure:

```jsonc
{
  "weights":              { "2024-01-15": 72.5 },
  "calorieIntake":        { "2024-01-15": 2500 },
  "googleFitExpenditure": { "2024-01-15": 2800 },
  "bodyFat":              { "2024-01-15": 15.5 },
  "macroProtein":         { "2024-01-15": 150.0 },
  "macroCarbs":           { "2024-01-15": 250.0 },
  "macroFat":             { "2024-01-15": 80.0 },
  "macroFiber":           { "2024-01-15": 30.0 }
}
```

Legacy keys (`protein`, `carbs`, `fat`, `fiber`) are also accepted for backward compatibility.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Chart not loading | Check browser console for errors; ensure `data.json` is valid JSON |
| CORS error | Use `npm run dev` (Vite dev server); don't open the HTML file directly |
| Stats showing N/A | Ensure enough data points exist in the selected range (min 7-14 days) |
| Goal line missing | Verify goal date is within the visible chart range |
| Macro widgets empty | Need macro fields in `data.json` (macroProtein, macroCarbs, etc.) |
| Correlation matrix cells grey | Insufficient data pairs for that correlation (need 14+ overlapping days) |
| Widgets stuck "loading" | Scroll down to trigger lazy initialization, or refresh the page |
| Offline toast appears | Your network is unavailable; cached data is being shown |
| Theme not saving | Check that localStorage is not disabled in your browser |

---

*For technical documentation on program flow and architecture, see [program_flow.md](program_flow.md).*
*For developer feature reference, see [features_reference.md](features_reference.md).*
