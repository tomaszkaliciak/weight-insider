// js/ui/animatedNumbers.js
// Provides smooth animated counting effect for stat values

/**
 * AnimatedNumbers module handles smooth number transitions
 * for statistics and counters across the application.
 */
export const AnimatedNumbers = {
    _activeAnimations: new Map(),

    /**
     * Animates a numeric value from current to target.
     * @param {HTMLElement} element - The DOM element to animate
     * @param {number} targetValue - The target number value
     * @param {Object} options - Animation options
     */
    animate(element, targetValue, options = {}) {
        if (!element || targetValue == null || isNaN(targetValue)) {
            if (element && targetValue === null) {
                element.textContent = 'N/A';
            }
            return;
        }

        const {
            suffix = '',
            prefix = '',
            decimals = 1,
            duration = 400,
            formatter = null
        } = options;

        // Cancel existing animation on this element
        const existingAnimation = this._activeAnimations.get(element);
        if (existingAnimation) {
            cancelAnimationFrame(existingAnimation);
        }

        // Get current value from element
        const currentText = element.textContent || '0';
        const currentValue = parseFloat(currentText.replace(/[^\d.-]/g, '')) || 0;

        // Skip animation if values match
        if (Math.abs(currentValue - targetValue) < 0.001) {
            return;
        }

        const startTime = performance.now();
        const valueDiff = targetValue - currentValue;
        const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

        const animateStep = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutQuart(progress);
            const currentAnimatedValue = currentValue + (valueDiff * easedProgress);

            // Format value
            let displayValue;
            if (formatter) {
                displayValue = formatter(currentAnimatedValue);
            } else {
                const sign = prefix && currentAnimatedValue > 0 ? '+' : '';
                displayValue = `${sign}${currentAnimatedValue.toFixed(decimals)}`;
            }

            element.textContent = `${displayValue}${suffix ? ' ' + suffix : ''}`.trim();

            if (progress < 1) {
                const frameId = requestAnimationFrame(animateStep);
                this._activeAnimations.set(element, frameId);
            } else {
                this._activeAnimations.delete(element);
            }
        };

        const frameId = requestAnimationFrame(animateStep);
        this._activeAnimations.set(element, frameId);
    },

    /**
     * Cancels all active animations.
     */
    cancelAll() {
        this._activeAnimations.forEach((frameId) => {
            cancelAnimationFrame(frameId);
        });
        this._activeAnimations.clear();
    }
};
