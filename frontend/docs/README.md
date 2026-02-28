# Weight Insider Documentation

Welcome to the Weight Insider documentation. This folder contains comprehensive guides for users and developers.

---

## Documentation Index

| Document | Audience | Description |
|----------|----------|-------------|
| [**User Guide**](user_guide.md) | End Users | How to use all features, tips and best practices |
| [**Features Reference**](features_reference.md) | Developers | Technical details, data structures, algorithms |
| [**Program Flow**](program_flow.md) | Developers | Architecture diagrams, event flows, formulas |

---

## Quick Start

```bash
cd frontend
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

For production:

```bash
npm run build        # outputs to dist/
npm run preview      # preview the build locally
```

---

## Features Overview

### Dashboard & Navigation
- Bento-grid layout with collapsible widgets (state persisted in localStorage)
- Three themes: Light, Dark (slate), Gruvbox (warm charcoal) -- cycle via the toggle button
- Mobile navigation FAB for jumping between widgets on small screens
- PWA with offline support (cache-first static assets, network-first data)

### Core Charting
- Interactive weight chart with SMA, EMA, regression lines, confidence band
- Zoom, pan, tooltips (hover/pin), context brush
- Manual trendline overlays (two independent rates)
- Analysis range control with quick presets (7D / 30D / 90D / All)

### Goal Management
- Inline goal form (target weight, date, rate) in the Goal Progress widget
- Goal Simulator with projection chart and confidence bands
- Goal Alerts (on-track, off-track, milestones, deadline warnings)
- Adaptive Goal Suggestions from historical performance

### Nutrition & Macros
- Macro Breakdown widget (P/C/F/Fiber progress bars, 7-day avg split)
- Protein Adequacy tracker (g/kg, threshold progress bar, 14-day sparkline)
- Macro rolling averages (7-day vs 14-day with delta indicators)
- Macro-weight correlation analysis

### Energy Analytics
- Energy Balance History (goal-aware bar chart: green = on-track, red = off-track)
- Energy Flow Sankey diagram (intake -> TDEE -> deficit/surplus -> weight change)
- TDEE Accuracy dashboard (trend-based vs adaptive vs Google Fit)
- TDEE vs Intake reconciliation chart

### Smart Coaching
- Smart Coach with phase-aware recommendations
- Plateau Breaker (detection + history-based suggestions)
- What Worked analysis (successful patterns from your history)
- Rate Optimizer (sustainable rate benchmarks)

### Tracking & Review
- Weekly Review summaries
- Monthly/Quarterly Reports with best-month highlighting
- Calorie Heatmap (calendar view)
- Streak Tracker (logging, deficit, consistency)
- Water Weight Predictor
- Reverse Dieting Calculator
- Event Countdown with milestones

### Data Management
- Quick Entry widget (manual weight + calorie logging via localStorage)
- CSV export from the data table modal
- Full data table with 200-row display

### Developer Tools
- ESLint + Prettier (`npm run lint`, `npm run format`)
- Lazy renderer initialization via IntersectionObserver
- Event-driven state management with typed subscriptions

---

## Project Structure

```
frontend/
├── index.html
├── vite.config.js
├── eslint.config.js
├── .prettierrc.json
├── data.json                      # Primary data source
├── public/
│   ├── sw.js                      # Service Worker (PWA)
│   └── manifest.json
├── css/
│   ├── variables.css              # Design tokens, 3 theme palettes
│   ├── layout.css
│   ├── components.css
│   └── widgets/                   # Per-feature widget styles
│       ├── base.css
│       ├── components.css
│       ├── dashboards.css
│       ├── periodization-analytics.css
│       └── advanced-features.css
├── js/
│   ├── main.js                    # Entry point, lazy init
│   ├── config.js
│   ├── core/
│   │   ├── stateManager.js        # Redux-style state bus
│   │   ├── dataService.js         # Fetch, merge, process pipeline
│   │   ├── statsManager.js        # Derived statistics (incl. macros)
│   │   ├── manualEntryService.js  # localStorage manual entries
│   │   ├── goalManager.js
│   │   ├── annotationManager.js
│   │   ├── domainManager.js
│   │   ├── themeManager.js        # 3-way theme cycle
│   │   ├── selectors.js
│   │   └── utils.js
│   ├── ui/
│   │   ├── renderers/             # 35 bento-widget renderers
│   │   ├── widgetCollapser.js
│   │   ├── mobileNav.js
│   │   ├── manualEntryWidget.js
│   │   ├── dataTableModal.js      # Data table + CSV export
│   │   ├── chartSetup.js
│   │   ├── chartUpdaters.js
│   │   ├── masterUpdater.js
│   │   └── ...
│   └── interactions/
│       ├── eventHandlers.js
│       ├── chartInteractions.js
│       ├── formHandlers.js
│       ├── resizeHandler.js
│       └── keyboardNav.js
├── docs/                          # You are here
└── tests/
```

---

## Contributing

When adding new features:

1. Create renderer in `js/ui/renderers/`
2. Add state management in `stateManager.js` if needed
3. Add HTML widget container in `index.html`
4. Add CSS styles in the appropriate `css/widgets/*.css` file
5. Import and initialize in `main.js` (use `lazyInit()` for below-fold widgets)
6. Use `StateManager.subscribeToSpecificEvent()` for subscriptions
7. Add catch-up render in `init()` for lazy-loaded renderers
8. Update documentation in this folder

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 4.0 | Feb 2026 | Macro nutrition widgets, quick entry, CSV export, Gruvbox theme, widget collapse, mobile nav, PWA caching, lazy loading, goal form/simulator restoration, layout reorganization |
| 3.0 | Dec 2025 | 12 premium analytics features, correlation matrix |
| 2.1 | Dec 2025 | 8 advanced analytics features |
| 2.0 | Dec 2025 | 6 core analysis features |
| 1.0 | - | Initial release with core charting |
