/**
 * chartControls.js
 * Handles interactions for the Master Chart section, such as fullscreen toggle.
 */

export const ChartControls = {
    init() {
        const fullscreenBtn = document.getElementById('chart-fullscreen-btn');
        const chartSection = document.getElementById('chart-section');

        if (fullscreenBtn && chartSection) {
            fullscreenBtn.addEventListener('click', () => {
                chartSection.classList.toggle('fullscreen');

                // Toggle icon
                const isFullscreen = chartSection.classList.contains('fullscreen');
                fullscreenBtn.innerHTML = isFullscreen ? '✕' : '⛶';
                fullscreenBtn.title = isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen';

                // Force resize of charts if Chart.js is used, to adapt to new size
                // Dispatch a window resize event which most chart libs listen to
                window.dispatchEvent(new Event('resize'));
            });

            // Add escape key listener to exit fullscreen
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && chartSection.classList.contains('fullscreen')) {
                    fullscreenBtn.click();
                }
            });
        }
    }
};
