// Browser E2E against deployed GitHub Pages. The Worker and Turnstile are mocked;
// no paid DeepSeek requests, no CAPTCHA solving or WAF bypass.
import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
const url="https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/";
let backendCalls=0,challengeRenders=0,upstreamPayload=null;
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
await page.route("**/health",route=>route.fulfill({
  status:200,contentType:"application/json",
  headers:{"access-control-allow-origin":"https://zjj1280637679-ship-it.github.io"},
  body:JSON.stringify({ok:true,configured:true,enabled:true,jiuzhouEnabled:true})
}));
await page.route("**/api/jiuzhou/turn",async route=>{
  const req=route.request();
  const cors={"access-control-allow-origin":"https://zjj1280637679-ship-it.github.io","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"};
  if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers:cors});return}
  assert.equal(req.method(),"POST");
  const data=JSON.parse(req.postData()||"{}");
  upstreamPayload=data;
  backendCalls++;
  assert.equal(data.mode,"story");
  assert.equal(data.turnstileToken,"mock-single-use-token");
  assert.ok(Array.isArray(data.messages)&&data.messages.length>=3);
  assert.equal(data.messages[0].role,"system");
  assert.equal(data.messages[1].role,"system");
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
  await page.waitForFunction(()=>window.__vnEngine?.serverSharedConfig?.hasServerKey===true,{timeout:25000});
  const state=await page.evaluate(async()=>{
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
  assert.equal(state.enabled,true);
  assert.equal(state.shared,true);
  assert.equal(backendCalls,1);
  assert.equal(state.draws,1);
  assert.ok(state.queue.some(x=>x.includes("虚拟验收专用：军饷账册")),JSON.stringify(state.queue.slice(0,5)));
  assert.ok(state.choices?.some(x=>x.includes("派人护送军饷")));
  assert.equal(state.cacheHit,650);
  assert.equal(errors.length,0,errors.join("\n"));
  console.log("PASS GitHub Pages HTTP 200 and client assets loaded");
  console.log("PASS shared AI health handshake and auto-enable");
  console.log("PASS Turnstile client callback (mock token only)");
  console.log("PASS POST /api/jiuzhou/turn with bounded game context (mock route)");
  console.log("PASS AI beats, choices and cache stats absorbed by game");
  console.log("PASS no browser JS exceptions, no paid model calls");
} finally {await browser.close()}
