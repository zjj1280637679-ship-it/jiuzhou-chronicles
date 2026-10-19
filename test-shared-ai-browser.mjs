// Simulated browser integration against this checkout by default.
// Worker and Turnstile are mocked: this does not verify a real AI deployment.
// Set JIUZHOU_TEST_URL explicitly to test a published client with the same mocks.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)("playwright");
const root=fileURLToPath(new URL(".",import.meta.url));
const contentTypes={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".jpg":"image/jpeg",".png":"image/png"};
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
let backendCalls=0,healthReady=false,responseMode="success";
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",msg=>{if(msg.type()==="error"&&!/fonts.googleapis.com|fonts.gstatic.com/.test(msg.text()))console.log("browser console:",msg.text().slice(0,200))});
await page.addInitScript(()=>{
  window.turnstile={
    render:(_widget,options)=>{window.__challengeRenders=(window.__challengeRenders||0)+1;queueMicrotask(()=>options.callback("mock-single-use-token"));return 42},
    remove:()=>{}
  };
});
await page.route("**/health",route=>healthReady?route.fulfill({
  status:200,contentType:"application/json",
  headers:{"access-control-allow-origin":origin},
  body:JSON.stringify({ok:true,configured:true,enabled:true,jiuzhouEnabled:true,inviteRequired:true,inviteConfigured:true,jiuzhouReady:true})
}):route.abort("failed"));
await page.route("**/api/jiuzhou/turn",async route=>{
  const req=route.request();
  const cors={"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"};
  if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers:cors});return}
  assert.equal(req.method(),"POST");
  const data=JSON.parse(req.postData()||"{}");
  backendCalls++;
  assert.ok(["story","suture"].includes(data.mode));
  assert.equal(data.turnstileToken,"mock-single-use-token");
  assert.equal(data.inviteCode,"test-invite-code-alpha","Worker gets current invite only with AI requests");
  assert.ok(Array.isArray(data.messages)&&data.messages.length>=3);
  assert.equal(data.messages[0].role,"system");
  assert.equal(data.messages[1].role,"system");
  if(responseMode==="failure"){
    await route.fulfill({status:403,contentType:"application/json",headers:cors,body:JSON.stringify({error:"challenge_required"})});return;
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
  assert.ok(data.messages.at(-1).content.includes("我秘密筹集军饷"));
  await route.fulfill({status:200,contentType:"application/json",headers:cors,
    body:JSON.stringify({choices:[{message:{role:"assistant",content:JSON.stringify({
      beats:[{speaker:"军需官",sub:"测试回执",type:"npc",stageChar:"center",text:"虚拟验收专用：军饷账册已在京师密库登记。"},{speaker:"旁白",sub:"后续",type:"narrator",stageChar:"left",text:"接下来的行动将改变粮道。"}],
      choices:[{text:"派人护送军饷",tag:"后勤"},{text:"隐秘调兵",tag:"军务"},{text:"召集商帮",tag:"交涉"}]
    })}}],usage:{prompt_tokens:1200,prompt_cache_hit_tokens:650,prompt_cache_miss_tokens:550,completion_tokens:230}})
  });
});
try{
  const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
  assert.equal(res?.status(),200);
  await page.waitForFunction(()=>Boolean(window.__vnEngine?.apiConfig),{timeout:25000});
  await page.waitForFunction(()=>window.__vnEngine?.sharedGatewayStatus?.state==="unavailable",{timeout:25000});
  await page.click("#title-btn-settings");
  assert.match(await page.locator("#ai-connection-status").textContent(),/共享 AI 无法连接/);
  healthReady=true;
  await page.click("#btn-retry-shared-ai");
  await page.waitForFunction(()=>window.__vnEngine?.serverSharedConfig?.hasServerKey===true,{timeout:25000});
  assert.match(await page.locator("#qm-cache").textContent(),/待生成/);
  assert.equal(await page.locator("#qm-cache").evaluate(el=>el.classList.contains("hit")),false);
  await page.click("#btn-close-settings");
  // The static webpage stays visible without a code. Enter it only when the first AI call is made.
  assert.equal(await page.locator('input[aria-label="AI 邀请码"]').count(),0);
  const pending=page.evaluate(async()=>{
    const e=window.__vnEngine;
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
      draws:window.__challengeRenders,
      typing:e.isTyping
    }
  });
  await page.locator('input[aria-label="AI 邀请码"]').waitFor({timeout:15000});
  await page.locator('input[aria-label="AI 邀请码"]').fill("test-invite-code-alpha");
  await page.locator('button:has-text("解锁 AI")').click();
  const state=await pending;
  assert.equal(state.enabled,true);
  assert.equal(state.shared,true);
  assert.equal(backendCalls,1);
  assert.equal(state.draws,1);
  assert.ok(state.queue.some(x=>x.includes("虚拟验收专用：军饷账册")),JSON.stringify(state.queue.slice(0,5)));
  assert.ok(state.choices?.some(x=>x.includes("派人护送军饷")));
  assert.equal(state.cacheHit,650);
  assert.equal(await page.locator("#qm-cache").evaluate(el=>el.classList.contains("hit")),true);
  responseMode="failure";
  const fallback=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    await e.resolveFactionAction({text:"继续筹饷",customInput:"继续筹饷",diceBase:7,isExtrapolation:true});
    return {queue:e.storyQueue.map(x=>x.text||""),choices:e.pendingApiChoices.length,status:e.aiRequestStatus};
  });
  assert.equal(fallback.status.state,"fallback");
  assert.match(fallback.status.message,/本轮已使用本地剧情：访问验证未通过/);
  assert.ok(fallback.queue.length>0&&fallback.queue.every(x=>!x.includes("虚拟验收专用")));
  assert.equal(fallback.choices,3);
  assert.equal(await page.locator("#qm-cache").evaluate(el=>el.classList.contains("hit")),false);
  assert.match(await page.locator("#ai-connection-status").textContent(),/本轮已使用本地剧情/);
  responseMode="invalid-story";
  const invalidStory=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    const historyBefore=e.apiHistory.length;
    await e.resolveFactionAction({text:"核对军饷",customInput:"核对军饷",diceBase:7,isExtrapolation:true});
    return {historyBefore,historyAfter:e.apiHistory.length,status:e.aiRequestStatus,queue:e.storyQueue};
  });
  assert.equal(invalidStory.status.state,"fallback");
  assert.match(invalidStory.status.message,/AI 返回的剧情格式无效/);
  assert.equal(invalidStory.historyBefore,invalidStory.historyAfter);
  assert.ok(invalidStory.queue.length>0&&invalidStory.queue.every(x=>!x.text?.includes("invalid game fixture")));
  responseMode="invalid-suture";
  const sutureFallback=await page.evaluate(async()=>{
    const e=window.__vnEngine;
    await e.loadCanonicalNode(e.currentStoryNodeId,true);
    return {status:e.aiRequestStatus,queue:e.storyQueue};
  });
  assert.equal(sutureFallback.status.state,"fallback");
  assert.match(sutureFallback.status.message,/本轮已使用本地弥合：AI 返回的剧情格式无效/);
  assert.ok(sutureFallback.queue.some(x=>x.speaker==="因果弥合"));
  assert.equal(backendCalls,4);
  assert.equal(errors.length,0,errors.join("\n"));
  console.log(`PASS ${localServer?"checked-out client":"explicit external client"} HTTP 200 and assets loaded`);
  console.log("PASS simulated shared AI health handshake and auto-enable");
  console.log("PASS Turnstile client callback (mock token only)");
  console.log("PASS POST /api/jiuzhou/turn with bounded game context (mock route)");
  console.log("PASS simulated AI beats, choices and cache stats absorbed by game");
  console.log("PASS failed health is visible and settings retry reaches ready without claiming generation");
  console.log("PASS failed model request uses real local fallback and removes successful cache badge");
  console.log("PASS arbitrary story JSON is rejected without displaying it or polluting AI history");
  console.log("PASS invalid suture response uses real local suture and shows its failure reason");
  console.log("PASS no browser JS exceptions, no paid model calls");
} finally {await browser.close();if(localServer)await new Promise(resolve=>localServer.close(resolve))}
