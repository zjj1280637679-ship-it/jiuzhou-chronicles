/* 九州沉浮录 · 移动阅读界面。同步 DOM 与引擎只读场景图投影，不改写剧情、AI 或存档。 */
(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const menu = byId("quick-menu");
  const menuToggle = byId("mobile-menu-toggle");
  const dialogueBox = byId("dialogue-box");
  const dialogueContent = byId("dialogue-content");
  const viewport = byId("game-viewport");
  if (!menu || !menuToggle || !dialogueBox || !dialogueContent) return;

  const mobileQuery = window.matchMedia(
    "(max-width: 768px), (max-width: 1024px) and (max-height: 600px) and (pointer: coarse)"
  );
  const choice = byId("choice-overlay");
  const prompt = byId("continue-prompt");
  const dialogueNav = byId("dialogue-nav-bar");
  const next = byId("mobile-next");
  const pagePosition = byId("mobile-page-position");
  const sceneTitle = byId("mobile-scene-title");
  const sceneArt = byId("mobile-scene-art");
  const defaultArt = sceneArt?.getAttribute("src") || "data/mobile/palace-night.webp";
  const branchPill = byId("branch-pill");
  const speaker = byId("speaker-name");
  const speakerSub = byId("speaker-sub");
  const incense = byId("incense-label");
  const progress = byId("ai-harness-progress");
  const cancelRequest = byId("btn-cancel-ai-request");
  const drawers = Array.from(document.querySelectorAll(".drawer, #modal-illustration"));
  const modalElements = new Set(drawers);
  const interactiveSelector = "button, a, input, textarea, select, summary, [contenteditable='true'], [role='button'], #branch-pill, .dialogue-illustration-card";
  const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";
  const originalMenuRole = menu.getAttribute("role");
  const originalMenuLabel = menu.getAttribute("aria-label");
  let activeModal = null;
  let preferredDrawer = null;
  let fontSize = 17;
  let syncPending = false;
  let modalDirty = true;
  let syncing = false;
  const returnFocus = new WeakMap();
  const lastModalFocus = new WeakMap();
  const inertRestore = new Map();

  function attr(node, name, value) {
    if (!node) return;
    if (value === null) {
      if (node.hasAttribute(name)) node.removeAttribute(name);
    } else if (node.getAttribute(name) !== String(value)) {
      node.setAttribute(name, String(value));
    }
  }

  function text(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function isChoiceVisible() {
    return Boolean(choice && !choice.hidden && choice.classList.contains("visible"));
  }

  function isDrawerOpen(drawer) {
    return !drawer.hidden && drawer.classList.contains("open");
  }

  function isMenuOpen() {
    return mobileQuery.matches && menu.classList.contains("mobile-menu-open");
  }

  function isGenerating() {
    return dialogueNav?.getAttribute("data-generating") === "true" || Boolean(progress && !progress.hidden);
  }

  function setMenuOpen(open) {
    const visible = Boolean(open && mobileQuery.matches);
    if (menu.classList.contains("mobile-menu-open") !== visible) {
      menu.classList.toggle("mobile-menu-open", visible);
    }
    attr(menuToggle, "aria-expanded", visible);
    queueSync(true);
  }

  function forward(button, target) {
    button?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (target && !target.disabled) target.click();
    });
  }
  forward(byId("mobile-home"), byId("qm-home"));
  forward(byId("mobile-backlog"), byId("qm-log"));
  forward(byId("mobile-choice-return"), byId("btn-dialogue-prev"));
  // Only this explicit action reaches the engine's existing quick-show / next-beat handler.
  next?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (!next.disabled && !activeModal) prompt?.click();
  });
  menuToggle.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(!isMenuOpen());
  });
  byId("mobile-menu-close")?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
  });
  menu.querySelectorAll(".qm-btn").forEach(button => {
    button.addEventListener("click", () => setMenuOpen(false));
  });

  function homeLocation(node) {
    return node ? { parent: node.parentNode, next: node.nextSibling } : null;
  }
  const progressHome = homeLocation(progress);
  const cancelHome = homeLocation(cancelRequest);
  const lengthGroup = byId("ai-length-group");
  const explainer = byId("btn-branch-explainer");
  const readingTools = byId("mobile-reading-tools");
  const lengthHome = homeLocation(lengthGroup);
  const explainerHome = homeLocation(explainer);

  function returnHome(node, home) {
    if (!node || !home?.parent || node.parentNode === home.parent) return;
    const anchor = home.next?.parentNode === home.parent ? home.next : null;
    home.parent.insertBefore(node, anchor);
  }

  function setFontSize(size) {
    fontSize = Math.max(15, Math.min(22, size));
    document.documentElement.style.setProperty("--mobile-reader-font-size", fontSize + "px");
    const minus = byId("mobile-font-decrease");
    const plus = byId("mobile-font-increase");
    if (minus) minus.disabled = fontSize === 15;
    if (plus) plus.disabled = fontSize === 22;
  }
  [["mobile-font-decrease", -1], ["mobile-font-increase", 1]].forEach(([id, delta]) => {
    byId(id)?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setFontSize(fontSize + delta);
    });
  });
  setFontSize(fontSize);

  function syncResponsiveLayout() {
    document.documentElement.classList.toggle("mobile-layout", mobileQuery.matches);
    setMenuOpen(false);
    if (mobileQuery.matches) {
      if (progress && progress.parentNode !== dialogueBox) dialogueBox.insertBefore(progress, dialogueContent);
      if (cancelRequest && cancelRequest.parentNode !== dialogueBox) dialogueBox.insertBefore(cancelRequest, dialogueContent);
      if (readingTools) {
        if (lengthGroup && lengthGroup.parentNode !== readingTools) readingTools.appendChild(lengthGroup);
        if (explainer && explainer.parentNode !== readingTools) readingTools.appendChild(explainer);
      }
    } else {
      returnHome(progress, progressHome);
      returnHome(cancelRequest, cancelHome);
      returnHome(lengthGroup, lengthHome);
      returnHome(explainer, explainerHome);
    }
    queueSync(true);
  }

  // Scrolling/selecting the prose, or touching the scene, never advances the game on phones.
  // Let controls handle their own click, then stop it before the legacy dialogue click listener.
  const bubbleStops = new WeakSet();
  function protectDialogueControls() {
    dialogueBox.querySelectorAll(interactiveSelector).forEach(control => {
      if (bubbleStops.has(control) || control === prompt) return;
      bubbleStops.add(control);
      control.addEventListener("click", event => {
        if (mobileQuery.matches) event.stopPropagation();
      });
    });
  }
  dialogueBox.addEventListener("click", event => {
    if (!mobileQuery.matches || !(event.target instanceof Element)) return;
    if (event.target.closest("#continue-prompt")) return;
    if (event.target.closest(interactiveSelector)) return;
    event.stopPropagation();
  }, true);
  viewport?.addEventListener("click", event => {
    if (!mobileQuery.matches || !(event.target instanceof Element)) return;
    if (event.target.closest(interactiveSelector + ", #dialogue-box, #quick-menu, .drawer, #modal-illustration, #choice-overlay")) return;
    event.stopPropagation();
  }, true);

  function visibleFocusables(modal) {
    return Array.from(modal.querySelectorAll(focusableSelector)).filter(node => {
      return !node.hidden && !node.closest("[hidden], [inert]") && node.getClientRects().length > 0;
    });
  }

  function focusNode(node) {
    if (!node?.isConnected || node.closest("[inert], [hidden]") || node.getClientRects().length === 0) return false;
    node.focus({ preventScroll: true });
    return document.activeElement === node;
  }

  function focusModal(modal, preferred = null) {
    if (preferred && modal.contains(preferred) && focusNode(preferred)) return;
    if (focusNode(lastModalFocus.get(modal))) return;
    const first = visibleFocusables(modal)[0];
    if (!focusNode(first)) {
      attr(modal, "tabindex", "-1");
      focusNode(modal);
    }
  }

  function manageInert(node) {
    if (!inertRestore.has(node)) inertRestore.set(node, node.hasAttribute("inert"));
    attr(node, "inert", "");
  }

  function restoreInert() {
    inertRestore.forEach((original, node) => attr(node, "inert", original ? "" : null));
    inertRestore.clear();
  }

  function makeBackgroundInert(modal) {
    // Inert siblings along the ancestor chain, never the modal's own ancestors.
    let child = modal;
    while (child?.parentElement) {
      const parent = child.parentElement;
      Array.from(parent.children).forEach(sibling => {
        if (sibling !== child && !/^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) manageInert(sibling);
      });
      if (parent === document.body) break;
      child = parent;
    }
  }

  function syncModals() {
    const previous = activeModal;
    const focused = document.activeElement;
    const openDrawers = drawers.filter(isDrawerOpen);
    const topDrawer = preferredDrawer && openDrawers.includes(preferredDrawer)
      ? preferredDrawer : (openDrawers.includes(previous) ? previous : openDrawers.at(-1));
    preferredDrawer = null;
    if (mobileQuery.matches && topDrawer) {
      openDrawers.forEach(drawer => {
        if (drawer !== topDrawer) drawer.classList.remove("open");
      });
      if (isMenuOpen()) {
        menu.classList.remove("mobile-menu-open");
        attr(menuToggle, "aria-expanded", false);
      }
    }
    activeModal = topDrawer || (isMenuOpen() ? menu : (isChoiceVisible() ? choice : null));
    restoreInert();

    drawers.forEach(drawer => {
      const shown = isDrawerOpen(drawer);
      attr(drawer, "role", "dialog");
      const title = drawer.querySelector(".drawer-title, .illustration-title");
      if (!drawer.hasAttribute("aria-labelledby") && !drawer.hasAttribute("aria-label")) {
        if (title?.id) attr(drawer, "aria-labelledby", title.id);
        else attr(drawer, "aria-label", title?.textContent.trim() || "游戏详情");
      }
      attr(drawer, "aria-hidden", !shown);
      attr(drawer, "aria-modal", drawer === activeModal ? "true" : null);
      if (!shown) manageInert(drawer);
    });
    if (choice) {
      const shown = isChoiceVisible();
      attr(choice, "role", "dialog");
      if (!choice.hasAttribute("aria-labelledby")) attr(choice, "aria-label", "此刻抉择");
      attr(choice, "aria-hidden", !shown);
      attr(choice, "aria-modal", choice === activeModal ? "true" : null);
      if (!shown) manageInert(choice);
    }
    if (mobileQuery.matches) {
      attr(menu, "role", "dialog");
      attr(menu, "aria-label", "更多功能");
      attr(menu, "aria-hidden", !isMenuOpen());
      attr(menu, "aria-modal", menu === activeModal ? "true" : null);
      if (!isMenuOpen()) manageInert(menu);
    } else {
      attr(menu, "role", originalMenuRole);
      attr(menu, "aria-label", originalMenuLabel);
      attr(menu, "aria-hidden", null);
      attr(menu, "aria-modal", null);
    }
    if (activeModal) makeBackgroundInert(activeModal);
    // A closed modal can return focus to Continue only after its disabled state is released.
    if (next) next.disabled = Boolean(activeModal || isGenerating());

    if (previous !== activeModal) {
      if (previous && previous.contains(focused)) lastModalFocus.set(previous, focused);
      if (activeModal) {
        if (!returnFocus.has(activeModal) || !previous) {
          returnFocus.set(activeModal, focused && focused !== document.body ? focused : next);
        }
        const returning = previous ? returnFocus.get(previous) : null;
        focusModal(activeModal, returning);
      } else {
        const destination = previous ? returnFocus.get(previous) : null;
        if (!focusNode(destination)) {
          if (previous === menu || destination?.closest("#quick-menu")) focusNode(menuToggle);
          else focusNode(next || byId("btn-dialogue-prev"));
        }
      }
    }
  }

  function upgradeChoices() {
    choice?.querySelectorAll(".choice-card").forEach(card => {
      attr(card, "role", "button");
      attr(card, "tabindex", "0");
    });
  }

  function syncScene() {
    const rawTitle = (branchPill?.textContent || "").trim();
    const parts = rawTitle.split(/\s*[·｜|]\s*/);
    const title = (parts.length >= 3 ? parts[2] : parts.length > 1 ? parts[1] : rawTitle.replace(/^[^\p{L}\p{N}]+/u, ""))
      .replace(/\s*[（(]单向不可逆演进[）)]\s*$/, "").trim();
    text(sceneTitle, title || speakerSub?.textContent.trim() || "九州行旅");

    if (sceneArt) {
      const faction = incense?.textContent || "";
      const illustration = dialogueContent.querySelector(".dialogue-illustration-card img");
      const scene = window.__vnEngine?.currentSceneIllustration;
      let art = defaultArt;
      if (/草原|蒙古|大汗/.test(faction)) art = "data/illustrations/mongol/battle.svg";
      else if (/海邦|南明|海疆|海上/.test(faction)) art = "data/illustrations/nanming/war.svg";
      if (scene?.relativePath) art = scene.relativePath;
      if (illustration?.getAttribute("src")) art = illustration.getAttribute("src");
      attr(sceneArt, "src", art);
      attr(sceneArt, "alt", scene?.title || (speakerSub?.textContent.trim() || title || "九州行旅") + " · 场景画面");
    }
    const promptText = prompt?.textContent || "";
    const count = promptText.match(/\[(\d+)\s*\/\s*(\d+)\]/);
    const typing = prompt?.style.opacity === "0";
    const busy = isGenerating();
    const step = Number(dialogueNav?.getAttribute("data-step"));
    const total = Number(dialogueNav?.getAttribute("data-total"));
    const hasCounter = Number.isInteger(step) && Number.isInteger(total) && step >= 1 && total >= step;
    // Public navigation metadata remains accurate during typing and at the final single beat.
    // The compatibility fallback uses only the current prompt, never a previous chapter's total.
    const counter = hasCounter ? step + " / " + total : !typing && count ? count[1] + " / " + count[2] : "阅读中";
    text(pagePosition, busy ? "推演中" : isChoiceVisible() ? "待抉择" : counter);
    if (next) {
      next.disabled = Boolean(activeModal || busy);
      attr(next, "aria-label", typing ? "显示本段全文" : /决断|抉择/.test(promptText) ? "查看此刻抉择" : "继续下一段");
    }
    protectDialogueControls();
  }

  function queueSync(withModals = false) {
    if (withModals) modalDirty = true;
    if (syncPending) return;
    syncPending = true;
    window.requestAnimationFrame(() => {
      syncPending = false;
      if (syncing) return;
      syncing = true;
      try {
        upgradeChoices();
        if (modalDirty) {
          modalDirty = false;
          syncModals();
        }
        syncScene();
      } finally {
        syncing = false;
      }
    });
  }

  const modalObserver = new MutationObserver(records => {
    for (const record of records) {
      if (modalElements.has(record.target) && isDrawerOpen(record.target)) preferredDrawer = record.target;
    }
    queueSync(true);
  });
  [...drawers, menu].forEach(node => {
    modalObserver.observe(node, { attributes: true, attributeFilter: ["class", "hidden"] });
  });
  if (choice) modalObserver.observe(choice, {
    attributes: true, attributeFilter: ["class", "hidden"], childList: true, subtree: true
  });
  const sceneObserver = new MutationObserver(() => queueSync());
  [branchPill, speaker, speakerSub, incense, dialogueContent].filter(Boolean).forEach(node => {
    sceneObserver.observe(node, { childList: true, characterData: true, subtree: true });
  });
  if (prompt) sceneObserver.observe(prompt, {
    attributes: true, attributeFilter: ["style"], childList: true, characterData: true, subtree: true
  });
  if (progress) sceneObserver.observe(progress, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });
  if (dialogueNav) sceneObserver.observe(dialogueNav, {
    attributes: true, attributeFilter: ["data-step", "data-total", "data-generating"]
  });

  document.addEventListener("focusin", event => {
    if (!activeModal) return;
    if (activeModal.contains(event.target)) lastModalFocus.set(activeModal, event.target);
    else focusModal(activeModal);
  });

  // Stop only propagation at the target: forms and native button keyboard defaults keep working,
  // while the engine's window-level navigation shortcuts cannot advance a modal's background.
  function stopAtTarget(event) {
    const target = event.target;
    if (target?.addEventListener && target !== window && target !== document) {
      target.addEventListener(event.type, e => e.stopPropagation(), { once: true });
    } else event.stopImmediatePropagation();
  }
  window.addEventListener("wheel", event => {
    // Preserve native scrolling; keep the legacy upward-wheel backlog shortcut out of sheets.
    if (activeModal || mobileQuery.matches) stopAtTarget(event);
  }, { capture: true, passive: true });
  window.addEventListener("keydown", event => {
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest(".choice-card");
    if (activeModal === choice && ["Escape", "ArrowLeft", "q", "Q"].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const previous = byId("btn-dialogue-prev");
      if (!event.repeat && previous && !previous.disabled) previous.click();
      return;
    }
    if (activeModal && card && activeModal.contains(card) && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) card.click();
      return;
    }
    if (activeModal && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (activeModal === menu) setMenuOpen(false);
      else if (activeModal !== choice) activeModal.querySelector(".drawer-close")?.click();
      return;
    }
    if (activeModal && event.key === "Tab") {
      const items = visibleFocusables(activeModal);
      const first = items[0];
      const last = items.at(-1);
      if (!first || (event.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement)))) {
        event.preventDefault();
        focusNode(last || activeModal);
      } else if (!event.shiftKey && (document.activeElement === last || !activeModal.contains(document.activeElement))) {
        event.preventDefault();
        focusNode(first);
      }
      return;
    }
    const navigationKey = ["ArrowLeft", "ArrowRight", "q", "Q", " ", "Enter"].includes(event.key);
    if (navigationKey && (activeModal || target?.closest(interactiveSelector))) stopAtTarget(event);
  }, true);

  if (typeof mobileQuery.addEventListener === "function") mobileQuery.addEventListener("change", syncResponsiveLayout);
  else mobileQuery.addListener(syncResponsiveLayout);
  syncResponsiveLayout();
})();
