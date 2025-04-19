// js/core/annotationManager.js
// Handles loading, saving, adding, and removing annotations, interacting with StateManager.

import { StateManager } from "./stateManager.js";
import { ui } from "../ui/uiCache.js"; // Still needed for form input access in handleSubmit
import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";
import * as Selectors from "./selectors.js"; // Import selectors

export const AnnotationManager = {
  /**
   * Loads annotations from localStorage and dispatches action to update state.
   */
  load() {
    const stored = localStorage.getItem(CONFIG.localStorageKeys.annotations);
    let loadedAnnotations = [];

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Validate and structure loaded annotations
          loadedAnnotations = parsed
            .map((a) => ({
              id: a.id ?? Date.now() + Math.random(), // Ensure ID exists
              date: a.date, // Expect 'YYYY-MM-DD' string
              text: a.text || "", // Ensure text is string
              type: a.type === "range" ? "range" : "point", // Default to 'point'
            }))
            .filter(
              // Basic validation
              (a) =>
                a.id &&
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
        localStorage.removeItem(CONFIG.localStorageKeys.annotations); // Clear invalid data
      }
    }
    // Annotations are sorted by the renderer if needed

    StateManager.dispatch({
      type: "LOAD_ANNOTATIONS",
      payload: loadedAnnotations,
    });
    console.log(
      `AnnotationManager: Dispatched LOAD_ANNOTATIONS with ${loadedAnnotations.length} annotations.`,
    );
    // AnnotationListRenderer handles the UI update via subscription
  },

  /**
   * Saves the current annotations state to localStorage.
   */
  save() {
    try {
      // Read the current annotations directly from the state using a selector
      const currentAnnotations = Selectors.selectAnnotations(
        StateManager.getState(),
      );

      // Prepare for storage (ensure only necessary fields are saved)
      const annotationsToSave = currentAnnotations.map(
        ({ id, date, text, type }) => ({ id, date, text, type }),
      );
      localStorage.setItem(
        CONFIG.localStorageKeys.annotations,
        JSON.stringify(annotationsToSave),
      );
      console.log(
        `AnnotationManager: Saved ${annotationsToSave.length} annotations.`,
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
   * Dispatches action to add a new annotation, then saves.
   * @param {string} dateStr - The date string ('YYYY-MM-DD').
   * @param {string} text - The annotation text.
   * @param {'point'|'range'} [type='point'] - The type of annotation.
   * @returns {boolean} True if the dispatch was successful, false otherwise.
   */
  add(dateStr, text, type = "point") {
    // Basic validation before dispatching
    const date = new Date(dateStr + "T00:00:00"); // Parse as local midnight
    if (isNaN(date.getTime()) || !text || text.trim().length === 0) {
      Utils.showStatusMessage(
        "Annotation requires a valid date and non-empty text.",
        "error",
      );
      return false;
    }

    // Format date consistently before creating the object
    const formattedDateStr = Utils.formatDate(date); // Ensure YYYY-MM-DD

    const newAnnotation = {
      id: `anno_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, // Slightly more unique ID
      date: formattedDateStr,
      text: text.trim(),
      type: type === "range" ? "range" : "point",
    };

    StateManager.dispatch({ type: "ADD_ANNOTATION", payload: newAnnotation });
    this.save(); // Save after state update

    // UI Render is handled by AnnotationListRenderer subscription
    return true;
  },

  /**
   * Dispatches action to remove an annotation by its ID, then saves.
   * @param {number|string} id - The unique ID of the annotation to remove.
   */
  remove(id) {
    StateManager.dispatch({ type: "DELETE_ANNOTATION", payload: { id } });
    this.save(); // Save after state update

    // UI Render is handled by AnnotationListRenderer subscription
  },

  /**
   * Finds the first annotation matching a specific date from the current state.
   * @param {Date} targetDate - The date to search for.
   * @returns {object|null} The annotation object or null if not found.
   */
  findAnnotationByDate(targetDate) {
    if (!(targetDate instanceof Date) || isNaN(targetDate)) return null;
    const targetTime = new Date(targetDate).setHours(0, 0, 0, 0); // Normalize target date (use local timezone)

    // Read current annotations from state using selector
    const currentAnnotations = Selectors.selectAnnotations(
      StateManager.getState(),
    );

    return currentAnnotations.find((a) => {
      // Parse annotation date string and normalize (use local timezone)
      const annoDate = new Date(a.date + "T00:00:00");
      return (
        !isNaN(annoDate.getTime()) &&
        annoDate.setHours(0, 0, 0, 0) === targetTime
      );
    });
  },

  /**
   * Handles the submission of the annotation form. Reads UI, calls add, clears form.
   * @param {Event} event - The form submission event.
   */
  handleSubmit(event) {
    event.preventDefault();
    const dateVal = ui.annotationDateInput?.property("value");
    const textVal = ui.annotationTextInput?.property("value");

    if (this.add(dateVal, textVal)) {
      // Calls internal add method (which dispatches)
      // Clear form only on successful add dispatch attempt
      ui.annotationDateInput?.property("value", "");
      ui.annotationTextInput?.property("value", "");
      Utils.showStatusMessage("Annotation added.", "success", 1500); // Show status after successful add call
    }
  },

  /**
   * Initializes the AnnotationManager by loading saved annotations.
   */
  init() {
    this.load();
    console.log("[AnnotationManager Init] Initialized and loaded annotations.");
  },
};
