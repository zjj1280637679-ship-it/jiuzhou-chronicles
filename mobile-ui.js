/* 九州沉浮录 · 手机阅读布局增强：只管理 DOM 展示，不接管游戏状态机。 */
(() => {
  "use strict";

  const menu = document.getElementById("quick-menu");
  const menuToggle = document.getElementById("mobile-menu-toggle");
  const dialogueBox = document.getElementById("dialogue-box");
  const dialogueContent = document.getElementById("dialogue-content");
  const branchTools = document.getElementById("story-branch-indicator");
  const progress = document.getElementById("ai-harness-progress");
  const cancelRequest = document.getElementById("btn-cancel-ai-request");

  if (!menu || !menuToggle || !dialogueBox || !dialogueContent) return;

  const mobileQuery = window.matchMedia(
    "(max-width: 768px), (max-width: 1024px) and (max-height: 600px) and (pointer: coarse)"
  );

  function setMenuOpen(open) {
    const active = Boolean(open && mobileQuery.matches);
    menu.classList.toggle("mobile-menu-open", active);
    menuToggle.setAttribute("aria-expanded", String(active));
    menuToggle.textContent = active ? "✕ 收起" : "☰ 菜单";
  }

  menuToggle.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(!menu.classList.contains("mobile-menu-open"));
  });

  menu.querySelectorAll(".qm-btn").forEach(button => {
    button.addEventListener("click", () => setMenuOpen(false));
  });

  document.addEventListener("pointerdown", event => {
    if (!menu.contains(event.target)) setMenuOpen(false);
  });

  window.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      setMenuOpen(false);
      branchTools?.classList.remove("mobile-tools-open");
      updateBranchToggle();
    }
  });

  /* 分支详情与篇幅为次要设置，保留但默认折叠。
     不删除原按钮，原游戏对其绑定的事件仍照常执行。 */
  let branchToggle = null;
  if (branchTools) {
    branchToggle = document.createElement("button");
    branchToggle.type = "button";
    branchToggle.className = "mobile-story-tools-toggle";
    branchToggle.id = "mobile-story-tools-toggle";
    branchToggle.setAttribute("aria-controls", "ai-length-group");
    branchToggle.setAttribute("aria-expanded", "false");
    const pill = document.getElementById("branch-pill");
    if (pill) pill.insertAdjacentElement("afterend", branchToggle);
    else branchTools.prepend(branchToggle);

    branchToggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation(); // 外层对白框的点击会推进剧情
      branchTools.classList.toggle("mobile-tools-open");
      updateBranchToggle();
    });

    branchTools.querySelectorAll(".btn-length").forEach(button => {
      button.addEventListener("click", () => {
        // 原长度选择处理在先，界面文字等当前回合状态更新完成后再读取。
        window.requestAnimationFrame(updateBranchToggle);
      });
    });
  }

  function updateBranchToggle() {
    if (!branchToggle) return;
    const selected = branchTools.querySelector(".btn-length.active");
    const amount = selected?.getAttribute("data-length") ||
      selected?.textContent?.match(/\d+/)?.[0] || "2000";
    const open = branchTools.classList.contains("mobile-tools-open");
    branchToggle.textContent = "篇幅 " + amount + (open ? " ▴" : " ▾");
    branchToggle.setAttribute("aria-expanded", String(open));
  }
  updateBranchToggle();

  /* 手机字号调节：不触碰正文内容、字数统计或输出 Token 设定。 */
  const fontControls = document.createElement("div");
  fontControls.className = "mobile-font-controls";
  fontControls.setAttribute("aria-label", "正文阅读字号");
  const minus = document.createElement("button");
  minus.type = "button";
  minus.textContent = "A−";
  minus.setAttribute("aria-label", "缩小正文字体");
  const plus = document.createElement("button");
  plus.type = "button";
  plus.textContent = "A+";
  plus.setAttribute("aria-label", "放大正文字体");
  const sizeLabel = document.createElement("span");
  sizeLabel.setAttribute("aria-live", "polite");
  fontControls.append(minus, sizeLabel, plus);
  menu.appendChild(fontControls);

  let fontSize = 17;
  try {
    const stored = Number(window.localStorage.getItem("jiuzhou-mobile-reader-font-size"));
    if (Number.isInteger(stored) && stored >= 15 && stored <= 22) fontSize = stored;
  } catch (_) { /* 隐私模式或本地存储被禁用时仍可正常阅读 */ }
  function setFontSize(size) {
    fontSize = Math.max(15, Math.min(22, size));
    document.documentElement.style.setProperty("--mobile-reader-font-size", fontSize + "px");
    sizeLabel.textContent = "正文 " + fontSize + "px";
    minus.disabled = fontSize <= 15;
    plus.disabled = fontSize >= 22;
    try {
      window.localStorage.setItem("jiuzhou-mobile-reader-font-size", String(fontSize));
    } catch (_) {}
  }
  minus.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setFontSize(fontSize - 1);
  });
  plus.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    setFontSize(fontSize + 1);
  });
  setFontSize(fontSize);

  /* 从浮动的高层状态消息改成阅读器内消息，避免挡住分支选择。
     取消按钮也要从折叠菜单移动到正文旁，允许一触取消等待。 */
  function homeLocation(node) {
    return node ? {parent: node.parentNode, next: node.nextSibling} : null;
  }
  const progressHome = homeLocation(progress);
  const cancelHome = homeLocation(cancelRequest);

  function returnHome(node, home) {
    if (!node || !home?.parent || node.parentNode === home.parent) return;
    const anchor = home.next && home.next.parentNode === home.parent ? home.next : null;
    home.parent.insertBefore(node, anchor);
  }

  function syncResponsiveLayout() {
    setMenuOpen(false);
    if (mobileQuery.matches) {
      if (progress && progress.parentNode !== dialogueBox) {
        dialogueBox.insertBefore(progress, dialogueContent);
      }
      if (cancelRequest && cancelRequest.parentNode !== dialogueBox) {
        dialogueBox.insertBefore(cancelRequest, dialogueContent);
      }
    } else {
      returnHome(progress, progressHome);
      returnHome(cancelRequest, cancelHome);
      branchTools?.classList.remove("mobile-tools-open");
      updateBranchToggle();
    }
  }

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncResponsiveLayout);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncResponsiveLayout);
  }

  syncResponsiveLayout();
})();
