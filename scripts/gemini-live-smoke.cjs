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
  let httpRequests = 0, quotaRetries = 0;
  const cases = [
    {name:"curated_phrase", expectedPopup:"qing_shengjing_palace", action:
      "你在盛京宫庭等候召见。本次验证最短调用：已知准确短语是“后金·盛京宫庭”，请直接调用show_illustration，参数只传这个token，使用默认位置和说明，不必再搜索。背景保持现状。然后用deliver_story直接交付这一幕。"},
    {name:"browse_search_select", expectedPopup:"qing_cavalry_charge", expectedBackground:"qing_frontier_pass", action:
      "你走近关隘观察后金骑兵集结。先查看图库根分类，再进入一个返回的军事相关分类；随后搜索后金骑兵冲锋的画面。取得准确token后，必须实际调用show_illustration安排骑军突击弹窗，并调用set_scene_background把“后金·关隘烽火”设为背景；两项安排完成后，再调用deliver_story交付这一幕。选图调用只传token即可，使用默认位置和说明。"}
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
          const call = {name:message.name, args:structuredClone(message.args)};
          pending.set(message.id, call);
          calls.push(call);
          if (["show_illustration", "set_scene_background", "browse_illustrations", "search_illustrations"].includes(message.name)) {
            report({case:scenario.name, tool:message.name, args:message.args});
          }
        },
        onMessage(message) {
          if (message.type !== "result") return;
          const call = pending.get(message.id);
          if (call) call.ok = message.result?.ok === true;
          replies.push({name:call?.name, ok:message.result?.ok,
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
            let response, data;
            while (true) {
              httpRequests++;
              response = await fetch(request.endpoint, {method:"POST", headers:request.headers,
                body:JSON.stringify(request.body), redirect:"error", signal:options.signal});
              try {data = JSON.parse(await response.text());} catch {throw new Error("non_json_model_response");}
              if (response.ok) break;
              const error = Array.isArray(data) ? data[0]?.error : data.error;
              const message = String(error?.message || "No API error detail");
              const retry = error?.details?.find(item => item["@type"] === "type.googleapis.com/google.rpc.RetryInfo");
              const seconds = Number(String(retry?.retryDelay || message.match(/Please retry in ([\d.]+)s/)?.[1] || "").replace(/s$/, ""));
              const waitMs = Math.ceil(seconds * 1000) + 1000;
              // Retry only the transient minute quota, never auth, daily quota,
              // or a tool execution. The exact message prefix remains intact.
              if (response.status === 429 && /per minute/i.test(message) &&
                  seconds > 0 && waitMs <= 60000 && quotaRetries < 2) {
                quotaRetries++;
                report({case:scenario.name, http_status:429, retryAfterMs:waitMs, reason:"google_minute_quota"});
                await require("node:timers/promises").setTimeout(waitMs, undefined, {signal:options.signal});
                continue;
              }
              report({case:scenario.name, http_status:response.status, code:error?.status || error?.code,
                message:message.slice(0,1000)});
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
      report({case:scenario.name, delivery:{beats:story.beats.length,
        choices:story.choices.length, stage_effects:story.stage_effects},
        executedTools:calls.map(call => call.name)});
      assert.ok(story.beats.length > 0);
      assert.equal(story.choices.length, 3, "The model itself must provide three choices");
      assert.ok(calls.some(call => call.name === "deliver_story" && call.args.story), "Direct story delivery was not exercised");
      assert.ok(calls.some(call => call.name === "show_illustration" && call.ok && typeof call.args.token === "string"));
      assert.ok(story.stage_effects.some(effect => effect.name === "show_illustration" && effect.params.id === scenario.expectedPopup));
      for (const call of calls.filter(call => call.ok && ["show_illustration", "set_scene_background"].includes(call.name))) {
        assert.equal(call.args.id, undefined);
        assert.ok(registry.resolve(call.args.token), "The model must use an approved phrase");
      }
      if (scenario.expectedBackground) {
        assert.ok(calls.some(call => call.name === "browse_illustrations" && !call.args.path));
        assert.ok(calls.some(call => call.name === "browse_illustrations" && call.args.path));
        assert.ok(calls.some(call => call.name === "search_illustrations"));
        assert.ok(story.stage_effects.some(effect => effect.name === "set_scene_background" && effect.params.id === scenario.expectedBackground));
      } else {
        const selected = calls.find(call => call.name === "show_illustration" && call.ok);
        assert.deepEqual(Object.keys(selected.args), ["token"]);
        assert.equal(registry.resolve(selected.args.token).id, scenario.expectedPopup);
        assert.ok(!calls.some(call => call.name === "set_scene_background"));
      }
      const fetched = downloads.slice(startDownload);
      assert.ok(fetched.every(url => /^\/data\/illustrations\/library\/[\w.-]+\.json$/.test(url)),
        "Gallery navigation and model selection must never download image files");
      const summary = {case:scenario.name, ok:true, model:result.data.model,
        modelCalls:result.harness.modelCalls, toolCalls:result.harness.toolCalls,
        promptTokens:result.harness.promptTokens, completionTokens:result.harness.completionTokens,
        rejectedTools:replies.filter(reply => reply.ok !== true),
        tools:calls.map(call => ({name:call.name, ok:call.ok,
          ...(["show_illustration", "set_scene_background", "browse_illustrations", "search_illustrations"].includes(call.name) ? {args:call.args} : {})})),
        metadataDownloads:fetched, imageDownloads:0, story};
      summaries.push(summary);
      report(summary);
    }
    report({ok:true, realAPI:true, fixtures:false, isolatedWorkers:true,
      cases:summaries.length, totalModelCalls:totalCalls, httpRequests, quotaRetries});
  } finally {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
}

main().catch(error => {
  report({ok:false, code:error.code || error.name, message:String(error.message).slice(0,1500)});
  process.exitCode = 1;
});
