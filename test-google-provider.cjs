// Offline Google-provider contracts only. All keys/model replies are fixtures.
// No real API request, browser save or paid model generation occurs here.
const assert = require("node:assert/strict");
const {test} = require("node:test");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const providers = require("./harness/providers.js");
const googlePlugin = require("./harness/provider-google.js");
const protocol = require("./harness/protocol.js");
const {createGameHarness} = require("./harness/runtime.js");
const {createNodeWorkerFactory} = require("./harness/test-worker.cjs");
const {WebVisualNovelEngine} = require("./app.js");

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = "gemini-flash-lite-latest";
const FIXTURE_KEY = "fixture-google-private-key";
const messages = [{role: "system", content: "以 JSON 交付已发生的游戏正文。"}, {role: "user", content: "推门查看。"}];
const baseURL = pathToFileURL(path.join(__dirname, "harness", path.sep)).href;
const story = {beats: [{text: "门里空无一人，桌上留着一封未拆的信。"}], choices: [{text: "查看信封"}]};
function google(overrides = {}) {
  return providers.normalizeConfig({enabled: true, source: "google", apiKey: FIXTURE_KEY, ...overrides});
}
function request(config = google(), options = {}) {
  return providers.createRequest(providers.resolve(config), {messages, mode: "probe", ...options});
}

test("Google provider registers independently and uses official defaults when only a Key is supplied", () => {
  assert.equal(googlePlugin.endpoint, ENDPOINT);
  assert.equal(googlePlugin.model, MODEL);
  const config = google(), route = providers.resolve(config);
  assert.equal(config.endpoint, ENDPOINT); assert.equal(config.model, MODEL);
  assert.equal(route.source, "google"); assert.equal(route.id, "google");
  assert.equal(route.endpoint, ENDPOINT); assert.equal(route.model, MODEL);
  assert.equal(route.adapter, "google"); assert.equal(route.useGateway, false);
  assert.equal(providers.list().filter(item => item.id === "google").length, 1);
});

test("Google Key is trimmed into the Bearer header and never enters the body or endpoint", () => {
  const output = request(google({apiKey: "  " + FIXTURE_KEY + "  "}));
  assert.equal(output.headers.Authorization, "Bearer " + FIXTURE_KEY);
  assert.equal(output.headers["Content-Type"], "application/json");
  assert.doesNotMatch(JSON.stringify(output.body), /fixture-google-private-key/);
  assert.doesNotMatch(output.endpoint, /fixture-google-private-key|[?&]key=/);
  assert.equal(output.useGateway, false);
});

test("Google probe and ordinary JSON completions enable JSON mode without DeepSeek settings", () => {
  for (const mode of ["probe", "suture", "story"]) {
    const output = request(google(), {mode});
    assert.deepEqual(output.body.response_format, {type: "json_object"});
    assert.equal(output.body.model, MODEL); assert.equal(output.body.stream, false);
    assert.equal(output.body.tools, undefined);
    for (const field of ["thinking", "reasoning_effort", "mode", "expectedLength", "turnstileToken", "inviteCode"]) {
      assert.equal(output.body[field], undefined, field);
    }
  }
});

test("Google harness passes the actual native tools and does not force JSON output", () => {
  const before = structuredClone(protocol.tools);
  const output = request(google(), {harness: true, tools: protocol.tools, mode: "story", expectedLength: 5000});
  assert.deepEqual(output.body.tools, before);
  assert.equal(output.body.response_format, undefined);
  assert.equal(output.body.thinking, undefined);
  assert.equal(output.body.reasoning_effort, undefined);
  assert.equal(output.body.expectedLength, undefined);
  output.body.tools[0].function.description = "changed request clone";
  assert.deepEqual(protocol.tools, before, "provider cannot mutate the registered tool snapshot");
});

test("Google preserves tool-call IDs, original arguments and opaque signatures without mutating input", () => {
  const transcript = [...messages, {role: "assistant", content: null, reasoning_content: "fixture-only DeepSeek reasoning",
    extra_content: {google: {thought_signature: "fixture-message-signature"}}, tool_calls: [{id: "function-call-fixture-1", type: "function",
      function: {name: "read_world", arguments: "{  }"}, extra_content: {google: {thought_signature: "fixture-tool-signature"}}}]},
    {role: "tool", tool_call_id: "function-call-fixture-1", content: '{"ok":true}'}];
  const before = structuredClone(transcript);
  const output = request(google(), {messages: transcript, harness: true, tools: protocol.tools});
  const assistant = output.body.messages.at(-2);
  assert.equal(assistant.reasoning_content, undefined);
  assert.deepEqual(assistant.extra_content, before.at(-2).extra_content);
  assert.deepEqual(assistant.tool_calls, before.at(-2).tool_calls);
  assert.equal(output.body.messages.at(-1).tool_call_id, "function-call-fixture-1");
  assistant.tool_calls[0].extra_content.google.thought_signature = "request-only edit";
  assert.deepEqual(transcript, before);
});

test("Google normalizes only its conventional API base and retains explicit paths and queries", () => {
  for (const [input, expected] of [
    ["https://generativelanguage.googleapis.com/v1beta/openai", ENDPOINT],
    ["https://generativelanguage.googleapis.com/v1beta/openai/", ENDPOINT],
    ["https://generativelanguage.googleapis.com/v1beta/openai/?region=fixture", ENDPOINT + "?region=fixture"],
    [ENDPOINT, ENDPOINT],
    ["https://google-proxy.fixture/custom/completion", "https://google-proxy.fixture/custom/completion"]
  ]) {
    const config = google({endpoint: input}), before = structuredClone(config);
    assert.equal(providers.resolve(config).endpoint, expected);
    assert.deepEqual(config, before);
  }
  assert.equal(providers.resolve(google({endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/"})).identity,
    providers.resolve(google({endpoint: ENDPOINT})).identity);
});

test("Google supports an explicitly selected concrete model and custom-model field", () => {
  for (const overrides of [{model: "fixture-specific-gemini-version"}, {model: "custom", customModel: "  fixture-specific-gemini-version  "}]) {
    const route = providers.resolve(google(overrides));
    assert.equal(route.model, "fixture-specific-gemini-version");
    assert.equal(providers.createRequest(route, {messages, mode: "probe"}).body.model, "fixture-specific-gemini-version");
  }
  for (const overrides of [{model: ""}, {model: "   "}, {model: "custom", customModel: ""}]) {
    assert.throws(() => providers.resolve(google(overrides)), {code: "invalid_model"});
  }
});

test("official Google endpoint requires a Key and endpoint validation still applies", () => {
  assert.throws(() => providers.resolve(google({apiKey: ""})), {code: "missing_api_key"});
  for (const endpoint of ["", "http://google-proxy.fixture/completion", "https://user:password@google-proxy.fixture/completion", "not a URL"]) {
    assert.throws(() => providers.resolve(google({endpoint})), {code: "invalid_private_endpoint"});
  }
});

test("Google route identity changes with its Key, endpoint or model without exposing credentials", () => {
  const first = providers.resolve(google()).identity;
  assert.equal(providers.resolve(google()).identity, first);
  for (const overrides of [{apiKey: "fixture-google-key-b"}, {model: "fixture-gemini-b"}, {endpoint: "https://google-proxy.fixture/completion"}]) {
    assert.notEqual(providers.resolve(google(overrides)).identity, first);
  }
  assert.doesNotMatch(first, /fixture|private|key/);
});

test("Google request does not impose an output cap and respects only an explicit token setting", () => {
  assert.equal(request().body.max_tokens, undefined);
  assert.equal(request().body.max_completion_tokens, undefined);
  const output = request(google({tokenParameter: "max_completion_tokens"}), {maxTokens: 500000});
  assert.equal(output.body.max_tokens, 500000);
  assert.equal(output.body.max_completion_tokens, undefined);
});

test("Google registration does not alter custom or DeepSeek protocol behavior", () => {
  const deepseek = providers.resolve({source: "custom", endpoint: providers.DEFAULT_ENDPOINT, model: "deepseek-flash", apiKey: "fixture-deepseek-key"});
  const custom = providers.resolve({source: "custom", endpoint: "https://custom-provider.fixture/v1", model: "fixture-custom"});
  assert.equal(deepseek.adapter, "deepseek"); assert.equal(custom.adapter, "openai");
  const deepseekRequest = providers.createRequest(deepseek, {messages, mode: "probe"});
  const customRequest = providers.createRequest(custom, {messages, mode: "probe"});
  assert.deepEqual(deepseekRequest.body.thinking, {type: "disabled"});
  assert.equal(deepseekRequest.headers.Authorization, "Bearer fixture-deepseek-key");
  assert.deepEqual(deepseekRequest.body.response_format, {type: "json_object"});
  assert.equal(customRequest.body.thinking, undefined); assert.equal(customRequest.body.response_format, undefined);
  assert.equal(customRequest.endpoint, "https://custom-provider.fixture/v1/chat/completions");
});

test("model card presets are copy-safe and distinguish Google, official DeepSeek and custom", () => {
  const presets = providers.presets();
  assert.deepEqual(presets.map(item => item.id), ["deepseek", "google", "custom"]);
  const card = presets.find(item => item.id === "google");
  assert.equal(card.source, "google"); assert.equal(card.endpoint, ENDPOINT); assert.equal(card.model, MODEL);
  assert.equal(card.apiKey, undefined);
  assert.equal(providers.presetId(google()), "google");
  assert.equal(providers.presetId({source: "custom", endpoint: providers.DEFAULT_ENDPOINT}), "deepseek");
  assert.equal(providers.presetId({source: "custom", endpoint: "https://custom-provider.fixture/v1", model: MODEL}), "custom");
  card.model = "mutated local preset";
  assert.equal(providers.presets().find(item => item.id === "google").model, MODEL);
});

test("Google signatures survive a full mocked tool result round-trip through real isolated plugins", async () => {
  let count = 0;
  const route = providers.resolve(google());
  const tool = {id: "function-call-google-fixture", type: "function", function: {name: "read_world", arguments: "{}"},
    extra_content: {google: {thought_signature: "fixture-native-tool-signature"}}};
  const signature = {google: {thought_signature: "fixture-native-message-signature"}};
  const result = await createGameHarness({baseURL, workerFactory: createNodeWorkerFactory(), messages,
    world: {location: "书房"}, model: async options => {
      count++;
      const outgoing = providers.createRequest(route, {...options, harness: true}).body;
      assert.equal(outgoing.response_format, undefined);
      if (count === 1) return {model: "fixture-returned-concrete-model", choices: [{finish_reason: "tool_calls", message: {
        role: "assistant", content: null, extra_content: signature, tool_calls: [tool]}}]};
      assert.equal(count, 2, "a valid final story must not cause an extra model call");
      assert.deepEqual(outgoing.messages.at(-2).tool_calls, [tool]);
      assert.deepEqual(outgoing.messages.at(-2).extra_content, signature);
      assert.equal(outgoing.messages.at(-1).tool_call_id, tool.id);
      assert.match(outgoing.messages.at(-1).content, /书房/);
      return {model: "fixture-returned-concrete-model", choices: [{finish_reason: "stop", message: {role: "assistant", content: JSON.stringify(story)}}]};
    }});
  assert.equal(count, 2); assert.equal(result.data.model, "fixture-returned-concrete-model");
  assert.deepEqual(JSON.parse(result.data.choices[0].message.content).beats.map(item => item.text), story.beats.map(item => item.text));
});

test("Google message signatures survive a recoverable final JSON formatting correction", async () => {
  let count = 0;
  const route = providers.resolve(google());
  const signature = {google: {thought_signature: "fixture-format-repair-signature"}};
  await createGameHarness({baseURL, workerFactory: createNodeWorkerFactory(), messages,
    model: async options => {
      count++;
      const outgoing = providers.createRequest(route, {...options, harness: true}).body;
      if (count === 1) return {model: MODEL, choices: [{finish_reason: "stop", message: {
        role: "assistant", content: "fixture-invalid-JSON", extra_content: signature}}]};
      assert.equal(count, 2);
      assert.equal(outgoing.messages.at(-2).role, "assistant");
      assert.equal(outgoing.messages.at(-2).content, "fixture-invalid-JSON");
      assert.deepEqual(outgoing.messages.at(-2).extra_content, signature);
      assert.equal(outgoing.messages.at(-1).role, "user");
      return {model: MODEL, choices: [{finish_reason: "stop", message: {role: "assistant", content: JSON.stringify(story)}}]};
    }});
  assert.equal(count, 2);
});

function formField(initialValue = "") {
  let value = String(initialValue);
  return {get value() {return value;}, set value(next) {value = String(next);}, checked: false, disabled: true, style: {}};
}
function settingsEngine(t, overrides = {}) {
  const savedStorage = global.localStorage;
  const writes = [];
  global.localStorage = {setItem(...args) {writes.push(args);}};
  t.after(() => {global.localStorage = savedStorage;});
  const config = providers.normalizeConfig({enabled: false, source: "custom", endpoint: providers.DEFAULT_ENDPOINT,
    model: "deepseek-flash", apiKey: "fixture-deepseek-card-key", maxTokens: 32768, ...overrides});
  const e = Object.assign(Object.create(WebVisualNovelEngine.prototype), {
    apiConfig: config, aiConfigRevision: 3, aiConnectionTestFormVersion: 0, aiConnectionTestRunning: false,
    settingApiSource: formField(config.source), settingEndpoint: formField(config.endpoint),
    settingApiAdapter: formField(config.adapter), settingTokenParameter: formField(config.tokenParameter),
    settingApiKey: formField(config.apiKey), settingMaxTokens: formField(config.maxTokens ?? ""),
    settingModel: formField(config.model), settingCustomModel: formField(config.customModel),
    settingEnableApi: formField(), aiConnectionTestStatus: {textContent: "先前测试结果"},
    aiProviderDescription: {textContent: ""},
    settingPresetButtons: ["deepseek", "google", "custom"].map(id => ({dataset: {aiPreset: id}, attributes: {},
      setAttribute(name, value) {this.attributes[name] = value;}}))
  });
  e.settingModel.options = ["deepseek-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner", MODEL, "custom"].map(value => ({value}));
  e.settingEnableApi.checked = config.enabled;
  const fields = [e.settingApiSource, e.settingEndpoint, e.settingApiAdapter, e.settingTokenParameter,
    e.settingApiKey, e.settingMaxTokens, e.settingModel, e.settingCustomModel];
  e.apiCustomFields = {hidden: true, querySelectorAll() {return fields;}};
  return {e, writes};
}

test("selecting the Google card fills usable defaults, clears another service's Key and cap, and only edits the form", t => {
  const {e, writes} = settingsEngine(t);
  const saved = structuredClone(e.apiConfig), revision = e.aiConfigRevision;
  e.applyAIPreset("google");
  assert.equal(e.settingApiSource.value, "google"); assert.equal(e.settingEndpoint.value, ENDPOINT);
  assert.equal(e.settingModel.value, MODEL); assert.equal(e.settingCustomModel.value, "");
  assert.equal(e.settingApiKey.value, "", "DeepSeek credential must never be copied into Google fields");
  assert.equal(e.settingMaxTokens.value, "", "a new Google card should use provider output defaults");
  assert.equal(e.settingEnableApi.checked, true); assert.equal(e.aiPresetSelection, "google");
  assert.deepEqual(e.apiConfig, saved); assert.equal(e.aiConfigRevision, revision); assert.deepEqual(writes, []);
  assert.equal(e.aiConnectionTestFormVersion, 1);
  assert.match(e.aiConnectionTestStatus.textContent, /配置已修改/);
});

test("Google card keeps direct endpoint and Key controls enabled and marks only its card selected", t => {
  const {e} = settingsEngine(t);
  e.applyAIPreset("google");
  assert.equal(e.apiCustomFields.hidden, false);
  for (const field of e.apiCustomFields.querySelectorAll()) assert.equal(field.disabled, false);
  for (const button of e.settingPresetButtons) {
    assert.equal(button.attributes["aria-pressed"], String(button.dataset.aiPreset === "google"));
  }
  assert.equal(e.settingCustomModel.style.display, "none");
  e.settingModel.value = "custom"; e.settingCustomModel.value = "fixture-concrete-google-version";
  e.settingApiKey.value = FIXTURE_KEY; e.updateAIProviderSettingsUI();
  assert.equal(e.settingCustomModel.style.display, "block");
  assert.match(e.aiProviderDescription.textContent, /fixture-concrete-google-version.*Google Gemini/);
});

test("switching cards restores only that card's same-page unsaved draft without mixing service keys", t => {
  const {e, writes} = settingsEngine(t);
  const saved = structuredClone(e.apiConfig);
  e.settingApiKey.value = "fixture-unsaved-deepseek-key";
  e.settingMaxTokens.value = "64000";
  e.applyAIPreset("google");
  e.settingApiKey.value = "fixture-unsaved-google-key";
  e.settingModel.value = "custom";
  e.settingCustomModel.value = "fixture-specific-google-version";
  e.settingMaxTokens.value = "";
  e.applyAIPreset("deepseek");
  assert.equal(e.settingApiKey.value, "fixture-unsaved-deepseek-key");
  assert.equal(e.settingEndpoint.value, providers.DEFAULT_ENDPOINT);
  assert.equal(e.settingMaxTokens.value, "64000");
  assert.equal(e.settingModel.value, "deepseek-flash");
  e.applyAIPreset("google");
  assert.equal(e.settingApiKey.value, "fixture-unsaved-google-key");
  assert.equal(e.settingEndpoint.value, ENDPOINT);
  assert.equal(e.settingModel.value, "custom");
  assert.equal(e.settingCustomModel.value, "fixture-specific-google-version");
  assert.equal(e.settingMaxTokens.value, "");
  assert.equal(e.readAISettingsConfig().source, "google");
  assert.deepEqual(e.apiConfig, saved); assert.deepEqual(writes, []);
});

test("an unknown card cannot modify configuration or create a remembered profile", t => {
  const {e, writes} = settingsEngine(t);
  const before = e.readAISettingsConfig();
  e.applyAIPreset("fixture-not-installed-provider");
  assert.deepEqual(e.readAISettingsConfig(), before);
  assert.equal(e.aiPresetDrafts, undefined); assert.equal(e.aiConnectionTestFormVersion, 0);
  assert.deepEqual(writes, []);
});

test("first custom-card selection clears the originating service Key while later restoring only its own draft Key", t => {
  for (const [preset, initial] of [["deepseek", {}], ["google", {source: "google", endpoint: ENDPOINT, model: MODEL, apiKey: FIXTURE_KEY}]]) {
    const {e, writes} = settingsEngine(t, initial);
    const originalKey = e.settingApiKey.value;
    e.applyAIPreset("custom");
    assert.equal(e.settingApiSource.value, "custom");
    assert.equal(e.settingApiKey.value, "", `${preset} Key must not be copied into a new custom card`);
    e.settingEndpoint.value = "https://custom-card.fixture/v1/chat/completions";
    e.settingApiKey.value = "fixture-custom-card-owned-key";
    e.applyAIPreset(preset);
    assert.equal(e.settingApiKey.value, originalKey, `${preset} should restore its own same-page draft`);
    e.applyAIPreset("custom");
    assert.equal(e.settingEndpoint.value, "https://custom-card.fixture/v1/chat/completions");
    assert.equal(e.settingApiKey.value, "fixture-custom-card-owned-key");
    assert.deepEqual(writes, []);
  }
});
