// Hidden widgets leave the bento grid. Separate from collapse.
// userHidden persists; presetHidden and dataHidden are in-memory and never written to storage.

const STORAGE_KEY = "weightInsiderHiddenWidgetsV1";

let _userHidden = new Set();
let _presetHidden = new Set();
let _dataHidden = new Set();

function loadHidden() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveHidden(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // quota
  }
}

function effectiveSet() {
  return new Set([..._userHidden, ..._presetHidden, ..._dataHidden]);
}

function applyToDom(set) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".bento-widget").forEach((widget) => {
    if (!widget.id) return;
    widget.classList.toggle("widget-hidden", set.has(widget.id));
  });
}

export const WidgetVisibility = {
  STORAGE_KEY,

  init() {
    _userHidden = loadHidden();
    this.apply();
  },

  apply() {
    applyToDom(effectiveSet());
  },

  isHidden(id) {
    return _userHidden.has(id);
  },

  isEffectivelyHidden(id) {
    return _userHidden.has(id) || _presetHidden.has(id) || _dataHidden.has(id);
  },

  getHiddenSet() {
    return new Set(_userHidden);
  },

  getPresetHiddenSet() {
    return new Set(_presetHidden);
  },

  setPresetHidden(ids) {
    _presetHidden = new Set(Array.isArray(ids) || ids instanceof Set ? ids : []);
    this.apply();
  },

  getDataHiddenSet() {
    return new Set(_dataHidden);
  },

  setDataHidden(ids) {
    _dataHidden = new Set(Array.isArray(ids) || ids instanceof Set ? ids : []);
    this.apply();
  },

  hide(id) {
    if (!id) return;
    _userHidden.add(id);
    saveHidden(_userHidden);
    this.apply();
  },

  show(id) {
    if (!id) return;
    _userHidden.delete(id);
    _presetHidden.delete(id);
    _dataHidden.delete(id);
    saveHidden(_userHidden);
    this.apply();
  },

  setHidden(id, hidden) {
    if (hidden) this.hide(id);
    else this.show(id);
  },

  showAll() {
    _userHidden = new Set();
    saveHidden(_userHidden);
    this.apply();
  },

  listHideableWidgets() {
    if (typeof document === "undefined") return [];
    return [...document.querySelectorAll(".bento-widget")]
      .filter((w) => w.id)
      .map((w) => {
        const named = w.querySelector("#chart-section-heading, .widget-header, .text-subhero");
        let title = w.id;
        if (named) {
          title = (named.id === "chart-section-heading"
            ? named.textContent
            : named.childNodes[0]?.textContent || named.textContent
          ).replace(/\s+/g, " ").trim();
        }
        return { id: w.id, title: title || w.id };
      });
  },
};
