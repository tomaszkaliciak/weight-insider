// js/ui/widgetOrderManager.js
// Persists and restores user-defined bento widget order.
// Uses SortableJS to enable drag-and-drop reordering by widget header.

import Sortable from 'sortablejs';

const STORAGE_KEY = 'weightInsiderWidgetOrderV1';

function getOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrder(orderedIds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orderedIds));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

export const WidgetOrderManager = {
  _sortable: null,

  /**
   * Read the saved order from localStorage and reorder bento-canvas children
   * to match. Must be called BEFORE WidgetCollapser.init() and renderer inits
   * so the DOM order is correct before any content is rendered.
   */
  applyOrder() {
    const canvas = document.querySelector('.bento-canvas');
    if (!canvas) return;

    const savedOrder = getOrder();
    if (savedOrder.length === 0) return;

    // Build a map of id -> element from current DOM
    const elements = new Map();
    canvas.querySelectorAll(':scope > .bento-widget').forEach((el) => {
      if (el.id) elements.set(el.id, el);
    });

    // Validate: saved order must reference the same set of IDs
    const currentIds = new Set(elements.keys());
    const savedSet = new Set(savedOrder);
    const isSameSet =
      savedOrder.every((id) => currentIds.has(id)) &&
      currentIds.size === savedSet.size;

    if (!isSameSet) {
      // Stale order — clear it so the default HTML order is used
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    // Re-append in saved order (moves each node to the end in sequence)
    savedOrder.forEach((id) => {
      const el = elements.get(id);
      if (el) canvas.appendChild(el);
    });
  },

  /**
   * Attach SortableJS to the bento-canvas.
   * Call this AFTER all renderers have been initialised (so chart SVGs etc.
   * are already in the DOM) to avoid interfering with content setup.
   */
  initSortable() {
    const canvas = document.querySelector('.bento-canvas');
    if (!canvas || this._sortable) return;

    this._sortable = Sortable.create(canvas, {
      animation: 200,
      handle: '.widget-header',
      draggable: '.bento-widget',
      ghostClass: 'widget-drag-ghost',
      chosenClass: 'widget-drag-chosen',
      dragClass: 'widget-dragging',
      // Ignore collapse-btn clicks so they don't accidentally start a drag
      filter: '.widget-collapse-btn',
      onEnd() {
        const orderedIds = [...canvas.querySelectorAll(':scope > .bento-widget')]
          .filter((el) => el.id)
          .map((el) => el.id);
        saveOrder(orderedIds);
      },
    });
  },
};
