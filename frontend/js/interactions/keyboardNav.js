// js/interactions/keyboardNav.js
// Keyboard navigation for tabs and collapsible cards

import { SidebarTabs } from '../ui/sidebarTabs.js';

/**
 * KeyboardNav handles keyboard shortcuts:
 * - Arrow keys to switch sidebar tabs
 * - Escape to collapse all expanded cards
 */
export const KeyboardNav = {
    _tabOrder: ['insights', 'analytics', 'settings'],
    _initialized: false,

    init() {
        if (this._initialized) return;

        document.addEventListener('keydown', (e) => this._handleKeyDown(e));
        this._setupSidebarToggle();
        this._setupFullscreenButton();

        this._initialized = true;
        console.log('[KeyboardNav] Initialized.');
    },

    _handleKeyDown(e) {
        // Ignore if typing in an input or textarea
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            return;
        }

        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowRight':
                this._navigateTabs(e.key === 'ArrowRight' ? 1 : -1);
                e.preventDefault();
                break;

            case 'Escape':
                this._collapseAllCards();
                e.preventDefault();
                break;

            case '1':
            case '2':
            case '3':
                // Quick tab switching with number keys
                if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                    const tabIndex = parseInt(e.key) - 1;
                    if (tabIndex < this._tabOrder.length) {
                        SidebarTabs.switchTab(this._tabOrder[tabIndex]);
                    }
                }
                break;

            case 's':
            case 'S':
                // Toggle right sidebar
                if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                    this._toggleSidebar();
                }
                break;

            case 'f':
            case 'F':
                // Toggle fullscreen chart
                if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                    this._toggleFullscreen();
                    e.preventDefault();
                }
                break;
        }
    },

    _navigateTabs(direction) {
        const activeTab = document.querySelector('.tab-button.active');
        if (!activeTab) return;

        const currentIndex = this._tabOrder.indexOf(activeTab.dataset.tab);
        if (currentIndex === -1) return;

        const newIndex = (currentIndex + direction + this._tabOrder.length) % this._tabOrder.length;
        SidebarTabs.switchTab(this._tabOrder[newIndex]);
    },

    _collapseAllCards() {
        const expandedCards = document.querySelectorAll('.card.collapsible');
        let collapsed = 0;

        expandedCards.forEach(card => {
            const toggleBtn = card.querySelector('.card-toggle-btn');
            const content = card.querySelector('.card-content');

            if (toggleBtn && content && !content.classList.contains('collapsed')) {
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.querySelector('.toggle-icon').textContent = '▶';
                content.classList.add('collapsed');
                collapsed++;
            }
        });

        if (collapsed > 0) {
            console.log(`[KeyboardNav] Collapsed ${collapsed} cards.`);
        }
    },

    _toggleSidebar() {
        const sidebar = document.getElementById('right-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
            console.log(`[KeyboardNav] Sidebar ${sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded'}.`);
        }
    },

    _setupSidebarToggle() {
        const toggleBtn = document.getElementById('sidebar-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this._toggleSidebar());
        }
    },

    _toggleFullscreen() {
        const chartSection = document.querySelector('.chart-section');
        if (!chartSection) return;

        if (!document.fullscreenElement) {
            chartSection.requestFullscreen().catch(err => {
                console.log(`[KeyboardNav] Fullscreen error: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    },

    _setupFullscreenButton() {
        const fullscreenBtn = document.getElementById('chart-fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this._toggleFullscreen());
        }
    }
};
