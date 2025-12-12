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
- 💪 **Workout Correlation** - Training volume vs weight relationship
- ⚖️ **Period Comparison** - Compare any two time periods

### Goal Management
- 🎯 **Goal Setting** - Target weight and date
- 🔔 **Goal Alerts** - Progress notifications and warnings
- 💡 **Adaptive Suggestions** - AI-powered goal recommendations

### Event Tracking
- 📅 **Competition Countdown** - Track upcoming events
- 🏆 **Milestone Tracking** - Peak week, final prep alerts
- 📊 **Progress Visualization** - Weight target progress bars

### Advanced Analytics (NEW!)
- 📅 **Weekend vs Weekday** - Compare eating patterns
- 🔮 **Weight Predictions** - 4/8/12 week projections with confidence bands
- 📊 **Adaptive Benchmarks** - Personal rate comparisons
- 🔍 **Calorie Accuracy** - Audit your logging accuracy
- 📈 **Monthly Reports** - Periodic progress summaries
- 💡 **What Worked** - Identify successful patterns
- 🚀 **Plateau Breaker** - Detection and suggestions
- 〰️ **Rolling Averages** - 7/14/30 day trend comparison

---

## 🗂️ Project Structure

```
frontend/
├── index.html              # Main HTML
├── style.css               # All styles
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
    │   └── ...
    ├── ui/                 # UI modules
    │   ├── chartSetup.js
    │   ├── masterUpdater.js
    │   └── renderers/      # Feature panels (14 files)
    │       ├── periodizationRenderer.js
    │       ├── workoutCorrelationRenderer.js
    │       ├── periodComparisonRenderer.js
    │       ├── goalAlertRenderer.js
    │       ├── goalSuggestionRenderer.js
    │       ├── eventCountdownRenderer.js
    │       ├── weekendAnalysisRenderer.js      # NEW
    │       ├── predictionBandsRenderer.js      # NEW
    │       ├── adaptiveRateRenderer.js         # NEW
    │       ├── calorieAuditRenderer.js         # NEW
    │       ├── monthlyReportRenderer.js        # NEW
    │       ├── whatWorkedRenderer.js           # NEW
    │       ├── plateauBreakerRenderer.js       # NEW
    │       └── rollingAveragesRenderer.js      # NEW
    └── interactions/       # Event handlers
        ├── eventHandlers.js
        └── chartInteractions.js
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
| 2.1 | Dec 2025 | Added 8 advanced analytics features |
| 2.0 | Dec 2025 | Added 6 core analysis features |
| 1.0 | - | Initial release with core charting |

---

*For support or questions, please open an issue in the repository.*
