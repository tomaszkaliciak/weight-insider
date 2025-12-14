// js/interactions/tooltipManager.js
// Manages the display and state of the application tooltip.

import { ui } from "../ui/uiCache.js";
import { StateManager, ActionTypes } from "../core/stateManager.js";
import * as Selectors from "../core/selectors.js";
import { CONFIG } from "../config.js";

export const TooltipManager = {
  /**
   * Shows the tooltip with the given content at the specified event position.
   * Manages show/hide delays and pinning state internally.
   * @param {string} htmlContent - The HTML content for the tooltip.
   * @param {MouseEvent} event - The mouse event triggering the tooltip.
   */
  show(htmlContent, event) {
    if (!ui.tooltip || ui.tooltip.empty()) return;

    // Get current show/hide timeout ID from state and clear it
    const currentTimeoutId = Selectors.selectState(
      StateManager.getState(),
    ).tooltipTimeoutId;
    if (currentTimeoutId) clearTimeout(currentTimeoutId);
    StateManager.dispatch({ type: ActionTypes.SET_TOOLTIP_TIMEOUT_ID, payload: null }); // Use ActionTypes

    const displayTooltip = () => {
      const margin = 15;
      const tooltipNode = ui.tooltip.node();
      if (!tooltipNode) return;

      // Handle Fullscreen Mode Reparenting
      const fse = document.fullscreenElement;
      if (fse && tooltipNode.parentNode !== fse) {
        fse.appendChild(tooltipNode);
      } else if (!fse && tooltipNode.parentNode !== document.body) {
        document.body.appendChild(tooltipNode);
      }

      // Calculate Coordinates
      let pageX = event.pageX;
      let pageY = event.pageY;
      let containerWidth = document.body.clientWidth;

      // If in fullscreen, adjust coordinates relative to the fullscreen container
      if (fse) {
        const rect = fse.getBoundingClientRect();
        // Use client coordinates for fullscreen calculations for stability
        pageX = event.clientX - rect.left;
        pageY = event.clientY - rect.top;
        containerWidth = fse.clientWidth;
      }

      let tooltipX = pageX + margin;
      let tooltipY = pageY - margin - tooltipNode.offsetHeight;

      const tooltipWidth = tooltipNode.offsetWidth;

      // Boundary Checks
      if (tooltipX + tooltipWidth > containerWidth - margin) {
        tooltipX = pageX - margin - tooltipWidth;
      }
      if (tooltipY < margin) {
        tooltipY = pageY + margin;
      }

      ui.tooltip
        .html(htmlContent)
        .style("left", `${tooltipX}px`)
        .style("top", `${tooltipY}px`)
        .style("opacity", 0.95)
        .style("z-index", 9999); // Ensure high z-index
    };

    // Use timeout for initial appearance delay
    const newTimeoutId = setTimeout(displayTooltip, CONFIG.tooltipDelayMs);
    StateManager.dispatch({
      type: ActionTypes.SET_TOOLTIP_TIMEOUT_ID, // Use ActionTypes
      payload: newTimeoutId,
    });
  },

  /**
   * Hides the tooltip unless it's currently pinned.
   * Manages hide delay.
   */
  hide() {
    if (!ui.tooltip || ui.tooltip.empty()) return;

    // Get current show/hide timeout ID from state and clear it
    const currentTimeoutId = Selectors.selectState(
      StateManager.getState(),
    ).tooltipTimeoutId;
    if (currentTimeoutId) clearTimeout(currentTimeoutId);
    StateManager.dispatch({ type: ActionTypes.SET_TOOLTIP_TIMEOUT_ID, payload: null }); // Use ActionTypes

    // Check pinned status from state before hiding
    if (!Selectors.selectPinnedTooltipData(StateManager.getState())) {
      // Use timeout for hiding delay
      const newTimeoutId = setTimeout(() => {
        // Double check pin status inside timeout in case it changed rapidly
        if (!Selectors.selectPinnedTooltipData(StateManager.getState())) {
          ui.tooltip.style("opacity", 0).style("left", "-1000px"); // Hide and move off-screen
        }
        // Clear the timeout ID from state after execution
        StateManager.dispatch({
          type: ActionTypes.SET_TOOLTIP_TIMEOUT_ID, // Use ActionTypes
          payload: null,
        });
      }, CONFIG.tooltipHideDelayMs || CONFIG.tooltipDelayMs); // Use hide delay if configured, else show delay

      // Store the new hide timeout ID in state
      StateManager.dispatch({
        type: ActionTypes.SET_TOOLTIP_TIMEOUT_ID, // Use ActionTypes
        payload: newTimeoutId,
      });
    }
  },

  /**
   * Clears any active tooltip hide timeout. Useful when pinning.
   */
  clearHideTimeout() {
    const currentTimeoutId = Selectors.selectState(
      StateManager.getState(),
    ).tooltipTimeoutId;
    if (currentTimeoutId) clearTimeout(currentTimeoutId);
    StateManager.dispatch({ type: ActionTypes.SET_TOOLTIP_TIMEOUT_ID, payload: null });
  },

  /**
  * Forces the tooltip to be visible immediately (e.g., after pinning).
  * Assumes content has already been set.
  */
  forceShow() {
    if (ui.tooltip && !ui.tooltip.empty()) {
      ui.tooltip.style("opacity", 0.95);
    }
  }
};

console.log("TooltipManager module loaded.");