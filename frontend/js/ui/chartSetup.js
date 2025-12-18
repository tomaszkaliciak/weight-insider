// chartSetup.js
// Handles the creation and setup of SVG elements, scales, axes, brushes, and zoom.

import { CONFIG } from "../config.js";
import { ui } from "./uiCache.js";
import { ChartInteractions } from "../interactions/chartInteractions.js";
import { Utils } from "../core/utils.js";

// --- D3 Constructs (Exported, populated by setup) ---
export const scales = {
  x: null,
  y: null,
  y2: null, // y2 retained but unused
  xContext: null,
  yContext: null,
  xBalance: null,
  yBalance: null,
  xRate: null,
  yRate: null,
  xTdeeDiff: null,
  yTdeeDiff: null,
  xScatter: null,
  yScatter: null,
};

export const axes = {
  xAxis: null,
  yAxis: null,
  yAxis2: null, // y2 retained but unused
  xAxisContext: null,
  xBalanceAxis: null,
  yBalanceAxis: null,
  xRateAxis: null,
  yRateAxis: null,
  xTdeeDiffAxis: null,
  yTdeeDiffAxis: null,
  xScatterAxis: null,
  yScatterAxis: null,
};

export const brushes = {
  context: null,
  regression: null,
};

export let zoom = null; // Zoom behavior instance

// Internal state for dimensions, calculated by calculateDimensions
const _dimensions = {};

/**
 * Calculates the drawable dimensions for each chart area based on container size and margins.
 * @returns {boolean} True if essential dimensions are valid, false otherwise.
 */
function calculateDimensions() {
  const getDim = (containerSelection, margins) => {
    if (!containerSelection || containerSelection.empty())
      return { width: 0, height: 0, valid: false };
    const node = containerSelection.node();
    if (!node) return { width: 0, height: 0, valid: false };

    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;

    const clientWidth = node.clientWidth || 0;
    const clientHeight = node.clientHeight || 0;

    // Use clientWidth/Height if available and seems reliable
    // Check if clientWidth is close to rect.width minus padding (accounts for border/scrollbar)
    const useClientDims =
      clientWidth > 0 &&
      clientHeight > 0 &&
      clientWidth >= rect.width - paddingLeft - paddingRight - 2; // Tolerance of 2px

    const effectiveWidth = useClientDims
      ? clientWidth - paddingLeft - paddingRight
      : rect.width - paddingLeft - paddingRight;
    const effectiveHeight = useClientDims
      ? clientHeight - paddingTop - paddingBottom
      : rect.height - paddingTop - paddingBottom;

    // Ensure width/height are not negative or excessively small
    const width = Math.max(10, effectiveWidth - margins.left - margins.right);
    const height = Math.max(10, effectiveHeight - margins.top - margins.bottom);

    // Check validity based on calculated drawable area
    const valid = width > 10 && height > 10;
    return { width, height, valid };
  };

  _dimensions.focus = getDim(ui.chartContainer, CONFIG.margins.focus);
  _dimensions.context = getDim(ui.contextContainer, CONFIG.margins.context);
  _dimensions.balance = getDim(
    ui.balanceChartContainer,
    CONFIG.margins.balance,
  );
  _dimensions.rate = getDim(ui.rateChartContainer, CONFIG.margins.rate);
  _dimensions.tdeeDiff = getDim(ui.tdeeDiffContainer, CONFIG.margins.tdeeDiff);
  _dimensions.scatter = getDim(
    ui.correlationScatterContainer,
    CONFIG.margins.correlationScatter,
  );

  // Only focus and context are absolutely essential for the main chart view
  const requiredDimsValid =
    _dimensions.focus.valid && _dimensions.context.valid;

  if (!requiredDimsValid) {
    console.error(
      "chartSetup: Cannot setup dimensions, focus or context container not found or has zero effective size.",
      { focus: _dimensions.focus, context: _dimensions.context }
    );
    // Potentially show a user-facing error message here
    Utils.showCriticalErrorMessage("Could not determine chart drawing dimensions.");
    return false;
  }
  return true;
}

/**
 * Creates the main SVG elements and groups for all charts.
 */
function createSVGElements() {
  console.log("chartSetup: Creating SVG elements...");
  const fm = CONFIG.margins.focus;
  const cm = CONFIG.margins.context;
  const bm = CONFIG.margins.balance;
  const rm = CONFIG.margins.rate;
  const tdm = CONFIG.margins.tdeeDiff;
  const sm = CONFIG.margins.correlationScatter;

  // Clear existing SVGs first
  ui.chartContainer?.select("svg").remove();
  ui.contextContainer?.select("svg").remove();
  ui.balanceChartContainer?.select("svg").remove();
  ui.rateChartContainer?.select("svg").remove();
  ui.tdeeDiffContainer?.select("svg").remove();
  ui.correlationScatterContainer?.select("svg").remove();

  // --- Focus Chart ---
  if (
    _dimensions.focus.valid &&
    ui.chartContainer &&
    !ui.chartContainer.empty()
  ) {
    const { width, height } = _dimensions.focus;
    ui.svg = ui.chartContainer
      .append("svg")
      .attr("width", width + fm.left + fm.right)
      .attr("height", height + fm.top + fm.bottom)
      .attr("aria-label", "Main Weight Chart")
      .attr("role", "img");

    ui.svg
      .append("defs")
      .append("clipPath")
      .attr("id", "clip-focus")
      .append("rect")
      .attr("width", width)
      .attr("height", height);

    ui.zoomCaptureRect = ui.svg
      .append("rect")
      .attr("class", "zoom-capture")
      .attr("width", width)
      .attr("height", height)
      .attr("transform", `translate(${fm.left}, ${fm.top})`);

    ui.focus = ui.svg
      .append("g")
      .attr("class", "focus")
      .attr("transform", `translate(${fm.left},${fm.top})`);

    // Groups within focus, order matters for layering
    ui.gridGroup = ui.focus.append("g").attr("class", "grid y-grid"); // Grid first (behind everything)
    ui.plateauGroup = ui.focus.append("g").attr("class", "plateau-group"); // Plateaus behind most lines/dots
    ui.goalZoneRect = ui.focus // Goal zone behind lines/dots
      .append("rect")
      .attr("class", "goal-zone-rect")
      .style("display", "none")
      .style("pointer-events", "none");

    // Main chart area group with clipping
    ui.chartArea = ui.focus
      .append("g")
      .attr("class", "chart-area")
      .attr("clip-path", "url(#clip-focus)");

    // Elements within chartArea - ORDER IS CRITICAL FOR LAYERING

    // 1. Areas (drawn first, underneath lines)
    ui.bandArea = ui.chartArea.append("path").attr("class", "area band-area");

    // 2. Trend/Reference Lines (drawn after areas, before main data lines/dots)
    ui.trendLine1 = ui.chartArea
      .append("path")
      .attr("class", "trend-line manual-trend-1");
    ui.trendLine2 = ui.chartArea
      .append("path")
      .attr("class", "trend-line manual-trend-2");
    ui.goalPrognosisLine = ui.chartArea // Goal Prognosis line
      .append("path")
      .attr("class", "goal-prognosis-line")
      .style("display", "none")
      .style("pointer-events", "none");
    ui.regressionLine = ui.chartArea // Regression line
      .append("path")
      .attr("class", "trend-line regression-line");
    ui.goalLine = ui.chartArea.append("path").attr("class", "goal-line");
    // goalLineHit moved to end of focus group
    ui.bfLine = ui.chartArea.append("path").attr("class", "line bf-line"); // Bodyfat line (unused)

    // 3. Main Data Lines (SMA, EMA - drawn after reference lines)
    ui.smaLine = ui.chartArea.append("path").attr("class", "line sma-line"); // <<< SMA LINE
    ui.emaLine = ui.chartArea.append("path").attr("class", "line ema-line"); // <<< EMA LINE

    // 4. Dots/Markers (drawn last within clipped area, on top of lines/areas)
    ui.rawDotsGroup = ui.chartArea.append("g").attr("class", "raw-dots-group");
    ui.smaDotsGroup = ui.chartArea.append("g").attr("class", "dots-group"); // Seems unused
    ui.trendChangeGroup = ui.chartArea
      .append("g")
      .attr("class", "trend-change-group"); // Trend change markers
    ui.highlightGroup = ui.chartArea
      .append("g")
      .attr("class", "highlight-group"); // Highlighted dot marker


    // Groups outside clipped area (drawn on top of everything in `focus` group)
    ui.annotationsGroup = ui.focus // Annotations markers (need to be clickable)
      .append("g")
      .attr("class", "annotations-group");
    ui.goalAchievedGroup = ui.focus // Goal achieved marker (drawn on top)
      .append("g")
      .attr("class", "goal-achieved-group");
    ui.xAxisGroup = ui.focus // X Axis
      .append("g")
      .attr("class", "axis axis--x")
      .attr("transform", `translate(0,${height})`);
    ui.yAxisGroup = ui.focus.append("g").attr("class", "axis axis--y"); // Y Axis

    // Crosshair Group (drawn last within focus, on top of axes potentially)
    ui.crosshairGroup = ui.focus
      .append("g")
      .attr("class", "crosshair-group")
      .style("display", "none");
    ui.crosshairGroup
      .append("line")
      .attr("class", "crosshair crosshair-x")
      .attr("y1", 0)
      .attr("y2", height);
    ui.crosshairGroup
      .append("line")
      .attr("class", "crosshair crosshair-y")
      .attr("x1", 0)
      .attr("x2", width);

    // Regression Brush Group (drawn on top for interaction)
    ui.regressionBrushGroup = ui.focus
      .append("g")
      .attr("class", "regression-brush");

    // Goal Line Hit Area (Appended last to be on top of brushes/overlays)
    ui.goalLineHit = ui.focus
      .append("path") // Appended to focus (not chartArea) to avoid clipping and overlay issues
      .attr("class", "goal-line-hit")
      .style("stroke", "transparent")
      .style("stroke-width", "15px")
      .style("fill", "none")
      .style("cursor", "ns-resize");

    // Axis Labels (Appended to main SVG, positioned relative to margins/dimensions)
    ui.svg
      .append("text")
      .attr("class", "axis-label y-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("y", 6) // Position outside left margin
      .attr("x", 0 - (height / 2 + fm.top)) // Center vertically
      .attr("dy", "1em") // Adjust vertical alignment
      .style("text-anchor", "middle")
      .text("Weight (KG)");
  } else {
    console.error(
      "chartSetup: Focus chart dimensions invalid or container missing.",
    );
    // Potentially throw error or handle gracefully
  }

  // --- Context Chart ---
  if (
    _dimensions.context.valid &&
    ui.contextContainer &&
    !ui.contextContainer.empty()
  ) {
    const { width, height } = _dimensions.context;
    ui.contextSvg = ui.contextContainer
      .append("svg")
      .attr("width", width + cm.left + cm.right)
      .attr("height", height + cm.top + cm.bottom)
      .attr("aria-hidden", "true");
    ui.context = ui.contextSvg
      .append("g")
      .attr("class", "context")
      .attr("transform", `translate(${cm.left},${cm.top})`);
    // Order within context chart
    ui.contextArea = ui.context
      .append("path")
      .attr("class", "area band-area context-area"); // Area first
    ui.contextLine = ui.context
      .append("path")
      .attr("class", "line sma-line context-line"); // Line on top of area
    ui.contextXAxisGroup = ui.context
      .append("g")
      .attr("class", "axis axis--x")
      .attr("transform", `translate(0,${height})`); // Axis last
    ui.brushGroup = ui.context
      .append("g")
      .attr("class", "brush context-brush"); // Brush on very top
  } else {
    console.warn("chartSetup: Context dimensions invalid or container missing. Context chart/brush disabled.")
  }

  // --- Balance Chart ---
  if (
    _dimensions.balance.valid &&
    ui.balanceChartContainer &&
    !ui.balanceChartContainer.empty()
  ) {
    const { width, height } = _dimensions.balance;
    ui.balanceSvg = ui.balanceChartContainer
      .append("svg")
      .attr("width", width + bm.left + bm.right)
      .attr("height", height + bm.top + bm.bottom)
      .attr("aria-hidden", "true");
    ui.balanceChartArea = ui.balanceSvg
      .append("g")
      .attr("class", "balance-chart-area")
      .attr("transform", `translate(${bm.left},${bm.top})`);
    ui.balanceZeroLine = ui.balanceChartArea // Zero line behind bars
      .append("line")
      .attr("class", "balance-zero-line")
      .attr("x1", 0)
      .attr("x2", width);
    // Bars will be appended dynamically inside balanceChartArea
    ui.balanceXAxisGroup = ui.balanceSvg
      .append("g")
      .attr("class", "axis balance-axis balance-axis--x")
      .attr("transform", `translate(${bm.left},${bm.top + height})`);
    ui.balanceYAxisGroup = ui.balanceSvg
      .append("g")
      .attr("class", "axis balance-axis balance-axis--y")
      .attr("transform", `translate(${bm.left},${bm.top})`);
    ui.balanceSvg
      .append("text")
      .attr("class", "axis-label y-axis-label-small")
      .attr("transform", "rotate(-90)")
      .attr("y", 4)
      .attr("x", 0 - (height / 2 + bm.top))
      .attr("dy", "0.75em")
      .style("text-anchor", "middle")
      .text("Balance (kcal)");
  }

  // --- Rate of Change Chart ---
  if (
    _dimensions.rate.valid &&
    ui.rateChartContainer &&
    !ui.rateChartContainer.empty()
  ) {
    const { width, height } = _dimensions.rate;
    ui.rateSvg = ui.rateChartContainer
      .append("svg")
      .attr("width", width + rm.left + rm.right)
      .attr("height", height + rm.top + rm.bottom)
      .attr("aria-hidden", "true");
    ui.rateSvg
      .append("defs")
      .append("clipPath")
      .attr("id", "clip-rate")
      .append("rect")
      .attr("width", width)
      .attr("height", height);
    ui.rateChartArea = ui.rateSvg
      .append("g")
      .attr("class", "rate-chart-area")
      .attr("transform", `translate(${rm.left},${rm.top})`)
      .attr("clip-path", "url(#clip-rate)");
    ui.optimalGainZoneRect = ui.rateChartArea // Zone behind lines
      .append("rect")
      .attr("class", "optimal-gain-zone")
      .attr("x", 0)
      .attr("width", width)
      .attr("y", 0)
      .attr("height", 0)
      .style("display", "none");
    ui.rateZeroLine = ui.rateChartArea // Zero line behind lines
      .append("line")
      .attr("class", "rate-zero-line")
      .attr("x1", 0)
      .attr("x2", width);
    ui.rateLine = ui.rateChartArea // Main rate line
      .append("path")
      .attr("class", "line rate-line");
    ui.rateMALine = ui.rateChartArea // MA line on top
      .append("path")
      .attr("class", "line rate-ma-line");
    // Hover dots will be appended dynamically
    ui.rateXAxisGroup = ui.rateSvg
      .append("g")
      .attr("class", "axis rate-axis rate-axis--x")
      .attr("transform", `translate(${rm.left},${rm.top + height})`);
    ui.rateYAxisGroup = ui.rateSvg
      .append("g")
      .attr("class", "axis rate-axis rate-axis--y")
      .attr("transform", `translate(${rm.left},${rm.top})`);
    ui.rateSvg
      .append("text")
      .attr("class", "axis-label y-axis-label-small")
      .attr("transform", "rotate(-90)")
      .attr("y", 4)
      .attr("x", 0 - (height / 2 + rm.top))
      .attr("dy", "0.56em")
      .style("text-anchor", "middle")
      .text("Rate (kg/wk)");
  }

  // --- TDEE Difference Chart ---
  if (
    _dimensions.tdeeDiff.valid &&
    ui.tdeeDiffContainer &&
    !ui.tdeeDiffContainer.empty()
  ) {
    const { width, height } = _dimensions.tdeeDiff;
    ui.tdeeDiffSvg = ui.tdeeDiffContainer
      .append("svg")
      .attr("width", width + tdm.left + tdm.right)
      .attr("height", height + tdm.top + tdm.bottom)
      .attr("aria-hidden", "true");
    ui.tdeeDiffSvg
      .append("defs")
      .append("clipPath")
      .attr("id", "clip-tdee-diff")
      .append("rect")
      .attr("width", width)
      .attr("height", height);
    ui.tdeeDiffChartArea = ui.tdeeDiffSvg
      .append("g")
      .attr("class", "tdee-diff-chart-area")
      .attr("transform", `translate(${tdm.left},${tdm.top})`)
      .attr("clip-path", "url(#clip-tdee-diff)");
    ui.tdeeDiffZeroLine = ui.tdeeDiffChartArea // Zero line behind main line
      .append("line")
      .attr("class", "tdee-diff-zero-line")
      .attr("x1", 0)
      .attr("x2", width);
    ui.tdeeDiffLine = ui.tdeeDiffChartArea // Main diff line
      .append("path")
      .attr("class", "line tdee-diff-line");
    // Hover dots will be appended dynamically
    ui.tdeeDiffXAxisGroup = ui.tdeeDiffSvg
      .append("g")
      .attr("class", "axis tdee-diff-axis tdee-diff-axis--x")
      .attr("transform", `translate(${tdm.left},${tdm.top + height})`);
    ui.tdeeDiffYAxisGroup = ui.tdeeDiffSvg
      .append("g")
      .attr("class", "axis tdee-diff-axis tdee-diff-axis--y")
      .attr("transform", `translate(${tdm.left},${tdm.top})`);
    ui.tdeeDiffSvg
      .append("text")
      .attr("class", "axis-label y-axis-label-small")
      .attr("transform", "rotate(-90)")
      .attr("y", 4)
      .attr("x", 0 - (height / 2 + tdm.top))
      .attr("dy", "0.75em")
      .style("text-anchor", "middle")
      .text("TDEE Diff (kcal)");
  }

  // --- Correlation Scatter Plot ---
  if (
    _dimensions.scatter.valid &&
    ui.correlationScatterContainer &&
    !ui.correlationScatterContainer.empty()
  ) {
    const { width, height } = _dimensions.scatter;
    ui.correlationScatterSvg = ui.correlationScatterContainer
      .append("svg")
      .attr("width", width + sm.left + sm.right)
      .attr("height", height + sm.top + sm.bottom)
      .attr("aria-label", "Correlation Scatter Plot")
      .attr("role", "img");
    ui.correlationScatterArea = ui.correlationScatterSvg
      .append("g")
      .attr("class", "correlation-scatter-area")
      .attr("transform", `translate(${sm.left},${sm.top})`);
    ui.scatterDotsGroup = ui.correlationScatterArea // Group for dots
      .append("g")
      .attr("class", "scatter-dots-group");
    ui.correlationScatterXAxisGroup = ui.correlationScatterSvg
      .append("g")
      .attr("class", "axis scatter-axis scatter-axis--x")
      .attr("transform", `translate(${sm.left},${sm.top + height})`);
    ui.correlationScatterYAxisGroup = ui.correlationScatterSvg
      .append("g")
      .attr("class", "axis scatter-axis scatter-axis--y")
      .attr("transform", `translate(${sm.left},${sm.top})`);
    ui.correlationScatterSvg
      .append("text")
      .attr("class", "axis-label scatter-axis-label-x")
      .attr("x", sm.left + width / 2)
      .attr("y", height + sm.top + sm.bottom - 5) // Position below x-axis
      .style("text-anchor", "middle")
      .text("Avg Weekly Net Calories (kcal)");
    ui.correlationScatterSvg
      .append("text")
      .attr("class", "axis-label scatter-axis-label-y")
      .attr("transform", "rotate(-90)")
      .attr("y", 4) // Position outside left margin
      .attr("x", 0 - (height / 2 + sm.top)) // Center vertically
      .attr("dy", "0.75em")
      .style("text-anchor", "middle")
      .text("Weekly Rate (kg/wk)");
  }

  console.log("chartSetup: SVG element creation finished.");
}

/**
 * Creates and configures the D3 scales for all charts.
 */
function createScales() {
  const focusW = _dimensions.focus.valid ? _dimensions.focus.width : 0;
  const focusH = _dimensions.focus.valid ? _dimensions.focus.height : 0;
  const contextW = _dimensions.context.valid ? _dimensions.context.width : 0;
  const contextH = _dimensions.context.valid ? _dimensions.context.height : 0;
  const balanceW = _dimensions.balance.valid ? _dimensions.balance.width : 0;
  const balanceH = _dimensions.balance.valid ? _dimensions.balance.height : 0;
  const rateW = _dimensions.rate.valid ? _dimensions.rate.width : 0;
  const rateH = _dimensions.rate.valid ? _dimensions.rate.height : 0;
  const tdeeDiffW = _dimensions.tdeeDiff.valid ? _dimensions.tdeeDiff.width : 0;
  const tdeeDiffH = _dimensions.tdeeDiff.valid
    ? _dimensions.tdeeDiff.height
    : 0;
  const scatterW = _dimensions.scatter.valid ? _dimensions.scatter.width : 0;
  const scatterH = _dimensions.scatter.valid ? _dimensions.scatter.height : 0;

  scales.x = d3.scaleTime().range([0, focusW]);
  scales.y = d3.scaleLinear().range([focusH, 0]);
  scales.y2 = d3.scaleLinear().range([focusH, 0]); // Retained but unused
  scales.xContext = d3.scaleTime().range([0, contextW]);
  scales.yContext = d3.scaleLinear().range([contextH, 0]);
  scales.xBalance = d3.scaleTime().range([0, balanceW]);
  scales.yBalance = d3.scaleLinear().range([0, balanceH]);
  scales.xRate = d3.scaleTime().range([0, rateW]);
  scales.yRate = d3.scaleLinear().range([rateH, 0]);
  scales.xTdeeDiff = d3.scaleTime().range([0, tdeeDiffW]);
  scales.yTdeeDiff = d3.scaleLinear().range([tdeeDiffH, 0]);
  scales.xScatter = d3.scaleLinear().range([0, scatterW]);
  scales.yScatter = d3.scaleLinear().range([scatterH, 0]);
}

/**
 * Creates and configures the D3 axes for all charts.
 */
function createAxes() {
  const focusW = _dimensions.focus.valid ? _dimensions.focus.width : 0;
  const focusH = _dimensions.focus.valid ? _dimensions.focus.height : 0;
  const contextW = _dimensions.context.valid ? _dimensions.context.width : 0;
  const balanceW = _dimensions.balance.valid ? _dimensions.balance.width : 0;
  const balanceH = _dimensions.balance.valid ? _dimensions.balance.height : 0;
  const rateW = _dimensions.rate.valid ? _dimensions.rate.width : 0;
  const rateH = _dimensions.rate.valid ? _dimensions.rate.height : 0;
  const tdeeDiffW = _dimensions.tdeeDiff.valid ? _dimensions.tdeeDiff.width : 0;
  const tdeeDiffH = _dimensions.tdeeDiff.valid
    ? _dimensions.tdeeDiff.height
    : 0;

  axes.xAxis = d3
    .axisBottom(scales.x)
    .ticks(Math.max(Math.floor(focusW / 130), 2)) // Dynamic ticks based on width
    .tickSizeOuter(0) // Remove outer ticks
    .tickFormat(Utils.formatDateShort); // Use custom date format
  axes.yAxis = d3
    .axisLeft(scales.y)
    .ticks(Math.max(Math.floor(focusH / 40), 5)) // Dynamic ticks based on height
    .tickSizeOuter(0)
    .tickFormat((d) => Utils.formatValue(d, 1)); // Format to 1 decimal place
  axes.yAxis2 = d3
    .axisRight(scales.y2) // Retained but unused
    .ticks(5)
    .tickSizeOuter(0)
    .tickFormat((d) => Utils.formatValue(d, 1) + "%");
  axes.xAxisContext = d3
    .axisBottom(scales.xContext)
    .ticks(Math.max(Math.floor(contextW / 100), 2)) // Fewer ticks for context
    .tickSizeOuter(0)
    .tickFormat(d3.timeFormat("%b '%y")); // Shorter format for context

  // Helper for secondary chart axes
  const createSecondaryAxis = (
    scale,
    dimension,
    orientation,
    tickDivisor,
    format,
  ) => {
    const axis =
      orientation === "left" ? d3.axisLeft(scale) : d3.axisBottom(scale);
    axis
      .ticks(Math.max(Math.floor(dimension / tickDivisor), 3)) // Adjust tick density
      .tickSizeOuter(0)
      .tickFormat(format);
    return axis;
  };

  // Balance Chart Axes
  axes.xBalanceAxis = createSecondaryAxis(
    scales.xBalance,
    balanceW,
    "bottom",
    180, // Fewer x-ticks
    d3.timeFormat("%b %d"), // Day-month format
  );
  axes.yBalanceAxis = createSecondaryAxis(
    scales.yBalance,
    balanceH,
    "left",
    25, // Fewer y-ticks
    (d) => (d === 0 ? "0" : d3.format("+,")(d)), // Format with sign, commas
  );

  // Rate Chart Axes
  axes.xRateAxis = createSecondaryAxis(
    scales.xRate,
    rateW,
    "bottom",
    150,
    d3.timeFormat("%b %d"),
  );
  axes.yRateAxis = createSecondaryAxis(scales.yRate, rateH, "left", 30, (d) =>
    Utils.formatValue(d, 2), // Format to 2 decimal places
  );

  // TDEE Diff Chart Axes
  axes.xTdeeDiffAxis = createSecondaryAxis(
    scales.xTdeeDiff,
    tdeeDiffW,
    "bottom",
    150,
    d3.timeFormat("%b %d"),
  );
  axes.yTdeeDiffAxis = createSecondaryAxis(
    scales.yTdeeDiff,
    tdeeDiffH,
    "left",
    30,
    d3.format("+,.0f"), // Format with sign, commas, no decimals
  );

  // Scatter Plot Axes
  axes.xScatterAxis = d3
    .axisBottom(scales.xScatter)
    .ticks(5) // Fewer ticks for scatter
    .tickFormat(d3.format("+,")); // Format with sign, commas
  axes.yScatterAxis = d3
    .axisLeft(scales.yScatter)
    .ticks(5)
    .tickFormat((d) => d.toFixed(2)); // Format to 2 decimal places
}

/**
 * Creates and configures the D3 brushes.
 */
function createBrushes() {
  // Context Brush
  if (
    _dimensions.context.valid &&
    ui.context &&
    !ui.context.empty() &&
    ui.brushGroup &&
    !ui.brushGroup.empty() // Ensure brushGroup exists
  ) {
    const { width, height } = _dimensions.context;
    brushes.context = d3
      .brushX()
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("brush.handler end.handler", ChartInteractions.contextBrushed); // Use ChartInteractions
    ui.brushGroup.call(brushes.context); // Apply brush to the dedicated group
  } else {
    console.warn(
      "chartSetup: Context dimensions invalid or context/brush group missing, cannot create context brush.",
    );
  }

  // Regression Brush
  if (
    _dimensions.focus.valid &&
    ui.regressionBrushGroup &&
    !ui.regressionBrushGroup.empty()
  ) {
    const { width, height } = _dimensions.focus;
    brushes.regression = d3
      .brushX()
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("end.handler", ChartInteractions.regressionBrushed); // Use ChartInteractions
    ui.regressionBrushGroup.call(brushes.regression);
    // Hide initially, only shown when range is active
    ui.regressionBrushGroup
      .selectAll(".overlay, .selection, .handle")
      .style("display", "none");
  } else {
    console.warn(
      "chartSetup: Focus dimensions invalid or regression group missing, cannot create regression brush.",
    );
  }
}

/**
 * Creates and configures the D3 zoom behavior.
 */
function createZoom() {
  if (!_dimensions.focus.valid || !ui.svg || ui.svg.empty()) {
    console.error(
      "chartSetup: Cannot create zoom - focus dimensions invalid or SVG missing.",
    );
    zoom = null;
    return;
  }
  const { width, height } = _dimensions.focus;
  // Get the context scale range AFTER it's been created and potentially domain-set
  const contextRange = scales.xContext?.range() || [0, width]; // Fallback to focus width

  zoom = d3
    .zoom()
    .filter(event => {
      // Allow panning (drag), double-click (if enabled elsewhere), but block wheel events
      // Check event type and button for drag (mousedown + button 0)
      const isDrag = event.type === 'mousedown' && event.button === 0;
      // Check event type for double click
      const isDblClick = event.type === 'dblclick';
      // Allow only drag and double-click (or other non-wheel events)
      return isDrag || isDblClick || !event.type.includes('wheel');
    })
    .scaleExtent([0.5, 20]) // Min/max zoom level
    .extent([ // Viewport for zoom
      [0, 0],
      [width, height],
    ])
    .translateExtent([ // Limit panning
      [contextRange[0], -Infinity], // Pan starts at the beginning of the context chart's range
      [contextRange[1], Infinity], // Pan ends at the end of the context chart's range
    ])
    .on("zoom", ChartInteractions.zoomed); // Use ChartInteractions

  // Apply zoom behavior to the capture rectangle
  if (ui.zoomCaptureRect && !ui.zoomCaptureRect.empty()) {
    ui.zoomCaptureRect.call(zoom).on("dblclick.zoom", null); // Disable double-click zoom reset
    console.log("chartSetup: Zoom behavior initialized.");
  } else {
    console.error(
      "chartSetup: Zoom capture rectangle not found, cannot attach zoom behavior.",
    );
    zoom = null;
  }
}

/**
 * Runs all setup steps in the correct order.
 * @returns {boolean} True if setup completed successfully, false otherwise.
 */
export function initializeChartSetup() {
  console.log("chartSetup: Running all setup steps...");
  if (!calculateDimensions()) {
    console.error("chartSetup: Dimension calculation failed.");
    return false;
  }
  createSVGElements(); // Creates groups in uiCache
  createScales(); // Populates exported scales
  createAxes(); // Populates exported axes
  createBrushes(); // Populates exported brushes, adds brushGroup to uiCache
  createZoom(); // Populates exported zoom

  // Initialize Interactions
  if (ui.goalLineHit && !ui.goalLineHit.empty()) {
    // Safeguard: Ensure hit area is transparent and has no fill
    ui.goalLineHit.attr("fill", "none");
    ChartInteractions.setupGoalDrag();
  }

  console.log("chartSetup: Setup complete.");
  return true;
}
