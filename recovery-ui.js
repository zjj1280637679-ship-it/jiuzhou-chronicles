(function () {
  "use strict";
  function mount() {
    const engine = window.__vnEngine;
    if (!engine || document.getElementById("turn-recovery-panel")) return;
    const section = document.createElement("section");
    section.id = "turn-recovery-panel";
    section.className = "turn-recovery-panel";
    section.hidden = true;
    section.setAttribute("aria-label", "未完成行动");
    const title = document.createElement("strong");
    title.textContent = "本次行动尚未交付";
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    const action = document.createElement("p");
    action.className = "turn-recovery-action";
    const buttons = document.createElement("div");
    buttons.className = "recovery-actions";
    function button(label, handler) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = label;
      el.addEventListener("click", handler);
      return el;
    }
    const retry = button("按原行动重试", () => engine.retryPendingTurn());
    const local = button("改用本地剧情", () => engine.retryPendingTurn(true));
    const discard = button("放弃本次尝试", () => engine.discardPendingTurn());
    const settings = button("检查 API 设置", () => {
      engine.openDrawer(engine.drawerSettings);
      requestAnimationFrame(() => document.getElementById("settings-connection-title")?.scrollIntoView({block: "start", behavior: "instant"}));
    });
    retry.id = "btn-retry-turn";
    local.id = "btn-local-turn";
    discard.id = "btn-discard-turn";
    settings.id = "btn-turn-api-settings";
    let collapsed = false;
    let renderedAttemptId = null;
    const collapse = button("收起，继续阅读", () => {collapsed = true; render();});
    collapse.id = "btn-collapse-turn-recovery";
    const reopen = document.getElementById("qm-recovery");
    reopen?.addEventListener("click", () => {collapsed = false; render(); retry.focus();});
    buttons.append(settings, retry, local, discard);
    section.append(title, collapse, message, action, buttons);
    document.body.append(section);

    const save = document.createElement("section");
    save.className = "progress-save-status";
    save.setAttribute("aria-label", "进度保存");
    const saveMessage = document.createElement("p");
    saveMessage.setAttribute("role", "status");
    const saveButtons = document.createElement("div");
    saveButtons.className = "recovery-actions";
    saveButtons.append(button("立即保存", () => engine.saveGameState()),
      button("导出进度备份", () => engine.exportGameProgress()));
    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".json,application/json";
    file.hidden = true;
    file.setAttribute("aria-label", "选择九州进度备份");
    const importButton = button("导入进度备份", () => file.click());
    saveButtons.append(importButton);
    const preview = document.createElement("p");
    preview.setAttribute("role", "status");
    const restore = button("恢复此备份", () => {
      if (!previewed || engine.isAIGenerating) return;
      try {
        if (engine.restoreGameBackup(previewed.state)) {
          preview.textContent = "备份已恢复。";
          previewed = null;
          restore.hidden = true;
        }
      } catch (_) {preview.textContent = "备份未能恢复，当前进度仍保留。";}
    });
    restore.hidden = true;
    let previewed = null;
    file.addEventListener("change", async () => {
      const selected = file.files?.[0];
      previewed = null;
      restore.hidden = true;
      if (!selected) return;
      try {
        previewed = engine.previewGameBackup(await selected.text());
        preview.textContent = `${previewed.faction} · 第 ${previewed.turn} 回合。点击“恢复此备份”将替换当前游戏进度，API 配置保持当前设置。`;
        restore.hidden = false;
        restore.disabled = Boolean(engine.isAIGenerating);
      } catch (_) {preview.textContent = "无法识别此进度备份，或包含不支持的内容。当前进度未修改。";}
      file.value = "";
    });
    save.append(saveMessage, saveButtons, file, preview, restore);
    (document.getElementById("settings-progress-status") || document.querySelector("#drawer-settings .settings-body"))?.append(save);
    const warning = document.createElement("button");
    warning.type = "button";
    warning.className = "save-failure-warning";
    warning.hidden = true;
    warning.textContent = "进度尚未保存 · 查看";
    warning.addEventListener("click", () => {
      engine.openDrawer(engine.drawerSettings);
      save.scrollIntoView({block: "nearest"});
    });
    document.body.append(warning);
    function render() {
      const attempt = engine.pendingTurnAttempt;
      if (attempt?.id !== renderedAttemptId) {collapsed = false; renderedAttemptId = attempt?.id || null;}
      const recoverable = Boolean(attempt && attempt.status !== "running" && engine.gameState === "PLAYING");
      section.hidden = !recoverable || collapsed;
      if (reopen) reopen.hidden = !recoverable;
      if (attempt) {
        message.textContent = (attempt.errorMessage || "上次推演已中断。") + " 已完成剧情与检定前状态均已保留；重试会重新发送请求，沿用原骰点。";
        action.textContent = String(attempt.choice.customInput || attempt.choice.text || "原行动");
      }
      const status = engine.saveStatus;
      saveMessage.textContent = [engine.turnPresentationError, status?.message || "进度保存在当前浏览器，备份仅包含游戏进度。"].filter(Boolean).join(" ");
      save.dataset.state = status?.state || "idle";
      warning.hidden = status?.state !== "error" && !engine.turnPresentationError;
      warning.textContent = status?.state === "error" ? "进度尚未保存 · 查看" : "正文已交付，显示遇到问题 · 查看";
      importButton.disabled = Boolean(engine.isAIGenerating);
      restore.disabled = Boolean(engine.isAIGenerating);
      warning.style.bottom = section.hidden ? "max(12px, env(safe-area-inset-bottom))" : "auto";
      warning.style.top = section.hidden ? "auto" : "max(12px, env(safe-area-inset-top))";
    }
    window.addEventListener("jiuzhou-recovery-change", render);
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
