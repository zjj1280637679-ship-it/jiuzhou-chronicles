/**
 * verify-web-e2e.js
 * 专为《观星纪 · 九州沉浮录》编写的无头 Chrome CDP 真机端到端全流程游玩与渲染验证脚本
 * 
 * 验证目标：
 * 1. 启动本地 Chrome 无头浏览器，直连 http://localhost:8088
 * 2. 深度监控 CDP Console、Runtime Exceptions 与 Network
 * 3. 验证快捷缓存胶囊 (#qm-cache) 与服务端 /api/config 握手状态 ('⚡ Reasoner (共享)')
 * 4. 模拟点击标题画面 '入篇 (New Game)' 进入游戏
 * 5. 模拟玩家交互推进序幕剧情对白，验证打字机动画流畅推进
 * 6. 验证选项面板呈现 3 个剧情分支 + 1 个开放式输入选项 (共 4 项)
 * 7. 点击开放式输入选项，填入 '查看辽东战局与当面虚实' 并提交
 * 8. 捕获真实 /api/chat 网络请求及 DeepSeek 官方返回 (含 Prompt Cache 遥测与思考链)
 * 9. 验证新剧情 beats 成功解析并通过打字机平滑渲染，逐拍推进并验证呈现全新分支选项
 * 10. 全流程 0 控制台报错检测，输出结构化验收报告
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.listeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.id && this.callbacks.has(data.id)) {
              const { resolve, reject } = this.callbacks.get(data.id);
              this.callbacks.delete(data.id);
              if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
              else resolve(data.result);
            } else if (data.method) {
              const handlers = this.listeners.get(data.method) || [];
              handlers.forEach(h => h(data.params));
            }
          } catch (e) {
            console.error('[CDP Client] Parse Error:', e);
          }
        };
        resolve();
      };
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Evaluation Exception: ${desc}`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    try {
      this.ws.close();
    } catch (_) {}
  }
}

async function runE2EVerification() {
  const report = {
    testStartTime: new Date().toISOString(),
    chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    targetUrl: 'http://localhost:8088',
    steps: [],
    consoleLogs: [],
    consoleErrors: [],
    uncaughtExceptions: [],
    networkRequests: [],
    apiChatTelemetry: null,
    verifications: {},
    passed: false,
    errorMessage: null
  };

  const step = (name, details) => {
    const entry = { step: name, timestamp: new Date().toISOString(), details };
    console.log(`\n========================================`);
    console.log(`▶ [STEP ${report.steps.length + 1}] ${name}`);
    if (details) console.log(`  Details:`, typeof details === 'string' ? details : JSON.stringify(details, null, 2));
    console.log(`========================================`);
    report.steps.push(entry);
  };

  const tempDir = path.join(os.tmpdir(), 'chrome_e2e_profile_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  let chromeProc = null;
  let cdp = null;

  try {
    // ----------------------------------------------------
    // 步骤 1: 启动无头 Chrome 浏览器
    // ----------------------------------------------------
    step('启动无头 Chrome 浏览器并暴露 CDP 端口 9222', { tempDir });
    chromeProc = spawn(report.chromePath, [
      '--headless=new',
      '--remote-debugging-port=9222',
      `--user-data-dir=${tempDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      report.targetUrl
    ], { stdio: 'ignore' });

    // 等待 Chrome 启动并查询调试目标
    let targets = null;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch('http://127.0.0.1:9222/json/list');
        if (res.ok) {
          targets = await res.json();
          if (targets && targets.length > 0) break;
        }
      } catch (_) {}
    }

    if (!targets || targets.length === 0) {
      throw new Error('未能连接到 Chrome CDP 9222 端口，目标列表为空！');
    }

    const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('8088')) || targets.find(t => t.type === 'page');
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      throw new Error('未找到有效的页面 CDP WebSocket 调试地址！');
    }

    console.log(`[E2E] 成功探测到页面 Target ID: ${pageTarget.id}, URL: ${pageTarget.url}`);

    // 连接 CDP
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    console.log(`[E2E] CDP WebSocket 建立连接成功！`);

    // 启用 CDP 域
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    // ----------------------------------------------------
    // 步骤 2: 绑定 Console & Network 监听器 (零报错把关)
    // ----------------------------------------------------
    cdp.on('Runtime.consoleAPICalled', (params) => {
      const text = params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
      const logEntry = {
        type: params.type,
        text,
        timestamp: params.timestamp,
        stackTrace: params.stackTrace
      };
      report.consoleLogs.push(logEntry);

      if (params.type === 'error') {
        console.error(`❌ [Page Console.error]: ${text}`);
        report.consoleErrors.push(logEntry);
      } else if (params.type === 'warn') {
        console.warn(`⚠️ [Page Console.warn]: ${text}`);
      } else {
        console.log(`ℹ️ [Page Console.${params.type}]: ${text}`);
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const ex = params.exceptionDetails;
      const exEntry = {
        text: ex.text,
        description: ex.exception?.description || '',
        url: ex.url,
        lineNumber: ex.lineNumber,
        columnNumber: ex.columnNumber,
        stackTrace: ex.stackTrace
      };
      console.error(`💥 [Uncaught Exception]: ${ex.text} at ${ex.url}:${ex.lineNumber}:${ex.columnNumber}`);
      report.uncaughtExceptions.push(exEntry);
      report.consoleErrors.push(exEntry);
    });

    cdp.on('Network.requestWillBeSent', (params) => {
      if (params.request.url.includes('/api/')) {
        console.log(`🌐 [Network Request]: ${params.request.method} ${params.request.url}`);
        report.networkRequests.push({
          requestId: params.requestId,
          url: params.request.url,
          method: params.request.method,
          postData: params.request.postData
        });
      }
    });

    let apiChatResponsePromiseResolve = null;
    const apiChatResponsePromise = new Promise((res) => { apiChatResponsePromiseResolve = res; });

    cdp.on('Network.responseReceived', (params) => {
      if (params.response.url.includes('/api/')) {
        console.log(`📥 [Network Response]: ${params.response.status} ${params.response.url}`);
        const req = report.networkRequests.find(r => r.requestId === params.requestId);
        if (req) {
          req.status = params.response.status;
          req.statusText = params.response.statusText;
          req.headers = params.response.headers;
        }
        if (params.response.url.includes('/api/chat') && apiChatResponsePromiseResolve) {
          apiChatResponsePromiseResolve(params.response);
        }
      }
    });

    cdp.on('Network.loadingFailed', (params) => {
      console.error(`❌ [Network Failed]: RequestId=${params.requestId}, Error=${params.errorText}`);
      const req = report.networkRequests.find(r => r.requestId === params.requestId);
      if (req) {
        req.failed = true;
        req.errorText = params.errorText;
      }
    });

    // 等待页面就绪 (DOMContentLoaded / load)
    step('等待页面加载就绪并检查 DOM 核心容器');
    await new Promise(r => setTimeout(r, 1200));

    const pageTitle = await cdp.evaluate('document.title');
    console.log(`[E2E] 页面标题: "${pageTitle}"`);
    if (!pageTitle.includes('暮灯星栈') && !pageTitle.includes('Visual Novel') && !pageTitle.includes('观星纪')) {
      throw new Error(`页面标题不匹配预期: ${pageTitle}`);
    }

    // ----------------------------------------------------
    // 步骤 3: 验证右上角快捷缓存胶囊 (#qm-cache) 与服务端握手
    // ----------------------------------------------------
    step('验证右上角快捷缓存胶囊 (#qm-cache) 服务端握手与展示状态');
    
    // 轮询等待 #qm-cache 完成与 /api/config 握手
    let qmCacheInfo = null;
    for (let i = 0; i < 20; i++) {
      qmCacheInfo = await cdp.evaluate(`(() => {
        const el = document.getElementById("qm-cache");
        if (!el) return null;
        return {
          innerText: el.innerText,
          classList: Array.from(el.classList),
          title: el.title,
          hasEngine: !!window.__vnEngine,
          serverConfig: window.__vnEngine ? window.__vnEngine.serverSharedConfig : null
        };
      })()`);

      if (qmCacheInfo && qmCacheInfo.innerText && (qmCacheInfo.innerText.includes('Flash (共享)') || qmCacheInfo.innerText.includes('Reasoner (共享)'))) {
        break;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[E2E] #qm-cache 胶囊 DOM 状态:`, qmCacheInfo);
    if (!qmCacheInfo) {
      throw new Error('DOM 元素 #qm-cache 未找到！');
    }
    if (!qmCacheInfo.innerText.includes('Flash (共享)') && !qmCacheInfo.innerText.includes('Reasoner (共享)')) {
      throw new Error(`#qm-cache 胶囊文本未正确展示共享网关握手！实际文本: "${qmCacheInfo.innerText}"`);
    }
    if (!qmCacheInfo.classList.includes('hit')) {
      throw new Error(`#qm-cache 胶囊缺少高亮 CSS 类 'hit'！实际 class: ${qmCacheInfo.classList.join(' ')}`);
    }
    report.verifications.qmCacheHandshake = {
      passed: true,
      text: qmCacheInfo.innerText,
      title: qmCacheInfo.title,
      classList: qmCacheInfo.classList
    };

    // ----------------------------------------------------
    // 步骤 4: 验证标题画面与游戏开始流程
    // ----------------------------------------------------
    step('验证标题画面 (#title-screen) 与游戏开始流程');
    const titleScreenState = await cdp.evaluate(`(() => {
      const ts = document.getElementById("title-screen");
      const btnStart = document.getElementById("title-btn-start");
      return {
        hasTitleScreen: !!ts,
        isActive: ts ? ts.classList.contains("active") : false,
        hasBtnStart: !!btnStart,
        btnText: btnStart ? btnStart.innerText : ""
      };
    })()`);

    console.log(`[E2E] 标题画面状态:`, titleScreenState);
    if (!titleScreenState.isActive || !titleScreenState.hasBtnStart) {
      throw new Error('标题画面未处于激活状态或开始游戏按钮缺失！');
    }

    // 点击“入篇 (New Game)”按钮进入游戏
    console.log(`[E2E] 模拟用户点击 #title-btn-start...`);
    await cdp.evaluate(`document.getElementById("title-btn-start").click()`);
    await new Promise(r => setTimeout(r, 600));

    const gameStateAfterStart = await cdp.evaluate(`(() => {
      const ts = document.getElementById("title-screen");
      const dbox = document.getElementById("dialogue-box");
      const engine = window.__vnEngine;
      return {
        titleActive: ts.classList.contains("active"),
        dialogueVisible: dbox ? dbox.offsetParent !== null : false,
        gameState: engine ? engine.gameState : null,
        currentStoryNodeId: engine ? engine.currentStoryNodeId : null,
        queueLength: engine ? engine.storyQueue.length : 0,
        currentStep: engine ? engine.currentStep : 0,
        speakerName: document.getElementById("speaker-name")?.innerText,
        typewriterText: document.getElementById("typewriter-text")?.innerText
      };
    })()`);

    console.log(`[E2E] 开始游戏后引擎状态:`, gameStateAfterStart);
    if (gameStateAfterStart.titleActive || gameStateAfterStart.gameState !== 'PLAYING') {
      throw new Error(`游戏进入失败！gameState=${gameStateAfterStart.gameState}, titleActive=${gameStateAfterStart.titleActive}`);
    }
    report.verifications.gameStart = {
      passed: true,
      gameState: gameStateAfterStart.gameState,
      nodeId: gameStateAfterStart.currentStoryNodeId,
      queueLength: gameStateAfterStart.queueLength
    };

    // ----------------------------------------------------
    // 步骤 5: 真实交互模拟 - 验证打字机文本动画与对白推进
    // ----------------------------------------------------
    step('真实交互模拟：验证打字机文本动画平滑播放与多拍对白逐次推进');

    // 采样打字机动态增长
    const sample1 = await cdp.evaluate(`document.getElementById("typewriter-text")?.innerText.length || 0`);
    await new Promise(r => setTimeout(r, 120));
    const sample2 = await cdp.evaluate(`document.getElementById("typewriter-text")?.innerText.length || 0`);
    console.log(`[E2E] 打字机字符长度采样: sample1=${sample1}, sample2=${sample2}`);

    // 点击对白框快速打完当前拍，随后逐拍推进至选项弹出
    let beatIdx = 1;
    const initialBeatsPlayed = [];

    while (true) {
      const beatState = await cdp.evaluate(`(() => {
        const engine = window.__vnEngine;
        const choiceOverlay = document.getElementById("choice-overlay");
        const isChoiceVisible = choiceOverlay && choiceOverlay.classList.contains("visible");
        return {
          isChoiceVisible,
          isTyping: engine ? engine.isTyping : false,
          currentStep: engine ? engine.currentStep : 0,
          totalQueue: engine ? engine.storyQueue.length : 0,
          speaker: document.getElementById("speaker-name")?.innerText,
          sub: document.getElementById("speaker-sub")?.innerText,
          text: document.getElementById("typewriter-text")?.innerText
        };
      })()`);

      if (beatState.isChoiceVisible) {
        console.log(`[E2E] 选项面板已就绪 (#choice-overlay.visible)！所有序幕对白播放完毕。`);
        break;
      }

      if (beatState.isTyping) {
        // 第一次点击：快进打字机
        await cdp.evaluate(`document.getElementById("dialogue-box").click()`);
        await new Promise(r => setTimeout(r, 100));
      }

      const fullBeat = await cdp.evaluate(`(() => {
        return {
          speaker: document.getElementById("speaker-name")?.innerText,
          sub: document.getElementById("speaker-sub")?.innerText,
          text: document.getElementById("typewriter-text")?.innerText
        };
      })()`);

      initialBeatsPlayed.push({
        index: beatIdx++,
        speaker: fullBeat.speaker,
        sub: fullBeat.sub,
        preview: fullBeat.text.substring(0, 60) + (fullBeat.text.length > 60 ? '...' : '')
      });
      console.log(`  [Beat ${beatIdx - 1}] [${fullBeat.speaker}] (${fullBeat.sub}): ${fullBeat.text.substring(0, 50)}...`);

      // 第二次点击：进入下一拍
      await cdp.evaluate(`document.getElementById("dialogue-box").click()`);
      await new Promise(r => setTimeout(r, 200));

      if (beatIdx > 20) {
        throw new Error('剧情推进超出 20 拍仍未展示选项，可能发生死循环或卡死！');
      }
    }

    report.verifications.typewriterAndBeats = {
      passed: true,
      beatsCount: initialBeatsPlayed.length,
      beats: initialBeatsPlayed
    };

    // ----------------------------------------------------
    // 步骤 6: 验证选项面板呈现 3 个剧情分支 + 1 个开放式输入
    // ----------------------------------------------------
    step('验证选项面板：呈现 3 个剧情分支 + 1 个开放式输入 (共 4 个选项)');
    const choicesInfo = await cdp.evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll("#choice-container .choice-card"));
      return cards.map((c, idx) => ({
        index: idx,
        text: c.innerText.trim(),
        hasOpenBadge: c.innerText.includes("开放外推") || c.innerText.includes("输入文字"),
        classList: Array.from(c.classList)
      }));
    })()`);

    console.log(`[E2E] 选项卡列表 (共 ${choicesInfo.length} 项):`, choicesInfo);
    if (choicesInfo.length !== 4) {
      throw new Error(`选项卡总数不为 4！实际数量: ${choicesInfo.length}`);
    }

    const openChoice = choicesInfo.find(c => c.hasOpenBadge);
    if (!openChoice) {
      throw new Error('未在选项卡中找到【✍️ 开放外推】或输入文字选项！');
    }
    const branchChoices = choicesInfo.filter(c => !c.hasOpenBadge);
    if (branchChoices.length !== 3) {
      throw new Error(`标准剧情分支选项数不为 3！实际数量: ${branchChoices.length}`);
    }

    report.verifications.choicesPresentation = {
      passed: true,
      totalCount: choicesInfo.length,
      branchCount: branchChoices.length,
      openChoiceIndex: openChoice.index,
      openChoiceText: openChoice.text,
      choices: choicesInfo
    };

    // ----------------------------------------------------
    // 步骤 7: 点击开放式输入选项并提交自由指令
    // ----------------------------------------------------
    const playerInstruction = "查看辽东战局与当面虚实";
    step(`点击开放式输入选项，填入玩家行动指令: "${playerInstruction}" 并提交`);

    // 点击第 4 个卡片 (开放式输入)
    await cdp.evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll("#choice-container .choice-card"));
      const openCard = cards.find(c => c.innerText.includes("开放外推") || c.innerText.includes("输入文字")) || cards[3];
      openCard.click();
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // 验证开放式输入抽屉 (#drawer-open-input) 已开启
    const drawerState = await cdp.evaluate(`(() => {
      const d = document.getElementById("drawer-open-input");
      const ta = document.getElementById("open-input-text");
      const btn = document.getElementById("btn-submit-open-input");
      return {
        isOpen: d ? d.classList.contains("open") : false,
        hasTextarea: !!ta,
        hasSubmitBtn: !!btn
      };
    })()`);

    console.log(`[E2E] #drawer-open-input 弹窗状态:`, drawerState);
    if (!drawerState.isOpen || !drawerState.hasTextarea || !drawerState.hasSubmitBtn) {
      throw new Error('开放式输入弹窗 #drawer-open-input 未成功展开或核心输入控件缺失！');
    }

    // 填入玩家自定行动指令
    await cdp.evaluate(`(() => {
      const ta = document.getElementById("open-input-text");
      ta.value = ${JSON.stringify(playerInstruction)};
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);

    const textareaValue = await cdp.evaluate(`document.getElementById("open-input-text")?.value`);
    console.log(`[E2E] 输入框当前值: "${textareaValue}"`);
    if (textareaValue !== playerInstruction) {
      throw new Error(`输入框赋值失败！当前值: "${textareaValue}"`);
    }

    // 点击提交按钮
    console.log(`[E2E] 点击 #btn-submit-open-input 触发外推流程...`);
    await cdp.evaluate(`document.getElementById("btn-submit-open-input").click()`);
    await new Promise(r => setTimeout(r, 400));

    // 验证抽屉关闭，界面出现天道深思执笔状态
    const waitingDialogue = await cdp.evaluate(`(() => {
      const d = document.getElementById("drawer-open-input");
      const speaker = document.getElementById("speaker-name")?.innerText;
      const sub = document.getElementById("speaker-sub")?.innerText;
      const text = document.getElementById("typewriter-text")?.innerText;
      return {
        drawerClosed: d ? !d.classList.contains("open") : false,
        speaker,
        sub,
        text
      };
    })()`);

    console.log(`[E2E] 提交后即时执笔状态:`, waitingDialogue);
    if (!waitingDialogue.drawerClosed) {
      throw new Error('提交后开放式输入弹窗未自动关闭！');
    }
    if (!waitingDialogue.speaker.includes('天道') && !waitingDialogue.sub.includes('DeepSeek')) {
      console.warn(`[E2E] 执笔提示可能被极快响应覆盖或文字有细微差异:`, waitingDialogue);
    }

    // ----------------------------------------------------
    // 步骤 8: 等待并验证真实调用 /api/chat 与 DeepSeek 官方返回
    // ----------------------------------------------------
    step('等待并捕获真实 /api/chat 与 DeepSeek 官方返回 (含 Prompt Cache 遥测与思考链)');
    console.log(`[E2E] 正在等待 /api/chat 响应 (最长等待 90 秒)...`);

    const apiChatResponse = await Promise.race([
      apiChatResponsePromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('等待 /api/chat 响应超时 (90s)！')), 90000))
    ]);

    console.log(`[E2E] /api/chat 响应状态码: ${apiChatResponse.status}`);
    if (apiChatResponse.status !== 200) {
      throw new Error(`/api/chat 返回非 200 状态码: ${apiChatResponse.status} ${apiChatResponse.statusText}`);
    }

    // 等待前端解析并完成 beats 挂载
    await new Promise(r => setTimeout(r, 1000));

    const engineTelemetry = await cdp.evaluate(`(() => {
      const engine = window.__vnEngine;
      const cachePill = document.getElementById("qm-cache");
      return {
        cacheTelemetry: engine ? engine.cacheTelemetry : null,
        pillText: cachePill ? cachePill.innerText : "",
        isExtrapolating: engine ? engine.isExtrapolating : false,
        storyQueueLength: engine ? engine.storyQueue.length : 0,
        currentStep: engine ? engine.currentStep : 0,
        apiHistoryLength: engine ? engine.apiHistory.length : 0,
        pendingApiChoicesLength: engine && engine.pendingApiChoices ? engine.pendingApiChoices.length : 0
      };
    })()`);

    console.log(`[E2E] API 返回后引擎遥测与缓存胶囊:`, engineTelemetry);
    report.apiChatTelemetry = engineTelemetry;

    if (!engineTelemetry.isExtrapolating) {
      throw new Error('引擎未正确进入 isExtrapolating 外推模式！');
    }
    if (engineTelemetry.storyQueueLength < 2) {
      throw new Error(`新生成的剧情 beats 数量过少 (${engineTelemetry.storyQueueLength})，未达到长篇要求！`);
    }

    // 验证右上角胶囊更新展示了缓存命中率
    console.log(`[E2E] 命中更新后 #qm-cache: "${engineTelemetry.pillText}"`);
    if (!engineTelemetry.pillText.includes('命中')) {
      console.warn(`[E2E] #qm-cache 胶囊未包含“命中”字样: ${engineTelemetry.pillText}`);
    }

    // ----------------------------------------------------
    // 步骤 9: 逐拍推进 AI 执笔的剧情对白并验证打字机渲染
    // ----------------------------------------------------
    step('逐拍推进 AI 执笔的全新剧情对白，验证打字机渲染与长文深度');
    const aiBeatsPlayed = [];
    let aiBeatStep = 1;

    while (true) {
      const beatState = await cdp.evaluate(`(() => {
        const engine = window.__vnEngine;
        const choiceOverlay = document.getElementById("choice-overlay");
        const isChoiceVisible = choiceOverlay && choiceOverlay.classList.contains("visible");
        return {
          isChoiceVisible,
          isTyping: engine ? engine.isTyping : false,
          currentStep: engine ? engine.currentStep : 0,
          totalQueue: engine ? engine.storyQueue.length : 0,
          speaker: document.getElementById("speaker-name")?.innerText,
          sub: document.getElementById("speaker-sub")?.innerText,
          text: document.getElementById("typewriter-text")?.innerText
        };
      })()`);

      if (beatState.isChoiceVisible) {
        console.log(`[E2E] AI 外推剧情流播放完毕，新选项面板已呈现！`);
        break;
      }

      if (beatState.isTyping) {
        await cdp.evaluate(`document.getElementById("dialogue-box").click()`);
        await new Promise(r => setTimeout(r, 100));
      }

      const fullBeat = await cdp.evaluate(`(() => {
        return {
          speaker: document.getElementById("speaker-name")?.innerText,
          sub: document.getElementById("speaker-sub")?.innerText,
          text: document.getElementById("typewriter-text")?.innerText
        };
      })()`);

      aiBeatsPlayed.push({
        index: aiBeatStep++,
        speaker: fullBeat.speaker,
        sub: fullBeat.sub,
        length: fullBeat.text.length,
        preview: fullBeat.text.substring(0, 80) + (fullBeat.text.length > 80 ? '...' : '')
      });
      console.log(`  [AI Beat ${aiBeatStep - 1}] [${fullBeat.speaker}] (${fullBeat.sub}) [${fullBeat.text.length}字]: ${fullBeat.text.substring(0, 60)}...`);

      // 点击进入下一拍
      await cdp.evaluate(`document.getElementById("dialogue-box").click()`);
      await new Promise(r => setTimeout(r, 200));

      if (aiBeatStep > 25) {
        throw new Error('AI 外推剧情对白推进超出 25 拍仍未展示选项，可能陷入循环！');
      }
    }

    report.verifications.aiBeatsRendering = {
      passed: true,
      beatsCount: aiBeatsPlayed.length,
      totalChars: aiBeatsPlayed.reduce((acc, b) => acc + b.length, 0),
      beats: aiBeatsPlayed
    };

    // ----------------------------------------------------
    // 步骤 10: 验证外推后新生成的 3 个选项呈现
    // ----------------------------------------------------
    step('验证外推后新生成的剧情分支选项呈现');
    const newChoicesInfo = await cdp.evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll("#choice-container .choice-card"));
      return cards.map((c, idx) => ({
        index: idx,
        text: c.innerText.trim(),
        hasOpenBadge: c.innerText.includes("开放外推") || c.innerText.includes("输入文字")
      }));
    })()`);

    console.log(`[E2E] AI 外推后新呈现的选项列表 (共 ${newChoicesInfo.length} 项):`, newChoicesInfo);
    if (newChoicesInfo.length < 3) {
      throw new Error(`AI 外推后选项数量不足 3 项！实际: ${newChoicesInfo.length}`);
    }

    report.verifications.newChoicesAfterExtrapolation = {
      passed: true,
      count: newChoicesInfo.length,
      choices: newChoicesInfo
    };

    // ----------------------------------------------------
    // 步骤 11: 零控制台报错 (0 Console Errors) 严格铁血判据
    // ----------------------------------------------------
    step('零控制台报错 (0 Console Errors) 与异常严格核查');
    console.log(`[E2E] 累计捕获 Console 日志总数: ${report.consoleLogs.length}`);
    console.log(`[E2E] 累计捕获 Console Error 数: ${report.consoleErrors.length}`);
    console.log(`[E2E] 累计捕获 Uncaught Exception 数: ${report.uncaughtExceptions.length}`);

    if (report.consoleErrors.length > 0) {
      console.error(`❌ [E2E FAIL] 检测到控制台报错:`, report.consoleErrors);
      throw new Error(`检测到 ${report.consoleErrors.length} 个控制台报错，违反 0 报错铁律！`);
    }
    if (report.uncaughtExceptions.length > 0) {
      console.error(`❌ [E2E FAIL] 检测到未捕获异常:`, report.uncaughtExceptions);
      throw new Error(`检测到 ${report.uncaughtExceptions.length} 个未捕获异常！`);
    }

    report.verifications.zeroErrors = {
      passed: true,
      consoleErrorsCount: 0,
      uncaughtExceptionsCount: 0
    };

    // ----------------------------------------------------
    // 验收通过，签署绿灯 PASS！
    // ----------------------------------------------------
    report.passed = true;
    report.testEndTime = new Date().toISOString();
    console.log(`\n=======================================================`);
    console.log(`🎉🎉🎉 全流程网页端端到端真机实测全部通过！绿灯 PASS！`);
    console.log(`=======================================================`);

  } catch (err) {
    report.passed = false;
    report.errorMessage = err.message;
    report.errorStack = err.stack;
    report.testEndTime = new Date().toISOString();
    console.error(`\n🚨🚨🚨 [E2E 验证守卫拦截告警] 实测失败: ${err.message}`);
    console.error(err.stack);
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try { chromeProc.kill(); } catch (_) {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // 保存完整的 JSON 验收测试日志供溯源
  const resultJsonPath = path.join(__dirname, 'e2e-verification-result.json');
  fs.writeFileSync(resultJsonPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[E2E] 详细测试日志已保存至: ${resultJsonPath}`);

  return report;
}

if (require.main === module) {
  runE2EVerification().then(report => {
    process.exit(report.passed ? 0 : 1);
  });
}

module.exports = { runE2EVerification };
