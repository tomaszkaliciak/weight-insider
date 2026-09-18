// js/ui/syncController.js
// Handles triggering on-demand sync with Fitatu and Health Connect,
// and displaying the last sync timestamp and status.

import { StateManager } from "../core/stateManager.js";
import { DataService } from "../core/dataService.js";
import { ManualEntryService } from "../core/manualEntryService.js";
import { SettingsPanel } from "./settingsPanel.js";
import { Utils } from "../core/utils.js";

let _btn = null;
let _indicator = null;
let _lastSyncData = null;
let _isSyncing = false;
let _timer = null;

function formatRelativeTime(dateInput) {
  if (!dateInput) return "—";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "—";

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 0) return "Just now";
  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return Utils.formatDateShort(date);
}

function updateDisplay() {
  if (!_indicator) return;

  if (_isSyncing) {
    _indicator.textContent = "Syncing...";
    _indicator.title = "Synchronizing latest data with Fitatu and Drive...";
    return;
  }

  if (!_lastSyncData || !_lastSyncData.timestamp) {
    _indicator.textContent = "Synced: —";
    _indicator.title = "No sync information recorded yet";
    return;
  }

  const rel = formatRelativeTime(_lastSyncData.timestamp);
  _indicator.textContent = `Synced ${rel}`;

  const lines = [`Last sync: ${new Date(_lastSyncData.timestamp).toLocaleString()}`];
  if (_lastSyncData.driveStatus) {
    const driveLabel = _lastSyncData.driveStatus === "cached" ? "Cached (unmodified)" : "Updated";
    lines.push(`Drive backup: ${driveLabel}`);
  }
  if (_lastSyncData.latestWeightDay && _lastSyncData.latestWeight) {
    lines.push(`Latest weight: ${_lastSyncData.latestWeight} kg (${_lastSyncData.latestWeightDay})`);
  }
  if (_lastSyncData.latestIntakeDay && _lastSyncData.latestIntake) {
    lines.push(`Latest intake: ${_lastSyncData.latestIntake} kcal (${_lastSyncData.latestIntakeDay})`);
  }
  _indicator.title = lines.join("\n");
}

async function triggerSync() {
  if (_isSyncing) return;

  _isSyncing = true;
  if (_btn) {
    _btn.classList.add("is-syncing");
    _btn.disabled = true;
  }
  updateDisplay();

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      // response might not be JSON if server 404s
    }

    if (!response.ok || !result?.success) {
      const errMsg = result?.error || result?.details || `HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    Utils.showStatusMessage("Sync completed! Loading latest data...", "success", 3000);

    // Re-fetch and reprocess data into StateManager and MasterUpdater
    const fetchedRaw = await DataService.fetchData();
    const rawDataObjects = ManualEntryService.mergeInto(fetchedRaw);
    const mergedData = DataService.mergeRawData(rawDataObjects);

    // Update last sync state from newly saved data
    if (result.lastSync) {
      _lastSyncData = result.lastSync;
    } else if (fetchedRaw.lastSync) {
      _lastSyncData = fetchedRaw.lastSync;
    }

    // Refresh UI without page reload
    SettingsPanel.reprocessFromMerged(mergedData);
    Utils.showStatusMessage("Dashboard updated with latest records.", "success", 2500);
  } catch (err) {
    console.warn("[SyncController] Sync error:", err);
    if (err.message?.includes("Failed to fetch") || err.message?.includes("404")) {
      Utils.showStatusMessage(
        "Sync endpoint not reachable. Ensure the sync server or Vite dev server is running.",
        "warn",
        6000,
      );
    } else {
      Utils.showStatusMessage(`Sync failed: ${err.message}`, "error", 6000);
    }
  } finally {
    _isSyncing = false;
    if (_btn) {
      _btn.classList.remove("is-syncing");
      _btn.disabled = false;
    }
    updateDisplay();
  }
}

async function checkSyncStatus() {
  try {
    const res = await fetch("/api/sync/status");
    if (res.ok) {
      const data = await res.json();
      if (data.lastSync) {
        _lastSyncData = data.lastSync;
        updateDisplay();
      }
    }
  } catch {
    // If status endpoint isn't available, rely on data.json lastSync field
  }
}

export const SyncController = {
  init() {
    _btn = document.getElementById("sync-now-btn");
    _indicator = document.getElementById("sync-last-indicator");

    if (_btn) {
      _btn.addEventListener("click", () => {
        triggerSync();
      });
    }

    // Subscribe to state to catch initial lastSync if present
    StateManager.subscribeToSpecificEvent("SET_INITIAL_DATA", (state) => {
      const raw = state?.rawDataObjects || state?.rawData;
      if (raw && raw.lastSync) {
        _lastSyncData = raw.lastSync;
        updateDisplay();
      }
    });

    // Check sync status from endpoint or current raw data
    checkSyncStatus();

    // Ticker to update relative time ("5m ago" -> "6m ago")
    if (_timer) clearInterval(_timer);
    _timer = setInterval(updateDisplay, 60000);
  },

  triggerSync,

  setLastSync(data) {
    _lastSyncData = data;
    updateDisplay();
  },

  getLastSync() {
    return _lastSyncData;
  },
};
