// Simulated browser integration against this checkout by default.
// Worker responses are mocked: this does not verify a real AI deployment.
// Set JIUZHOU_TEST_URL explicitly to test a published client with the same mocks.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)("playwright");
const root=fileURLToPath(new URL(".",import.meta.url));
const contentTypes={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".jpg":"image/jpeg",".png":"image/png",".svg":"image/svg+xml",".webp":"image/webp"};
let localServer;
let url=process.env.JIUZHOU_TEST_URL;
if(!url){
  localServer=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
      const path=resolve(root,"."+(pathname==="/"?"/index.html":pathname));
      if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return}
      const bytes=await readFile(path);
      res.writeHead(200,{"content-type":contentTypes[extname(path)]||"application/octet-stream"}).end(bytes);
    }catch{res.writeHead(404).end()}
  });
  await new Promise(resolve=>localServer.listen(0,"127.0.0.1",resolve));
  url=`http://127.0.0.1:${localServer.address().port}/`;
}
const browser=await chromium.launch({headless:true,executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE});
const origin=new URL(url).origin;
let backendCalls=0,probeCalls=0,probeFailure=true,challengeRequests=0,healthReady=false,responseMode="success";
const successfulAgentBodies=[];
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
async function settingsReady(){
  await page.waitForFunction(()=>{
    const drawer=document.querySelector("#drawer-settings");
    return drawer.classList.contains("open")&&drawer.getAttribute("aria-modal")==="true"&&!drawer.closest("[inert]");
  });
}
async function openCacheSettings(){
  if(await page.locator("#choice-overlay").evaluate(el=>el.classList.contains("visible"))) {
    await page.click("#mobile-choice-return");
    await page.waitForFunction(()=>!document.querySelector("#choice-overlay").classList.contains("visible"));
  }
  await page.click("#mobile-menu-toggle");
  await page.waitForFunction(()=>document.querySelector("#quick-menu").getAttribute("aria-modal")==="true");
  await page.click("#qm-cache");
  await settingsReady();
}
const errors=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",msg=>{if(msg.type()==="error"&&!/fonts.googleapis.com|fonts.gstatic.com/.test(msg.text()))console.log("browser console:",msg.text().slice(0,200))});
await page.route("https://challenges.cloudflare.com/**",route=>{
  challengeRequests++;
  return route.abort("failed");
});
await page.route("**/health",route=>healthReady?route.fulfill({
  status:200,contentType:"application/json",
  headers:{"access-control-allow-origin":origin},
  body:JSON.stringify({ok:true,configured:false,enabled:false,jiuzhouEnabled:false,jiuzhouReady:true})
}):route.abort("failed"));
await page.route("**/api/jiuzhou/turn",async route=>{
  const req=route.request();
  const cors={"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"};
  if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers:cors});return}
  assert.equal(req.method(),"POST");
  const data=JSON.parse(req.postData()||"{}");
  if(data.mode==="suture"&&data.max_tokens===256){
    probeCalls++;
    assert.ok(data.messages.at(-1).content.includes("连接测试成功"));
    assert.equal(data.turnstileToken,undefined);
    if(probeFailure){
      await route.fulfill({status:503,contentType:"application/json",headers:cors,body:JSON.stringify({error:"upstream_unavailable"})});
    }else{
      await route.fulfill({status:200,contentType:"application/json",headers:cors,body:JSON.stringify({model:"fixture-probe-model",choices:[{message:{content:JSON.stringify({reconciledBeats:[{text:"连接测试成功。"}]})}}]})});
    }
    return;
  }
  backendCalls++;
  assert.ok(["agent","story","suture"].includes(data.mode));
  assert.equal(data.turnstileToken,undefined);
  assert.equal(data.max_tokens,32768);
  assert.ok(Array.isArray(data.messages)&&data.messages.length>=3);
  assert.equal(data.messages[0].role,"system");
  assert.equal(data.messages[1].role,"system");
  if(responseMode==="pending"){
    await new Promise(resolve=>setTimeout(resolve,1500));
    await route.fulfill({status:503,contentType:"application/json",headers:cors,body:JSON.stringify({error:"upstream_unavailable"})}).catch(()=>{});return;
  }
  if(responseMode==="truncated"){
    await route.fulfill({status:502,contentType:"application/json",headers:cors,body:JSON.stringify({error:"output_truncated"})});return;
  }
  if(responseMode==="failure"){
    await route.fulfill({status:503,contentType:"application/json",headers:cors,body:JSON.stringify({error:"upstream_unavailable"})});return;
  }
  if(data.mode==="suture"){
    assert.ok(data.messages.at(-1).content.includes("我秘密筹集军饷"));
    await route.fulfill({status:200,contentType:"application/json",headers:cors,
      body:JSON.stringify({choices:[{message:{content:JSON.stringify({unexpected:"invalid suture fixture"})}}]})});return;
  }
  if(responseMode==="invalid-story"){
    await route.fulfill({status:200,contentType:"application/json",headers:cors,
      body:JSON.stringify({choices:[{message:{content:JSON.stringify({unexpected:"invalid game fixture"})}}]})});return;
  }
  assert.ok(data.messages.some(message=>message.role==="user"&&message.content.includes("我秘密筹集军饷")));
  if(data.mode==="agent"){
    successfulAgentBodies.push(data);
    assert.equal(data.tools,undefined);
    assert.deepEqual(data.enabledTools,["deliver_story","inspect_draft","read_draft","read_world","write_draft"]);
    assert.equal(data.thinking,undefined);
    assert.equal(data.response_format,undefined);
    if(successfulAgentBodies.length===1){
      await route.fulfill({status:200,contentType:"application/json",headers:cors,
        body:JSON.stringify({model:"fixture-agent-model",choices:[{finish_reason:"tool_calls",message:{role:"assistant",content:null,
          reasoning_content:"这是不交付的测试思考",tool_calls:[{id:"fixture_read_world",type:"function",function:{name:"read_world",arguments:"{}"}}]}}],
          usage:{prompt_cache_hit_tokens:650,prompt_cache_miss_tokens:550,completion_tokens:17}})});
      return;
    }
    assert.equal(data.messages.at(-1).role,"tool");
    assert.equal(data.messages.at(-1).tool_call_id,"fixture_read_world");
    assert.equal(data.messages.at(-2).reasoning_content,"这是不交付的测试思考");
    assert.deepEqual(data.messages.slice(0,successfulAgentBodies[0].messages.length),successfulAgentBodies[0].messages);
    assert.deepEqual(data.enabledTools,successfulAgentBodies[0].enabledTools);
  }
  const fixtureOpening="虚拟验收专用：军饷账册<img src=x onerror=window.__unsafeMarker=1>已在京师密库登记。";
  const fixtureEnding="接下来的行动将改变粮道。";
  const target=5000;
  const fixtureProse=fixtureOpening+"验".repeat(target-Array.from((fixtureOpening+fixtureEnding).replace(/\s/g,"")).length);
  await route.fulfill({status:200,contentType:"application/json",headers:cors,
    body:JSON.stringify({choices:[{message:{role:"assistant",content:JSON.stringify({
      beats:[{speaker:"军需官",sub:"测试回执",type:"npc",stageChar:"center",text:fixtureProse},{speaker:"旁白",sub:"后续",type:"narrator",stageChar:"left",text:fixtureEnding}],
      choices:[{text:"派人护送军饷<img src=x onerror=window.__unsafeMarker=1>",tag:"后勤<img src=x onerror=window.__unsafeMarker=1>"},{text:"隐秘调兵",tag:"军务"},{text:"召集商帮",tag:"交涉"}]
    })},finish_reason:"stop"}],usage:{prompt_tokens:1200,prompt_cache_hit_tokens:650,prompt_cache_miss_tokens:550,completion_tokens:230}})
  });
});
try{
  const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
  assert.equal(res?.status(),200);
  await page.waitForFunction(()=>Boolean(window.__vnEngine?.apiConfig),{timeout:25000});
  await page.waitForFunction(()=>window.__vnEngine?.sharedGatewayStatus?.state==="unavailable",{timeout:25000});
  await page.click("#title-btn-settings");
  await settingsReady();
  assert.match(await page.locator("#ai-connection-status").textContent(),/共享 AI 无法连接/);
  const beforeProbe=await page.evaluate(()=>JSON.stringify({config:window.__vnEngine.apiConfig,history:window.__vnEngine.apiHistory,status:window.__vnEngine.aiRequestStatus,cache:window.__vnEngine.cacheTelemetry}));
  await page.click("#btn-test-ai-connection");
  await page.waitForFunction(()=>document.getElementById("ai-connection-test-status").textContent.includes("测试失败"));
  assert.match(await page.locator("#ai-connection-test-status").textContent(),/AI 服务暂时不可用/);
  probeFailure=false;
  await page.click("#btn-test-ai-connection");
  await page.waitForFunction(()=>document.getElementById("ai-connection-test-status").textContent.includes("测试成功"));
  assert.match(await page.locator("#ai-connection-test-status").textContent(),/共享通道.*fixture-probe-model/);
  assert.equal(await page.locator("#btn-test-ai-connection").isDisabled(),false);
  assert.equal(probeCalls,2);
  assert.equal(await page.evaluate(()=>JSON.stringify({config:window.__vnEngine.apiConfig,history:window.__vnEngine.apiHistory,status:window.__vnEngine.aiRequestStatus,cache:window.__vnEngine.cacheTelemetry})),beforeProbe);
  assert.equal(await page.locator("#ai-connection-test-status").evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  healthReady=true;
  await page.locator("#settings-diagnostics > summary").click();
  await page.click("#btn-retry-shared-ai");
  await page.waitForFunction(()=>window.__vnEngine?.serverSharedConfig?.hasServerKey===true,{timeout:25000});
  assert.match(await page.locator("#qm-cache").textContent(),/待生成/);
  assert.equal(await page.locator("#qm-cache").evaluate(el=>el.classList.contains("hit")),false);
  await page.click("#btn-close-settings");
  const state=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    e.apiConfig.maxTokens=32768;
    e.expectedLength=5000;
    e.startNewGame("ming");
    await e.resolveFactionAction({
      text:"我秘密筹集军饷",customInput:"我秘密筹集军饷",tag:"开源筹饷",
      bias:{authority:0,pragmatism:1,progress:0,cognition:0},
      diceBase:7,isExtrapolation:true
    });
    return {
      enabled:e.apiConfig.enabled,shared:e.serverSharedConfig?.hasServerKey,
      queue:e.storyQueue?.map(x=>x.text||""),
      choices:e.pendingApiChoices?.map(x=>x.text||""),
      cacheHit:e.cacheTelemetry?.lastHitTokens,
      challengeScripts:document.querySelectorAll('script[src*="challenges.cloudflare.com"]').length,
      typing:e.isTyping
    }
  });
  assert.equal(state.enabled,true);
  assert.equal(state.shared,true);
  assert.equal(backendCalls,2);
  assert.equal(successfulAgentBodies.length,2);
  assert.equal(state.challengeScripts,0);
  assert.ok(state.queue.some(x=>x.includes("虚拟验收专用：军饷账册")),JSON.stringify(state.queue.slice(0,5)));
  assert.ok(state.choices?.some(x=>x.includes("派人护送军饷")));
  assert.equal(state.cacheHit,1300);
  assert.equal(await page.locator("#qm-cache").evaluate(el=>el.classList.contains("hit")),true);
  assert.match(await page.locator("#ai-generation-metrics").textContent(),/字符.*中文/);
  assert.match(await page.locator("#ai-generation-metrics").textContent(),/完成 Token 247.*交付完成（插件验证通过）/);
  assert.match(await page.locator("#ai-generation-metrics").textContent(),/5000 字符.*正文已达目标/);
  assert.match(await page.locator("#ai-generation-metrics").textContent(),/插件式工具循环.*模型 2 次.*工具 1 次/);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__vnEngine.apiHistory).includes("这是不交付的测试思考")),false);
  const safeRendering=await page.evaluate(()=>{
    const e=window.__vnEngine;
    e.fastForwardTypewriter();
    const textSafe=e.typewriterText.querySelectorAll("img").length===0&&e.typewriterText.textContent.includes("<img");
    const pending=e.pendingApiChoices;
    e.presentFactionChoices();
    const choicesSafe=e.choiceContainer.querySelectorAll("img").length===0&&e.choiceContainer.textContent.includes("<img");
    e.pendingApiChoices=pending;
    e.choiceOverlay.classList.remove("visible");
    return {textSafe,choicesSafe,executed:window.__unsafeMarker===1};
  });
  assert.deepEqual(safeRendering,{textSafe:true,choicesSafe:true,executed:false});
  responseMode="failure";
  const fallback=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    await e.resolveFactionAction({text:"继续筹饷",customInput:"继续筹饷",diceBase:7,isExtrapolation:true});
    return {queue:e.storyQueue.map(x=>x.text||""),choices:e.pendingApiChoices.length,status:e.aiRequestStatus};
  });
  assert.equal(fallback.status.state,"fallback");
  assert.match(fallback.status.message,/本轮剧情尚未交付：AI 服务暂时不可用/);
  assert.ok(fallback.queue.some(x=>x.includes("虚拟验收专用")), "failed action must preserve the previous delivered scene");
  assert.equal(fallback.choices,3);
  assert.equal(await page.locator("#qm-cache").evaluate(el=>el.classList.contains("hit")),false);
  assert.match(await page.locator("#ai-connection-status").textContent(),/本轮剧情尚未交付/);
  assert.equal(await page.evaluate(()=>window.__vnEngine.pendingTurnAttempt?.status),"failed");
  responseMode="invalid-story";
  const invalidStory=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    e.discardPendingTurn();
    const historyBefore=e.apiHistory.length;
    await e.resolveFactionAction({text:"核对军饷",customInput:"核对军饷",diceBase:7,isExtrapolation:true});
    return {historyBefore,historyAfter:e.apiHistory.length,status:e.aiRequestStatus,queue:e.storyQueue};
  });
  assert.equal(invalidStory.status.state,"fallback");
  assert.match(invalidStory.status.message,/格式无效|重复了相同操作且没有进展/);
  assert.equal(invalidStory.historyBefore,invalidStory.historyAfter);
  assert.ok(invalidStory.queue.length>0&&invalidStory.queue.every(x=>!x.text?.includes("invalid game fixture")));
  responseMode="invalid-suture";
  const sutureFallback=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    e.discardPendingTurn();
    await e.loadCanonicalNode(e.currentStoryNodeId,true);
    return {status:e.aiRequestStatus,queue:e.storyQueue};
  });
  assert.equal(sutureFallback.status.state,"fallback");
  assert.match(sutureFallback.status.message,/本轮已使用本地弥合：AI 返回的剧情格式无效/);
  assert.ok(sutureFallback.queue.some(x=>x.speaker==="因果弥合"));
  assert.equal(backendCalls,6);
  responseMode="truncated";
  const truncated=await page.evaluate(async()=>{
    const e=window.__vnEngine,before=e.apiHistory.length;
    await e.resolveFactionAction({text:"核实自由探索结果",customInput:"核实自由探索结果",diceBase:7,isExtrapolation:true});
    return {before,after:e.apiHistory.length,status:e.aiRequestStatus,locked:e.isAIGenerating};
  });
  assert.match(truncated.status.message,/AI 输出未完整结束/);
  assert.equal(truncated.before,truncated.after);
  assert.equal(truncated.locked,false);
  responseMode="pending";
  // This case tests cancellation after transport starts. The cancel control
  // becomes available earlier, while isolated plugins are still starting.
  const pendingModelRequest=page.waitForRequest(request=>request.method()==="POST"&&new URL(request.url()).pathname==="/api/jiuzhou/turn");
  const pendingAction=page.evaluate(async()=>{
    const e=window.__vnEngine,before=e.apiHistory.length;
    e.discardPendingTurn();
    const choicesBefore=JSON.stringify(e.pendingApiChoices);
    await e.resolveFactionAction({text:"等待中的自由探索",customInput:"等待中的自由探索",diceBase:7,isExtrapolation:true});
    return {before,after:e.apiHistory.length,status:e.aiRequestStatus,locked:e.isAIGenerating,choicesBefore,choicesAfter:JSON.stringify(e.pendingApiChoices)};
  });
  await pendingModelRequest;
  await page.waitForSelector('#btn-cancel-ai-request:not([hidden])');
  await page.click('#btn-cancel-ai-request');
  const cancelled=await pendingAction;
  assert.match(cancelled.status.message,/已取消本次请求/);
  assert.equal(cancelled.before,cancelled.after);
  assert.equal(cancelled.locked,false);
  assert.equal(cancelled.choicesAfter,cancelled.choicesBefore);
  assert.equal(await page.locator('#btn-cancel-ai-request').isHidden(),true);
  assert.equal(backendCalls,8);
  await page.evaluate(()=>window.__vnEngine.discardPendingTurn());
  let customCalls=0,customProbeCalls=0;
  await page.route("https://custom.fixture/v1/chat/completions",async route=>{
    const request=route.request();
    const cors={"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"};
    if(request.method()==="OPTIONS"){await route.fulfill({status:204,headers:cors});return}
    assert.equal(request.headers().authorization,undefined);
    const body=JSON.parse(request.postData()||"{}");
    assert.equal(body.model,"generic-fixture-model");
    for(const field of ["mode","expectedLength","enabledTools","thinking","reasoning_effort","max_tokens"])
      assert.equal(body[field],undefined,field);
    if(!body.tools){
      customProbeCalls++;
      assert.equal(body.max_completion_tokens,256);
      await route.fulfill({status:200,contentType:"application/json",headers:cors,body:JSON.stringify({model:"generic-fixture-model",choices:[{finish_reason:"stop",message:{content:JSON.stringify({reconciledBeats:[{text:"连接测试成功。"}]})}}]})});
      return;
    }
    customCalls++;
    assert.equal(body.max_completion_tokens,32768);
    assert.deepEqual(body.tools.map(tool=>tool.function.name),["deliver_story","inspect_draft","read_draft","read_world","write_draft"]);
    if(customCalls===1){
      await route.fulfill({status:200,contentType:"application/json",headers:cors,body:JSON.stringify({model:"generic-fixture-model",choices:[{finish_reason:"tool_calls",message:{role:"assistant",content:null,tool_calls:[{id:"custom_world",type:"function",function:{name:"read_world",arguments:"{}"}}]}}],usage:{prompt_tokens:100,completion_tokens:5}})});
      return;
    }
    assert.equal(body.messages.at(-1).role,"tool"); assert.equal(body.messages.at(-1).tool_call_id,"custom_world");
    await route.fulfill({status:200,contentType:"application/json",headers:cors,body:JSON.stringify({model:"generic-fixture-model",choices:[{finish_reason:"stop",message:{content:JSON.stringify({beats:[{speaker:"旁白",text:"自定义无密钥来源验收"+"文".repeat(490)}],choices:[{text:"救人"},{text:"查账"},{text:"守城"}]})}}],usage:{prompt_tokens:200,completion_tokens:100}})});
  });
  await openCacheSettings();
  await page.selectOption("#setting-api-source","custom");
  await page.fill("#setting-api-key","");
  await page.fill("#setting-endpoint","https://custom.fixture/v1/chat/completions");
  await page.selectOption("#setting-model","custom");
  await page.fill("#setting-custom-model","generic-fixture-model");
  await page.locator("#settings-compatibility > summary").click();
  await page.selectOption("#setting-api-adapter","openai");
  await page.selectOption("#setting-token-parameter","max_completion_tokens");
  await page.locator("#settings-generation-advanced > summary").click();
  await page.fill("#setting-max-tokens","32768");
  await page.click("#btn-test-ai-connection");
  await page.waitForFunction(()=>document.getElementById("ai-connection-test-status").textContent.includes("测试成功"));
  assert.match(await page.locator("#ai-connection-test-status").textContent(),/自定义.*generic-fixture-model/);
  await page.click("#btn-save-settings");
  await openCacheSettings();
  await page.click("#btn-retry-shared-ai");
  await page.waitForFunction(()=>window.__vnEngine.sharedGatewayStatus.state==="ready");
  assert.equal(await page.locator("#setting-api-source").inputValue(),"custom");
  await page.click("#btn-close-settings");
  const customState=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    e.expectedLength=500;
    const before=e.apiHistory.length;
    await e.resolveFactionAction({text:"自定义来源先救人",customInput:"自定义来源先救人",diceBase:7,isExtrapolation:true});
    return {source:e.apiConfig.source,key:e.apiConfig.apiKey,before,after:e.apiHistory.length,status:e.aiRequestStatus.state,
      prose:e.storyQueue.map(beat=>beat.text).join(""),metrics:e.aiGenerationMetrics};
  });
  assert.equal(customProbeCalls,1); assert.equal(customCalls,2); assert.equal(backendCalls,8);
  assert.equal(customState.source,"custom"); assert.equal(customState.key,""); assert.equal(customState.status,"success");
  assert.equal(customState.after,customState.before+2); assert.match(customState.prose,/自定义无密钥来源验收/);
  assert.equal(customState.metrics.harness.modelCalls,2); assert.equal(customState.metrics.harness.toolCalls,1);
  assert.equal(customState.metrics.textCharacters,500);
  assert.match(await page.locator("#ai-generation-metrics").textContent(),/未提供|未知/);
  assert.equal(challengeRequests,0);
  assert.equal(errors.length,0,errors.join("\n"));
  console.log(`PASS ${localServer?"checked-out client":"explicit external client"} HTTP 200 and assets loaded`);
  console.log("PASS simulated shared AI health handshake preserves the configured source and remote preference");
  console.log("PASS direct shared requests without CAPTCHA scripts, tokens, or challenge network calls");
  console.log("PASS POST /api/jiuzhou/turn with bounded game context (mock route)");
  console.log("PASS simulated AI beats, choices and cache stats absorbed by game");
  console.log("PASS real browser Workers run a native tool step, preserve the cache prefix and deliver exactly 5000 fixture prose characters");
  console.log("PASS model prose, choices and tags containing HTML are displayed as text without script execution");
  console.log("PASS 32768 output tokens forwarded for story and suture without shared-channel clamps");
  console.log("PASS failed health is visible and settings retry reaches ready without claiming generation");
  console.log("PASS settings test button sends independent short requests, shows failure/success and leaves game/config/cache unchanged");
  console.log("PASS failed model request preserves the committed scene and original action for explicit recovery, removing the stale cache badge");
  console.log("PASS arbitrary story JSON is rejected without displaying it or polluting AI history");
  console.log("PASS invalid suture response uses real local suture and shows its failure reason");
  console.log("PASS real metrics distinguish completed model output; truncation and manual cancellation release exploration without history pollution");
  console.log("PASS selected Keyless custom provider probes and runs native tools with generic parameters; shared health cannot take over and absent cache telemetry stays unknown");
  console.log("PASS no browser JS exceptions, no paid model calls");
} finally {await browser.close();if(localServer)await new Promise(resolve=>localServer.close(resolve))}
