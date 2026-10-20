/* The settings engine continues to read the original controls. This adapter
   only brings the result of an explicitly requested test into view. */
(() => {
  "use strict";
  const test = document.getElementById("btn-test-ai-connection");
  const result = document.querySelector("#drawer-settings .settings-test-result");
  if (!test || !result) return;
  test.addEventListener("click", () => {
    result.scrollIntoView({block: "nearest", behavior: "instant"});
  });
  document.getElementById("qm-cache")?.addEventListener("click", () => {
    const diagnostics = document.getElementById("settings-diagnostics");
    if (!diagnostics) return;
    diagnostics.open = true;
    requestAnimationFrame(() => diagnostics.scrollIntoView({block: "start", behavior: "instant"}));
  });
})();
