// js/ui/renderers/whatIfOverlayRenderer.js
// A1: Draws a dashed "ghost" projection line on the main chart when a
// what-if scenario has been pinned via GoalSimulatorRenderer.

import { StateManager } from "../../core/stateManager.js";
import { scales } from "../chartSetup.js";
import { ui } from "../uiCache.js";
import * as d3 from "d3";

const LINE_ID = "what-if-overlay-path";
const LABEL_ID = "what-if-overlay-label";

function _draw(overlay) {
  const chartArea = ui.chartArea;
  if (!chartArea || !scales.x || !scales.y) return;

  // Remove previous
  chartArea.select(`#${LINE_ID}`).remove();
  chartArea.select(`#${LABEL_ID}`).remove();

  if (!overlay || !overlay.points?.length) return;

  const validPoints = overlay.points.filter(
    p => p.date instanceof Date && !isNaN(p.date) && p.weight != null
  );
  if (!validPoints.length) return;

  const lineGen = d3.line()
    .x(d => scales.x(d.date))
    .y(d => scales.y(d.weight))
    .curve(d3.curveMonotoneX)
    .defined(d => isFinite(scales.x(d.date)) && isFinite(scales.y(d.weight)));

  chartArea.append("path")
    .attr("id", LINE_ID)
    .datum(validPoints)
    .attr("fill", "none")
    .attr("stroke", "var(--warning-color, #f39c12)")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6 4")
    .attr("opacity", 0.8)
    .attr("pointer-events", "none")
    .attr("d", lineGen);

  // Label at end of line
  const last = validPoints[validPoints.length - 1];
  const lx = scales.x(last.date);
  const ly = scales.y(last.weight);
  if (isFinite(lx) && isFinite(ly)) {
    chartArea.append("text")
      .attr("id", LABEL_ID)
      .attr("x", lx + 6)
      .attr("y", ly + 4)
      .attr("font-size", "11px")
      .attr("fill", "var(--warning-color, #f39c12)")
      .attr("pointer-events", "none")
      .text(`What-If ${overlay.rateKgWeek > 0 ? "+" : ""}${(overlay.rateKgWeek ?? 0).toFixed(2)} kg/wk`);
  }
}

export const WhatIfOverlayRenderer = {
  init() {
    StateManager.subscribeToSpecificEvent("state:simulationOverlayChanged", ({ overlay }) => {
      _draw(overlay);
    });
    // Redraw on chart updates (range change, resize) — overlay data is in state
    StateManager.subscribeToSpecificEvent("state:filteredDataChanged", () => {
      _draw(StateManager.getState().simulationOverlay);
    });
  },
};
