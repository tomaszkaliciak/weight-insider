# Weight Insider Documentation

Welcome to the Weight Insider documentation. This folder contains comprehensive guides for users and developers.

---

## 📚 Documentation Index

| Document | Audience | Description |
|----------|----------|-------------|
| [**User Guide**](user_guide.md) | End Users | How to use all features, tips and best practices |
| [**Features Reference**](features_reference.md) | Developers | Technical details, data structures, algorithms |
| [**Program Flow**](program_flow.md) | Developers | Architecture diagrams, event flows, formulas |

---

## 🚀 Quick Start

1. **Run the application:**
   ```bash
   cd frontend
   npx live-server --port=8080
   ```

2. **Open:** `http://localhost:8080`

3. **Add your data** to `data.json` - see [Data Format](user_guide.md#data-format)

---

## ✨ Features Overview

### Core Features
- 📊 **Interactive Weight Chart** - Zoom, pan, tooltips
- 📈 **Trend Analysis** - SMA, EMA, regression lines
- 📝 **Annotations** - Mark important events
- 🎨 **Light/Dark Theme** - Toggle display mode

### Analysis Features
- 🔄 **Periodization Analysis** - Auto-detect bulk/cut/maintenance phases
- ⚖️ **Period Comparison** - Compare any two time periods
- 💪 **Workout Correlation** - Training volume vs weight change

### Goal Management
- 🎯 **Goal Setting** - Target weight and date
- 🔔 **Goal Alerts** - Progress notifications and warnings
- 💡 **Adaptive Suggestions** - AI-powered goal recommendations

### Event Tracking
- 📅 **Competition Countdown** - Track upcoming events
- 🏆 **Milestone Tracking** - Peak week, final prep alerts
- 📊 **Progress Visualization** - Weight target progress bars

### Advanced Analytics
- 📅 **Weekend vs Weekday** - Compare eating patterns
- 🔮 **Weight Predictions** - 4/8/12 week projections with confidence bands
- 📊 **Adaptive Benchmarks** - Personal rate comparisons
- 🔍 **Calorie Accuracy** - Audit your logging accuracy
- 📈 **Monthly Reports** - Periodic progress summaries
- 💡 **What Worked** - Identify successful patterns
- 🚀 **Plateau Breaker** - Detection and suggestions
- 〰️ **Rolling Averages** - 7/14/30 day trend comparison

### Premium Analytics (New!)
- 🔥 **TDEE Accuracy Dashboard** - Compare estimated vs actual TDEE
- 📆 **Calorie Heatmap** - Calendar view of daily intake patterns
- 🏆 **Streak Tracker** - Track logging and goal consistency
- 💧 **Water Weight Predictor** - Estimate water retention patterns
- 🔄 **Reverse Dieting Calculator** - Plan post-diet calorie increases
- ⚡ **Rate Optimizer** - Find your optimal gain/loss rate
- 🧠 **Smart Coach** - AI-powered personalized advice
- 📋 **Weekly Review** - Comprehensive weekly summaries
- 🎯 **Executive Hub** - High-level KPI dashboard
- 🥗 **Macro-Weight Correlation** - Macros vs weight analysis
- 🔳 **Advanced Insight Matrix** - Multi-variable correlation heatmap
- ⚖️ **Energy Balance** - Visual deficit/surplus tracking

---

## 🗂️ Project Structure

```
frontend/
├── index.html              # Main HTML
├── style.css               # All styles (~6500 lines)
├── data.json               # Your data
├── docs/                   # 📍 You are here
│   ├── README.md
│   ├── user_guide.md
│   ├── features_reference.md
│   └── program_flow.md
└── js/
    ├── main.js             # Entry point
    ├── config.js           # Configuration
    ├── core/               # Core modules
    │   ├── dataService.js
    │   ├── stateManager.js
    │   ├── statsManager.js
    │   ├── domainManager.js
    │   ├── themeManager.js
    │   ├── goalManager.js
    │   ├── annotationManager.js
    │   ├── selectors.js
    │   └── utils.js
    ├── ui/                 # UI modules
    │   ├── chartSetup.js
    │   ├── chartUpdaters.js
    │   ├── masterUpdater.js
    │   ├── legendManager.js
    │   ├── insightsGenerator.js
    │   ├── sidebarTabs.js
    │   ├── tooltipManager.js
    │   ├── weeklySummaryUpdater.js
    │   ├── components/     # Reusable components
    │   │   └── progressRing.js
    │   └── renderers/      # Feature panels (29 files)
    │       ├── statsDisplayRenderer.js
    │       ├── annotationListRenderer.js
    │       ├── periodizationRenderer.js
    │       ├── periodComparisonRenderer.js
    │       ├── goalAlertRenderer.js
    │       ├── goalSuggestionRenderer.js
    │       ├── eventCountdownRenderer.js
    │       ├── weekendAnalysisRenderer.js
    │       ├── predictionBandsRenderer.js
    │       ├── adaptiveRateRenderer.js
    │       ├── calorieAuditRenderer.js
    │       ├── monthlyReportRenderer.js
    │       ├── whatWorkedRenderer.js
    │       ├── plateauBreakerRenderer.js
    │       ├── rollingAveragesRenderer.js
    │       ├── tdeeAccuracyRenderer.js      # Premium
    │       ├── calorieHeatmapRenderer.js    # Premium
    │       ├── streakTrackerRenderer.js     # Premium
    │       ├── waterWeightRenderer.js       # Premium
    │       ├── reverseDietRenderer.js       # Premium
    │       ├── rateOptimizerRenderer.js     # Premium
    │       ├── smartCoachRenderer.js        # Premium
    │       ├── weeklyReviewRenderer.js      # Premium
    │       ├── executiveHubRenderer.js      # Premium
    │       ├── macroCorrelationRenderer.js  # Premium
    │       ├── correlationMatrixRenderer.js # Premium
    │       ├── energyBalanceRenderer.js     # Premium
    │       ├── quickStatsRenderer.js        # Premium
    │       └── sparklineRenderer.js         # Premium
    └── interactions/       # Event handlers
        ├── eventHandlers.js
        ├── chartInteractions.js
        ├── resizeHandler.js
        └── keyboardNav.js
```

---

## 📝 Contributing

When adding new features:

1. **Create renderer** in `js/ui/renderers/`
2. **Add state management** in `stateManager.js` if needed
3. **Add HTML section** in `index.html`
4. **Add CSS styles** in `style.css`
5. **Import and initialize** in `main.js`
6. **Update documentation** in this folder

---

## 📜 Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.0 | Dec 2025 | Added 12 premium analytics features, correlation matrix |
| 2.1 | Dec 2025 | Added 8 advanced analytics features |
| 2.0 | Dec 2025 | Added 6 core analysis features |
| 1.0 | - | Initial release with core charting |

---

*For support or questions, please open an issue in the repository.*
