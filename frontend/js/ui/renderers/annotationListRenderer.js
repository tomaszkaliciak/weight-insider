import { state } from "../../state.js";
import { ui } from "../uiCache.js";
import { Utils } from "../../core/utils.js";
import { EventBus } from "../../core/eventBus.js";

export const AnnotationListRenderer = {
  render() {
    const list = ui.annotationList;
    if (!list || list.empty()) {
      console.warn("AnnotationManager: Annotation list UI element not found.");
      return;
    }

    list.html("");

    if (state.annotations.length === 0) {
      list
        .append("li")
        .attr("class", "empty-msg")
        .text("No annotations added yet.");
      return;
    }

    const items = list
      .selectAll("li.annotation-list-item")
      .data(state.annotations, (d) => d.id)
      .join("li")
      .attr("class", "annotation-list-item");

    items
      .append("span")
      .attr("class", "annotation-date")
      .text((d) => Utils.formatDateShort(new Date(d.date)));

    items
      .append("span")
      .attr("class", "annotation-text")
      .text((d) => d.text);

    items
      .append("button")
      .attr("class", "remove-annotation")
      .attr("aria-label", "Remove annotation")
      .html("×")
      .on("click", (event, d) => {
        event.stopPropagation();
        this.remove(d.id);
      });
  },
  init() {
    EventBus.subscribe("state::AnnotationUpdate", this.render);
  },
};
