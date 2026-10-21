// Real layout and click regression against this checkout. All external traffic is
// intercepted; model replies are fixtures and never consume an API balance.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile, mkdir} from "node:fs/promises";
import {resolve, extname, sep, join} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)("playwright");
const root=fileURLToPath(new URL(".",import.meta.url));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp",".woff2":"font/woff2"};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const path=resolve(root,"."+(pathname==="/"?"/index.html":pathname));
    if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return}
    const bytes=await readFile(path);
    res.writeHead(200,{"content-type":mime[extname(path)]||"application/octet-stream"}).end(bytes);
  }catch{res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url=`http://127.0.0.1:${server.address().port}/`;
const origin=new URL(url).origin;
const browser=await chromium.launch({headless:true,executablePath:process.env.JIUZHOU_BROWSER_EXECUTABLE});
const screenshots=process.env.JIUZHOU_LAYOUT_SCREENSHOTS;
if(screenshots)await mkdir(screenshots,{recursive:true});
const sizes=[
  {name:"phone-320",width:320,height:740,mobile:true},
  {name:"phone-390",width:390,height:844,mobile:true},
  {name:"phone-430",width:430,height:932,mobile:true},
  {name:"landscape",width:844,height:390,mobile:true},
  {name:"desktop",width:1440,height:900,mobile:false}
];

async function reachable(page,selector){
  const el=page.locator(selector);
  await el.scrollIntoViewIfNeeded();
  await el.waitFor({state:"visible"});
  const result=await el.evaluate(node=>{
    const r=node.getBoundingClientRect();
    const x=r.left+r.width/2,y=r.top+r.height/2;
    const hit=document.elementFromPoint(x,y);
    const ancestors=[];
    for(let parent=node.parentElement;parent&&ancestors.length<5;parent=parent.parentElement){
      const box=parent.getBoundingClientRect(),css=getComputedStyle(parent);
      ancestors.push({id:parent.id,className:parent.className,y:box.y,height:box.height,scrollTop:parent.scrollTop,scrollHeight:parent.scrollHeight,clientHeight:parent.clientHeight,overflow:css.overflowY,display:css.display,flex:css.flex,padding:css.padding});
    }
    return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight,visualHeight:visualViewport?.height},hit:hit===node||node.contains(hit),ancestors};
  });
  assert.ok(result.rect.width>0&&result.rect.height>0,`${selector}: empty target`);
  assert.ok(result.rect.x>=-1&&result.rect.y>=-1&&result.rect.x+result.rect.width<=result.viewport.width+1&&result.rect.y+result.rect.height<=result.viewport.height+1,`${selector}: clipped ${JSON.stringify(result)}`);
  assert.ok(result.hit,`${selector}: covered at its centre ${JSON.stringify(result)}`);
}
async function noOverflow(page,label,selectors=[]){
  const result=await page.evaluate(selectors=>{
    const width=document.documentElement.clientWidth;
    const overflow=[document.documentElement,document.body,...selectors.map(s=>document.querySelector(s)).filter(Boolean)]
      .filter(node=>node.scrollWidth>node.clientWidth+1)
      .map(node=>({id:node.id||node.tagName,width:node.clientWidth,scroll:node.scrollWidth}));
    return {width,overflow};
  },selectors);
  assert.deepEqual(result.overflow,[],`${label}: horizontal overflow ${JSON.stringify(result)}`);
}
async function shot(page,size,state){
  if(screenshots)await page.screenshot({path:join(screenshots,`${size.name}-${state}.png`),fullPage:false});
}
async function engineState(page){
  return page.evaluate(()=>({step:window.__vnEngine.currentStep,total:window.__vnEngine.storyQueue.length,node:window.__vnEngine.currentStoryNodeId,turn:window.__vnEngine.currentTurn,typing:window.__vnEngine.isTyping,generating:window.__vnEngine.isAIGenerating}));
}
async function counterMatches(page){
  await page.waitForFunction(()=>{
    const nav=document.querySelector("#dialogue-nav-bar"),e=window.__vnEngine;
    return nav.dataset.step===String(e.currentStep)&&nav.dataset.total===String(e.storyQueue.length)&&document.querySelector("#mobile-page-position").textContent.trim()===`${e.currentStep} / ${e.storyQueue.length}`;
  });
}
async function resizeRoundTrip(page){
  const before=await engineState(page);
  await page.click("#mobile-menu-toggle");
  await page.waitForFunction(()=>document.querySelector("#quick-menu").getAttribute("aria-modal")==="true");
  const initialFont=await page.locator("#dialogue-content").evaluate(node=>parseFloat(getComputedStyle(node).fontSize));
  await page.click("#mobile-font-increase");
  await page.click("#mobile-menu-close");
  await page.waitForFunction(()=>!document.querySelector("#dialogue-content").closest("[inert]"));
  const fontResult=await page.evaluate(()=>({font:parseFloat(getComputedStyle(document.querySelector("#dialogue-content")).fontSize),rootFont:document.documentElement.style.getPropertyValue("--mobile-reader-font-size"),menuOpen:document.querySelector("#quick-menu").classList.contains("mobile-menu-open")}));
  assert.equal(fontResult.font,initialFont+1,`font button must change actual prose typography ${JSON.stringify(fontResult)}`);
  await page.click("#mobile-menu-toggle");
  await page.waitForFunction(()=>document.querySelector("#quick-menu").getAttribute("aria-modal")==="true");
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>!document.documentElement.classList.contains("mobile-layout")&&document.querySelector("#ai-length-group").parentElement.id==="story-branch-indicator"&&document.querySelector("#ai-harness-progress").parentElement.id==="game-viewport");
  const desktopParents=await page.evaluate(()=>Object.fromEntries(["ai-length-group","btn-branch-explainer","ai-harness-progress","btn-cancel-ai-request"].map(id=>[id,document.getElementById(id).parentElement.id])));
  assert.deepEqual(desktopParents,{"ai-length-group":"story-branch-indicator","btn-branch-explainer":"story-branch-indicator","ai-harness-progress":"game-viewport","btn-cancel-ai-request":"quick-menu"});
  assert.equal(await page.locator("#quick-menu").evaluate(node=>node.classList.contains("mobile-menu-open")),false);
  assert.equal(await page.locator("#mobile-menu-toggle").getAttribute("aria-expanded"),"false");
  assert.equal(await page.locator("#mobile-topbar").isVisible(),false);
  await reachable(page,"#qm-settings");
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.documentElement.classList.contains("mobile-layout")&&document.querySelector("#ai-length-group").parentElement.id==="mobile-reading-tools"&&document.querySelector("#ai-harness-progress").parentElement.id==="dialogue-box");
  const mobileParents=await page.evaluate(()=>Object.fromEntries(["ai-length-group","btn-branch-explainer","ai-harness-progress","btn-cancel-ai-request"].map(id=>[id,document.getElementById(id).parentElement.id])));
  assert.deepEqual(mobileParents,{"ai-length-group":"mobile-reading-tools","btn-branch-explainer":"mobile-reading-tools","ai-harness-progress":"dialogue-box","btn-cancel-ai-request":"dialogue-box"});
  assert.equal(await page.locator("#quick-menu").isVisible(),false);
  assert.equal(await page.locator("#mobile-menu-toggle").getAttribute("aria-expanded"),"false");
  assert.equal(await page.locator("#dialogue-content").evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),initialFont+1,"phone font preference must survive breakpoint changes");
  await page.click("#mobile-menu-toggle");
  await page.waitForFunction(()=>document.querySelector("#quick-menu").getAttribute("aria-modal")==="true");
  await page.click("#mobile-font-decrease");
  await page.click("#mobile-menu-close");
  await page.waitForFunction(()=>!document.querySelector("#quick-menu").classList.contains("mobile-menu-open")&&!document.querySelector("#mobile-next").closest("[inert]"));
  assert.equal(await page.locator("#dialogue-content").evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),initialFont);
  assert.equal((await engineState(page)).step,before.step,"breakpoint switches and font controls must not advance the story");
  await noOverflow(page,"same-context phone → desktop → phone",["#dialogue-box","#dialogue-content"]);
  console.log("PASS same context 390 → 1440 → 390 restores tool/progress/cancel parents, closes menus and preserves functional font controls");
}
async function resumeMiddleBeat(page){
  const before=await engineState(page);
  assert.ok(before.step>1&&before.step<before.total,"mid-story resume fixture must be between the first and final beat");
  await page.click("#mobile-home");
  await page.waitForFunction(()=>window.__vnEngine.gameState==="TITLE");
  await page.click("#title-btn-continue");
  await page.waitForFunction(()=>window.__vnEngine.gameState==="PLAYING");
  await counterMatches(page);
  const after=await engineState(page);
  // currentStep indexes the next unread beat; the visible saved page is step-1.
  assert.equal(after.step,before.step,"continuing must restore the same visible page without skipping it");
  assert.equal(after.total,before.total);
  assert.equal(after.node,before.node);assert.equal(after.turn,before.turn);
  assert.equal(await page.locator("#btn-dialogue-prev").isDisabled(),false,"saved middle beat must immediately enable previous-page navigation");
  if(after.typing)await page.click("#mobile-next");
  assert.equal((await engineState(page)).step,after.step,"revealing the resumed beat must not skip it");
  console.log("PASS mid-story home → continue restores the saved queue, current counter and enabled previous-page button");
}
async function openMenuAction(page,size,button){
  if(size.mobile){
    await reachable(page,"#mobile-menu-toggle");
    await page.click("#mobile-menu-toggle");
    await reachable(page,"#mobile-menu-close");
  }
  await reachable(page,button);
  await page.click(button);
}
async function toChoices(page,size){
  const advance=size.mobile?"#mobile-next":"#dialogue-box";
  for(let i=0;i<180;i++){
    if(await page.locator("#choice-overlay").evaluate(el=>el.classList.contains("visible")))return;
    await page.click(advance);
  }
  assert.fail(`${size.name}: decisions never became visible through normal navigation`);
}
async function openFreeAction(page){
  await page.click("#choice-container .choice-card:last-child");
  // The focus/inert state changes on the next animation frame. A human cannot
  // type before that paint; wait for the modal's public accessibility state.
  await page.waitForFunction(()=>{
    const drawer=document.querySelector("#drawer-open-input");
    return drawer.classList.contains("open")&&drawer.getAttribute("aria-modal")==="true"&&!drawer.closest("[inert]");
  });
}
async function illustrationFlow(page,size){
  // Supply an actual illustration beat through the rendering API, then operate
  // its normal card and modal. This does not bypass opening/closing with classes.
  const before=await engineState(page);
  await page.evaluate(()=>{
    const description="远处烽烟渐起，城门前的众人仍守着灯火。长卷注脚应当可以滚动阅读。".repeat(80);
    window.__vnEngine.displayDialogue("画卷旁白","手机插画布局验收","narrator",description,"center",{
      relativePath:"data/illustrations/ming/battle.jpg",title:"城下风云 · 长卷说明",description,
      factionName:"大明",categoryName:"测试画卷",symbol:"◇"
    });
  });
  await page.click(".dialogue-illustration-card .illustration-view-pill");
  await page.waitForFunction(()=>document.querySelector("#modal-illustration").getAttribute("aria-modal")==="true");
  await page.waitForFunction(()=>{const image=document.querySelector("#illustration-graphic img");return Boolean(image?.complete&&image.naturalWidth>0)});
  await reachable(page,"#btn-close-illustration");
  assert.ok(await page.locator("#illustration-caption").evaluate(node=>node.scrollHeight>node.clientHeight+20),`${size.name}: long image caption needs an independent scroll area`);
  await page.locator("#illustration-caption").hover();
  await page.mouse.wheel(0,500);
  await page.waitForFunction(()=>document.querySelector("#illustration-caption").scrollTop>0);
  await reachable(page,"#btn-close-illustration");
  await noOverflow(page,`${size.name} illustration`,["#modal-illustration .illustration-box","#illustration-caption"]);
  await shot(page,size,"illustration");
  await page.click("#btn-close-illustration");
  await page.waitForFunction(()=>!document.querySelector("#modal-illustration").classList.contains("open")&&!document.querySelector("#mobile-next").closest("[inert]"));
  assert.equal((await engineState(page)).step,before.step,"opening/closing an image must not advance the story");
}

try{
  for(const size of sizes){
    const context=await browser.newContext({viewport:{width:size.width,height:size.height},isMobile:size.mobile,hasTouch:size.mobile,deviceScaleFactor:1,serviceWorkers:"block",reducedMotion:"reduce"});
    const page=await context.newPage();
    const errors=[];
    let modelCalls=0,pendingReply=false,notifyModelRequest;
    const external=[];
    const firstModelRequest=new Promise(done=>{notifyModelRequest=done});
    page.on("pageerror",error=>errors.push(error.message));
    // This allowlist also blocks unknown external endpoints. No user profile,
    // local secrets, real gateway or browser session is used by this test.
    await context.route("**/*",async route=>{
      const request=route.request(),target=new URL(request.url());
      if(target.origin===origin){await route.continue();return}
      external.push({path:target.pathname,method:request.method()});
      if(target.pathname==="/health"){
        await route.fulfill({status:200,contentType:"application/json",headers:{"access-control-allow-origin":origin},body:JSON.stringify({ok:true,configured:true,enabled:true,jiuzhouEnabled:true,jiuzhouReady:true,model:"layout-fixture"})});return;
      }
      if(target.origin==="https://layout.fixture"&&target.pathname==="/v1/chat/completions"){
        const headers={"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"};
        if(request.method()==="OPTIONS"){await route.fulfill({status:204,headers});return}
        modelCalls++;
        notifyModelRequest();
        if(pendingReply){
          await new Promise(done=>setTimeout(done,1800));
          await route.fulfill({status:503,headers,contentType:"application/json",body:JSON.stringify({error:"fixture_cancel_pending"})}).catch(()=>{});return;
        }
        const body=JSON.stringify({model:"layout-fixture",choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({beats:[{speaker:"布局验收旁白",sub:"模拟响应，不连接模型",text:"手机布局模拟剧情。"+"灯影映着城墙，众人仍在商议下一步。".repeat(340)}],choices:[{text:"查阅粮册"},{text:"召集百姓"},{text:"加固城门"}]})}}],usage:{prompt_tokens:100,completion_tokens:100}});
        await route.fulfill({status:200,headers,contentType:"application/json",body});return;
      }
      await route.abort("blockedbyclient");
    });
    try{
      const response=await page.goto(url,{waitUntil:"domcontentloaded"});
      assert.equal(response?.status(),200);
      await page.waitForFunction(()=>Boolean(window.__vnEngine?.apiConfig));
      for(const id of ["title-btn-start","title-btn-continue","title-btn-factions","title-btn-destiny","title-btn-swarm","title-btn-settings"])
        await reachable(page,`#${id}`);
      await noOverflow(page,`${size.name} title`,["#title-screen",".title-content-box"]);
      await shot(page,size,"title");

      await page.click("#title-btn-settings");
      await reachable(page,"#btn-close-settings");

      await page.fill("#setting-endpoint","https://layout.fixture/v1");
      await page.selectOption("#setting-model","custom");
      await page.fill("#setting-custom-model","layout-fixture");
      await reachable(page,"#btn-save-settings");
      await noOverflow(page,`${size.name} settings`,["#drawer-settings .ribbon-modal-box","#drawer-settings .drawer-body"]);
      if(size.mobile)await reachable(page,"#btn-close-settings");
      await shot(page,size,"settings");
      // Save only fixture settings into this new isolated browser context.
      await page.check("#setting-enable-api");
      await page.click("#btn-save-settings");
      await page.waitForFunction(()=>!document.querySelector("#drawer-settings").classList.contains("open"));

      await page.click("#title-btn-factions");
      assert.equal(await page.locator("#faction-grid-selector .faction-card").count(),4);
      await reachable(page,"#faction-grid-selector .faction-card:last-child");
      if(size.mobile)await reachable(page,"#btn-close-faction");
      await noOverflow(page,`${size.name} factions`,["#faction-grid-selector"]);
      await page.click("#btn-close-faction");
      await page.click("#title-btn-start");
      await page.waitForFunction(()=>window.__vnEngine.gameState==="PLAYING");
      assert.equal(await page.locator("#choice-overlay").evaluate(el=>el.classList.contains("visible")),false);
      if(size.mobile)assert.equal(await page.locator("#choice-overlay").evaluate(el=>getComputedStyle(el).display),"none","decisions must occupy no layout before the story asks for them");
      await noOverflow(page,`${size.name} reading`,["#dialogue-box","#dialogue-content"]);
      if(size.mobile){
        await reachable(page,"#mobile-topbar");
        await reachable(page,"#mobile-next");
        await reachable(page,"#mobile-backlog");
        assert.equal(await page.locator("#continue-prompt").isVisible(),false);
        await page.waitForFunction(()=>{const art=document.querySelector("#mobile-scene-art"),img=art?.tagName==="IMG"?art:art?.querySelector("img");return Boolean(img?.complete&&img.naturalWidth>0)});
        await counterMatches(page);
        const before=await engineState(page);
        await page.click("#dialogue-content");
        await page.locator("#dialogue-content").hover();
        await page.mouse.wheel(0,180);
        assert.equal((await engineState(page)).step,before.step,"reading clicks/scroll must not turn the page");
        await page.click("#mobile-next");
        if((await engineState(page)).step<=before.step)await page.click("#mobile-next");
        assert.ok((await engineState(page)).step>before.step,"explicit next should advance");
        if((await engineState(page)).typing)await page.click("#mobile-next");
        await page.waitForFunction(()=>/\d/.test(document.querySelector("#mobile-page-position").textContent));
        assert.match(await page.locator("#mobile-page-position").textContent(),/\d/);
        await counterMatches(page);
        const beforeBacklog=await engineState(page);
        await page.click("#mobile-backlog");
        await reachable(page,"#btn-close-backlog");
        await page.click("#btn-close-backlog");
        assert.equal((await engineState(page)).step,beforeBacklog.step);
        await page.click("#mobile-menu-toggle");
        await reachable(page,"#mobile-menu-close");
        await page.click("#mobile-menu-close");
        assert.equal(await page.locator("#quick-menu").evaluate(el=>el.classList.contains("mobile-menu-open")),false);
        if(size.name==="phone-390"){
          await resizeRoundTrip(page);
          await resumeMiddleBeat(page);
        }
      }else{
        assert.equal(await page.locator("#mobile-topbar").isVisible(),false);
        assert.equal(await page.locator("#mobile-next").isVisible(),false);
        await reachable(page,"#qm-settings");
      }
      await shot(page,size,"reading");
      await toChoices(page,size);
      assert.equal(await page.locator("#choice-container .choice-card").count(),4);
      await page.waitForFunction(()=>Array.from(document.querySelectorAll("#choice-container .choice-card")).every(card=>Number(getComputedStyle(card).opacity)>=.99));
      if(size.mobile){
        await reachable(page,"#mobile-choice-return");
        await page.click("#mobile-choice-return");
        await page.waitForFunction(()=>getComputedStyle(document.querySelector("#choice-overlay")).display==="none");
        const reread=await engineState(page);
        assert.equal(reread.step,reread.total,"return to reading should show the final beat without choosing an action");
        await counterMatches(page);
        await toChoices(page,size);
        assert.equal(await page.locator("#choice-container .choice-card").count(),4);
      }
      await reachable(page,"#choice-container .choice-card:last-child");
      await noOverflow(page,`${size.name} choices`,["#choice-container"]);
      await shot(page,size,"choices");
      const beforeChoice=await engineState(page);
      await page.click("#choice-container .choice-card:first-child");
      await page.waitForFunction(previous=>!window.__vnEngine.isAIGenerating&&window.__vnEngine.currentStoryNodeId!==previous,beforeChoice.node);
      assert.equal((await engineState(page)).turn,beforeChoice.turn+1,"normal choice should advance the actual story");
      await toChoices(page,size);
      assert.equal(await page.locator("#choice-container .choice-card").count(),4);
      await openFreeAction(page);
      await page.fill("#open-input-text","先查阅粮册，再与乡民商议补给。\n这是手机布局测试文字。");
      if(size.mobile){
        // Browser resize approximates the reduced visual area when a keyboard
        // opens. Physical IME and Safari behaviour still need device testing.
        await page.setViewportSize({width:size.width,height:Math.min(size.height,360)});
        await page.locator("#open-input-text").focus();
        await reachable(page,"#btn-submit-open-input");
        await reachable(page,"#btn-close-open-input");
        await noOverflow(page,`${size.name} keyboard-height`,["#drawer-open-input .ribbon-modal-box","#drawer-open-input .drawer-body"]);
      }
      await reachable(page,"#btn-cancel-open-input");
      await page.click("#btn-cancel-open-input");
      assert.equal(await page.locator("#choice-overlay").evaluate(el=>el.classList.contains("visible")),true);
      assert.equal(modelCalls,0,"opening/cancelling action must not call any model");
      if(size.mobile)await page.setViewportSize({width:size.width,height:size.height});

      await openFreeAction(page);
      await page.fill("#open-input-text","仅测试手机取消等待，不请求真实模型。");
      assert.equal(await page.locator("#open-input-text").inputValue(),"仅测试手机取消等待，不请求真实模型。","submitted action must remain in the input after filling");
      pendingReply=true;
      await page.click("#btn-submit-open-input");
      await new Promise((done,reject)=>{
        const timer=setTimeout(async()=>{
          const state=await page.evaluate(()=>({source:window.__vnEngine.apiConfig.source,enabled:window.__vnEngine.apiConfig.enabled,shared:window.__vnEngine.sharedGatewayStatus,status:window.__vnEngine.aiRequestStatus,dialogOpen:document.querySelector("#drawer-open-input").classList.contains("open"),generating:window.__vnEngine.isAIGenerating}));
          reject(new Error(`${size.name}: mock model request was never started ${JSON.stringify({external,state})}`));
        },10000);
        firstModelRequest.then(()=>{clearTimeout(timer);done()});
      });
      await page.waitForSelector("#btn-cancel-ai-request:not([hidden])");
      await reachable(page,"#btn-cancel-ai-request");
      await page.click("#btn-cancel-ai-request");
      await page.waitForFunction(()=>window.__vnEngine.isAIGenerating===false);
      assert.equal(modelCalls,1);
      assert.match(await page.locator("#ai-connection-status").textContent(),/已取消本次请求/);
      assert.ok(await page.locator("#dialogue-content").evaluate(el=>el.clientHeight>=40),"cancelling must preserve usable prose area");
      await page.waitForSelector("#turn-recovery-panel:not([hidden])");
      assert.deepEqual(await page.locator("#turn-recovery-panel .recovery-actions button").allTextContents(),
        ["检查 API 设置","按原行动重试","改用本地剧情","放弃本次尝试"]);
      if(size.mobile)await counterMatches(page);

      await openMenuAction(page,size,"#qm-home");
      await page.waitForFunction(()=>window.__vnEngine.gameState==="TITLE");
      assert.equal(await page.locator("#title-btn-continue").isDisabled(),false);
      const saved=await engineState(page);
      await page.click("#title-btn-continue");
      await page.waitForFunction(()=>window.__vnEngine.gameState==="PLAYING");
      const restored=await engineState(page);
      assert.equal(restored.node,saved.node);assert.equal(restored.turn,saved.turn);
      await noOverflow(page,`${size.name} resume`,["#dialogue-box","#dialogue-content"]);
      await page.click("#btn-collapse-turn-recovery");
      await page.waitForSelector("#turn-recovery-panel[hidden]",{state:"attached"});
      if(size.mobile)await illustrationFlow(page,size);
      assert.deepEqual(errors,[],`${size.name}: browser JS errors`);
      console.log(`PASS ${size.name} ${size.width}x${size.height}: title/settings/factions/read/choices/action/cancel/resume${size.mobile?"/illustration-caption-scroll":""}; no external AI calls`);
    }finally{await context.close()}
  }
}finally{await browser.close();await new Promise(done=>server.close(done))}
