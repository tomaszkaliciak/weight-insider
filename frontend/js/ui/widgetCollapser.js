// js/ui/widgetCollapser.js
// Adds collapse/expand behaviour to all bento widget headers.
// Collapsed state is persisted to localStorage so it survives page reloads.
// Exposes applyCollapsedSet() so dashboard presets can programmatically
// set which widgets are expanded.

const STORAGE_KEY = "widgetInsiderCollapsedV1";

// Module-level state so applyCollapsedSet can mutate it.
let _collapsedSet = new Set();
// Registry: widgetId -> { widget: HTMLElement, chevron: HTMLElement }
const _registry = new Map();

function loadCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveCollapsed(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

function collapse(widget, collapsed, chevron) {
  const body = widget.querySelector(".widget-body");
  if (!body) return;

  if (collapsed) {
    body.style.display = "none";
    widget.classList.add("widget-collapsed");
    chevron.style.transform = "rotate(-90deg)";
    chevron.setAttribute("aria-label", "Expand widget");
  } else {
    body.style.display = "";
    widget.classList.remove("widget-collapsed");
    chevron.style.transform = "";
    chevron.setAttribute("aria-label", "Collapse widget");
  }
}

export const WidgetCollapser = {
  init() {
    _collapsedSet = loadCollapsed();
    const widgets = document.querySelectorAll(".bento-widget");

    widgets.forEach((widget) => {
      const header = widget.querySelector(".widget-header");
      if (!header) return;

      const widgetId =
        widget.id ||
        header.textContent.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      if (!widgetId) return;

      const chevronBtn = document.createElement("button");
      chevronBtn.className = "widget-collapse-btn";
      chevronBtn.setAttribute("aria-label", "Collapse widget");
      chevronBtn.setAttribute("type", "button");
      chevronBtn.setAttribute("title", "Collapse / expand");
      chevronBtn.innerHTML = `<svg viewBox="0 0 10 6" width="10" height="10" aria-hidden="true">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>`;
      chevronBtn.style.transition = "transform 0.2s ease";

      header.appendChild(chevronBtn);

      const body = document.createElement("div");
      body.className = "widget-body";
      const children = [...widget.children].filter((c) => c !== header);
      children.forEach((c) => body.appendChild(c));
      widget.appendChild(body);

      // Register for later programmatic access
      _registry.set(widgetId, { widget, chevron: chevronBtn });

      // Apply saved collapsed state
      const isCollapsed = _collapsedSet.has(widgetId);
      collapse(widget, isCollapsed, chevronBtn);

      chevronBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nowCollapsed = !widget.classList.contains("widget-collapsed");
        collapse(widget, nowCollapsed, chevronBtn);
        if (nowCollapsed) {
          _collapsedSet.add(widgetId);
        } else {
          _collapsedSet.delete(widgetId);
        }
        saveCollapsed(_collapsedSet);
      });
    });
  },

  /**
   * Programmatically apply a new collapsed set (used by dashboard presets).
   * @param {Set<string>} newSet - Set of widget IDs that should be collapsed.
   */
  applyCollapsedSet(newSet) {
    _collapsedSet = new Set(newSet);
    saveCollapsed(_collapsedSet);
    _registry.forEach(({ widget, chevron }, widgetId) => {
      collapse(widget, _collapsedSet.has(widgetId), chevron);
    });
  },

  /** Returns the current collapsed set (read-only copy). */
  getCollapsedSet() {
    return new Set(_collapsedSet);
  },

  /** Returns all registered widget IDs. */
  getWidgetIds() {
    return [..._registry.keys()];
  },
};
