// Read-only gallery: navigation and search load text; only an explicit preview loads an image.
(function () {
  "use strict";
  const registry = window.JiuzhouIllustrations;
  const menu = document.getElementById("quick-menu"), viewport = document.getElementById("game-viewport");
  if (!registry || !menu || !viewport) return;
  const node = (tag, text = "", className = "") => {
    const item = document.createElement(tag); item.textContent = text; item.className = className; return item;
  };
  const button = (text, className, action) => {
    const item = node("button", text, className); item.type = "button"; item.addEventListener("click", action); return item;
  };
  const trigger = button("画库", "qm-btn", open);
  trigger.id = "qm-gallery"; trigger.setAttribute("aria-controls", "drawer-gallery"); trigger.setAttribute("aria-haspopup", "dialog");
  menu.insertBefore(trigger, document.getElementById("qm-settings"));
  const drawer = node("aside", "", "drawer drawer-modal"); drawer.id = "drawer-gallery";
  drawer.setAttribute("aria-labelledby", "gallery-title");
  drawer.innerHTML = `
    <div class="ribbon-modal-box gallery-box">
      <header class="drawer-header gallery-header">
        <div><p class="gallery-eyebrow">九州图志 · 藏画入卷</p><div class="drawer-title" id="gallery-title">画库</div></div>
        <button type="button" class="drawer-close" id="btn-close-gallery">收起 ✕</button>
      </header>
      <div class="gallery-toolbar">
        <div class="gallery-tabs" role="tablist" aria-label="查找画卷的方式">
          <button type="button" role="tab" id="gallery-tab-featured" data-view="featured" aria-controls="gallery-results" aria-selected="true">常用精选</button>
          <button type="button" role="tab" id="gallery-tab-browse" data-view="browse" aria-controls="gallery-results" aria-selected="false" tabindex="-1">分类寻画</button>
          <button type="button" role="tab" id="gallery-tab-search" data-view="search" aria-controls="gallery-results" aria-selected="false" tabindex="-1">关键词搜索</button>
        </div>
        <div class="gallery-filter-row"><p id="gallery-overview"></p><label>画面设定 <select id="gallery-faction"><option value="">全部设定</option><option value="qing">后金</option><option value="ming">大明</option><option value="mongol">蒙古</option><option value="nanming">南明</option></select></label></div>
        <form id="gallery-search-form" class="gallery-search" hidden>
          <label class="gallery-search-label" for="gallery-query">搜索画面、调用短语或编号</label>
          <div><input id="gallery-query" type="search" placeholder="如：渡口 核名、兜裆布、JH01-01" autocomplete="off"><button type="submit">寻画</button></div>
        </form>
        <nav id="gallery-breadcrumb" class="gallery-breadcrumb" aria-label="图库分类路径" hidden></nav>
      </div>
      <div class="gallery-workspace">
        <section class="gallery-catalog" aria-label="画卷目录">
          <p id="gallery-status" class="gallery-status" role="status" aria-live="polite"></p>
          <div id="gallery-categories" class="gallery-categories"></div>
          <div id="gallery-results" class="gallery-results" role="tabpanel" aria-labelledby="gallery-tab-featured"></div>
          <nav id="gallery-pages" class="gallery-pages" aria-label="画卷翻页"></nav>
        </section>
        <section id="gallery-preview" class="gallery-preview is-empty" aria-label="画卷预览">
          <div id="gallery-image-wrap" class="gallery-image-wrap"><div class="gallery-empty-art" aria-hidden="true">卷</div></div>
          <div class="gallery-preview-info"><p class="gallery-eyebrow" id="gallery-preview-category">展卷一隅</p><h2 id="gallery-preview-title">先寻画，再展卷</h2><p id="gallery-preview-description">从左侧挑选一幅画卷，查看画面与调用短语。</p>
            <div id="gallery-token-tools" hidden><label for="gallery-token">调用短语</label><input id="gallery-token" readonly><button type="button" id="gallery-copy-token">复制短语</button></div>
            <p id="gallery-preview-status" role="status" aria-live="polite"></p>
          </div>
        </section>
      </div>
      <footer class="gallery-footer">先寻其意，后展其形。</footer>
    </div>`;
  viewport.appendChild(drawer);
  const byId = id => drawer.querySelector("#" + id);
  const results = byId("gallery-results"), status = byId("gallery-status"), categories = byId("gallery-categories");
  const breadcrumb = byId("gallery-breadcrumb"), pages = byId("gallery-pages");
  const preview = byId("gallery-preview"), imageWrap = byId("gallery-image-wrap"), previewStatus = byId("gallery-preview-status");
  const tabs = [...drawer.querySelectorAll("[data-view]")];
  const state = {view: "featured", faction: "", path: "", query: "", page: 1};
  let revision = 0, previewRevision = 0;
  const engine = () => window.__vnEngine;
  function open() {
    render();
    if (engine()?.openDrawer) engine().openDrawer(drawer); else drawer.classList.add("open");
  }
  function close() {
    if (engine()?.closeDrawer) engine().closeDrawer(drawer); else drawer.classList.remove("open");
  }
  byId("btn-close-gallery").addEventListener("click", close);
  drawer.addEventListener("click", event => {if (event.target === drawer) close();});
  document.getElementById("title-btn-gallery")?.addEventListener("click", open);
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {state.view = tab.dataset.view; state.page = 1; render();});
    tab.addEventListener("keydown", event => {
      const target = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (target === null) return;
      event.preventDefault(); tabs[target].click(); tabs[target].focus();
    });
  });
  byId("gallery-faction").addEventListener("change", event => {state.faction = event.target.value; state.page = 1; render();});
  byId("gallery-search-form").addEventListener("submit", event => {
    event.preventDefault(); state.query = byId("gallery-query").value.trim(); state.page = 1; render();
  });
  byId("gallery-copy-token").addEventListener("click", async () => {
    try {await navigator.clipboard.writeText(byId("gallery-token").value); previewStatus.textContent = "已复制调用短语。";}
    catch (_) {byId("gallery-token").focus(); byId("gallery-token").select(); previewStatus.textContent = "可长按或复制已选中的调用短语。";}
  });
  function navigate(path) {
    state.path = path; state.page = 1;
    render().then(() => breadcrumb.querySelector("button:last-child")?.focus());
  }
  function renderBreadcrumb() {
    breadcrumb.replaceChildren(button("全部分类", "", () => navigate("")));
    const parts = state.path ? state.path.split("/") : [];
    parts.forEach((part, i) => {
      breadcrumb.append(node("span", "／"), button(part, "", () => navigate(parts.slice(0, i + 1).join("/"))));
    });
  }
  function card(asset) {
    const article = node("article", "", "gallery-card"); article.dataset.assetId = asset.id;
    const meta = node("div", "", "gallery-card-meta");
    meta.append(node("span", asset.categoryPath.at(-1) || "画卷"), node("span", asset.factionName));
    article.append(meta, node("h3", asset.title), node("p", asset.description || "查看画卷了解详情。"), node("code", asset.token));
    const action = button("展卷预览 ↗", "gallery-preview-button", () => showPreview(asset));
    action.setAttribute("aria-label", "预览" + asset.title); article.append(action);
    return article;
  }
  async function render() {
    const ticket = ++revision;
    tabs.forEach(tab => {const active = tab.dataset.view === state.view; tab.setAttribute("aria-selected", active); tab.tabIndex = active ? 0 : -1;});
    results.setAttribute("aria-labelledby", "gallery-tab-" + state.view);
    byId("gallery-search-form").hidden = state.view !== "search";
    breadcrumb.hidden = state.view !== "browse";
    byId("gallery-overview").textContent = registry.list({faction: state.faction}).length + " 幅可选画卷";
    results.replaceChildren(); categories.replaceChildren(); pages.replaceChildren();
    status.textContent = ""; results.setAttribute("aria-busy", "true");
    try {
      let output;
      if (state.view === "featured") {
        const current = engine();
        const items = registry.featured({faction: state.faction || current?.currentFaction, coords: current?.currentCoords,
          backgroundId: current?.getSceneIllustration()?.id, limit: 8}).filter(asset => !state.faction || asset.faction === state.faction);
        output = {illustrations: items}; status.textContent = "常用画卷与此地精选，随行止而换。";
      } else if (state.view === "browse") {
        renderBreadcrumb(); output = registry.browse({path: state.path, faction: state.faction, page: state.page});
        status.textContent = (output.description || "循类而寻，逐层展开画卷。") + (state.path ? ` 共 ${output.total} 幅。` : "");
        output.children.forEach(child => {
          const item = button("", "gallery-category", () => navigate(child.path));
          item.append(node("strong", child.name), node("span", child.count + " 幅 · 进入 →"), node("small", child.description));
          categories.append(item);
        });
      } else if (!state.query) {
        output = {illustrations: []}; status.textContent = "输入画面内容或关键词，以空格组合多个条件。";
        ["背景 母图", "渡口 核名", "兜裆布", "骑兵 冲锋"].forEach(query => categories.append(button(query, "gallery-query-example", () => {
          byId("gallery-query").value = query; state.query = query; state.page = 1; render();
        })));
      } else {
        status.textContent = "正在寻画……";
        output = await registry.search({query: state.query, faction: state.faction, page: state.page});
        if (ticket !== revision) return;
        status.textContent = output.total ? `“${state.query}” · 寻得 ${output.total} 幅，第 ${output.page} 页。` : "暂未寻得相符画卷，试试更短的词，或换个分类。";
      }
      if (ticket !== revision) return;
      output.illustrations.forEach(asset => results.append(card(asset)));
      if (state.view === "browse" && !output.children.length && !output.illustrations.length) status.textContent = "此设定下暂无画卷，可返回上层或切换设定。";
      if (state.page > 1) pages.append(button("← 上一页", "", () => {state.page--; render();}));
      if (output.hasMore) pages.append(button("下一页 →", "", () => {state.page++; render();}));
    } catch (_) {
      if (ticket === revision) status.textContent = "寻画资料暂时未能打开，请重试；也可以先浏览分类或精选。";
    } finally {if (ticket === revision) results.setAttribute("aria-busy", "false");}
  }
  async function showPreview(selected) {
    const ticket = ++previewRevision;
    preview.classList.remove("is-empty");
    byId("gallery-preview-title").textContent = selected.title;
    byId("gallery-preview-description").textContent = selected.description;
    byId("gallery-preview-category").textContent = selected.categoryPath.join(" ／ ");
    byId("gallery-token-tools").hidden = false; byId("gallery-token").value = selected.token;
    previewStatus.textContent = "正在展卷……";
    let asset = registry.resolve(selected.id);
    // Full metadata is useful but its failure must not prevent loading an approved image.
    try {asset = await registry.details(selected.id) || asset;} catch (_) { /* keep the boot summary */ }
    if (ticket !== previewRevision) return;
    byId("gallery-preview-description").textContent = asset.description;
    const image = document.createElement("img"); image.alt = asset.title; image.decoding = "async";
    image.addEventListener("load", () => {if (ticket === previewRevision) previewStatus.textContent = "";}, {once: true});
    image.addEventListener("error", () => {
      if (ticket !== previewRevision) return;
      image.hidden = true; previewStatus.textContent = "画卷暂时未能打开，可重新点击预览。";
    }, {once: true});
    // This is the only gallery operation that assigns an image URL.
    image.src = asset.relativePath; imageWrap.replaceChildren(image);
    if (window.matchMedia("(max-width: 768px)").matches) preview.scrollIntoView({block: "nearest", behavior: "smooth"});
  }
})();
