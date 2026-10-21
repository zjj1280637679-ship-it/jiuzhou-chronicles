const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const providers = require("./harness/providers.js");

test("fresh visitors start locally and have no built-in shared provider", () => {
  const config = providers.normalizeConfig(null);
  assert.equal(config.enabled, false); assert.equal(config.source, "custom");
  assert.deepEqual(providers.list().map(p => p.id), ["custom"]);
});
test("retired shared settings preserve every personal field but require explicit enabling", () => {
  const original = {enabled: true, source: "shared", endpoint: "https://personal.fixture/v1", apiKey: "fixture-personal-key",
    model: "custom", customModel: "personal-model", adapter: "openai", tokenParameter: "max_completion_tokens", maxTokens: 32768};
  const before = structuredClone(original), migrated = providers.normalizeConfig(original);
  assert.deepEqual(original, before);
  assert.equal(migrated.source, "custom"); assert.equal(migrated.enabled, false); assert.equal(migrated.sharedApiRemoved, true);
  for (const key of ["endpoint", "apiKey", "model", "customModel", "adapter", "tokenParameter", "maxTokens"]) assert.equal(migrated[key], original[key]);
  assert.equal(providers.normalizeConfig(migrated).enabled, false);
});
test("personal and keyless custom routes retain their enabled preference", () => {
  for (const enabled of [true, false]) for (const apiKey of ["", "fixture-personal-key"]) {
    const config = providers.normalizeConfig({source: "custom", enabled, apiKey, endpoint: "https://personal.fixture/v1", model: "personal-model"});
    assert.equal(config.enabled, enabled); assert.equal(config.source, "custom"); assert.equal(config.apiKey, apiKey);
    const request = providers.createRequest(providers.resolve(config), {messages: [{role: "user", content: "行动"}], mode: "story"});
    assert.equal(request.endpoint, "https://personal.fixture/v1/chat/completions"); assert.equal(request.body.mode, undefined);
  }
});
test("the published client has no default Worker address, health lookup or shared selector", () => {
  const html = fs.readFileSync("index.html", "utf8"), app = fs.readFileSync("app.js", "utf8");
  assert.doesNotMatch(html, /ai-gateway-config\.js|value="shared"|btn-retry-shared-ai|workers\.dev/);
  assert.doesNotMatch(app, /JIUZHOU_AI_GATEWAY|checkServerSharedApi|getSharedGateway|\/api\/jiuzhou\/turn/);
  assert.equal(fs.existsSync("ai-gateway-config.js"), false);
});
