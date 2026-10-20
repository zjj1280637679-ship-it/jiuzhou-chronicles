/* Keep the focused mobile sheet inside the visual viewport. No story or settings state. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.JiuzhouInputViewport = api;
    const mount = () => { api.controller = api.createInputViewportAdapter({ window: root, document: root.document }); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  }
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";

  const MOBILE_QUERY = "(max-width: 768px), (max-width: 1024px) and (max-height: 600px) and (pointer: coarse)";
  const EDITABLE = "textarea, input, [contenteditable]:not([contenteditable='false'])";
  const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

  // Address bars can change viewport height without an IME. Require both an editable
  // focus and substantial occlusion. Pinch zoom must retain the browser's own layout.
  function measureInputViewport({ mobile, focused, scale, viewportHeight, offsetTop, referenceHeight }) {
    if (!mobile || !focused || !Number.isFinite(scale) || Math.abs(scale - 1) > .02) return null;
    if (!(viewportHeight > 0) || !(referenceHeight > 0)) return null;
    if (referenceHeight - viewportHeight < Math.max(120, referenceHeight * .2)) return null;
    return { height: Math.round(viewportHeight), top: Math.max(0, Math.round(offsetTop || 0)) };
  }

  function createInputViewportAdapter({ window: win, document: doc }) {
    const vv = win.visualViewport;
    if (!vv) return { destroy() {} };
    const query = win.matchMedia(MOBILE_QUERY);
    let referenceHeight = 0;
    let referenceWidth = 0;
    let frame = null;
    let disposed = false;
    let fittedModal = null;
    const removers = [];

    function listen(target, type, handler) {
      target.addEventListener(type, handler, { passive: true });
      removers.push(() => target.removeEventListener(type, handler));
    }

    function focusedInput() {
      const node = doc.activeElement;
      if (!node?.matches?.(EDITABLE) || node.disabled || node.readOnly) return null;
      if (node.tagName === "INPUT" && !TEXT_INPUT_TYPES.has((node.type || "text").toLowerCase())) return null;
      if (node.closest("[hidden], [inert]") || !node.getClientRects().length) return null;
      return node;
    }

    function clear() {
      if (!fittedModal) return;
      fittedModal.classList.remove("input-viewport-fit");
      fittedModal.style.removeProperty("--input-viewport-height");
      fittedModal.style.removeProperty("--input-viewport-top");
      fittedModal = null;
    }

    function keepInputVisible(input, modal) {
      const scroller = input.closest(".drawer-body");
      if (!scroller || !modal.contains(scroller)) return;
      const field = input.getBoundingClientRect();
      const area = scroller.getBoundingClientRect();
      const padding = 10;
      // Scroll only this sheet's content, and only the distance it is obscured.
      // Never scroll the document, stage, or a field already visible in the sheet.
      const available = area.height - 2 * padding;
      if (available <= 0) return;
      const delta = field.height > available
        ? field.top - area.top - padding
        : field.top < area.top + padding ? field.top - area.top - padding
          : field.bottom > area.bottom - padding ? field.bottom - area.bottom + padding : 0;
      if (delta) scroller.scrollTop += delta;
    }

    function sync() {
      frame = null;
      if (disposed) return;
      const input = focusedInput();
      const modal = input?.closest(".drawer.open, [role='dialog'][aria-modal='true']");
      const width = doc.documentElement.clientWidth || win.innerWidth;
      const layoutHeight = Math.max(doc.documentElement.clientHeight || 0, win.innerHeight || 0);
      const scale = vv.scale || 1;
      if (Math.abs(scale - 1) <= .02) {
        // A width change denotes a new orientation/breakpoint, not a taller keyboard.
        if (Math.abs(width - referenceWidth) > 2) {
          referenceWidth = width;
          referenceHeight = Math.max(layoutHeight, vv.height);
        } else referenceHeight = !input ? Math.max(layoutHeight, vv.height)
          : Math.max(referenceHeight, layoutHeight);
      }
      const box = measureInputViewport({ mobile: query.matches, focused: Boolean(modal), scale,
        viewportHeight: vv.height, offsetTop: vv.offsetTop, referenceHeight });
      if (!box) { clear(); return; }
      if (fittedModal !== modal) { clear(); fittedModal = modal; }
      modal.style.setProperty("--input-viewport-height", box.height + "px");
      modal.style.setProperty("--input-viewport-top", box.top + "px");
      if (!modal.classList.contains("input-viewport-fit")) modal.classList.add("input-viewport-fit");
      keepInputVisible(input, modal);
    }

    function schedule() {
      if (!disposed && frame === null) frame = win.requestAnimationFrame(sync);
    }
    listen(vv, "resize", schedule);
    listen(vv, "scroll", schedule);
    listen(win, "resize", schedule);
    listen(win, "orientationchange", () => { referenceWidth = 0; referenceHeight = 0; schedule(); });
    listen(doc, "focusin", schedule);
    listen(doc, "focusout", schedule);
    if (query.addEventListener) listen(query, "change", schedule);
    else { query.addListener(schedule); removers.push(() => query.removeListener(schedule)); }
    const observer = new win.MutationObserver(schedule);
    doc.querySelectorAll(".drawer, [role='dialog']").forEach(node => observer.observe(node, {
      attributes: true, attributeFilter: ["class", "hidden", "inert", "aria-modal"]
    }));
    // Capture the full viewport before the first focused keyboard event.
    sync();
    return {
      destroy() {
        if (disposed) return;
        disposed = true;
        if (frame !== null) win.cancelAnimationFrame(frame);
        frame = null;
        observer.disconnect();
        removers.forEach(remove => remove());
        clear();
      }
    };
  }

  return { MOBILE_QUERY, measureInputViewport, createInputViewportAdapter };
});
