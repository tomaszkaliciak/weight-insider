// js/interactions/dateInputUX.js
// Adds a unified DD-MM-YYYY UX for text date inputs.

import { Utils } from "../core/utils.js";

function normalizeDateInput(el) {
  if (!el) return;
  const parsed = Utils.parseDateInput(el.value);
  if (!parsed) {
    if (el.value?.trim()) el.classList.add("date-input-invalid");
    return;
  }
  el.value = Utils.formatDateDMY(parsed);
  el.classList.remove("date-input-invalid");
}

function attachDateInputBehavior(el) {
  if (!el) return;
  if (el.dataset.dateUxBound === "1") return;
  el.dataset.dateUxBound = "1";
  el.setAttribute("placeholder", "DD-MM-YYYY");
  el.setAttribute("inputmode", "numeric");
  el.setAttribute("autocomplete", "off");
  el.setAttribute("spellcheck", "false");
  el.classList.add("date-input-dmy");

  el.addEventListener("input", () => {
    el.classList.remove("date-input-invalid");
  });
  el.addEventListener("blur", () => normalizeDateInput(el));
}

export const DateInputUX = {
  init() {
    const dateInputs = document.querySelectorAll(
      'input.date-input-dmy, input.date-input, #analysisStartDate, #analysisEndDate, #trendStartDate, #goalDate, #me-date',
    );
    dateInputs.forEach((el) => attachDateInputBehavior(el));
  },
};
