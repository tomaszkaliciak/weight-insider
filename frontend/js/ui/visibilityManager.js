/**
 * js/ui/visibilityManager.js
 * Optimized utility to track the visibility of UI components using IntersectionObserver.
 * Helps prevent expensive re-renders (like D3 charts or complex grids) for components
 * that are not currently visible or are in collapsed tabs.
 */

export const VisibilityManager = {
    _observer: null,
    _visibilityMap: new Map(), // Element -> isVisible (boolean)
    _callbacks: new Map(),      // Element -> Array of visibility change callbacks

    init() {
        if (this._observer) return;

        this._observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const isVisible = entry.isIntersecting;
                const wasVisible = this._visibilityMap.get(entry.target);

                if (isVisible !== wasVisible) {
                    this._visibilityMap.set(entry.target, isVisible);
                    this._triggerCallbacks(entry.target, isVisible);
                }
            });
        }, {
            threshold: 0.1 // Trigger when 10% of the element is visible
        });
    },

    /**
     * Start observing an element for visibility changes.
     * @param {HTMLElement} element - The DOM element to track.
     * @param {Function} callback - Function called with (isVisible, element).
     */
    observe(element, callback) {
        if (!element) return;
        this.init();

        this._observer.observe(element);

        if (!this._callbacks.has(element)) {
            this._callbacks.set(element, []);
        }
        this._callbacks.get(element).push(callback);

        // Immediate callback with current state if known
        if (this._visibilityMap.has(element)) {
            callback(this._visibilityMap.get(element), element);
        }
    },

    /**
     * Stop observing an element.
     */
    unobserve(element) {
        if (!element || !this._observer) return;
        this._observer.unobserve(element);
        this._visibilityMap.delete(element);
        this._callbacks.delete(element);
    },

    /**
     * Check if an element is currently visible.
     */
    isVisible(element) {
        if (!element) return false;
        return this._visibilityMap.get(element) || false;
    },

    _triggerCallbacks(element, isVisible) {
        const list = this._callbacks.get(element);
        if (list) {
            list.forEach(cb => cb(isVisible, element));
        }
    }
};
