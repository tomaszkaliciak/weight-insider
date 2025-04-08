import { state } from "../state.js";
import { ui } from "../ui/uiCache.js";
import { CONFIG } from "../config.js";
import { Utils } from "./utils.js";
import { EventBus } from "./eventBus.js";

export const AnnotationManager = {
  load() {
    const stored = localStorage.getItem(CONFIG.localStorageKeys.annotations);
    state.annotations = [];

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          state.annotations = parsed
            .map((a) => ({
              id: a.id ?? Date.now() + Math.random(),
              date: a.date,
              text: a.text || "",
              // TODO: implement annotated range in UI
              type: a.type === "range" ? "range" : "point",
            }))
            .filter(
              (a) =>
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
    state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log(
      `AnnotationManager: Loaded ${state.annotations.length} annotations.`,
    );
  },

  save() {
    try {
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

    if (isNaN(date.getTime()) || !text || text.trim().length === 0) {
      Utils.showStatusMessage(
        "Annotation requires a valid date and non-empty text.",
        "error",
      );
      return false;
    }

    date.setUTCHours(0, 0, 0, 0);

    const newAnnotation = {
      id: Date.now() + Math.random(),
      date: date.toISOString().slice(0, 10),
      text: text.trim(),
      type: type === "range" ? "range" : "point",
    };

    state.annotations.push(newAnnotation);
    state.annotations.sort((a, b) => new Date(a.date) - new Date(b.date));

    this.save();

    EventBus.publish("state::annotationUpdate", state);

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

    if (state.annotations.length < initialLength) {
      this.save();

      EventBus.publish("state::annotationUpdate", state);
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
    event.preventDefault();
    const dateVal = ui.annotationDateInput?.property("value");
    const textVal = ui.annotationTextInput?.property("value");

    if (this.add(dateVal, textVal)) {
      ui.annotationDateInput?.property("value", "");
      ui.annotationTextInput?.property("value", "");
    }
  },
};
