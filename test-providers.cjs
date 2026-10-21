// Provider routing fixtures only: no real model requests or credentials.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const {normalizeConfig, resolve, createRequest, register, list} = require("./harness/providers.js");
const {tools} = require("./harness/protocol.js");

const shared = {sharedEndpoint: "https://shared.fixture/api/jiuzhou/turn", sharedModel: "server-selected-model"};
const transcript = [{role: "system", content: "稳定游戏规则"}, {role: "user", content: "先救百姓"}];
function custom(overrides = {}) {
  return normalizeConfig({enabled: true, source: "custom", endpoint: "https://compatible.fixture/v1/chat/completions",
    model: "fixture-generic-model", apiKey: "", adapter: "auto", tokenParameter: "max_tokens", ...overrides});
}

test("legacy personal keys or non-default endpoints migrate to custom, including endpoints without keys", () => {
  for (const legacy of [
    {enabled: true, apiKey: "fixture-personal-key", endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-reasoner"},
    {enabled: false, apiKey: "", endpoint: "https://compatible.fixture/v1/chat/completions", model: "fixture-model"},
    {enabled: true, apiKey: "", endpoint: "http://localhost:1234/v1/chat/completions", model: "local-model"}
  ]) {
    const before = structuredClone(legacy), config = normalizeConfig(legacy);
    assert.equal(config.source, "custom"); assert.equal(config.model, legacy.model);
    assert.equal(config.endpoint, legacy.endpoint); assert.equal(config.apiKey, legacy.apiKey);
    assert.equal(config.enabled, legacy.enabled); assert.deepEqual(legacy, before);
  }
});

test("custom HTTPS and loopback HTTP endpoints work without a Key or shared health configuration", () => {
  for (const endpoint of ["https://compatible.fixture/v1/chat/completions", "http://localhost:1234/v1/chat/completions",
    "http://127.0.0.1:8080/v1/chat/completions", "http://[::1]:8080/v1/chat/completions"]) {
    const route = resolve(custom({endpoint}), {sharedEndpoint: "broken shared setting"});
    assert.equal(route.source, "custom"); assert.equal(route.endpoint, endpoint);
    assert.equal(route.useGateway, false); assert.equal(route.headers.Authorization, undefined);
  }
});

test("custom v1 base URLs resolve to Chat Completions while preserving prefixes and query parameters", () => {
  for (const [endpoint, expected] of [
    ["https://compatible.fixture/v1", "https://compatible.fixture/v1/chat/completions"],
    ["https://compatible.fixture/v1/", "https://compatible.fixture/v1/chat/completions"],
    ["https://compatible.fixture/api/v1", "https://compatible.fixture/api/v1/chat/completions"],
    ["https://compatible.fixture/openai/v1/?region=cn&version=1", "https://compatible.fixture/openai/v1/chat/completions?region=cn&version=1"],
    ["http://localhost:1234/v1", "http://localhost:1234/v1/chat/completions"]
  ]) {
    const route = resolve(custom({endpoint}));
    assert.equal(route.endpoint, expected);
    assert.equal(createRequest(route, {messages: transcript, mode: "probe"}).endpoint, expected);
  }
});

test("complete Chat Completions URLs and arbitrary custom paths are not rewritten or doubled", () => {
  for (const endpoint of ["https://compatible.fixture/v1/chat/completions", "https://compatible.fixture/api/v1/chat/completions?region=cn",
    "https://compatible.fixture/v1/chat/completions/", "https://compatible.fixture/custom/api/chat", "https://compatible.fixture/api/chat",
    "https://compatible.fixture/v10"]) {
    assert.equal(resolve(custom({endpoint})).endpoint, endpoint);
  }
});

test("base URL resolution preserves the saved raw endpoint and shares identity with its equivalent full URL", () => {
  for (const [endpoint, fullEndpoint] of [
    ["https://compatible.fixture/v1", "https://compatible.fixture/v1/chat/completions"],
    ["https://compatible.fixture/api/v1/", "https://compatible.fixture/api/v1/chat/completions"],
    ["https://compatible.fixture/openai/v1?region=cn", "https://compatible.fixture/openai/v1/chat/completions?region=cn"]
  ]) {
    const config = custom({endpoint}); const before = structuredClone(config);
    const base = resolve(config);
    const full = resolve(custom({endpoint: fullEndpoint}));
    assert.equal(config.endpoint, endpoint); assert.deepEqual(config, before);
    assert.equal(base.identity, full.identity);
  }
});

test("custom endpoint validation rejects remote plaintext HTTP and embedded URL credentials", () => {
  for (const endpoint of ["http://compatible.fixture/chat/completions", "https://user:password@compatible.fixture/chat/completions", "ftp://compatible.fixture/chat/completions", "not an endpoint"]) {
    assert.throws(() => resolve(custom({endpoint})), /invalid.*endpoint|endpoint.*invalid/);
  }
});

test("explicit blank custom endpoint or model fields are rejected rather than silently replaced with DeepSeek defaults", () => {
  for (const overrides of [{endpoint: ""}, {endpoint: "   "}, {model: ""}, {model: "   "}, {model: "custom", customModel: ""}]) {
    const config = custom(overrides);
    assert.throws(() => resolve(config), /invalid_private_endpoint|invalid_model/);
  }
  const missingLegacyFields = normalizeConfig({enabled: true, source: "custom", apiKey: "fixture-key"});
  assert.equal(missingLegacyFields.endpoint, "https://api.deepseek.com/chat/completions");
  assert.equal(missingLegacyFields.model, "deepseek-flash");
});

test("custom authentication goes only to its selected endpoint and never appears in a request body", () => {
  const route = resolve(custom({apiKey: "fixture-personal-key"}));
  const request = createRequest(route, {messages: transcript, maxTokens: 256, mode: "probe"});
  assert.equal(request.endpoint, "https://compatible.fixture/v1/chat/completions");
  assert.equal(request.headers.Authorization, "Bearer fixture-personal-key");
  assert.doesNotMatch(JSON.stringify(request.body), /fixture-personal-key/);
});

test("generic compatible requests preserve native tools but do not send DeepSeek or shared-gateway parameters", () => {
  const messages = [...transcript, {role: "assistant", content: null, reasoning_content: "provider-only-reasoning", tool_calls: [
    {id: "fixture_tool", type: "function", function: {name: "read_world", arguments: "{}"}}
  ]}, {role: "tool", tool_call_id: "fixture_tool", content: '{"ok":true}'}];
  const before = structuredClone(messages);
  const request = createRequest(resolve(custom({model: "deepseek-flash"})), {messages, tools, maxTokens: 32768,
    mode: "story", expectedLength: 5000, harness: true});
  assert.equal(request.body.model, "deepseek-flash");
  assert.deepEqual(request.body.tools, tools);
  assert.equal(request.body.messages.at(-2).tool_calls[0].id, "fixture_tool");
  assert.equal(request.body.messages.at(-1).tool_call_id, "fixture_tool");
  for (const field of ["thinking", "reasoning_effort", "mode", "expectedLength", "enabledTools", "turnstileToken", "inviteCode"]) {
    assert.equal(request.body[field], undefined, field);
  }
  assert.equal(request.body.messages.at(-2).reasoning_content, undefined);
  assert.equal(request.body.response_format, undefined);
  assert.deepEqual(messages, before);
});

test("DeepSeek-specific options depend on its adapter rather than a model name at an arbitrary provider", () => {
  const official = resolve(custom({endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-flash"}));
  assert.equal(official.adapter, "deepseek");
  const officialRequest = createRequest(official, {messages: transcript, mode: "probe", maxTokens: 256});
  assert.equal(officialRequest.body.thinking.type, "disabled");
  const generic = resolve(custom({endpoint: "https://api.deepseek.com/chat/completions", adapter: "openai"}));
  assert.equal(generic.adapter, "openai");
  assert.equal(createRequest(generic, {messages: transcript, mode: "probe"}).body.thinking, undefined);
});

test("a provider can use max_completion_tokens and large user settings without a global DeepSeek clamp", () => {
  const route = resolve(custom({tokenParameter: "max_completion_tokens"}));
  const request = createRequest(route, {messages: transcript, maxTokens: 500000, mode: "story"});
  assert.equal(request.body.max_completion_tokens, 500000);
  assert.equal(request.body.max_tokens, undefined);
});

test("provider identity is stable for the same configuration and changes with endpoint, model, adapter, token parameter or Key", () => {
  const base = custom({apiKey: "fixture-key-a"});
  const first = resolve(base).identity;
  assert.equal(resolve(structuredClone(base)).identity, first);
  for (const overrides of [{endpoint: "https://second.fixture/v1/chat/completions"}, {model: "second-model"},
    {adapter: "deepseek"}, {tokenParameter: "max_completion_tokens"}, {apiKey: "fixture-key-b"}]) {
    assert.notEqual(resolve(custom({...base, ...overrides})).identity, first);
  }
  assert.doesNotMatch(String(first), /fixture-key-a/);
});

test("a separately registered provider uses the same transport contract and can be removed without changing built-ins", () => {
  const before = list();
  const plugin = {id: "fixture-independent-provider", label: "独立来源测试", resolve(config) {
    return {source: this.id, id: this.id, label: this.label, identity: "fixture-plugin-route", useGateway: false,
      endpoint: "https://independent.fixture/completions", model: config.model, headers: {"Content-Type": "application/json"}};
  }, request(route, options) {return {model: route.model, messages: structuredClone(options.messages), fixture: true};}};
  const dispose = register(plugin);
  try {
    assert.throws(() => register(plugin), /duplicate_provider/);
    const route = resolve({enabled: true, source: plugin.id, model: "independent-model"});
    const request = createRequest(route, {messages: transcript, mode: "story", maxTokens: 1234});
    assert.equal(request.endpoint, "https://independent.fixture/completions");
    assert.equal(request.body.fixture, true); assert.equal(request.body.max_tokens, 1234);
    assert.equal(request.body.model, "independent-model");
    assert.equal(resolve(custom()).source, "custom");
    assert.equal(resolve({source: "shared"}, shared).source, "custom");
  } finally {dispose();}
  assert.deepEqual(list(), before);
  assert.throws(() => resolve({source: plugin.id}), /invalid_provider/);
});

test("a resolved route cannot be dispatched through a different plugin later registered under the same id", () => {
  const plugin = marker => ({id: "fixture-replaced-provider", resolve() {return {
    source: this.id, id: this.id, identity: marker, useGateway: false, endpoint: "https://independent.fixture/completions", headers: {}
  };}, request() {return {marker};}});
  const removeA = register(plugin("A"));
  const oldRoute = resolve({source: "fixture-replaced-provider"});
  removeA();
  const removeB = register(plugin("B"));
  try {
    assert.throws(() => createRequest(oldRoute, {messages: transcript, mode: "story"}), /provider_changed/);
    const newRoute = resolve({source: "fixture-replaced-provider"});
    assert.equal(createRequest(newRoute, {messages: transcript, mode: "story"}).body.marker, "B");
  } finally {removeB();}
});
