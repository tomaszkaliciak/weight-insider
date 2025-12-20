# Application Flow Diagrams

This document contains diagrams illustrating the key flows within the weight tracking application.

> **📚 Related Documentation:**
> - [User Guide](user_guide.md) - How to use all features
> - [Features Reference](features_reference.md) - Technical details of all features
> - [Documentation Index](README.md) - Overview of all documentation

## 1. Application Startup Flow

This diagram shows the main steps involved when the application loads initially.

```mermaid
sequenceDiagram
    participant Browser
    participant main.js
    participant DataService
    participant StateManager
    participant DomainManager
    participant StatsManager
    participant ChartSetup
    participant EventHandlers
    participant MasterUpdater

    Browser->>main.js: Load index.html & main.js
    main.js->>DataService: loadData()
    DataService->>Browser: Fetch data.json
    Browser-->>DataService: Return data
    DataService-->>main.js: Data loaded
    main.js->>StateManager: Initialize state (initialState)
    main.js->>DomainManager: initializeDomains(data)
    DomainManager-->>main.js: Domains calculated
    main.js->>StatsManager: update() / processInitialData()
    StatsManager-->>main.js: Initial stats calculated (updates state via dispatch)
    main.js->>ChartSetup: initializeChartSetup()
    ChartSetup-->>main.js: SVG, Scales, Axes, Zoom, Brushes created
    main.js->>EventHandlers: setupAll()
    EventHandlers-->>main.js: Listeners attached (resize, clicks, zoom, brush)
    main.js->>MasterUpdater: updateAllCharts()
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>ChartSetup: Read scales
    MasterUpdater->>Browser: Render initial chart view
    Browser-->>User: Display chart
```

**Explanation:**

1.  The browser loads the HTML and the main JavaScript file (`main.js`).
2.  `main.js` initiates data loading via `DataService`.
3.  Once data is available, core managers like `StateManager`, `DomainManager`, and `StatsManager` are initialized, setting up the initial application state, calculating data ranges, and computing initial statistics.
4.  `ChartSetup` creates all the necessary visual components (SVG structure, scales, axes, interaction elements like zoom/brush).
5.  `EventHandlers` attaches listeners to the window, UI controls, and chart elements.
6.  Finally, `MasterUpdater` performs the initial rendering of all chart components based on the prepared state and scales.

## 2. Event Handling Flows

This section illustrates how the application responds to specific user interactions.

### 2.1 Dot Hover/Click Interaction

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater

    User->>Browser/D3/UI: Hovers over data point (dot)
    Browser/D3/UI->>EventHandlers: dotMouseOver(event, data)
    EventHandlers->>StateManager: dispatch({ type: 'SET_ACTIVE_HOVER_DATA', payload: data })
    EventHandlers->>EventHandlers: _showTooltip(content, event)
    StateManager-->>MasterUpdater: Notify: state changed (hoverData)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Update dot style (highlight), update crosshair

    User->>Browser/D3/UI: Clicks on hovered data point
    Browser/D3/UI->>EventHandlers: dotClick(event, data)
    EventHandlers->>StateManager: dispatch({ type: 'SET_PINNED_TOOLTIP', payload: { id: ..., data: ... } })
    StateManager-->>MasterUpdater: Notify: state changed (pinnedTooltip)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Update dot style (pin highlight)
    Note over EventHandlers,Browser/D3/UI: Tooltip remains visible due to pinned state

    User->>Browser/D3/UI: Moves mouse off dot
    Browser/D3/UI->>EventHandlers: dotMouseOut(event, data)
    EventHandlers->>StateManager: dispatch({ type: 'SET_ACTIVE_HOVER_DATA', payload: null })
    EventHandlers->>EventHandlers: _hideTooltip() (Checks pinned state, tooltip stays)
    StateManager-->>MasterUpdater: Notify: state changed (hoverData)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Remove hover style, remove crosshair
```
*   **Explanation:** Shows how hovering triggers tooltip display and state updates for highlighting. Clicking toggles the pinned state for the tooltip and associated data point.

### 2.2 Date Range Input Change

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater
    participant StatsManager
    participant ChartSetup (Scales)

    User->>Browser/D3/UI: Changes Analysis Start/End Date Input
    Browser/D3/UI->>EventHandlers: handleAnalysisRangeInputChange()
    EventHandlers->>EventHandlers: _debouncedRangeInputChange() scheduled
    Note right of EventHandlers: After debounce delay...
    EventHandlers->>Browser/D3/UI: Read input values
    EventHandlers->>StateManager: dispatch({ type: 'SET_ANALYSIS_RANGE', payload: { start: ..., end: ... } })
    EventHandlers->>ChartSetup (Scales): Update scales.x.domain()
    EventHandlers->>EventHandlers: syncBrushAndZoomToFocus()
    EventHandlers->>StateManager: dispatch({ type: 'SET_LAST_ZOOM_TRANSFORM', payload: ... })
    StateManager-->>StatsManager: Notify: state changed (analysisRange)
    StatsManager->>StatsManager: update() -> _calculateDerivedData()
    StatsManager->>StateManager: dispatch(...) updates for stats, filtered data etc.
    StateManager-->>MasterUpdater: Notify: state changed (multiple)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Full chart redraw with new range and stats
```
*   **Explanation:** Illustrates how changing the date inputs triggers a debounced update, leading to a state change for the analysis range, recalculation of stats by `StatsManager`, and a full chart redraw by `MasterUpdater`.

### 2.3 Background Click

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater

    User->>Browser/D3/UI: Clicks on chart background
    Browser/D3/UI->>EventHandlers: handleBackgroundClick(event)
    EventHandlers->>StateManager: dispatch({ type: 'SET_HIGHLIGHTED_DATE', payload: null })
    EventHandlers->>StateManager: dispatch({ type: 'SET_PINNED_TOOLTIP', payload: null })
    EventHandlers->>StateManager: dispatch({ type: 'SET_INTERACTIVE_REGRESSION_RANGE', payload: { start: null, end: null } })
    EventHandlers->>EventHandlers: _hideTooltip()
    StateManager-->>MasterUpdater: Notify: state changed (highlight, pin, regRange)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Remove highlights, hide regression brush, etc.
```
*   **Explanation:** Demonstrates how clicking the background clears transient states like highlights, pinned tooltips, and the interactive regression range by dispatching null payloads to the `StateManager`.

### 2.4 Window Resize

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater
    participant ChartSetup (Scales)
    participant DomainManager

    User->>Browser/D3/UI: Resizes browser window
    Browser/D3/UI->>EventHandlers: handleResize() (debounced)
    Note right of EventHandlers: After debounce delay...
    EventHandlers->>StateManager: dispatch(...) to clear highlights, pins etc.
    EventHandlers->>ChartSetup (Scales): initializeChartSetup() (recalculates dimensions, scales, axes)
    EventHandlers->>DomainManager: initializeDomains() (recalculates based on new dimensions/data)
    EventHandlers->>EventHandlers: restoreViewAfterResize()
    EventHandlers->>StateManager: dispatch({ type: 'SET_LAST_ZOOM_TRANSFORM', payload: ... }) (restores zoom)
    EventHandlers->>MasterUpdater: updateAllCharts()
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Full chart redraw with new dimensions
```
*   **Explanation:** Shows the debounced handling of resize events, which involves re-initializing the chart setup, recalculating domains, restoring the previous zoom/brush state, and triggering a full redraw.

### 2.5 Goal Form Submission

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater
    participant StatsManager
    participant GoalManager

    User->>Browser/D3/UI: Enters goal data and submits form
    Browser/D3/UI->>EventHandlers: handleGoalSubmit(event)
    EventHandlers->>Browser/D3/UI: Read form input values
    EventHandlers->>StateManager: dispatch({ type: 'LOAD_GOAL', payload: { weight: ..., date: ..., rate: ... } })
    StateManager->>StateManager: Update goal state (reducer likely validates/parses)
    EventHandlers->>GoalManager: save() (Saves goal state to localStorage)
    StateManager-->>StatsManager: Notify: state changed (goal)
    Note right of StatsManager: StatsManager reads goal state during its next calculation cycle (_calculateDerivedData)
    StatsManager->>StateManager: dispatch({ type: 'SET_DISPLAY_STATS', payload: ... }) (updates goal-related stats)
    StateManager-->>MasterUpdater: Notify: state changed (goal, displayStats)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Update goal line on chart, update stats display
```
*   **Explanation:** Details how submitting the goal form dispatches an action to update the goal state, triggers a save to local storage, and eventually leads to updates in the stats display and chart visuals.

### 2.6 Theme Toggle

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant ThemeManager

    User->>Browser/D3/UI: Clicks Theme Toggle Button
    Browser/D3/UI->>EventHandlers: handleThemeToggle()
    EventHandlers->>ThemeManager: toggleTheme() (via dynamic import)
    ThemeManager->>ThemeManager: Determine new theme
    ThemeManager->>Browser/D3/UI: Update body class/attribute (e.g., <body class="dark-theme">)
    ThemeManager->>Browser/D3/UI: Save theme preference (localStorage)
    Browser/D3/UI->>Browser/D3/UI: Apply new theme via CSS rules
    Note right of EventHandlers: MasterUpdater might redraw if needed, but often CSS handles theme changes.
```
*   **Explanation:** Explains how clicking the toggle button calls the `ThemeManager`, which updates the UI (likely via CSS classes) and saves the preference, usually without complex state dispatches.

### 2.7 Annotation Form Submission

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater
    participant AnnotationManager

    User->>Browser/D3/UI: Enters annotation data and submits form
    Browser/D3/UI->>EventHandlers: (AnnotationManager.handleSubmit called via listener)
    EventHandlers->>AnnotationManager: handleSubmit(event) (via dynamic import)
    AnnotationManager->>Browser/D3/UI: Read form input values
    AnnotationManager->>AnnotationManager: Validate input
    AnnotationManager->>StateManager: dispatch({ type: 'ADD_ANNOTATION', payload: { date: ..., text: ... } })
    StateManager->>StateManager: Update annotations state
    AnnotationManager->>AnnotationManager: saveAnnotations() (Saves to localStorage)
    StateManager-->>MasterUpdater: Notify: state changed (annotations)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Draw new annotation marker on chart
```
*   **Explanation:** Shows how submitting the annotation form triggers the `AnnotationManager` to validate, dispatch an `ADD_ANNOTATION` action, save the data, and update the chart display.

### 2.8 Manual Trendline Input Change

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater

    User->>Browser/D3/UI: Changes input for manual trendline (start date, weight, rate)
    Browser/D3/UI->>EventHandlers: handleTrendlineInputChange()
    EventHandlers->>Browser/D3/UI: Read input values
    EventHandlers->>StateManager: dispatch({ type: 'UPDATE_TREND_CONFIG', payload: { ... } })
    StateManager->>StateManager: Update trendConfig state
    StateManager-->>MasterUpdater: Notify: state changed (trendConfig)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Recalculate and redraw manual trendlines
```
*   **Explanation:** Illustrates how modifying trendline inputs dispatches an `UPDATE_TREND_CONFIG` action, causing the `MasterUpdater` to redraw the manual trendlines.

### 2.9 Stat Date Click (from Stats Panel)

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater
    participant StatsManager
    participant ChartSetup (Scales)

    User->>Browser/D3/UI: Clicks on a date in the stats panel
    Browser/D3/UI->>EventHandlers: statDateClickWrapper(event) -> statDateClick(date)
    EventHandlers->>StateManager: getState() (to find closest point)
    EventHandlers->>StateManager: dispatch({ type: 'SET_HIGHLIGHTED_DATE', payload: date })
    EventHandlers->>EventHandlers: Calculate new domain centered on date
    EventHandlers->>ChartSetup (Scales): Update scales.x.domain()
    EventHandlers->>StateManager: dispatch({ type: 'SET_ANALYSIS_RANGE', payload: newRange })
    EventHandlers->>EventHandlers: syncBrushAndZoomToFocus()
    EventHandlers->>StateManager: dispatch({ type: 'SET_LAST_ZOOM_TRANSFORM', payload: ... })
    StateManager-->>StatsManager: Notify: state changed (analysisRange, highlight)
    StatsManager->>StatsManager: update() -> _calculateDerivedData()
    StatsManager->>StateManager: dispatch(...) updates for stats, filtered data etc.
    StateManager-->>MasterUpdater: Notify: state changed (multiple)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Full chart redraw centered on new date, highlight point
```
*   **Explanation:** Explains how clicking a date in the statistics panel triggers centering the chart view on that date, updating the analysis range, highlighting the point, and recalculating/redrawing relevant data.

### 2.10 Regression Brush Set/Drag

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater
    participant StatsManager
    participant ChartSetup (Scales)

    User->>Browser/D3/UI: Drags regression brush on main chart
    Browser/D3/UI->>EventHandlers: regressionBrushed(event) (on 'end' event)
    EventHandlers->>ChartSetup (Scales): Read scales.x to invert pixel selection to dates
    EventHandlers->>StateManager: dispatch({ type: 'SET_INTERACTIVE_REGRESSION_RANGE', payload: { start: date1, end: date2 } })
    StateManager-->>StatsManager: Notify: state changed (interactiveRegressionRange)
    StatsManager->>StatsManager: update() -> _calculateDerivedData() (recalculates regression)
    StatsManager->>StateManager: dispatch({ type: 'SET_REGRESSION_RESULT', payload: ... })
    StateManager-->>MasterUpdater: Notify: state changed (regressionResult)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Update regression line, CI area, stats display
```
*   **Explanation:** Details how finishing a drag action with the regression brush dispatches the new date range to the state, triggering recalculation of regression statistics and visual updates to the regression line and confidence interval.

### 2.11 Legend Item Click

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant StateManager
    participant MasterUpdater
    participant LegendManager

    User->>Browser/D3/UI: Clicks on a legend item (e.g., 'SMA')
    Browser/D3/UI->>LegendManager: handleLegendClick(seriesKey) (Handler likely in LegendManager or attached by it)
    LegendManager->>StateManager: dispatch({ type: 'TOGGLE_SERIES_VISIBILITY', payload: seriesKey })
    StateManager->>StateManager: Update seriesVisibility state
    StateManager-->>MasterUpdater: Notify: state changed (seriesVisibility)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Show/hide the corresponding line/dots on the chart
```
*   **Explanation:** Shows how clicking a legend item likely triggers a state change to toggle the visibility of the corresponding data series, followed by a visual update from `MasterUpdater`.

### 2.12 Annotation List Item Click

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant MasterUpdater
    participant AnnotationListRenderer

    User->>Browser/D3/UI: Clicks on an item in the annotation list panel
    Browser/D3/UI->>AnnotationListRenderer: handleAnnotationClick(annotationData) (Handler likely in Renderer or attached by it)
    AnnotationListRenderer->>StateManager: dispatch({ type: 'SET_HIGHLIGHTED_DATE', payload: annotationDate })
    AnnotationListRenderer->>EventHandlers: statDateClick(annotationDate) (Potentially re-uses centering logic)
    Note right of AnnotationListRenderer: Subsequent flow similar to 'Stat Date Click'
    StateManager-->>MasterUpdater: Notify: state changed (highlight, analysisRange, etc.)
    MasterUpdater->>StateManager: getState()
    MasterUpdater->>Browser/D3/UI: Center chart, highlight annotation marker/date
```
*   **Explanation:** Illustrates how clicking an annotation in the list panel might highlight the corresponding date and potentially center the chart view on it, reusing logic similar to the 'Stat Date Click'.

### 2.13 "What If" Scenario Submission

```mermaid
sequenceDiagram
    participant User
    participant Browser/D3/UI
    participant EventHandlers
    participant StateManager
    participant StatsManager

    User->>Browser/D3/UI: Enters "What If" data and submits
    Browser/D3/UI->>EventHandlers: handleWhatIfSubmit(event)
    EventHandlers->>Browser/D3/UI: Read form input values (intake, duration)
    EventHandlers->>StateManager: getState() (to get current stats via selectors)
    EventHandlers->>StatsManager: (Implicitly uses current stats like TDEE, current weight from state)
    EventHandlers->>EventHandlers: Calculate projected weight change
    EventHandlers->>Browser/D3/UI: Update "What If" result display area directly
    Note right of EventHandlers: Does not dispatch state changes or trigger MasterUpdater
```
*   **Explanation:** Shows how submitting the "What If" form reads current state/stats, performs a calculation, and directly updates the result display area without altering the main chart state or triggering major redraws.

## 3. Key Formulas and Calculations

This section outlines the primary formulas used within `StatsManager` to derive key metrics. `KCALS_PER_KG` is a configuration constant (typically ~7700).

**TDEE Estimation (from Weight Trend)**

*   Calculates Total Daily Energy Expenditure based on average intake and the rate of weight change.
*   `Daily KG Change = Weekly KG Change / 7`
*   `Daily Deficit/Surplus (kcal) = Daily KG Change * KCALS_PER_KG`
*   `TDEE (kcal) = Average Calorie Intake - Daily Deficit/Surplus`

**Estimated Deficit/Surplus (from Trend)**

*   Estimates the average daily calorie balance based solely on the rate of weight change.
*   `Daily KG Change = Weekly KG Change / 7`
*   `Estimated Daily Deficit/Surplus (kcal) = Daily KG Change * KCALS_PER_KG`

**Time to Goal Projection**

*   Estimates the time required to reach the goal weight based on the current trend.
*   `Weight Difference (kg) = Goal Weight - Current Weight`
*   `Weeks Needed = Weight Difference / Weekly KG Change`
*   *(Result is formatted into days/weeks/months/years)*

**Required Rate for Goal Date**

*   Calculates the weekly rate needed to reach the goal weight by the target date.
*   `Weight Difference (kg) = Goal Weight - Current Weight`
*   `Days Remaining = (Goal Date - Today) / Milliseconds_Per_Day`
*   `Required Weekly Rate (kg/wk) = Weight Difference / (Days Remaining / 7)`

**Required Calorie Adjustment (for Target Rate)**

*   Calculates the change in daily net calories needed to match the user's target rate.
*   `Rate Difference (kg/wk) = Target Rate - Current Trend Rate`
*   `Required Daily Adjustment (kcal) = (Rate Difference / 7) * KCALS_PER_KG`

**Required Net Calories (for Goal Date)**

*   Calculates the required average daily net calorie balance to meet the goal by the target date.
*   `Required Daily Deficit/Surplus (kcal) = (Required Weekly Rate / 7) * KCALS_PER_KG`
*   `Required Net Calories = Required Daily Deficit/Surplus`

**Suggested Intake Range**

*   Provides a suggested daily calorie intake range to meet the goal date.
*   `Baseline TDEE = Adaptive TDEE or Trend TDEE or Google Fit TDEE` (Uses best available estimate)
*   `Target Intake = Baseline TDEE + Required Daily Deficit/Surplus`
*   `Range = [Target Intake - 100, Target Intake + 100]`

**Linear Regression**

*   Uses the `simple-statistics` library (`ss.linearRegression`) to find the line of best fit for weight (or SMA) data over time within the selected regression range.
*   The slope (`m`) represents the average *daily* weight change (kg/day) during that period.

**Volatility**

*   Calculates the standard deviation (`ss.standardDeviation`) of the difference between daily raw weight values and their corresponding Simple Moving Average (SMA) value within the analysis range. Measures day-to-day weight fluctuations around the trend.

**Plateau Detection**

*   Identifies periods where the `smoothedWeeklyRate` remains close to zero (within `CONFIG.plateauRateThresholdKgWeek`) for a minimum duration (`CONFIG.plateauMinDurationWeeks`).

**Trend Change Detection**

*   Compares the slope of the SMA line (calculated over `CONFIG.trendChangeWindowDays`) before and after each data point.
*   If the absolute difference between the 'before' slope and 'after' slope exceeds `CONFIG.trendChangeMinSlopeDiffKgWeek`, a significant change in trend direction or speed is marked.

---

## 4. New Analysis Features Flows

This section documents the flows for features added in version 2.0.

### 4.1 Periodization Analysis Flow

```mermaid
sequenceDiagram
    participant StatsManager
    participant DataService
    participant StateManager
    participant PeriodizationRenderer

    StatsManager->>DataService: detectPeriodizationPhases(processedData)
    DataService->>DataService: Analyze smoothedWeeklyRate
    DataService->>DataService: Classify periods (bulk/cut/maintenance)
    DataService->>DataService: Filter by MIN_PHASE_DURATION_WEEKS
    DataService-->>StatsManager: phases[]
    StatsManager->>StateManager: dispatch(SET_PERIODIZATION_PHASES, phases)
    StateManager-->>PeriodizationRenderer: Notify: state changed
    PeriodizationRenderer->>StateManager: getState()
    PeriodizationRenderer->>PeriodizationRenderer: _render() - display phase cards
```

**Explanation:** During the stats update cycle, `DataService` analyzes weight rate data to detect training phases. Results are dispatched to state and rendered by the dedicated component.

### 4.2 Workout Correlation Flow

```mermaid
sequenceDiagram
    participant StatsManager
    participant DataService
    participant StateManager
    participant WorkoutCorrelationRenderer

    StatsManager->>DataService: calculateWorkoutCorrelation(processedData)
    DataService->>DataService: Group data by week
    DataService->>DataService: Sum weekly volume, avg rate
    DataService->>DataService: Compute Pearson correlation
    DataService-->>StatsManager: {coefficient, weeklyData, interpretation}
    StatsManager->>StateManager: dispatch(SET_WORKOUT_CORRELATION, result)
    StateManager-->>WorkoutCorrelationRenderer: Notify: state changed
    WorkoutCorrelationRenderer->>StateManager: getState()
    WorkoutCorrelationRenderer->>WorkoutCorrelationRenderer: _render() - display correlation
```

**Explanation:** Correlation between training volume and weight change is calculated weekly, with statistical interpretation provided.

### 4.3 Period Comparison Flow

```mermaid
sequenceDiagram
    participant User
    participant PeriodComparisonRenderer
    participant StateManager

    User->>PeriodComparisonRenderer: Click "Last 2 Weeks" button
    PeriodComparisonRenderer->>PeriodComparisonRenderer: Calculate period dates
    PeriodComparisonRenderer->>StateManager: getState() (get processedData)
    PeriodComparisonRenderer->>PeriodComparisonRenderer: _calculatePeriodStats(period1)
    PeriodComparisonRenderer->>PeriodComparisonRenderer: _calculatePeriodStats(period2)
    PeriodComparisonRenderer->>PeriodComparisonRenderer: _renderComparison(stats1, stats2)
```

**Explanation:** Period comparison is handled entirely within the renderer, calculating derived stats on demand from existing processed data.

### 4.4 Goal Alerts Flow

```mermaid
sequenceDiagram
    participant StateManager
    participant GoalAlertRenderer

    StateManager-->>GoalAlertRenderer: Notify: goal or stats changed
    GoalAlertRenderer->>StateManager: getState()
    GoalAlertRenderer->>GoalAlertRenderer: _getCurrentWeight()
    GoalAlertRenderer->>GoalAlertRenderer: _checkDeadlineAlert()
    GoalAlertRenderer->>GoalAlertRenderer: _checkProgressAlert()
    GoalAlertRenderer->>GoalAlertRenderer: _checkRateAlert()
    GoalAlertRenderer->>GoalAlertRenderer: _checkMilestoneAlert()
    GoalAlertRenderer->>GoalAlertRenderer: _checkGoalAchievedAlert()
    GoalAlertRenderer->>GoalAlertRenderer: _render() - display prioritized alerts
```

**Explanation:** Alert checking runs whenever goal or stats change, evaluating multiple conditions and displaying prioritized alerts.

### 4.5 Goal Suggestions Flow

```mermaid
sequenceDiagram
    participant StateManager
    participant GoalSuggestionRenderer

    StateManager-->>GoalSuggestionRenderer: Notify: stats changed
    GoalSuggestionRenderer->>StateManager: getState()
    GoalSuggestionRenderer->>GoalSuggestionRenderer: _analyzeHistoricalPatterns()
    Note right of GoalSuggestionRenderer: Calculate avg rates, sustainability
    GoalSuggestionRenderer->>GoalSuggestionRenderer: _createSuggestions()
    Note right of GoalSuggestionRenderer: Generate cut/bulk/maintenance options
    GoalSuggestionRenderer->>GoalSuggestionRenderer: _render() - display suggestion cards

    User->>GoalSuggestionRenderer: Click "Apply Goal"
    GoalSuggestionRenderer->>StateManager: dispatch(SET_GOAL, {weight, date})
```

**Explanation:** Suggestions are generated from historical performance analysis. Users can apply suggestions directly, which dispatches to state.

### 4.6 Event Countdown Flow

```mermaid
sequenceDiagram
    participant User
    participant EventCountdownRenderer
    participant localStorage
    participant StateManager

    EventCountdownRenderer->>localStorage: Load saved events
    EventCountdownRenderer->>EventCountdownRenderer: _render() initial

    User->>EventCountdownRenderer: Click "+ Add Event"
    User->>EventCountdownRenderer: Fill form, click "Save"
    EventCountdownRenderer->>EventCountdownRenderer: Validate input
    EventCountdownRenderer->>EventCountdownRenderer: _addEvent()
    EventCountdownRenderer->>localStorage: Save events
    EventCountdownRenderer->>EventCountdownRenderer: _render() - show event card

    StateManager-->>EventCountdownRenderer: Notify: filteredData changed
    EventCountdownRenderer->>StateManager: getState()
    EventCountdownRenderer->>EventCountdownRenderer: _getProgress(targetWeight, currentWeight)
    EventCountdownRenderer->>EventCountdownRenderer: _render() - update progress bars
```

**Explanation:** Events are persisted in localStorage independently of main state. Progress bars update when weight data changes.

### 4.7 Advanced Insight Matrix Flow

```mermaid
sequenceDiagram
    participant StatsManager
    participant simple-statistics
    participant StateManager
    participant CorrelationMatrixRenderer

    StatsManager->>StatsManager: _calculateDerivedData()
    StatsManager->>StatsManager: _calculateCorrelationMatrix(filteredData)
    loop For each pair of variables
        StatsManager->>simple-statistics: sampleCorrelation(x, y)
    end
    StatsManager->>StateManager: dispatch(SET_DISPLAY_STATS, {correlationMatrix})
    StateManager-->>CorrelationMatrixRenderer: Notify: displayStatsUpdated
    CorrelationMatrixRenderer->>CorrelationMatrixRenderer: render(matrix)
    CorrelationMatrixRenderer->>CorrelationMatrixRenderer: _getColorForValue(val)
```

**Explanation:** The correlation matrix is computed during the main stats cycle using `simple-statistics`. The renderer uses a non-linear color scale to highlight strengths.

---

## 5. Premium Formulas

**Water Weight Prediction**
* `Water Weight (kg) = (Daily Carbs - Avg Carbs) * 3 / 1000 + (Daily Sodium - Avg Sodium) * 0.005`
* *Note: Simplified model assuming 3-4g water per 1g glycogen.*

**Adaptive TDEE (28-day Window)**
* `TDEE = (Total Intake + (Weight Start - Weight End) * 7700) / 28`
* Uses a longer smoothing window than the standard trend-based TDEE for higher stability.

**Calorie Accuracy Score**
* `Expected Change = (Intake - TDEE) / 7700`
* `Accuracy = 1 - (|Actual Change - Expected Change| / |Expected Change|)`

---

## 6. Architecture Overview

### Component Relationships

```mermaid
graph TB
    subgraph "Data Layer"
        DJ[data.json]
        DS[DataService]
        DJ --> DS
    end

    subgraph "State Layer"
        SM[StateManager]
        SEL[Selectors]
    end

    subgraph "Processing Layer"
        STATS[StatsManager]
        DOM[DomainManager]
    end

    subgraph "Rendering Layer"
        MU[MasterUpdater]
        CHART[ChartUpdaters]
        REND[Renderers]
    end

    DS --> SM
    SM --> STATS
    STATS --> SM
    SM --> SEL
    SEL --> MU
    SEL --> REND
    MU --> CHART
    DOM --> MU

    subgraph "Core Renderers"
        PR[Periodization]
        WCR[WorkoutCorrelation]
        PCR[PeriodComparison]
        GAR[GoalAlerts]
        GSR[GoalSuggestions]
        ECR[EventCountdown]
    end

    subgraph "Premium Renderers"
        CMR[CorrelationMatrix]
        TAR[TdeeAccuracy]
        CHR[CalorieHeatmap]
        STR[StreakTracker]
        WWR[WaterWeight]
        RDO[RateOptimizer]
        SC[SmartCoach]
    end

    SEL --> Core
    SEL --> Premium
```

---

*For technical details on each feature, see [features_reference.md](features_reference.md).*  
*For user documentation, see [user_guide.md](user_guide.md).*