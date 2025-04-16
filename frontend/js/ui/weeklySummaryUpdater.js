// js/ui/weeklySummaryUpdater.js
// Handles rendering and sorting the weekly summary table based on state.

import { ui } from "./uiCache.js";
import { StateManager } from "../core/stateManager.js";
import { Utils } from "../core/utils.js";
import * as Selectors from "../core/selectors.js";

export const WeeklySummaryUpdater = {
  /**
   * Sorts the weekly summary data.
   * @param {Array<object>} data - The array of weekly summary objects.
   * @param {string} key - The key to sort by.
   * @param {'asc'|'desc'} direction - The sort direction.
   * @returns {Array<object>} The sorted array.
   */
  _sortData(data, key, direction) {
    if (!key || !Array.isArray(data)) return data;
    const isAsc = direction === "asc";
    const dataToSort = [...data]; // Sort copy

    dataToSort.sort((a, b) => {
      let valA = a[key];
      let valB = b[key];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (valA instanceof Date && valB instanceof Date) {
        return isAsc
          ? valA.getTime() - valB.getTime()
          : valB.getTime() - valA.getTime();
      }
      if (typeof valA === "number" && typeof valB === "number") {
        return isAsc ? valA - valB : valB - valA;
      }
      if (typeof valA === "string" && typeof valB === "string") {
        return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0;
    });
    return dataToSort;
  },

  /**
   * Renders the weekly summary table based on current state (sort options and data).
   * @param {object} tableState - Object containing { weeklyData, sortKey, sortDir }.
   */
  _renderTable({ weeklyData, sortKey, sortDir }) {
    console.log("[WeeklySummaryUpdater] _renderTable called.");
    const container = ui.weeklySummaryContainer;
    if (!container || container.empty()) {
      console.warn("WeeklySummaryUpdater: Container element not found.");
      return;
    }

    container.select(".loading-msg").remove();
    let emptyMsg = container.select(".empty-msg");
    let tableWrapper = container.select(".table-wrapper");

    if (!Array.isArray(weeklyData) || weeklyData.length === 0) {
      tableWrapper.remove();
      if (emptyMsg.empty()) {
        emptyMsg = container.append("p").attr("class", "empty-msg");
      }
      emptyMsg
        .style("display", null)
        .text("No weekly data available for the selected analysis range.");
      return;
    }

    emptyMsg?.style("display", "none");

    const columnsConfig = [
      {
        key: "weekStartDate",
        label: "Week Start",
        numeric: false,
        sortable: true,
      },
      {
        key: "avgWeight",
        label: "Avg Wgt (kg)",
        numeric: true,
        sortable: true,
      },
      {
        key: "weeklyRate",
        label: "Rate (kg/wk)",
        numeric: true,
        sortable: true,
      },
      { key: "avgIntake", label: "Avg Intake", numeric: true, sortable: true },
      {
        key: "avgExpenditure",
        label: "Avg GFit",
        numeric: true,
        sortable: true,
      },
      { key: "avgNetCal", label: "Avg Net", numeric: true, sortable: true },
    ];

    let thead;
    if (tableWrapper.empty()) {
      tableWrapper = container.append("div").attr("class", "table-wrapper");
      const table = tableWrapper.append("table").attr("class", "summary-table");
      thead = table.append("thead");
      table.append("tbody");
    } else {
      thead = tableWrapper.select("thead");
    }

    thead
      .selectAll("tr")
      .data([null])
      .join("tr")
      .selectAll("th")
      .data(columnsConfig, (d) => d.key)
      .join("th")
      .attr("class", (d) =>
        `${d.numeric ? "numeric" : ""} ${d.sortable ? "sortable" : ""}`.trim(),
      )
      .classed(
        "sorted-asc",
        (d) => d.sortable && d.key === sortKey && sortDir === "asc",
      )
      .classed(
        "sorted-desc",
        (d) => d.sortable && d.key === sortKey && sortDir === "desc",
      )
      .text((d) => d.label)
      .on("click", (event, d) => {
        if (!d.sortable) return;
        let newDirection = "asc";
        if (d.key === sortKey) {
          newDirection = sortDir === "asc" ? "desc" : "asc";
        }
        // Dispatch action to update sort options in state
        StateManager.dispatch({
          type: "SET_SORT_OPTIONS",
          payload: { columnKey: d.key, direction: newDirection },
        });
      });

    const sortedData = this._sortData(weeklyData, sortKey, sortDir); // Sort the data passed in

    const fv = Utils.formatValue;
    const fd = Utils.formatDateShort;
    const rowColumns = [
      { key: "weekStartDate", format: fd, numeric: false },
      { key: "avgWeight", format: (d) => fv(d, 1), numeric: true },
      { key: "weeklyRate", format: (d) => fv(d, 2), numeric: true },
      { key: "avgIntake", format: (d) => fv(d, 0), numeric: true },
      { key: "avgExpenditure", format: (d) => fv(d, 0), numeric: true },
      { key: "avgNetCal", format: (d) => fv(d, 0), numeric: true },
    ];

    const tbody = tableWrapper.select("tbody");
    const rows = tbody.selectAll("tr").data(sortedData, (d) => d.weekKey);

    rows.join(
      (enter) => {
        const tr = enter.append("tr");
        rowColumns.forEach((col) => {
          tr.append("td")
            .attr("class", col.numeric ? "number" : null)
            .text((d) => (d[col.key] != null ? col.format(d[col.key]) : "N/A")); // Handle nulls
        });
        return tr;
      },
      (update) => {
        update
          .selectAll("td")
          .data((d) =>
            rowColumns.map((col) => ({
              value: d[col.key],
              format: col.format,
              numeric: col.numeric,
            })),
          )
          .attr("class", (d) => (d.numeric ? "number" : null))
          .text((d) => (d.value != null ? d.format(d.value) : "N/A")); // Handle nulls
        return update;
      },
      (exit) => exit.remove(),
    );
  },

  init() {
    // Subscribe to events carrying the necessary data and sort options
    StateManager.subscribe((stateChanges) => {
      // Check if relevant state parts changed
      if (
        stateChanges.action.type.includes("WEEKLY_SUMMARY") ||
        stateChanges.action.type.includes("SORT_OPTIONS")
      ) {
        // Extract needed data from the new state using selectors
        const newState = stateChanges.newState;
        const weeklyData = Selectors.selectWeeklySummaryData(newState);
        const { columnKey: sortKey, direction: sortDir } =
          Selectors.selectSortOptions(newState);
        this._renderTable({ weeklyData, sortKey, sortDir });
      }
    });
    console.log(
      "[WeeklySummaryUpdater Init] Subscribed to relevant state changes.",
    );
    // Perform initial render based on current state
    const initialState = StateManager.getState();
    const initialWeeklyData = Selectors.selectWeeklySummaryData(initialState);
    const { columnKey: initialSortKey, direction: initialSortDir } =
      Selectors.selectSortOptions(initialState);
    this._renderTable({
      weeklyData: initialWeeklyData,
      sortKey: initialSortKey,
      sortDir: initialSortDir,
    });
  },
};
