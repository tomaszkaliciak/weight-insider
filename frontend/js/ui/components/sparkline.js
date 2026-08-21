// js/ui/components/sparkline.js
// Tiny inline SVG trend charts for statistics

/**
 * Sparkline creates tiny inline trend charts using SVG.
 * Shows recent history of a value as a small line graph.
 */
export const Sparkline = {
    /**
     * Renders a sparkline SVG into the given container.
     * @param {HTMLElement} container - Element to render into
     * @param {number[]} data - Array of numeric values (recent history)
     * @param {Object} options - Rendering options
     */
    render(container, data, options = {}) {
        if (!container || !data || data.length < 2) {
            return;
        }

        const {
            width = 60,
            height = 20,
            strokeColor = null, // Auto-detect based on trend
            strokeWidth = 1.5,
            fillOpacity = 0.1
        } = options;

        // Filter out null/undefined values
        const validData = data.filter(d => d != null && !isNaN(d));
        if (validData.length < 2) {
            container.innerHTML = '';
            return;
        }

        // Calculate min/max for scaling
        const min = Math.min(...validData);
        const max = Math.max(...validData);
        const range = max - min || 1; // Avoid division by zero

        // Calculate points
        const stepX = width / (validData.length - 1);
        const points = validData.map((value, i) => {
            const x = i * stepX;
            const y = height - ((value - min) / range) * (height - 4) - 2; // 2px padding
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });

        // Determine color based on trend (first vs last value)
        const trend = validData[validData.length - 1] - validData[0];
        const color = strokeColor || (
            trend > 0.01 ? 'var(--success-color)' :
                trend < -0.01 ? 'var(--danger-color)' :
                    'var(--text-muted)'
        );

        // Create fill polygon points (adds bottom corners)
        const fillPoints = [
            `0,${height}`,
            ...points,
            `${width},${height}`
        ].join(' ');

        container.innerHTML = `
            <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <polygon 
                    points="${fillPoints}" 
                    fill="${color}" 
                    fill-opacity="${fillOpacity}"
                />
                <polyline 
                    points="${points.join(' ')}" 
                    fill="none" 
                    stroke="${color}" 
                    stroke-width="${strokeWidth}"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `;
    },

    /**
     * Creates a sparkline element without container.
     * @param {number[]} data - Array of numeric values
     * @param {Object} options - Rendering options
     * @returns {string} SVG HTML string
     */
    createSVG(data, options = {}) {
        const tempDiv = document.createElement('div');
        this.render(tempDiv, data, options);
        return tempDiv.innerHTML;
    }
};
