# Weight Insider User Guide

Welcome to **Weight Insider** - an advanced weight tracking and analysis application that helps you understand your body's response to diet and exercise.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Features](#core-features)
3. [Analysis Features](#analysis-features)
4. [Goal Management](#goal-management)
5. [Event & Competition Tracking](#event--competition-tracking)
6. [Advanced Analytics](#advanced-analytics)
7. [Tips for Best Results](#tips-for-best-results)

---

## Getting Started

### Running the Application

1. Navigate to the `frontend` folder
2. Start a local server:
   ```bash
   npx live-server --port=8080
   ```
3. Open `http://localhost:8080` in your browser

### Understanding the Interface

The application is divided into three main areas:

| Area | Description |
|------|-------------|
| **Left Sidebar** | Analysis panels, settings, and results |
| **Main Chart** | Interactive weight visualization with trends |
| **Right Panel** | Weekly summary and annotations |

---

## Core Features

### 📊 Weight Chart

The main chart displays your weight data over time with multiple overlays:

| Element | Description |
|---------|-------------|
| **Raw Data Points** | Individual weight measurements (dots) |
| **SMA Line** | Simple Moving Average - smooths daily fluctuations |
| **EMA Line** | Exponential Moving Average - more responsive to recent changes |
| **SMA Band** | Standard deviation range around the SMA |
| **Regression Line** | Linear trend with confidence interval |

**Interacting with the chart:**
- **Hover** over dots to see detailed information
- **Click** a dot to pin its tooltip
- **Drag** to zoom into a specific date range
- **Use mouse wheel** to zoom in/out
- Click **background** to reset selections

### 📈 Analysis Range

Set custom date ranges to focus your analysis:

1. Enter **Start Date** and **End Date** (DD-MM-YYYY format)
2. Click **Apply Range**
3. All statistics will recalculate for this period

**Quick Actions:**
- Use the context brush below the main chart for quick selection
- The chart automatically syncs with your range

### 📝 Annotations

Add notes to mark important events:

1. Enter a **date** and **note text**
2. Click **Add Annotation**
3. Annotations appear as markers on the chart
4. Click annotations in the list to jump to that date

---

## Analysis Features

### 🔄 Periodization Analysis

**What it does:** Automatically detects and classifies your training phases.

**How it works:**
- Analyzes your smoothed weekly weight change rate
- Classifies periods into three categories:

| Phase | Rate | Meaning |
|-------|------|---------|
| 🟢 **Bulk** | > +0.15 kg/week | Weight gaining phase |
| 🔴 **Cut** | < -0.15 kg/week | Weight loss phase |
| ⚪ **Maintenance** | -0.15 to +0.15 kg/week | Weight stable |

**How to use:**
- Open the **Periodization Analysis** panel in the sidebar
- Review detected phases with duration, weight change, and average calories
- Use this to verify your phase timing and effectiveness

---

### ⚖️ Period Comparison

**What it does:** Compare any two time periods side-by-side.

**Quick Compare Options:**
| Button | Comparison |
|--------|------------|
| **Last 2 Weeks** | This week vs previous week |
| **Last 2 Months** | This month vs previous month |
| **Last 2 Phases** | Compare your last two detected phases |

**Custom Comparison:**
1. Enter dates for **Period 1** (start and end)
2. Enter dates for **Period 2** (start and end)
3. Click **Compare Periods**

**Metrics Compared:**
- Duration
- Total weight change
- Average rate (kg/week)
- Average calories
- Average training volume

---

## Goal Management

### 🎯 Setting Goals

1. Go to the **Goal Settings** section
2. Enter:
   - **Target Weight** (kg)
   - **Target Date** (DD-MM-YYYY)
   - **Target Rate** (optional, kg/week)
3. Submit to see the goal line on your chart

### 🔔 Goal Alerts

The **Goal Alerts** panel monitors your progress and shows contextual notifications:

| Alert Type | When it Appears |
|------------|-----------------|
| 🎯 **Goal Achieved** | Within 0.3 kg of target |
| ✅ **On Track** | Current trajectory will reach goal |
| 📉 **Off Track** | Current rate won't reach goal in time |
| ⚠️ **Wrong Direction** | Gaining when you need to lose (or vice versa) |
| ⏰ **Deadline Approaching** | Less than 2 weeks remaining |
| 🏆 **Milestone** | 25%, 50%, 75%, or 90% progress reached |

### 💡 Goal Suggestions

The **Goal Suggestions** panel analyzes your historical data and recommends realistic goals:

| Suggestion Type | Description |
|-----------------|-------------|
| 🎯 **Moderate Cut** | Sustainable 12-week weight loss based on your history |
| 🔥 **Aggressive Cut** | Faster 8-week cut requiring more discipline |
| 💪 **Lean Bulk** | Slow 16-week muscle building phase |
| ⚖️ **Maintenance** | 4-week weight stable phase |
| 📈 **Continue Trend** | Follow your current trajectory |

**Applying a Suggestion:**
- Click **Apply Goal** on any suggestion card
- Your goal will be automatically set

---

## Event & Competition Tracking

### 📅 Event Countdown

Track upcoming events like competitions, photoshoots, or special occasions.

**Adding an Event:**
1. Click **+ Add Event**
2. Enter:
   - **Event Name**
   - **Date** (DD-MM-YYYY)
   - **Target Weight** (optional)
   - **Category** (Competition, Photoshoot, Vacation, Wedding, Other)
3. Click **Save Event**

**Event Card Features:**
- **Large countdown** showing days remaining
- **Progress bar** toward your target weight
- **Weight difference** showing how much you need to gain/lose
- **Milestones** like "Peak Week" or "Final Prep"

**Urgency Indicators:**
| Days Remaining | Visual |
|----------------|--------|
| ≤ 7 days | 🔴 Red border - urgent |
| ≤ 14 days | 🟡 Yellow border - soon |
| ≤ 30 days | 🔵 Blue border - upcoming |

**Managing Events:**
- Events are saved in your browser's local storage
- Click **×** to remove an event
- Past events are automatically hidden

---

## Advanced Analytics

### 📅 Weekend vs Weekday Analysis

**What it does:** Compares your eating and training patterns between weekdays and weekends.

**Metrics Shown:**
| Metric | Weekdays | Weekends |
|--------|----------|----------|
| Average Calories | Mon-Fri average | Sat-Sun average |
| Daily Weight Change | Typical fluctuation | Weekend impact |
| Volatility | Stability measure | Stability measure |

**Key Insight:** Shows "Weekend Calorie Difference" - if positive, you're eating more on weekends which may slow progress. The panel suggests a weekday calorie buffer if needed.

---

### 🔮 Weight Predictions

**What it does:** Projects your future weight based on current trends with confidence intervals.

**Time Frames:**
| Period | Use Case |
|--------|----------|
| 4 weeks | Short-term planning |
| 8 weeks | Medium-term goals |
| 12 weeks | Competition prep, phases |

**Reading the Predictions:**
- **Expected** - Most likely weight based on current rate
- **Range** - Best/worst case based on your rate variability
- **Confidence %** - Higher = more reliable prediction

---

### 📊 Adaptive Benchmarks

**What it does:** Compares your current rate to your personal history, not generic standards.

**Features:**
- **Percentile Ranking** - "You're in the 75th percentile of your bulk phases"
- **Rate Comparison** - Current rate vs your historical average
- **Personal Records** - Your best bulk and cut rates

**Why it matters:** Generic advice says "lose 0.5-1kg/week" but YOUR sustainable rate might be different. This shows what actually works for you.

---

### 🔍 Calorie Accuracy Audit

**What it does:** Compares expected weight change (from logged calories) vs actual change to identify logging accuracy issues.

**Accuracy Score:**
| Score | Meaning |
|-------|---------|
| 80-100% | Excellent - logging is accurate |
| 60-79% | Good - minor discrepancies |
| 40-59% | Moderate - check portion sizes |
| <40% | Poor - significant underreporting likely |

**Possible Reasons for Discrepancy:**
- Underreporting (snacks, cooking oils, drinks)
- TDEE estimate too high/low
- Water retention fluctuations

**Weekly Breakdown:** Shows expected vs actual change for each week.

---

### 📈 Monthly/Quarterly Reports

**What it does:** Generates periodic summaries of your progress.

**Monthly View:**
- Start/end weight for each month
- Average calories and rate
- Consistency score (% of days logged)
- Weight range (min-max)

**Quarterly View:**
- Aggregated progress across 3 months
- Phase breakdown
- Average consistency

**Highlights:**
- 🏆 Best Month - highest consistency
- 📊 Total Progress - overall weight change

---

### 💡 What Worked

**What it does:** Analyzes your most successful periods to identify winning patterns.

**Insights Generated:**
| Insight | Example |
|---------|---------|
| Best Cut Calories | "Around 1800 kcal/day achieved -0.7 kg/week" |
| Best Bulk Calories | "Around 2600 kcal/day achieved +0.2 kg/week" |
| Volume Impact | "Higher volume correlates with more weight loss" |
| Longest Phase | "You can sustain cuts for 10+ weeks" |
| Consistency Impact | "Consistent weeks average better results" |

**Why it matters:** Instead of following generic advice, use YOUR proven strategies.

---

### 🚀 Plateau Breaker

**What it does:** Detects if you're in a plateau and suggests strategies based on your history.

**Plateau Detection:**
- Triggers when absolute weekly rate < 0.15 kg for 14+ days
- Shows duration and stable weight

**Suggestions (Prioritized):**
1. **Based on Your History** - What broke past plateaus
2. **Diet Break** - If plateau > 21 days
3. **Increase Activity** - Add steps or sessions
4. **Water Retention Check** - Sodium, stress, sleep
5. **Tracking Audit** - Re-weigh portions

**Historical Plateaus:** Shows when past plateaus occurred and how they were broken.

---

### 〰️ Rolling Averages

**What it does:** Displays 7-day, 14-day, and 30-day rolling averages for trend comparison.

**Reading the Averages:**
| Average | Purpose |
|---------|---------|
| 7-Day | Short-term trend, responsive |
| 14-Day | Medium-term, balances noise |
| 30-Day | Long-term trend, stable |

**Momentum Indicator:**
- Compares 7-day to 30-day average
- **Gaining** = short-term trending higher
- **Losing** = short-term trending lower
- **Stable** = aligned trends

**Reversal Detection:** Alerts when short-term trend opposes long-term (potential turning point).

**Tip:** When 7-day average crosses above 30-day, it often signals a trend reversal.

---

## Premium Analytics

### 🔥 TDEE Accuracy Dashboard

**What it does:** Compares different TDEE estimation methods to find which is most accurate for you.

**Methods Compared:**
| Method | Source |
|--------|--------|
| Trend-Based | Calculated from your intake vs weight change |
| Adaptive | 28-day rolling calculation |
| Google Fit | Device-based estimation |

**Reading the Results:**
- Higher accuracy % = that method works best for you
- Large variance = your TDEE fluctuates significantly

---

### 📆 Calorie Heatmap

**What it does:** Shows a calendar-style heatmap of your daily calorie intake.

**Color Coding:**
- 🟢 **Light** - Lower intake days (deficit)
- 🟡 **Medium** - Maintenance range
- 🔴 **Dark** - Higher intake days (surplus)

**Patterns to Look For:**
- Weekend clusters of high intake
- Holiday spikes
- Monthly patterns

---

### 🏆 Streak Tracker

**What it does:** Gamifies consistency by tracking your logging streaks.

**Streak Types:**
| Streak | What It Tracks |
|--------|---------------|
| 📊 **Logging** | Consecutive days with weight data |
| 🎯 **Goal** | Days within your calorie target |
| ⭐ **Perfect** | Both criteria met |

**Benefits:**
- Motivation through visible progress
- Pattern recognition (when do streaks break?)

---

### 💧 Water Weight Predictor

**What it does:** Estimates water retention based on carb and sodium intake.

**How It Works:**
- Each gram of carbs stores ~3g of water
- High sodium increases water retention
- Shows predicted vs actual weight fluctuation

**Use Cases:**
- Explains sudden weight jumps after high-carb meals
- Helps distinguish fat gain from water retention

---

### 🔄 Reverse Dieting Calculator

**What it does:** Plans gradual calorie increases after a cut to minimize fat regain.

**Phases Available:**
| Phase | Duration | Weekly Increase |
|-------|----------|-----------------|
| Quick | 4 weeks | +200 kcal/week |
| Standard | 8 weeks | +100 kcal/week |
| Conservative | 12 weeks | +50 kcal/week |

**When to Use:**
- After completing a cut
- Transitioning to maintenance
- Preparing for a bulk

---

### ⚡ Rate Optimizer

**What it does:** Analyzes your history to find your optimal gain/loss rate.

**Insights Provided:**
- Your most sustainable rate ranges
- Rate vs adherence correlation
- Sweet spot recommendations

**Why It Matters:** Aggressive rates may be counterproductive if they lead to poor adherence.

---

### 🧠 Smart Coach

**What it does:** Provides personalized coaching tips based on your current data.

**Tip Categories:**
- 📊 **Consistency** - Logging and weighing habits
- 📈 **Progress** - Rate and trajectory feedback
- 🚧 **Obstacles** - Plateau and stall strategies
- 🎯 **Goals** - Pacing and timeline advice

---

### 📋 Weekly Review

**What it does:** Generates comprehensive weekly progress summaries.

**Report Sections:**
| Section | Content |
|---------|---------|
| Summary | Weight change, rate, trajectory |
| Nutrition | Avg calories, macro split |
| Training | Volume, consistency |
| Insights | Key observations and recommendations |

---

### 🎯 Executive Hub

**What it does:** Provides a high-level KPI dashboard for quick status checks.

**KPIs Displayed:**
- Current weight (raw and SMA)
- Weekly rate of change
- Days to goal (if set)
- Logging consistency %
- Trend direction indicator

**Best For:** Quick morning check-ins without diving into details.

---

### 🥗 Macro-Weight Correlation

**What it does:** Analyzes how your macro ratios correlate with weight changes.

**Correlations Analyzed:**
- Carb % vs Weight Volatility (water retention)
- Protein % vs Rate (muscle retention)
- Fat % vs Consistency

**Key Insight:** Higher carb days often correlate with water weight spikes.

---

### 🔳 Advanced Insight Matrix

**What it does:** Creates a multi-variable correlation heatmap for deep analysis.

**Variables Included:**
| Inputs | Outcomes |
|--------|----------|
| Calories | Weight Change |
| Protein % | TDEE |
| Carbs % | Weekly Rate |
| Fat % | - |
| Volatility | - |

**Reading the Matrix:**
- 🟩 **Green** - Positive correlation (both increase together)
- 🟥 **Red** - Negative correlation (inverse relationship)
- ⬜ **Gray** - No significant correlation

**Hover** over cells for detailed interpretation.

---

### ⚖️ Energy Balance

**What it does:** Visualizes your daily calorie deficit or surplus.

**Display Features:**
- Daily bar chart (green = deficit, red = surplus)
- Cumulative weekly balance
- Running total vs goal

---

## Tips for Best Results

### Weighing Consistency

For accurate trend analysis:
- Weigh at the **same time** each day (morning after bathroom, before eating)
- Use the **same scale** on a hard, flat surface
- Weigh **daily** for best SMA/EMA smoothing, or at minimum 3x per week

### Understanding Data Noise

Daily weight fluctuates due to:
- Water retention
- Sodium intake
- Carbohydrate intake
- Bowel movements
- Hormonal cycles

**Don't panic over single-day changes.** Focus on the SMA line for true trends.

### Setting Realistic Goals

| Goal Type | Recommended Rate |
|-----------|------------------|
| Fat Loss | -0.5 to -1.0 kg/week |
| Lean Bulk | +0.1 to +0.25 kg/week |
| Aggressive Cut | -0.75 to -1.0 kg/week |
| Competition Prep | Consult a coach |

### Using Phases Effectively

A typical yearly structure:
1. **Bulk Phase** (12-16 weeks): Build muscle with moderate surplus
2. **Maintenance** (4 weeks): Stabilize and recover
3. **Cut Phase** (8-12 weeks): Reduce body fat
4. **Maintenance** (4+ weeks): Settle at new weight

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Escape** | Clear selection/tooltip |
| **R** | Reset zoom to full view |
| **1-4** | Switch sidebar tabs |

---

## Data Format

Your weight data is stored in `data.json` with the following structure:

```json
{
  "weights": {
    "2024-01-15": 72.5,
    "2024-01-16": 72.3
  },
  "calorieIntake": {
    "2024-01-15": 2500
  },
  "protein": {
    "2024-01-15": 150
  },
  "carbs": {
    "2024-01-15": 250
  },
  "fat": {
    "2024-01-15": 80
  },
  "bodyFat": {
    "2024-01-15": 15.5
  }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Chart not loading | Check browser console for errors, ensure data.json is valid |
| CORS error | Use a local server (`live-server`), don't open file directly |
| Stats showing N/A | Ensure enough data points exist in the selected range (min 7-14 days) |
| Goal line missing | Verify goal date is within visible range |
| Premium features empty | Need sufficient data: 14+ days for correlations, 7+ for macros |
| Matrix cells gray | Insufficient data pairs for that correlation |
| Slow performance | Large data files may need pagination or date range filtering |

---

*For technical documentation on program flow and architecture, see [program_flow.md](program_flow.md).*

