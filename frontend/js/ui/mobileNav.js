// js/ui/mobileNav.js
// Floating "jump to widget" button for mobile viewports.
// Renders a draggable FAB that opens an anchor list of all bento widgets.

export const MobileNav = {
  _fab: null,
  _panel: null,
  _isOpen: false,

  init() {
    // Only activate on small screens; use a media query listener so it
    // can be torn down if the user resizes to a large viewport.
    const mq = window.matchMedia("(max-width: 768px)");
    if (mq.matches) this._build();

    mq.addEventListener("change", (e) => {
      if (e.matches) {
        this._build();
      } else {
        this._destroy();
      }
    });
  },

  _build() {
    if (this._fab) return; // Already built

    // --- Collect widgets ---
    const widgets = [...document.querySelectorAll(".bento-widget[id]")].filter(
      (w) => w.querySelector(".widget-header"),
    );

    if (widgets.length === 0) return;

    // --- Build panel (anchor list) ---
    this._panel = document.createElement("div");
    this._panel.id = "mobile-nav-panel";
    this._panel.setAttribute("role", "dialog");
    this._panel.setAttribute("aria-label", "Jump to widget");
    this._panel.setAttribute("aria-hidden", "true");

    const panelInner = document.createElement("div");
    panelInner.className = "mobile-nav-panel-inner";

    const title = document.createElement("div");
    title.className = "mobile-nav-title";
    title.textContent = "Jump to";
    panelInner.appendChild(title);

    const list = document.createElement("ul");
    list.className = "mobile-nav-list";

    widgets.forEach((widget) => {
      const headerEl = widget.querySelector(".widget-header");
      // Get only the direct text, not the text of nested buttons
      const label = [...headerEl.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE || n.tagName === "SPAN")
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim() || widget.id;

      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${widget.id}`;
      a.textContent = label;
      a.addEventListener("click", () => this._close());
      li.appendChild(a);
      list.appendChild(li);
    });

    panelInner.appendChild(list);
    this._panel.appendChild(panelInner);
    document.body.appendChild(this._panel);

    // --- Build FAB ---
    this._fab = document.createElement("button");
    this._fab.id = "mobile-nav-fab";
    this._fab.setAttribute("type", "button");
    this._fab.setAttribute("aria-label", "Jump to widget");
    this._fab.setAttribute("title", "Navigate");
    this._fab.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>`;

    this._fab.addEventListener("click", () => this._toggle());
    document.body.appendChild(this._fab);

    // Close panel when clicking outside
    document.addEventListener("click", this._handleOutsideClick.bind(this), true);
  },

  _destroy() {
    this._fab?.remove();
    this._panel?.remove();
    this._fab = null;
    this._panel = null;
    this._isOpen = false;
    document.removeEventListener("click", this._handleOutsideClick.bind(this), true);
  },

  _toggle() {
    this._isOpen ? this._close() : this._open();
  },

  _open() {
    this._isOpen = true;
    this._panel.classList.add("open");
    this._panel.setAttribute("aria-hidden", "false");
    this._fab.classList.add("active");
  },

  _close() {
    this._isOpen = false;
    this._panel.classList.remove("open");
    this._panel.setAttribute("aria-hidden", "true");
    this._fab.classList.remove("active");
  },

  _handleOutsideClick(e) {
    if (
      this._isOpen &&
      !this._panel.contains(e.target) &&
      e.target !== this._fab
    ) {
      this._close();
    }
  },
};
