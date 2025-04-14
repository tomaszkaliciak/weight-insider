// js/ui/renderers/annotationListRenderer.js

import { StateManager } from "../../core/stateManager.js";
import { ui } from "../uiCache.js";
import { Utils } from "../../core/utils.js";
// Import AnnotationManager only for the remove action, not for reading data
import { AnnotationManager } from "../../core/annotationManager.js";
import * as Selectors from "../../core/selectors.js"; // Import selectors

export const AnnotationListRenderer = {
  /**
   * Renders the annotation list based on the annotations array provided.
   * @param {Array} annotations - The array of annotation objects from the state event payload.
   */
  _render(annotations) {
    console.log("[AnnotationListRenderer] _render called with annotations:", annotations);
    const list = ui.annotationList;
    if (!list || list.empty()) {
      console.warn("AnnotationListRenderer: Annotation list UI element not found.");
      return;
    }

    list.html(""); // Clear previous items

    if (!Array.isArray(annotations) || annotations.length === 0) {
      list.append("li").attr("class", "empty-msg").text("No annotations added yet.");
      return;
    }

    // Sort annotations by date before rendering
    const sortedAnnotations = [...annotations].sort((a, b) => new Date(a.date) - new Date(b.date));

    const items = list
      .selectAll("li.annotation-list-item")
      .data(sortedAnnotations, (d) => d.id); // Use sorted data

    items.join( // Use enter/update/exit pattern
      enter => {
        const li = enter.append("li").attr("class", "annotation-list-item");
        li.append("span").attr("class", "annotation-date")
            .text(d => Utils.formatDateShort(new Date(d.date)));
        li.append("span").attr("class", "annotation-text")
            .text(d => d.text);
        li.append("button").attr("class", "remove-annotation")
            .attr("aria-label", "Remove annotation").html("×")
            .on("click", (event, d) => {
                event.stopPropagation();
                // Call AnnotationManager method which handles dispatching DELETE action
                AnnotationManager.remove(d.id);
            });
        return li;
      },
      update => {
        // Update existing elements if needed (though unlikely for this list)
        update.select(".annotation-date").text(d => Utils.formatDateShort(new Date(d.date)));
        update.select(".annotation-text").text(d => d.text);
        // Re-attach listener just in case? Might not be necessary with d3's join.
        update.select(".remove-annotation").on("click", (event, d) => {
             event.stopPropagation();
             AnnotationManager.remove(d.id);
        });
        return update;
      },
      exit => exit.remove()
    );
  },

  init() {
    // Subscribe specifically to the event carrying the annotations array
    StateManager.subscribeToSpecificEvent('state:annotationsChanged', (payload) => {
        // The payload here IS { annotations: [...] }
        this._render(payload.annotations);
    });
    console.log("[AnnotationListRenderer Init] Subscribed to state:annotationsChanged.");
    // Perform initial render based on current state
    const initialState = StateManager.getState();
    this._render(Selectors.selectAnnotations(initialState));
  },
};