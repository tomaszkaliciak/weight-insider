// js/ui/toastManager.js
// V4: Bottom-right toast stack with icons, slide-in animation, progress bar, dismiss.
// Utils.showStatusMessage() is shimmed to delegate here so all 30+ call sites
// get the upgraded look for free without API changes.

import { icon } from "./icons.js";

const STACK_ID = "toast-stack";
const MAX_VISIBLE = 3;

const ICON_MAP = {
  info:    "info",
  success: "success",
  warn:    "warn",
  error:   "error",
};

let _stack = null;

function _ensureStack() {
  if (_stack && document.body.contains(_stack)) return _stack;
  _stack = document.getElementById(STACK_ID);
  if (!_stack) {
    _stack = document.createElement("div");
    _stack.id = STACK_ID;
    _stack.className = "toast-stack";
    _stack.setAttribute("role", "status");
    _stack.setAttribute("aria-live", "polite");
    document.body.appendChild(_stack);
  }
  return _stack;
}

function _enforceCap(stack) {
  while (stack.children.length > MAX_VISIBLE) {
    stack.firstElementChild?.remove();
  }
}

/**
 * Show a toast.
 * @param {string} message
 * @param {'info'|'success'|'warn'|'error'} [type='info']
 * @param {number} [duration=3000] ms
 */
export function showToast(message, type = "info", duration = 3000) {
  const stack = _ensureStack();
  const kind = ICON_MAP[type] ? type : "info";

  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;

  toast.innerHTML = `
    <span class="toast-icon">${icon(ICON_MAP[kind], { size: 18 })}</span>
    <span class="toast-message"></span>
    <button class="toast-dismiss" aria-label="Dismiss">${icon("close", { size: 14 })}</button>
    <span class="toast-progress"></span>
  `;
  toast.querySelector(".toast-message").textContent = message;

  stack.appendChild(toast);
  _enforceCap(stack);

  // Animate in next frame so the initial style is applied first
  requestAnimationFrame(() => toast.classList.add("toast-in"));

  // Progress bar animation drives dismissal timing
  const progress = toast.querySelector(".toast-progress");
  progress.style.animationDuration = `${duration}ms`;

  const remove = () => {
    toast.classList.remove("toast-in");
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 220);
  };

  const timer = setTimeout(remove, duration);

  toast.querySelector(".toast-dismiss").addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}

export const ToastManager = {
  show: showToast,
};
