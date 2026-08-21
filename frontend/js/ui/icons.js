// js/ui/icons.js
// Inline Lucide-style SVG icons. Avoids npm dependency and keeps bundle tiny.
// Icons inherit currentColor, so they theme automatically.

const _paths = {
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  scale: '<circle cx="12" cy="12" r="9"/><path d="M7 9h10"/><path d="M12 4v5"/>',
  chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  refeed: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/><path d="M21 3v6h-6"/>',
  arrowUp: '<path d="m18 15-6-6-6 6"/>',
  arrowDown: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  success: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  sparkle: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
};

/**
 * Render an inline Lucide SVG string.
 * @param {string} name - key from the icon table
 * @param {object} opts
 * @param {number} [opts.size=16]
 * @param {string} [opts.cls=''] extra classes
 * @param {number} [opts.stroke=2]
 * @returns {string} SVG markup
 */
export function icon(name, opts = {}) {
  const { size = 16, cls = '', stroke = 2 } = opts;
  const body = _paths[name];
  if (!body) {
    console.warn(`[icons] unknown icon "${name}"`);
    return '';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" class="lucide ${cls}" aria-hidden="true">${body}</svg>`;
}

export const ICONS = _paths;
