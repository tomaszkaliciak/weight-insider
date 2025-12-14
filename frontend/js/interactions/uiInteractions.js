// js/interactions/uiInteractions.js
// Handles general UI interactions like theme toggling, card collapsing, etc.

import { ResizeHandler } from "./resizeHandler.js";

export const UIInteractions = {
  handleThemeToggle() {
    // Dynamically import ThemeManager only when needed
    import("../core/themeManager.js")
      .then(({ ThemeManager }) => {
        ThemeManager.toggleTheme();
      })
      .catch((err) =>
        console.error("Failed to load ThemeManager for toggle", err),
      );
  },

  handleCardToggle(buttonElement) {
    if (!buttonElement) return;
    const cardSection = buttonElement.closest(".card.collapsible");
    if (!cardSection) return;
    const isCollapsed = cardSection.classList.toggle("collapsed");
    buttonElement.setAttribute("aria-expanded", !isCollapsed);
    const cardId = cardSection.id;
    if (cardId) {
      try {
        const states = JSON.parse(
          localStorage.getItem("cardCollapseStates") || "{}",
        );
        states[cardId] = isCollapsed;
        localStorage.setItem("cardCollapseStates", JSON.stringify(states));
      } catch (e) {
        console.error("Failed to save card collapse state", e);
      }
    }
    // Trigger resize to fix chart layout if layout changed
    ResizeHandler.handleResize();
  },

  // Add a setup function if needed, e.g., for the body click listener
  // setup() { ... }
};

console.log("UIInteractions module loaded.");