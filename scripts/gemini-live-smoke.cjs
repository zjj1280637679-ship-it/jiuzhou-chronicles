// Explicit live diagnostic only: excluded from the unit suite and public build.
// The key is sent only to Google, never to Workers, model messages or artifacts.
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const providers = require("../harness/providers.js");
const protocol = require("../harness/protocol.js");
const {createGameHarness} = require("../harness/runtime.js");
const {createNodeWorkerFactory} = require("../harness/test-worker.cjs");
const {createStaticServer} = require("../server.js");
const {WebVisualNovelEngine} = require("../app.js");
const compact = require("../data/illustrations/catalog-index.js");
const registry = require("../illustration-system.js");

const key = (process.env.GEMINI_API_KEY || "").trim();
// Node test Workers inherit process.env by default. Retain the credential only
// in the host closure before starting them, matching browser Worker isolation.
delete process.env.GEMINI_API_KEY;
function report(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  console.log(key ? text.replaceAll(key, "[redacted]") : text);
}

async function main() {
  if (!key) throw Object.assign(new Error("GEMINI_API_KEY is not available to this repository workflow."), {code:"missing_secret"});
  const root = path.resolve(__dirname, "..");
  const route = providers.resolve(providers.normalizeConfig({source:"google", enabled:true, apiKey:key}));
  assert.equal(route.endpoint, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  const server = createStaticServer({root});
  const downloads = [];
  server.on("request", request => downloads.push(request.url));
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const pageBase = `http://127.0.0.1:${server.address().port}/`;
  const summaries = [];
  let totalCalls = 0;
  const cases = [
    {name:"curated_phrase", expectedPopup:"qing_shengjing_palace", action:
      "你在盛京宫庭等候召见。把本轮少量精选中的“后金·盛京宫庭”直接作为独立图片弹窗，然后完成这一幕。"},
    {name:"browse_search_select", expectedPopup:"qing_cavalry_charge", expectedBackground:"qing_frontier_pass", action:
      "你走近关隘观察后金骑兵集结。先查看图库根分类，再进入一个返回的军事相关分类；随后搜索后金骑兵冲锋的画面，从搜索结果中选中骑军突击作为独立弹窗，用“后金·关隘烽火”作为持续背景，然后完成这一幕。"}
  ];
  try {
    for (const scenario of cases) {
      const controller = new AbortController();
      // Diagnostic limits only; these never alter gameplay settings.
      const deadline = setTimeout(() => controller.abort(), 150000);
      const engine = Object.assign(Object.create(WebVisualNovelEngine.prototype), {
        currentFaction:"qing", currentCoords:"qing:mukden", expectedLength:500,
        branchDepth:1, apiHistory:[], ideologyVector:{authority:0, pragmatism:0, progress:0, cognition:0}
      });
      const payload = engine.buildDeepSeekCachePayload({customInput:scenario.action, diceBase:7}, 4, 4, 10, true);
      payload.messages.at(-1).content += "\n【仅本次验收的篇幅偏好】本轮只写三段简短正文和三个具体行动选项，覆盖上文一般篇幅偏好。选图通过原生工具安排，最后直接交付story；不需要草稿流程。";
      const startDownload = downloads.length;
      const calls = [], replies = [], pending = new Map();
      let modelCalls = 0;
      const originalPrefix = structuredClone(payload.messages);
      const workerFactory = createNodeWorkerFactory({
        onPostMessage(message) {
          if (message.type !== "call") return;
          pending.set(message.id, message.name);
          calls.push({name:message.name, args:structuredClone(message.args)});
          if (["show_illustration", "set_scene_background", "browse_illustrations", "search_illustrations"].includes(message.name)) {
            report({case:scenario.name, tool:message.name, args:message.args});
          }
        },
        onMessage(message) {
          if (message.type !== "result") return;
          replies.push({name:pending.get(message.id), ok:message.result?.ok,
            ...(message.result?.error ? {error:message.result.error} : {})});
          if (message.result?.ok !== true) report({case:scenario.name, toolError:message.result?.error});
        }
      });
      let result;
      try {
        result = await createGameHarness({
          baseURL:pathToFileURL(path.join(root, "harness", path.sep)).href,
          workerFactory, messages:payload.messages, world:engine.buildAIHarnessWorldSnapshot(),
          illustrationCatalog:compact, illustrationBaseURL:pageBase, signal:controller.signal,
          model:async options => {
            assert.ok(++modelCalls <= 8 && ++totalCalls <= 12, "Diagnostic model-request budget exceeded");
            assert.deepEqual(options.tools, protocol.modelTools);
            assert.deepEqual(options.messages.slice(0, originalPrefix.length), originalPrefix);
            const request = providers.createRequest(route, {...options, harness:true, maxTokens:2048});
            assert.equal(request.body.response_format, undefined);
            assert.equal(request.body.tool_choice, undefined, "Tool choice must be the model's own decision");
            assert.equal(JSON.stringify(request.body).includes(key), false);
            const response = await fetch(request.endpoint, {method:"POST", headers:request.headers,
              body:JSON.stringify(request.body), redirect:"error", signal:options.signal});
            let data;
            try {data = JSON.parse(await response.text());} catch {throw new Error("non_json_model_response");}
            if (!response.ok) {
              const error = Array.isArray(data) ? data[0]?.error : data.error;
              report({case:scenario.name, http_status:response.status, code:error?.status || error?.code,
                message:String(error?.message || "No API error detail").slice(0,1000)});
              throw Object.assign(new Error("model_http_error"), {code:`http_${response.status}`});
            }
            report({case:scenario.name, request:modelCalls, http_status:response.status,
              model:data.model, finish_reason:data.choices?.[0]?.finish_reason,
              requested_tools:(data.choices?.[0]?.message?.tool_calls || []).map(call => call.function?.name)});
            return data;
          }
        });
      } finally {clearTimeout(deadline);}
      const story = JSON.parse(result.data.choices[0].message.content);
      assert.ok(story.beats.length > 0);
      assert.equal(story.choices.length, 3, "The model itself must provide three choices");
      assert.ok(calls.some(call => call.name === "deliver_story" && call.args.story), "Direct story delivery was not exercised");
      assert.ok(calls.some(call => call.name === "show_illustration" && typeof call.args.token === "string"));
      assert.ok(story.stage_effects.some(effect => effect.name === "show_illustration" && effect.params.id === scenario.expectedPopup));
      assert.deepEqual(replies.filter(reply => reply.ok !== true), [], "A model tool request was rejected");
      for (const call of calls.filter(call => ["show_illustration", "set_scene_background"].includes(call.name))) {
        assert.equal(call.args.id, undefined);
        assert.ok(registry.resolve(call.args.token), "The model must use an approved phrase");
      }
      if (scenario.expectedBackground) {
        assert.ok(calls.some(call => call.name === "browse_illustrations" && !call.args.path));
        assert.ok(calls.some(call => call.name === "browse_illustrations" && call.args.path));
        assert.ok(calls.some(call => call.name === "search_illustrations"));
        assert.ok(story.stage_effects.some(effect => effect.name === "set_scene_background" && effect.params.id === scenario.expectedBackground));
      }
      const fetched = downloads.slice(startDownload);
      assert.ok(fetched.every(url => /^\/data\/illustrations\/library\/[\w.-]+\.json$/.test(url)),
        "Gallery navigation and model selection must never download image files");
      const summary = {case:scenario.name, ok:true, model:result.data.model,
        modelCalls:result.harness.modelCalls, toolCalls:result.harness.toolCalls,
        promptTokens:result.harness.promptTokens, completionTokens:result.harness.completionTokens,
        tools:calls.map(call => ({name:call.name,
          ...(["show_illustration", "set_scene_background", "browse_illustrations", "search_illustrations"].includes(call.name) ? {args:call.args} : {})})),
        metadataDownloads:fetched, imageDownloads:0, story};
      summaries.push(summary);
      report(summary);
    }
    report({ok:true, realAPI:true, fixtures:false, isolatedWorkers:true,
      cases:summaries.length, totalModelCalls:totalCalls});
  } finally {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
}

main().catch(error => {
  report({ok:false, code:error.code || error.name, message:String(error.message).slice(0,1500)});
  process.exitCode = 1;
});
