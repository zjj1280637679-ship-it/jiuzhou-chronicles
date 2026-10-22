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
})();
