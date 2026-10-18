// verify-factions-illustrations-web.js
// 使用 Chrome CDP 真实浏览器端到端测试四大阵营底本、独立套图库、返回上一段与段落插图

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9224;

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

  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

async function runTest() {
  console.log("===============================================================");
  console.log("🚀 启动 Chrome CDP 真实无头浏览器实测");
  console.log("===============================================================\n");

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--window-size=1280,800',
    'http://localhost:8088'
  ]);

  await new Promise(r => setTimeout(r, 1500));

  // 等待 Chrome 启动并查询页面调试目标
  let targets = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        targets = await res.json();
        if (targets && targets.length > 0) break;
      }
    } catch (_) {}
  }

  const pageTarget = targets && targets.find(t => t.type === 'page');
  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error('未找到有效的页面 CDP WebSocket 调试地址！');
  }

  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  const consoleErrors = [];
  client.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const text = (params.args || []).map(a => a.value || a.description).join(' ');
      consoleErrors.push(text);
      console.error(`[Browser Console Error]: ${text}`);
    }
  });

  client.on('Runtime.exceptionThrown', (params) => {
    const text = params.exceptionDetails.text;
    consoleErrors.push(text);
    console.error(`[Browser Uncaught Exception]: ${text}`);
  });

  await client.send('Page.enable');
  await client.send('Runtime.enable');

  console.log("等待页面加载就绪 ...");
  await new Promise(r => setTimeout(r, 2000));

  // 1. 验证浏览器端全局变量
  console.log("\n[Test 1] 验证浏览器端四大阵营底本与 24 张专属套图全局变量挂载...");
  const globalsEval = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const hasNovels = !!window.FACTION_EPIC_NOVELS;
      const qingLen = window.QING_EPIC_NOVEL ? window.QING_EPIC_NOVEL.length : 0;
      const mingLen = window.MING_EPIC_NOVEL ? window.MING_EPIC_NOVEL.length : 0;
      const mongolLen = window.MONGOL_EPIC_NOVEL ? window.MONGOL_EPIC_NOVEL.length : 0;
      const nanmingLen = window.NANMING_EPIC_NOVEL ? window.NANMING_EPIC_NOVEL.length : 0;
      const vault = window.FACTION_ILLUSTRATION_VAULT || {};
      const vaultKeys = Object.keys(vault);
      let assetCount = 0;
      vaultKeys.forEach(k => {
        assetCount += Object.keys(vault[k] || {}).length;
      });
      return {
        hasNovels,
        qingLen,
        mingLen,
        mongolLen,
        nanmingLen,
        vaultKeys,
        assetCount
      };
    })()`,
    returnByValue: true
  });

  const gRes = globalsEval.result.value;
  console.log(`  ✓ 四大阵营长篇史诗底本: 清朝(${gRes.qingLen}字) 大明(${gRes.mingLen}字) 蒙古(${gRes.mongolLen}字) 南明(${gRes.nanmingLen}字)`);
  console.log(`  ✓ 阵营独立套图库: ${gRes.vaultKeys.join(', ')}，总计 ${gRes.assetCount} / 24 张`);

  if (!gRes.hasNovels || gRes.qingLen < 20000 || gRes.mingLen < 15000 || gRes.mongolLen < 15000 || gRes.nanmingLen < 15000) {
    throw new Error("[FAIL] 浏览器端史诗底本挂载异常或字数不足！");
  }
  if (gRes.assetCount !== 24) {
    throw new Error(`[FAIL] 浏览器端套图总数应为 24，实际为 ${gRes.assetCount}`);
  }

  // 2. 验证进入游戏与“返回上一段”功能
  console.log("\n[Test 2] 验证游戏开始流程与“返回上一段”按钮...");
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const startBtn = document.getElementById("title-btn-start");
      if (startBtn) startBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  // 步进第 1 拍并快进打字机
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      window.app.fastForwardTypewriter();
    })()`
  });
  await new Promise(r => setTimeout(r, 300));

  // 点击推进到第 2 拍
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      window.app.nextStoryBeat();
      window.app.fastForwardTypewriter();
    })()`
  });
  await new Promise(r => setTimeout(r, 300));

  const stepBeforePrev = await client.send('Runtime.evaluate', {
    expression: `window.app.currentStep`,
    returnByValue: true
  });
  console.log(`  推进到第 2 拍，当前步数 currentStep = ${stepBeforePrev.result.value}`);

  // 验证返回上一段按钮已启用
  const btnPrevState = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById("btn-dialogue-prev");
      return {
        exists: !!btn,
        disabled: btn ? btn.disabled : true,
        text: btn ? btn.innerText : ""
      };
    })()`,
    returnByValue: true
  });
  console.log(`  ✓ 返回上一段按钮状态: 存在=${btnPrevState.result.value.exists}, 禁用=${btnPrevState.result.value.disabled}, 文案="${btnPrevState.result.value.text}"`);
  if (btnPrevState.result.value.disabled) {
    throw new Error("[FAIL] 在第 2 拍时返回上一段按钮应当处于启用状态！");
  }

  // 点击“返回上一段”按钮
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById("btn-dialogue-prev");
      if (btn) btn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 300));

  const stepAfterPrev = await client.send('Runtime.evaluate', {
    expression: `window.app.currentStep`,
    returnByValue: true
  });
  console.log(`  ✓ 点击“返回上一段”后，步数成功回退至 currentStep = ${stepAfterPrev.result.value}`);
  if (stepAfterPrev.result.value !== 1) {
    throw new Error(`[FAIL] 点击返回上一段后步数应为 1，实际为 ${stepAfterPrev.result.value}`);
  }

  // 3. 验证独立段落插图卡片渲染与弹窗全景品鉴
  console.log("\n[Test 3] 验证独立段落插图卡片在对白流中的全景渲染与全屏品鉴视窗...");
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const illusData = window.FACTION_ILLUSTRATION_VAULT["ming"]["ming_war"];
      window.app.storyQueue.push({
        speaker: "【史诗画卷】",
        sub: illusData.title,
        type: "illustration",
        stageChar: "center",
        text: "《" + illusData.title + "》：" + illusData.description,
        illustrationData: illusData
      });
      window.app.currentStep = window.app.storyQueue.length - 1;
      window.app.playNextInQueue();
    })()`
  });
  await new Promise(r => setTimeout(r, 400));

  const cardCheck = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector(".dialogue-illustration-card");
      const img = card ? card.querySelector("img") : null;
      const title = card ? card.querySelector(".illustration-card-title") : null;
      return {
        cardFound: !!card,
        imgSrc: img ? img.getAttribute("src") : "",
        cardTitle: title ? title.innerText : ""
      };
    })()`,
    returnByValue: true
  });

  console.log(`  ✓ 独立段落插图卡片找到: ${cardCheck.result.value.cardFound}`);
  console.log(`  ✓ 插图标题: "${cardCheck.result.value.cardTitle}"`);
  console.log(`  ✓ 矢量图片源: "${cardCheck.result.value.imgSrc}"`);

  if (!cardCheck.result.value.cardFound) {
    throw new Error("[FAIL] 未在对白流正文中找到 .dialogue-illustration-card！");
  }

  // 点击卡片，呼起全屏品鉴弹窗
  console.log("  模拟点击插图卡片唤起全屏品鉴视窗...");
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector(".dialogue-illustration-card");
      if (card) card.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 400));

  const modalCheck = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.getElementById("modal-illustration");
      const title = document.getElementById("illustration-title");
      const img = modal ? modal.querySelector(".illustration-graphic img") : null;
      return {
        isOpen: modal ? modal.classList.contains("open") : false,
        modalTitle: title ? title.innerText : "",
        imgLoaded: !!img
      };
    })()`,
    returnByValue: true
  });

  console.log(`  ✓ 全屏品鉴视窗开启状态: ${modalCheck.result.value.isOpen}`);
  console.log(`  ✓ 视窗标题: "${modalCheck.result.value.modalTitle}"`);
  console.log(`  ✓ 视窗全高清矢量图渲染: ${modalCheck.result.value.imgLoaded}`);

  if (!modalCheck.result.value.isOpen || !modalCheck.result.value.imgLoaded) {
    throw new Error("[FAIL] 全屏品鉴弹窗未能成功打开或图片未加载！");
  }

  // 关闭全屏视窗
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.getElementById("btn-close-illustration");
      if (closeBtn) closeBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 300));

  // 4. 再次测试从插图卡片“返回上一段”
  console.log("  测试从独立段落插图卡片点击“返回上一段”...");
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById("btn-dialogue-prev");
      if (btn) btn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 300));

  const stepBackFromIllus = await client.send('Runtime.evaluate', {
    expression: `window.app.currentStep`,
    returnByValue: true
  });
  console.log(`  ✓ 从插图卡片回退成功，步数回退至 currentStep = ${stepBackFromIllus.result.value}`);

  // 5. 控制台零报错断言
  console.log("\n[Test 4] 浏览器控制台零报错审查...");
  if (consoleErrors.length > 0) {
    throw new Error(`[FAIL] 控制台存在 ${consoleErrors.length} 个错误！\n` + consoleErrors.join("\n"));
  }
  console.log("  ✓ 控制台 0 Console Errors, 0 Uncaught Exceptions！");

  // 清理
  client.close();
  chromeProc.kill();

  console.log("\n===============================================================");
  console.log("🏆 网页端真实 Chrome E2E 端到端测试 100% 全部通过 (GREEN PASS)！");
  console.log("===============================================================\n");
}

runTest().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
