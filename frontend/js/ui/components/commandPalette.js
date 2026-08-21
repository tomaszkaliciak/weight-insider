// js/ui/components/commandPalette.js
// Command Palette (Cmd+K / Ctrl+K) for quick navigation, layout presets,
// quick data logging, and app action shortcuts.

import { StateManager, ActionTypes } from '../../core/stateManager.js';
import { DashboardPresets } from '../dashboardPresets.js';
import { ThemeManager } from '../../core/themeManager.js';
import { Utils } from '../../core/utils.js';

export const CommandPalette = {
  _modalEl: null,
  _inputEl: null,
  _resultsEl: null,
  _isOpen: false,
  _selectedIndex: 0,
  _filteredItems: [],

  init() {
    this._createDOM();
    this._bindEvents();
  },

  _createDOM() {
    if (document.getElementById('command-palette-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'command-palette-modal';
    modal.className = 'command-palette-backdrop';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');

    modal.innerHTML = `
      <div class="command-palette-container">
        <div class="command-palette-header">
          <svg class="command-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="command-palette-input" class="command-palette-input" placeholder="Type a command or search widgets (e.g., '30d', 'cut', 'macro', 'log')..." autocomplete="off" />
          <kbd class="command-kbd">ESC</kbd>
        </div>
        <div id="command-palette-results" class="command-palette-results"></div>
        <div class="command-palette-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>ESC</kbd> close</span>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Also insert a quick trigger button into header controls
    const headerControls = document.querySelector('.header-controls');
    if (headerControls && !document.getElementById('cmd-k-btn')) {
      const btn = document.createElement('button');
      btn.id = 'cmd-k-btn';
      btn.className = 'icon-btn cmd-k-trigger';
      btn.title = 'Command Palette (Cmd+K)';
      btn.innerHTML = `<span style="font-family: var(--font-mono, monospace); font-size: 0.75rem; font-weight: 600; opacity: 0.8;">⌘K</span>`;
      btn.addEventListener('click', () => this.open());
      headerControls.insertBefore(btn, headerControls.firstChild);
    }

    this._modalEl = modal;
    this._inputEl = document.getElementById('command-palette-input');
    this._resultsEl = document.getElementById('command-palette-results');
  },

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this._isOpen) {
        this.close();
      }
    });

    this._modalEl.addEventListener('click', (e) => {
      if (e.target === this._modalEl) this.close();
    });

    this._inputEl.addEventListener('input', () => {
      this._selectedIndex = 0;
      this._renderResults();
    });

    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this._filteredItems.length > 0) {
          this._selectedIndex = (this._selectedIndex + 1) % this._filteredItems.length;
          this._highlightSelected();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this._filteredItems.length > 0) {
          this._selectedIndex = (this._selectedIndex - 1 + this._filteredItems.length) % this._filteredItems.length;
          this._highlightSelected();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this._filteredItems[this._selectedIndex]) {
          this._execute(this._filteredItems[this._selectedIndex]);
        }
      }
    });
  },

  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  },

  open() {
    if (!this._modalEl) return;
    this._isOpen = true;
    this._modalEl.hidden = false;
    this._modalEl.setAttribute('aria-hidden', 'false');
    this._inputEl.value = '';
    this._selectedIndex = 0;
    this._renderResults();
    setTimeout(() => this._inputEl.focus(), 50);
  },

  close() {
    if (!this._modalEl) return;
    this._isOpen = false;
    this._modalEl.hidden = true;
    this._modalEl.setAttribute('aria-hidden', 'true');
  },

  _getAllCommands() {
    const commands = [
      // Quick Actions
      { id: 'act-log', category: 'Action', title: 'Log Daily Entry (Weight & Calories)', icon: '✏️', action: () => this._triggerLogWidget() },
      { id: 'act-toggle-theme', category: 'Action', title: 'Toggle Light / Dark Theme', icon: '🌓', action: () => ThemeManager.toggleTheme() },
      { id: 'act-export', category: 'Action', title: 'Export Application Settings & Data', icon: '📥', action: () => document.getElementById('settings-export-btn')?.click() },

      // Ranges
      { id: 'range-7', category: 'Range', title: 'Analysis Range: Last 7 Days', icon: '📅', action: () => this._setRangeDays(7) },
      { id: 'range-30', category: 'Range', title: 'Analysis Range: Last 30 Days (Default)', icon: '📅', action: () => this._setRangeDays(30) },
      { id: 'range-90', category: 'Range', title: 'Analysis Range: Last 90 Days', icon: '📅', action: () => this._setRangeDays(90) },
      { id: 'range-all', category: 'Range', title: 'Analysis Range: All Data', icon: '📅', action: () => this._setRangeDays('all') },
      { id: 'range-phase', category: 'Range', title: 'Analysis Range: This Phase', icon: '📅', action: () => this._setRangeDays('phase') },
      { id: 'act-inspect-day', category: 'Action', title: 'Inspect latest day', icon: '🔎', action: () => this._inspectLatestDay() },

      // Presets
      { id: 'preset-executive', category: 'Preset View', title: 'Switch to Executive Overview', icon: '📊', action: () => DashboardPresets.applyPreset('executive') },
      { id: 'preset-cut', category: 'Preset View', title: 'Switch to Weight Loss (Cut) Focus', icon: '🎯', action: () => DashboardPresets.applyPreset('cut') },
      { id: 'preset-nutrition', category: 'Preset View', title: 'Switch to Nutrition & Energy Focus', icon: '🥗', action: () => DashboardPresets.applyPreset('nutrition') },
      { id: 'preset-complete', category: 'Preset View', title: 'Switch to Complete View (All Widgets)', icon: '⚡', action: () => DashboardPresets.applyPreset('complete') },
    ];

    // Add Widget Jump Commands dynamically from DOM
    const widgets = document.querySelectorAll('.bento-widget');
    widgets.forEach((w) => {
      const header = w.querySelector('.widget-header, .text-subhero');
      const title = header ? header.textContent.trim() : w.id;
      if (title && w.id) {
        commands.push({
          id: `widget-${w.id}`,
          category: 'Jump to Widget',
          title: title,
          icon: '📍',
          action: () => this._jumpToWidget(w.id),
        });
      }
    });

    return commands;
  },

  _renderResults() {
    const query = this._inputEl.value.toLowerCase().trim();
    const all = this._getAllCommands();

    if (!query) {
      this._filteredItems = all;
    } else {
      this._filteredItems = all.filter((item) =>
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    }

    if (this._filteredItems.length === 0) {
      this._resultsEl.innerHTML = `<div class="command-palette-empty">No matching commands found for "${query}"</div>`;
      return;
    }

    let html = '';
    let currentCategory = '';

    this._filteredItems.forEach((item, index) => {
      if (item.category !== currentCategory) {
        currentCategory = item.category;
        html += `<div class="command-category-title">${currentCategory}</div>`;
      }
      const isSelected = index === this._selectedIndex;
      html += `
        <div class="command-item ${isSelected ? 'selected' : ''}" data-index="${index}">
          <span class="command-item-icon">${item.icon}</span>
          <span class="command-item-title">${item.title}</span>
        </div>
      `;
    });

    this._resultsEl.innerHTML = html;

    // Add click listeners to item rows
    this._resultsEl.querySelectorAll('.command-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        if (this._filteredItems[idx]) {
          this._execute(this._filteredItems[idx]);
        }
      });
    });

    this._highlightSelected();
  },

  _highlightSelected() {
    const items = this._resultsEl.querySelectorAll('.command-item');
    items.forEach((el, i) => {
      if (i === this._selectedIndex) {
        el.classList.add('selected');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        el.classList.remove('selected');
      }
    });
  },

  _execute(item) {
    this.close();
    if (typeof item.action === 'function') {
      item.action();
    }
  },

  _setRangeDays(days) {
    const presetBtn = document.querySelector(`.preset-btn[data-range="${days}"]`);
    if (presetBtn) {
      presetBtn.click();
    }
  },

  _jumpToWidget(widgetId) {
    const el = document.getElementById(widgetId);
    if (el) {
      import('../widgetVisibility.js').then(({ WidgetVisibility }) => {
        WidgetVisibility.show(widgetId);
        el.classList.remove('widget-collapsed');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('widget-highlight-glow');
        setTimeout(() => el.classList.remove('widget-highlight-glow'), 2000);
      });
    }
  },

  _inspectLatestDay() {
    import('../dayInspector.js').then(({ DayInspector }) => DayInspector.openLatest());
  },

  _triggerLogWidget() {
    import('../dayInspector.js').then(({ DayInspector }) => DayInspector.openToday());
  }
};
