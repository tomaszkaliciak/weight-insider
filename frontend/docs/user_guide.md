# Weight Insider User Guide

Welcome to **Weight Insider** - an advanced weight tracking and analysis application that helps you understand your body's response to diet and exercise.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Features](#core-features)
3. [Analysis Features](#analysis-features)
4. [Goal Management](#goal-management)
5. [Event & Competition Tracking](#event--competition-tracking)
6. [Tips for Best Results](#tips-for-best-results)

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

### 💪 Workout Correlation

**What it does:** Analyzes the relationship between your training volume and weight changes.

**How it works:**
- Groups data by week
- Calculates total training volume (sets × weight × reps)
- Computes Pearson correlation coefficient (r) between volume and weight change

**Interpreting Results:**

| Correlation | Meaning |
|-------------|---------|
| **Strong positive** (r > 0.7) | Higher volume = more weight gain (muscle building) |
| **Strong negative** (r < -0.7) | Higher volume = more weight loss |
| **Moderate** (0.4-0.7) | Notable relationship exists |
| **Weak** (0.2-0.4) | Minor relationship |
| **None** (< 0.2) | No significant pattern |

**How to use:**
- View the **Workout Correlation** panel
- Consider the interpretation context - during a bulk, positive correlation is expected

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
  "workouts": {
    "2024-01-15": {
      "workoutCount": 1,
      "totalSets": 25,
      "totalVolume": 15000,
      "isRestDay": false
    }
  }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Chart not loading | Check browser console for errors, ensure data.json is valid |
| CORS error | Use a local server (`live-server`), don't open file directly |
| Stats showing N/A | Ensure enough data points exist in the selected range |
| Goal line missing | Verify goal date is within visible range |

---

*For technical documentation on program flow and architecture, see [program_flow.md](program_flow.md).*
