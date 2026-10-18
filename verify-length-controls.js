/**
 * verify-length-controls.js
 * 验证对白框预期篇幅控制器 (少于500字 / 少于2000字 / 少于5000字) 功能与端到端交互
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Runtime.evaluate Exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    try {
      this.ws.close();
    } catch (_) {}
  }
}

async function findChromeWebSocketUrl(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let buf = '';
          res.on('data', chunk => buf += chunk);
          res.on('end', () => resolve(buf));
        }).on('error', reject);
      });
      const targets = JSON.parse(data);
      const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('8088')) || targets.find(t => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) return pageTarget.webSocketDebuggerUrl;
    } catch (_) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('无法连接至 Chrome 调试端口');
}

async function runTests() {
  console.log('===============================================================');
  console.log('>>> 对白框 AI 预期篇幅控制器 (500/2000/5000字) 验证套件');
  console.log('===============================================================\n');

  // 1. 静态代码与提示词层验证
  console.log('[1/3] 验证 app.js 提示词与篇幅适配逻辑:');
  const appJsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  if (!appJsContent.includes('setExpectedLength(len)')) {
    throw new Error('FAIL: app.js 缺少 setExpectedLength 方法定义');
  }
  console.log('  [PASS] app.js 包含 setExpectedLength(len) 核心方法');

  if (!appJsContent.includes('vn_expected_length')) {
    throw new Error('FAIL: app.js 缺少 vn_expected_length 本地持久化支持');
  }
  console.log('  [PASS] app.js 包含 localStorage (vn_expected_length) 读写持久化');

  if (!appJsContent.includes('预期篇幅: 少于${this.expectedLength}字')) {
    throw new Error('FAIL: app.js 缺少动态推演篇幅状态栏显示');
  }
  console.log('  [PASS] app.js 在推演中实时反馈当前篇幅设定');

  // 2. 静态 HTML 与 CSS 样式验证
  console.log('\n[2/3] 验证 index.html 与 styles.css 元素及样式规范:');
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const stylesCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

  const requiredButtons = ['少于500字', '少于2000字', '少于5000字'];
  for (const label of requiredButtons) {
    if (!indexHtml.includes(label)) {
      throw new Error(`FAIL: index.html 缺少预期篇幅按钮: ${label}`);
    }
  }
  console.log('  [PASS] index.html 完整包含 3 个篇幅设定按钮: 少于500字、少于2000字、少于5000字');

  if (!stylesCss.includes('.ai-length-group') || !stylesCss.includes('.btn-length.active')) {
    throw new Error('FAIL: styles.css 缺少 .ai-length-group 或 .btn-length.active 视觉样式定义');
  }
  console.log('  [PASS] styles.css 拥有专属高质感毛玻璃与暗金发光 active 样式');

  // 3. 真机无头 Chrome CDP 交互与持久化验证
  console.log('\n[3/3] 启动无头 Chrome 验证真机 DOM 渲染与事件防冒泡:');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9234;
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-length-test-'));

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tempProfile}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1280,800',
    'http://localhost:8088'
  ], { detached: true, stdio: 'ignore' });

  try {
    const wsUrl = await findChromeWebSocketUrl(debugPort);
    const client = new CDPClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    await client.send('Page.navigate', { url: 'http://localhost:8088' });
    await new Promise(r => setTimeout(r, 800));

    // 等待引擎初始化完成
    for (let i = 0; i < 30; i++) {
      const ready = await client.evaluate(`!!(window.__vnEngine || window.vnEngine)`);
      if (ready) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // 验证按钮存在与初始状态
    const initInfo = await client.evaluate(`
      (() => {
        const group = document.getElementById("ai-length-group");
        const buttons = Array.from(document.querySelectorAll(".btn-length")).map(b => ({
          len: b.getAttribute("data-length"),
          text: b.innerText.trim(),
          active: b.classList.contains("active")
        }));
        return {
          groupExists: !!group,
          buttons
        };
      })()
    `);

    if (!initInfo.groupExists || initInfo.buttons.length !== 3) {
      throw new Error(`FAIL: 页面 DOM 中未能检测到完整的 3 个篇幅按钮，实际获取: ${JSON.stringify(initInfo)}`);
    }
    console.log(`  [PASS] 页面成功加载 ${initInfo.buttons.length} 个篇幅切换按钮`);

    // 模拟点击进入游戏 (New Game)
    await client.evaluate(`
      (() => {
        const startBtn = document.getElementById("title-btn-start");
        if (startBtn) startBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // 检查初始步骤
    const stepBeforeClick = await client.evaluate(`(window.__vnEngine || window.vnEngine) ? (window.__vnEngine || window.vnEngine).currentStep : -1`);

    // 测试点击 "少于500字" 按钮
    const click500Result = await client.evaluate(`
      (() => {
        const engine = window.__vnEngine || window.vnEngine;
        const btn500 = document.querySelector('.btn-length[data-length="500"]');
        if (!btn500) return { error: "not found" };
        btn500.click();
        return {
          expectedLength: engine ? engine.expectedLength : null,
          localStored: localStorage.getItem("vn_expected_length"),
          btn500Active: btn500.classList.contains("active"),
          btn2000Active: document.querySelector('.btn-length[data-length="2000"]').classList.contains("active"),
          btn5000Active: document.querySelector('.btn-length[data-length="5000"]').classList.contains("active")
        };
      })()
    `);

    if (click500Result.expectedLength !== 500 || click500Result.localStored !== "500" || !click500Result.btn500Active) {
      throw new Error(`FAIL: 点击少于500字按钮后状态不符合预期: ${JSON.stringify(click500Result)}`);
    }
    console.log('  [PASS] 点击「少于500字」：vnEngine.expectedLength=500，active样式切换，localStorage="500" 成功持久化');

    // 检查点击按钮是否冒泡导致对白步进
    const stepAfterClick = await client.evaluate(`(window.__vnEngine || window.vnEngine) ? (window.__vnEngine || window.vnEngine).currentStep : -1`);
    if (stepAfterClick !== stepBeforeClick) {
      throw new Error(`FAIL: 点击篇幅控制按钮冒泡推进了对白框！stepBefore=${stepBeforeClick}, stepAfter=${stepAfterClick}`);
    }
    console.log('  [PASS] 点击篇幅控制按钮事件冒泡被成功拦截 (e.stopPropagation)，未破坏打字机与对白节奏');

    // 测试点击 "少于5000字" 按钮
    const click5000Result = await client.evaluate(`
      (() => {
        const engine = window.__vnEngine || window.vnEngine;
        const btn5000 = document.querySelector('.btn-length[data-length="5000"]');
        if (!btn5000) return { error: "not found" };
        btn5000.click();
        return {
          expectedLength: engine ? engine.expectedLength : null,
          localStored: localStorage.getItem("vn_expected_length"),
          btn5000Active: btn5000.classList.contains("active"),
          btn500Active: document.querySelector('.btn-length[data-length="500"]').classList.contains("active")
        };
      })()
    `);

    if (click5000Result.expectedLength !== 5000 || click5000Result.localStored !== "5000" || !click5000Result.btn5000Active || click5000Result.btn500Active) {
      throw new Error(`FAIL: 点击少于5000字按钮后状态不符合预期: ${JSON.stringify(click5000Result)}`);
    }
    console.log('  [PASS] 点击「少于5000字」：vnEngine.expectedLength=5000，active样式精确切换，localStorage="5000" 成功持久化');

    // 测试页面刷新后恢复持久化设定
    await client.send('Page.reload');
    await new Promise(r => setTimeout(r, 1200));

    const restoredState = await client.evaluate(`
      (() => {
        const engine = window.__vnEngine || window.vnEngine;
        const activeBtn = document.querySelector('.btn-length.active');
        return {
          expectedLength: engine ? engine.expectedLength : null,
          activeLen: activeBtn ? activeBtn.getAttribute("data-length") : null,
          localStored: localStorage.getItem("vn_expected_length")
        };
      })()
    `);

    if (restoredState.expectedLength !== 5000 || restoredState.activeLen !== "5000") {
      throw new Error(`FAIL: 页面刷新后未能成功恢复设定: ${JSON.stringify(restoredState)}`);
    }
    console.log('  [PASS] 页面刷新后持久化恢复验证：正确初始化为「少于5000字」并高亮激活按钮');

    // 测试动态 payload 构造
    const payloadPromptCheck = await client.evaluate(`
      (() => {
        const engine = window.__vnEngine || window.vnEngine;
        engine.setExpectedLength(2000);
        const p2000 = engine.buildDeepSeekCachePayload({ text: "试探军情", diceBase: 10 }, 4, 5, 11, true);
        engine.setExpectedLength(500);
        const p500 = engine.buildDeepSeekCachePayload({ text: "试探军情", diceBase: 10 }, 4, 5, 11, true);
        engine.setExpectedLength(5000);
        const p5000 = engine.buildDeepSeekCachePayload({ text: "试探军情", diceBase: 10 }, 4, 5, 11, true);
        
        return {
          has500Prompt: p500.messages[0].content.includes("少于500字") && p500.messages[2].content.includes("少于500字"),
          has2000Prompt: p2000.messages[0].content.includes("少于2000字") && p2000.messages[2].content.includes("少于2000字"),
          has5000Prompt: p5000.messages[0].content.includes("少于5000字") && p5000.messages[2].content.includes("少于5000字")
        };
      })()
    `);

    if (!payloadPromptCheck.has500Prompt || !payloadPromptCheck.has2000Prompt || !payloadPromptCheck.has5000Prompt) {
      throw new Error(`FAIL: Payload 构造中未能包含对应的篇幅提示: ${JSON.stringify(payloadPromptCheck)}`);
    }
    console.log('  [PASS] live payload 验证：系统提示词与主持要求严格按 500 / 2000 / 5000 字动态切换');

    client.close();
  } finally {
    try {
      process.kill(chromeProc.pid);
    } catch (_) {}
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n===============================================================');
  console.log('🎉 全部篇幅控制验证项 100% 顺利通过！(DOM + CSS + 事件拦截 + 持久化 + 动态Prompt)');
  console.log('===============================================================');
}

runTests().catch(err => {
  console.error('\n❌ 验证测试报错:', err);
  process.exit(1);
});
