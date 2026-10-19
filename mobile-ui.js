/* 九州沉浮录 · 手机功能菜单（纯界面增强，不改剧情/AI状态） */
(() => {
  "use strict";
  const menu = document.getElementById("quick-menu");
  const toggle = document.getElementById("mobile-menu-toggle");
  if (!menu || !toggle) return;

  const mobileQuery = window.matchMedia(
    "(max-width: 768px), (max-width: 1024px) and (max-height: 600px) and (pointer: coarse)"
  );
  function setOpen(open) {
    const active = Boolean(open && mobileQuery.matches);
    menu.classList.toggle("mobile-menu-open", active);
    toggle.setAttribute("aria-expanded", String(active));
    toggle.textContent = active ? "✕ 收起功能" : "☰ 功能菜单";
  }

  toggle.addEventListener("click", event => {
    event.stopPropagation();
    setOpen(!menu.classList.contains("mobile-menu-open"));
  });
  menu.querySelectorAll(".qm-btn").forEach(button => {
    button.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("pointerdown", event => {
    if (!menu.contains(event.target)) setOpen(false);
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });
  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", () => setOpen(false));
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(() => setOpen(false));
  }
  setOpen(false);
})();
