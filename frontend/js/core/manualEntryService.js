// js/core/manualEntryService.js
// Persists manually-entered weight/calorie records to localStorage and
// merges them with data.json on load so the app works even without the backend.

const STORAGE_KEY = "weightInsiderManualEntriesV1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function save(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded — silently ignore
  }
}

export const ManualEntryService = {
  /**
   * Returns the raw stored entries object: { "YYYY-MM-DD": { weight?, calories? } }
   */
  getAll() {
    return load();
  },

  /**
   * Saves or updates a manual entry for the given date.
   * Fields that are null/undefined are ignored (existing values kept).
   * @param {string} dateStr - "YYYY-MM-DD"
   * @param {{ weight?: number|null, calories?: number|null }} fields
   */
  upsert(dateStr, fields) {
    const entries = load();
    if (!entries[dateStr]) entries[dateStr] = {};
    if (fields.weight != null && !isNaN(fields.weight)) {
      entries[dateStr].weight = Number(fields.weight);
    }
    if (fields.calories != null && !isNaN(fields.calories)) {
      entries[dateStr].calories = Math.round(Number(fields.calories));
    }
    save(entries);
  },

  /**
   * Removes a manual entry for the given date.
   * @param {string} dateStr - "YYYY-MM-DD"
   */
  remove(dateStr) {
    const entries = load();
    delete entries[dateStr];
    save(entries);
  },

  /**
   * Merges manual entries into the raw data object returned by DataService.fetchData().
   * Manual entries take precedence for weight and calories only for dates where
   * the backend did not provide a value.
   * @param {object} rawDataObjects - The object from data.json
   * @returns {object} Merged raw data object
   */
  mergeInto(rawDataObjects) {
    const entries = load();
    if (Object.keys(entries).length === 0) return rawDataObjects;

    const merged = { ...rawDataObjects };
    // Ensure the maps exist
    merged.weights = { ...merged.weights };
    merged.calorieIntake = { ...merged.calorieIntake };

    for (const [dateStr, { weight, calories }] of Object.entries(entries)) {
      if (weight != null) {
        merged.weights[dateStr] = weight;
      }
      if (calories != null) {
        merged.calorieIntake[dateStr] = calories;
      }
    }

    return merged;
  },
};
