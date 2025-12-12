// js/ui/renderers/eventCountdownRenderer.js
// Renders competition/event countdown with weight milestones

import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

/**
 * Displays countdown to upcoming events/competitions with:
 * - Days remaining
 * - Target weight for the event
 * - Progress towards event weight
 * - Milestones (weigh-in, peak week, etc.)
 */
export const EventCountdownRenderer = {
    _container: null,
    _events: [],
    _storageKey: 'weight-insider-events',

    init() {
        this._container = document.getElementById('event-countdown-content');
        if (!this._container) {
            console.warn('[EventCountdownRenderer] Container #event-countdown-content not found.');
            return;
        }

        // Load saved events
        this._loadEvents();

        // Subscribe to state changes
        StateManager.subscribe((stateChanges) => {
            if (stateChanges.action.type.includes('FILTERED_DATA') ||
                stateChanges.action.type.includes('DISPLAY_STATS')) {
                this._render();
            }
        });

        // Initial render
        this._render();
        console.log('[EventCountdownRenderer] Initialized.');
    },

    _loadEvents() {
        try {
            const stored = localStorage.getItem(this._storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this._events = parsed.map(e => ({
                    ...e,
                    date: new Date(e.date)
                })).filter(e => e.date >= new Date()); // Only future events
            }
        } catch (err) {
            console.warn('[EventCountdownRenderer] Error loading events:', err);
            this._events = [];
        }
    },

    _saveEvents() {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._events));
        } catch (err) {
            console.warn('[EventCountdownRenderer] Error saving events:', err);
        }
    },

    _addEvent(name, date, targetWeight, category) {
        const event = {
            id: Date.now(),
            name,
            date: new Date(date),
            targetWeight: parseFloat(targetWeight) || null,
            category: category || 'general'
        };
        this._events.push(event);
        this._events.sort((a, b) => a.date - b.date);
        this._saveEvents();
        this._render();
    },

    _removeEvent(id) {
        this._events = this._events.filter(e => e.id !== id);
        this._saveEvents();
        this._render();
    },

    _getProgress(targetWeight, currentWeight) {
        if (!targetWeight || !currentWeight) return null;

        // If we're going down (cutting for event)
        // If we're going up (bulking for event)
        // Calculate how close we are

        const diff = Math.abs(targetWeight - currentWeight);
        if (diff < 0.5) return 100; // Within 0.5kg = at goal

        // Assume user started at least 5kg away for meaningful progress
        const estimatedStart = Math.max(diff + 2, 5);
        const progress = Math.max(0, Math.min(100, ((estimatedStart - diff) / estimatedStart) * 100));
        return progress;
    },

    _render() {
        if (!this._container) return;

        const state = StateManager.getState();
        const filteredData = Selectors.selectFilteredData(state);

        // Get current weight
        let currentWeight = null;
        if (filteredData && filteredData.length > 0) {
            for (let i = filteredData.length - 1; i >= 0; i--) {
                if (filteredData[i].value != null) {
                    currentWeight = filteredData[i].value;
                    break;
                }
            }
        }

        this._container.innerHTML = `
      <div class="event-controls">
        <button id="add-event-btn" class="btn-small">+ Add Event</button>
      </div>
      
      <div id="add-event-form" class="add-event-form hidden">
        <div class="form-row">
          <input type="text" id="event-name" placeholder="Event name" class="event-input" />
        </div>
        <div class="form-row">
          <input type="text" id="event-date" placeholder="DD-MM-YYYY" class="event-input" />
          <input type="number" id="event-weight" placeholder="Target kg" step="0.1" class="event-input event-input--small" />
        </div>
        <div class="form-row">
          <select id="event-category" class="event-input">
            <option value="competition">🏆 Competition</option>
            <option value="photoshoot">📸 Photoshoot</option>
            <option value="vacation">🏖️ Vacation</option>
            <option value="wedding">💍 Wedding</option>
            <option value="other">📅 Other</option>
          </select>
        </div>
        <div class="button-group">
          <button id="save-event-btn" class="btn-primary btn-small">Save Event</button>
          <button id="cancel-event-btn" class="btn-secondary btn-small">Cancel</button>
        </div>
      </div>
      
      <div class="events-list">
        ${this._events.length === 0 ? `
          <div class="empty-state-message">
            <p>No upcoming events</p>
            <small>Add a competition or event to track your countdown</small>
          </div>
        ` : this._events.map(event => this._renderEvent(event, currentWeight)).join('')}
      </div>
    `;

        this._setupEventListeners();
    },

    _renderEvent(event, currentWeight) {
        const now = new Date();
        const daysRemaining = Math.ceil((event.date - now) / (1000 * 60 * 60 * 24));
        const weeksRemaining = (daysRemaining / 7).toFixed(1);

        const progress = this._getProgress(event.targetWeight, currentWeight);
        const weightDiff = event.targetWeight && currentWeight
            ? (event.targetWeight - currentWeight).toFixed(1)
            : null;

        const categoryIcons = {
            competition: '🏆',
            photoshoot: '📸',
            vacation: '🏖️',
            wedding: '💍',
            other: '📅'
        };

        const urgencyClass = daysRemaining <= 7 ? 'urgent' :
            daysRemaining <= 14 ? 'soon' :
                daysRemaining <= 30 ? 'upcoming' : '';

        return `
      <div class="event-card ${urgencyClass}" data-event-id="${event.id}">
        <div class="event-header">
          <span class="event-category-icon">${categoryIcons[event.category] || '📅'}</span>
          <span class="event-name">${event.name}</span>
          <button class="remove-event-btn" data-id="${event.id}" title="Remove event">×</button>
        </div>
        
        <div class="countdown-display">
          <div class="countdown-number">${daysRemaining}</div>
          <div class="countdown-label">days to go</div>
        </div>
        
        <div class="event-details">
          <div class="event-date">
            📅 ${Utils.formatDateShort(event.date)} (${weeksRemaining} weeks)
          </div>
          ${event.targetWeight ? `
            <div class="event-weight">
              🎯 Target: ${event.targetWeight} kg
              ${weightDiff ? `
                <span class="weight-diff ${parseFloat(weightDiff) > 0 ? 'need-gain' : 'need-loss'}">
                  (${parseFloat(weightDiff) > 0 ? '+' : ''}${weightDiff} kg)
                </span>
              ` : ''}
            </div>
          ` : ''}
        </div>
        
        ${progress !== null ? `
          <div class="event-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="progress-text">${progress.toFixed(0)}% ready</span>
          </div>
        ` : ''}
        
        ${this._renderMilestones(event, daysRemaining)}
      </div>
    `;
    },

    _renderMilestones(event, daysRemaining) {
        const milestones = [];

        if (daysRemaining <= 1) {
            milestones.push({ icon: '🎯', text: 'Event day!', active: true });
        }
        if (daysRemaining <= 7 && daysRemaining > 1) {
            milestones.push({ icon: '⚡', text: 'Peak week', active: true });
        }
        if (daysRemaining <= 14 && daysRemaining > 7) {
            milestones.push({ icon: '📋', text: 'Final prep phase', active: true });
        }
        if (daysRemaining <= 30 && daysRemaining > 14) {
            milestones.push({ icon: '🏃', text: 'Training intensification', active: false });
        }

        if (milestones.length === 0) return '';

        return `
      <div class="event-milestones">
        ${milestones.map(m => `
          <span class="milestone ${m.active ? 'active' : ''}">${m.icon} ${m.text}</span>
        `).join('')}
      </div>
    `;
    },

    _setupEventListeners() {
        const addBtn = document.getElementById('add-event-btn');
        const form = document.getElementById('add-event-form');
        const saveBtn = document.getElementById('save-event-btn');
        const cancelBtn = document.getElementById('cancel-event-btn');

        if (addBtn && form) {
            addBtn.addEventListener('click', () => {
                form.classList.toggle('hidden');
                addBtn.textContent = form.classList.contains('hidden') ? '+ Add Event' : 'Cancel';
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const name = document.getElementById('event-name')?.value;
                const dateStr = document.getElementById('event-date')?.value;
                const weight = document.getElementById('event-weight')?.value;
                const category = document.getElementById('event-category')?.value;

                if (!name || !dateStr) {
                    Utils.showStatusMessage('Please enter event name and date', 'error');
                    return;
                }

                // Parse date (DD-MM-YYYY)
                const parts = dateStr.split('-');
                if (parts.length !== 3) {
                    Utils.showStatusMessage('Date format: DD-MM-YYYY', 'error');
                    return;
                }
                const [day, month, year] = parts.map(Number);
                const date = new Date(year, month - 1, day);

                if (isNaN(date.getTime()) || date <= new Date()) {
                    Utils.showStatusMessage('Please enter a valid future date', 'error');
                    return;
                }

                this._addEvent(name, date, weight, category);
                Utils.showStatusMessage(`Event "${name}" added!`, 'success');
            });
        }

        if (cancelBtn && form) {
            cancelBtn.addEventListener('click', () => {
                form.classList.add('hidden');
                document.getElementById('add-event-btn').textContent = '+ Add Event';
            });
        }

        // Remove event buttons
        document.querySelectorAll('.remove-event-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id);
                if (id) {
                    this._removeEvent(id);
                    Utils.showStatusMessage('Event removed', 'info');
                }
            });
        });
    }
};
