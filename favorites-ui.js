// Optional read-only scenes UI. Removing this file does not affect generation.
(function () {
  "use strict";
  const api = window.JiuzhouSceneFavorites;
  const menu = document.getElementById("quick-menu");
  const viewport = document.getElementById("game-viewport");
  if (!api || !menu || !viewport) return;
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = {getItem() {throw new Error("storage_unavailable");}}; }
  const store = api.createStore(storage);
  const button = document.createElement("button");
  button.type = "button"; button.className = "qm-btn"; button.id = "qm-favorites"; button.textContent = "场景收藏";
  menu.insertBefore(button, document.getElementById("qm-settings"));
  const drawer = document.createElement("aside");
  drawer.className = "drawer drawer-modal"; drawer.id = "drawer-favorites";
  drawer.innerHTML = '<div class="ribbon-modal-box favorites-box"><div class="drawer-header"><div class="drawer-title">场景收藏</div><button type="button" class="drawer-close" id="btn-close-favorites">收起 ✕</button></div><div class="drawer-body"><p class="favorites-help">保存当前这一段文字与对应画卷，留待回看。</p><button type="button" class="btn-primary" id="btn-favorite-current">收藏当前段落</button><p id="favorites-status" role="status" aria-live="polite"></p><div id="favorites-list"></div></div></div>';
  viewport.appendChild(drawer);
  const list = drawer.querySelector("#favorites-list");
  const status = drawer.querySelector("#favorites-status");
  const save = drawer.querySelector("#btn-favorite-current");
  const engine = () => window.__vnEngine;
  const current = () => engine()?.getCurrentReadingScene?.();
  function node(tag, text, className) {
    const item = document.createElement(tag); item.textContent = text;
    if (className) item.className = className;
    return item;
  }
  function render() {
    save.disabled = !current();
    list.replaceChildren();
    const items = store.list();
    if (!items.length) list.appendChild(node("p", "还没有收藏。读到喜欢的段落时，可以从这里收好。", "favorites-empty"));
    items.forEach(item => {
      const card = document.createElement("details"); card.className = "favorite-scene";
      const summary = node("summary", (item.sub || item.speaker || "九州行旅") + " · " + item.text.slice(0, 34));
      card.appendChild(summary);
      card.appendChild(node("p", item.chapter + " · " + item.speaker, "favorite-meta"));
      // Images load only on explicit expansion; no generation or external URLs.
      if (item.image) card.addEventListener("toggle", () => {
        if (!card.open || card.querySelector("img")) return;
        const image = document.createElement("img"); image.src = item.image; image.alt = item.sub || "收藏画卷"; image.loading = "lazy";
        card.insertBefore(image, card.querySelector(".favorite-text"));
      });
      card.appendChild(node("p", item.text, "favorite-text"));
      const copy = node("button", "复制段落", "qm-btn"); copy.type = "button";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(item.text); status.textContent = "已复制正文。"; }
        catch (_) { status.textContent = "浏览器未允许复制；可以长按或选中文字复制。"; }
      });
      const remove = node("button", "取消收藏", "qm-btn"); remove.type = "button";
      remove.addEventListener("click", () => { const result = store.remove(item.id); status.textContent = result.ok ? "已取消收藏。" : result.message; if (result.ok) render(); });
      const actions = document.createElement("div"); actions.className = "favorite-actions"; actions.append(copy, remove); card.appendChild(actions);
      list.appendChild(card);
    });
  }
  button.addEventListener("click", () => {
    status.textContent = store.error() || ""; render(); engine()?.openDrawer(drawer);
  });
  drawer.querySelector("#btn-close-favorites").addEventListener("click", () => engine()?.closeDrawer(drawer));
  save.addEventListener("click", () => {
    const result = store.add(current());
    status.textContent = result.ok ? result.duplicate ? "这一段已经收藏。" : "已收藏当前段落。" : result.message;
    if (result.ok) render();
  });
})();
