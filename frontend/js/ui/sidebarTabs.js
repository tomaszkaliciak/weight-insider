// js/ui/sidebarTabs.js
// Handles tab navigation for sidebar card categories

const STORAGE_KEY = 'sidebarActiveTab';
const DEFAULT_TAB = 'overview';

/**
 * SidebarTabs module manages the tabbed navigation system for sidebar cards.
 * - Switches between card category panels
 * - Persists active tab to localStorage
 * - Restores tab state on page load
 */
export const SidebarTabs = {
    _tabButtons: null,
    _tabPanels: null,
    _initialized: false,

    /**
     * Initializes the tab system.
     * Sets up click handlers and restores previous tab state.
     */
    init() {
        const isBentoMode = !!document.querySelector('.dashboard-container.bento-mode');
        this._tabButtons = document.querySelectorAll('.left-sidebar .tab-btn');
        this._tabPanels = document.querySelectorAll('.tab-panels .tab-panel');

        if (isBentoMode) {
            console.log('[SidebarTabs] Bento mode detected. Initializing scroll anchors.');
            this._tabButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetId = e.currentTarget.getAttribute('data-target');
                    if (targetId) {
                        e.preventDefault();

                        // Update active state
                        this._tabButtons.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');

                        // Smooth scroll
                        const targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            const headerOffset = 80;
                            const elementPosition = targetEl.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                            window.scrollTo({
                                top: offsetPosition,
                                behavior: "smooth"
                            });
                        }
                    }
                });
            });
            return;
        }

        // --- Standard Tab Logic (Legacy) ---
        if (this._tabButtons.length === 0 || this._tabPanels.length === 0) {
            console.warn('[SidebarTabs] No tabs or panels found. Skipping initialization.');
            return;
        }

        // Set up click handlers for tab buttons
        this._tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                if (tabName) {
                    this.switchTab(tabName);
                }
            });
        });

        // Restore saved tab or use default
        const savedTab = this._getSavedTab();
        this.switchTab(savedTab, false); // false = don't animate on initial load

        this._initialized = true;
        console.log('[SidebarTabs] Initialized with active tab:', savedTab);
    },

    /**
     * Switches to the specified tab.
     * @param {string} tabName - The tab identifier (data-tab value)
     * @param {boolean} animate - Whether to animate the transition (default true)
     */
    switchTab(tabName, animate = true) {
        if (!tabName) return;

        // Update button states
        this._tabButtons.forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });

        // Update panel visibility
        this._tabPanels.forEach(panel => {
            const isActive = panel.dataset.tab === tabName;
            panel.classList.toggle('active', isActive);
            panel.setAttribute('aria-hidden', !isActive);

            if (animate && isActive) {
                panel.classList.add('fade-in');
                setTimeout(() => panel.classList.remove('fade-in'), 300);
            }
        });

        // Save to localStorage
        this._saveTab(tabName);
    },

    /**
     * Gets the currently active tab name.
     * @returns {string} The active tab identifier
     */
    getActiveTab() {
        const activeBtn = document.querySelector('.sidebar-tabs .tab-btn.active');
        return activeBtn?.dataset.tab || DEFAULT_TAB;
    },

    /**
     * Saves the active tab to localStorage.
     * @param {string} tabName - The tab identifier to save
     */
    _saveTab(tabName) {
        try {
            localStorage.setItem(STORAGE_KEY, tabName);
        } catch (e) {
            console.warn('[SidebarTabs] Failed to save tab state:', e);
        }
    },

    /**
     * Retrieves the saved tab from localStorage.
     * @returns {string} The saved tab or default
     */
    _getSavedTab() {
        try {
            return localStorage.getItem(STORAGE_KEY) || DEFAULT_TAB;
        } catch (e) {
            return DEFAULT_TAB;
        }
    }
};
