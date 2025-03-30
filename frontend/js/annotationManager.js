// annotationManager.js
// Handles loading, saving, adding, removing, and rendering annotations.

import { state } from "./state.js";
import { ui } from "./uiCache.js";
import { CONFIG } from "./config.js";
import { Utils } from "./utils.js";
// Import updaters needed when annotations change
import { FocusChartUpdater } from "./chartUpdaters.js";
import { LegendManager } from "./legendManager.js"; // Legend might show/hide based on annotations

export const AnnotationManager = {
  /**
   * Loads annotations from localStorage into the application state.
   */
  load() {
    const stored = localStorage.getItem(CONFIG.localStorageKeys.annotations);
    state.annotations = []; // Reset state array

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Validate and sanitize loaded annotations
          state.annotations = parsed
            .map((a) => ({
              // Ensure required fields exist and assign default ID if missing
              id: a.id ?? Date.now() + Math.random(), // Generate unique ID if missing
              date: a.date, // Expecting 'YYYY-MM-DD' string
              text: a.text || "", // Ensure text is a string
              type: a.type === "range" ? "range" : "point", // Default to 'point'
            }))
            .filter(
              (a) =>
                // Basic validation: date must be present and look like YYYY-MM-DD
                a.date &&
                typeof a.text === "string" &&
                /^\d{4}-\d{2}-\d{2}$/.test(a.date),
            );
        }
      } catch (e) {
        console.error(
          "AnnotationManager: Error loading/parsing annotations:",
          e,
        );
      }
    }
    // Sort annotations by date after loading/parsing
    state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date));
    // Render the list initially
    this.renderList();
    console.log(
      `AnnotationManager: Loaded ${state.annotations.length} annotations.`,
    );
  },

  /**
   * Saves the current annotations from the state to localStorage.
   */
  save() {
    try {
      // Only save relevant fields
      const annotationsToSave = state.annotations.map(
        ({ id, date, text, type }) => ({ id, date, text, type }),
      );
      localStorage.setItem(
        CONFIG.localStorageKeys.annotations,
        JSON.stringify(annotationsToSave),
      );
    } catch (e) {
      console.error("AnnotationManager: Error saving annotations:", e);
      Utils.showStatusMessage(
        "Could not save annotations due to storage error.",
        "error",
      );
    }
  },

  /**
   * Adds a new annotation to the state and saves it.
   * @param {string} dateStr - The date string ('YYYY-MM-DD').
   * @param {string} text - The annotation text.
   * @param {'point'|'range'} [type='point'] - The type of annotation.
   * @returns {boolean} True if the annotation was added successfully, false otherwise.
   */
  add(dateStr, text, type = "point") {
    const date = new Date(dateStr);
    // Validate date and text
    if (isNaN(date.getTime()) || !text || text.trim().length === 0) {
      Utils.showStatusMessage(
        "Annotation requires a valid date and non-empty text.",
        "error",
      );
      return false;
    }
    // Normalize date to midnight UTC for consistent comparison/storage
    date.setUTCHours(0, 0, 0, 0);

    const newAnnotation = {
      id: Date.now() + Math.random(), // Simple unique ID
      date: date.toISOString().slice(0, 10), // Store as 'YYYY-MM-DD'
      text: text.trim(),
      type: type === "range" ? "range" : "point", // Validate type
    };

    state.annotations.push(newAnnotation);
    // Re-sort after adding
    state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date));

    this.save(); // Save changes
    this.renderList(); // Update the UI list
    // Update the chart markers (assuming FocusChartUpdater is available)
    if (
      typeof FocusChartUpdater !== "undefined" &&
      FocusChartUpdater.updateAnnotations
    ) {
      FocusChartUpdater.updateAnnotations(state.filteredData); // Update markers on chart
    }
    // Rebuild legend in case the annotation item needs to appear/disappear
    if (typeof LegendManager !== "undefined" && LegendManager.build) {
      LegendManager.build();
    }

    Utils.showStatusMessage("Annotation added.", "success", 1500);
    return true;
  },

  /**
   * Removes an annotation by its ID.
   * @param {number|string} id - The unique ID of the annotation to remove.
   */
  remove(id) {
    const initialLength = state.annotations.length;
    state.annotations = state.annotations.filter((a) => a.id !== id);

    // Check if an annotation was actually removed
    if (state.annotations.length < initialLength) {
      this.save(); // Save changes
      this.renderList(); // Update the UI list
      // Update the chart markers (assuming FocusChartUpdater is available)
      if (
        typeof FocusChartUpdater !== "undefined" &&
        FocusChartUpdater.updateAnnotations
      ) {
        FocusChartUpdater.updateAnnotations(state.filteredData); // Update markers on chart
      }
      // Rebuild legend in case the annotation item needs to appear/disappear
      if (typeof LegendManager !== "undefined" && LegendManager.build) {
        LegendManager.build();
      }
      Utils.showStatusMessage("Annotation removed.", "info", 1500);
    }
  },

  /**
   * Finds the first annotation matching a specific date.
   * @param {Date} targetDate - The date to search for.
   * @returns {object|null} The annotation object or null if not found.
   */
  findAnnotationByDate(targetDate) {
    if (!(targetDate instanceof Date) || isNaN(targetDate)) return null;
    // Normalize target date to midnight UTC for comparison
    const targetTime = new Date(targetDate).setUTCHours(0, 0, 0, 0);

    return state.annotations.find((a) => {
      // Parse annotation date string and normalize to midnight UTC
      const annoDate = new Date(a.date);
      return (
        !isNaN(annoDate.getTime()) &&
        annoDate.setUTCHours(0, 0, 0, 0) === targetTime
      );
    });
  },

  /**
   * Handles the submission of the annotation form.
   * @param {Event} event - The form submission event.
   */
  handleSubmit(event) {
    event.preventDefault(); // Prevent default form submission
    const dateVal = ui.annotationDateInput?.property("value");
    const textVal = ui.annotationTextInput?.property("value");

    if (this.add(dateVal, textVal)) {
      // Use 'this' to call the add method
      // Clear the form fields on successful addition
      ui.annotationDateInput?.property("value", "");
      ui.annotationTextInput?.property("value", "");
    }
  },

  /**
   * Renders the list of annotations in the UI.
   */
  renderList() {
    const list = ui.annotationList; // Get the cached list element
    if (!list || list.empty()) {
      console.warn("AnnotationManager: Annotation list UI element not found.");
      return;
    }

    // Clear current list content
    list.html("");

    // Display message if no annotations
    if (state.annotations.length === 0) {
      list
        .append("li")
        .attr("class", "empty-msg")
        .text("No annotations added yet.");
      return;
    }

    // Use D3 data join to render list items
    const items = list
      .selectAll("li.annotation-list-item")
      .data(state.annotations, (d) => d.id) // Key by unique ID
      .join("li")
      .attr("class", "annotation-list-item"); // Ensure class for styling

    // Append date span
    items
      .append("span")
      .attr("class", "annotation-date")
      .text((d) => Utils.formatDateShort(new Date(d.date))); // Format date

    // Append text span
    items
      .append("span")
      .attr("class", "annotation-text")
      .text((d) => d.text); // Display text

    // Append remove button
    items
      .append("button")
      .attr("class", "remove-annotation")
      .attr("aria-label", "Remove annotation")
      .html("×") // 'x' character
      .on("click", (event, d) => {
        event.stopPropagation(); // Prevent potential event bubbling
        this.remove(d.id); // Use 'this' to call remove method
      });
  },
};
