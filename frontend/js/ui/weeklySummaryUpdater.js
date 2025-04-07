// weeklySummaryUpdater.js
// Handles rendering and sorting the weekly summary table.

import { ui } from "./uiCache.js";
import { state } from "../state.js";
import { Utils } from "../core/utils.js";
import { EventBus } from "../core/eventBus.js";

export const WeeklySummaryUpdater = {
  /**
   * Sorts the weekly summary data based on the current state.
   * @param {Array<object>} data - The array of weekly summary objects.
   * @param {string} key - The key to sort by (e.g., 'weekStartDate', 'avgWeight').
   * @param {'asc'|'desc'} direction - The sort direction.
   * @returns {Array<object>} The sorted array.
   */
  _sortData(data, key, direction) {
    if (!key || !Array.isArray(data)) return data; // No sorting if key or data is invalid

    const isAsc = direction === "asc";

    // Create a copy to avoid mutating the original data in state directly during sort
    const dataToSort = [...data];

    dataToSort.sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      // Handle null/undefined consistently (push to bottom regardless of direction)
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1; // a is null/undefined, b is not -> b comes first (effectively pushing nulls down)
      if (valB == null) return -1; // b is null/undefined, a is not -> a comes first (effectively pushing nulls down)

      // Specific type comparisons
      if (valA instanceof Date && valB instanceof Date) {
        // For dates, subtract directly
        return isAsc
          ? valA.getTime() - valB.getTime()
          : valB.getTime() - valA.getTime();
      }
      if (typeof valA === "number" && typeof valB === "number") {
        // For numbers, subtract directly
        return isAsc ? valA - valB : valB - valA;
      }
      // Fallback for strings or other types (less likely needed for this table data)
      if (typeof valA === "string" && typeof valB === "string") {
        return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      // If types differ or aren't comparable, maintain original relative order
      return 0;
    });

    return dataToSort;
  },

  weeklyData(data) {
    weeklyData = data.weeklySummaryData;
    const container = ui.weeklySummaryContainer; // Use cached container
    if (!container || container.empty()) {
      console.warn("WeeklySummaryUpdater: Container element not found.");
      return;
    }

    // Remove loading message if it exists
    container.select(".loading-msg").remove();

    // Get or create necessary elements
    let emptyMsg = container.select(".empty-msg");
    let tableWrapper = container.select(".table-wrapper");

    // --- Handle Empty/Invalid Data ---
    if (!Array.isArray(weeklyData) || weeklyData.length === 0) {
      tableWrapper.remove(); // Remove table if data is empty
      if (emptyMsg.empty()) {
        // Create empty message if it doesn't exist
        container
          .append("p")
          .attr("class", "empty-msg")
          .text("No weekly data available for the selected analysis range.");
      } else {
        // Show existing empty message
        emptyMsg.style("display", null);
      }
      return; // Stop processing
    }

    // --- Data is Available ---
    emptyMsg?.style("display", "none"); // Hide empty message

    // --- Create Table Structure if it doesn't exist ---
    let thead, tbody;
    if (tableWrapper.empty()) {
      tableWrapper = container.append("div").attr("class", "table-wrapper");
      const table = tableWrapper.append("table").attr("class", "summary-table"); // Use specific class if needed
      thead = table.append("thead");
      tbody = table.append("tbody");

      // Define table columns configuration
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
        {
          key: "avgIntake",
          label: "Avg Intake",
          numeric: true,
          sortable: true,
        },
        {
          key: "avgExpenditure",
          label: "Avg GFit",
          numeric: true,
          sortable: true,
        },
        { key: "avgNetCal", label: "Avg Net", numeric: true, sortable: true },
      ];

      // Create table header row
      thead
        .append("tr")
        .selectAll("th")
        .data(columnsConfig)
        .join("th")
        .attr("class", (d) =>
          `${d.numeric ? "numeric" : ""} ${d.sortable ? "sortable" : ""}`.trim(),
        )
        // Set initial sort classes based on state
        .classed(
          "sorted-asc",
          (d) =>
            d.sortable &&
            d.key === state.sortColumnKey &&
            state.sortDirection === "asc",
        )
        .classed(
          "sorted-desc",
          (d) =>
            d.sortable &&
            d.key === state.sortColumnKey &&
            state.sortDirection === "desc",
        )
        .text((d) => d.label)
        // Add click listener for sorting
        .on("click", (event, d) => {
          if (!d.sortable) return; // Ignore click if column is not sortable

          if (d.key === state.sortColumnKey) {
            // Clicked on the currently sorted column: flip direction
            state.sortDirection =
              state.sortDirection === "asc" ? "desc" : "asc";
          } else {
            // Clicked on a new column: sort ascending by default
            state.sortColumnKey = d.key;
            state.sortDirection = "asc";
          }

          // Update header classes immediately for visual feedback
          thead
            .selectAll("th.sortable")
            .classed(
              "sorted-asc",
              (col) =>
                col.key === state.sortColumnKey &&
                state.sortDirection === "asc",
            )
            .classed(
              "sorted-desc",
              (col) =>
                col.key === state.sortColumnKey &&
                state.sortDirection === "desc",
            );

          // Re-render the table body with sorted data
          this.updateTable(state.weeklySummaryData); // Call self to re-render body
        });
    } else {
      // Table structure already exists, get references
      thead = tableWrapper.select("thead");
      tbody = tableWrapper.select("tbody");
    }

    // --- Prepare and Sort Data for Rows ---
    const sortedData = this._sortData(
      [...weeklyData],
      state.sortColumnKey,
      state.sortDirection,
    ); // Sort a copy

    // --- Define Cell Formatting ---
    const fv = Utils.formatValue;
    const fd = Utils.formatDateShort;
    // Define columns for data binding rows
    const rowColumns = [
      { key: "weekStartDate", format: fd, numeric: false },
      { key: "avgWeight", format: (d) => fv(d, 1), numeric: true },
      { key: "weeklyRate", format: (d) => fv(d, 2), numeric: true },
      { key: "avgIntake", format: (d) => fv(d, 0), numeric: true },
      { key: "avgExpenditure", format: (d) => fv(d, 0), numeric: true },
      { key: "avgNetCal", format: (d) => fv(d, 0), numeric: true },
    ];

    // --- Bind Data and Update Rows/Cells ---
    const rows = tbody.selectAll("tr").data(sortedData, (d) => d.weekKey); // Use weekKey as the unique identifier

    rows.join(
      (enter) => {
        const tr = enter.append("tr");
        // Append cells based on column definitions
        rowColumns.forEach((col) => {
          tr.append("td")
            .attr("class", col.numeric ? "number" : null) // Use 'number' class from CSS
            .text((d) => col.format(d[col.key]));
        });
        return tr;
      },
      (update) => {
        // Update existing cells efficiently
        update
          .selectAll("td")
          // Re-bind data for each cell in the row
          .data((d) =>
            rowColumns.map((col) => ({
              value: d[col.key],
              format: col.format,
              numeric: col.numeric,
            })),
          )
          .attr("class", (d) => (d.numeric ? "number" : null)) // Update class
          .text((d) => d.format(d.value)); // Update text content
        return update;
      },
      (exit) => exit.remove(), // Remove rows that are no longer in the data
    );
  },
};

EventBus.subscribe("state:statsUpdated", WeeklySummaryUpdater.weeklyData);
