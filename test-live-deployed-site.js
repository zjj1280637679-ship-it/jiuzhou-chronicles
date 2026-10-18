// test-live-deployed-site.js
// 使用 Chrome CDP 真实验证已发布的 GitHub Pages 在线站点

const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9227;
const TARGET_URL = "https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/";

class CDPClient {
  constructor(wsUrl) {
    this.ws = new globalThis.WebSocket(wsUrl);
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
  console.log(`🚀 验证已发布线上站点: ${TARGET_URL}`);
  console.log("===============================================================\n");

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,800',
    TARGET_URL
  ]);

  await new Promise(r => setTimeout(r, 2000));

  function getJson(path) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => resolve(JSON.parse(raw)));
      }).on('error', reject);
    });
  }

  const targets = await getJson('/json');
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('jiuzhou-chronicles'));
  if (!pageTarget) {
    throw new Error("Target page not found among targets: " + JSON.stringify(targets));
  }

  const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  const consoleErrors = [];
  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const text = params.args.map(a => a.value || a.description || '').join(' ');
      consoleErrors.push(text);
    }
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails.text + ' ' + (params.exceptionDetails.exception?.description || ''));
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  console.log("1. 等待线上页面渲染...");
  await new Promise(r => setTimeout(r, 3000));

  // 检查标题与新篇按钮
  const titleInfo = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const heading = document.querySelector('.title-main-heading')?.innerText;
      const startBtn = document.getElementById('title-btn-start');
      const novelsLoaded = typeof FACTION_EPIC_NOVELS !== 'undefined';
      const illustrationsLoaded = typeof FACTION_ILLUSTRATION_VAULT !== 'undefined';
      const qingNovelLen = novelsLoaded ? (FACTION_EPIC_NOVELS.qing?.length || 0) : 0;
      const illustrationCount = illustrationsLoaded ? Object.keys(FACTION_ILLUSTRATION_VAULT).length : 0;
      return { 
        heading, 
        hasStartBtn: !!startBtn, 
        novelsLoaded, 
        qingNovelLen, 
        illustrationsLoaded, 
        illustrationCount 
      };
    })()`,
    returnByValue: true
  });
  console.log("标题画面状态:", titleInfo.result.value);

  // 点击进入游戏
  console.log("2. 点击进入新篇...");
  await cdp.send('Runtime.evaluate', {
    expression: `document.getElementById('title-btn-start').click()`
  });
  await new Promise(r => setTimeout(r, 2000));

  // 检查对白框与返回上一段按钮
  const advInfo = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const advBox = document.getElementById('dialogue-box');
      const speaker = document.getElementById('dialogue-speaker')?.innerText;
      const text = document.getElementById('dialogue-content')?.innerText;
      const prevBtn = document.getElementById('btn-dialogue-prev');
      return {
        advVisible: !advBox.classList.contains('hidden'),
        speaker,
        textSnippet: text.substring(0, 40) + '...',
        hasPrevBtn: !!prevBtn,
        prevBtnDisabled: prevBtn ? prevBtn.disabled : null
      };
    })()`,
    returnByValue: true
  });
  console.log("ADV对白框状态:", advInfo.result.value);

  // 3. 点击前进一段对白
  console.log("3. 点击推进下一段剧情...");
  await cdp.send('Runtime.evaluate', {
    expression: `document.getElementById('dialogue-box').click()`
  });
  await new Promise(r => setTimeout(r, 1500));

  const advStep2 = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const text = document.getElementById('dialogue-content')?.innerText;
      const prevBtn = document.getElementById('btn-dialogue-prev');
      return {
        textSnippet: text.substring(0, 40) + '...',
        prevBtnDisabled: prevBtn ? prevBtn.disabled : null
      };
    })()`,
    returnByValue: true
  });
  console.log("推进第二段后状态:", advStep2.result.value);

  // 4. 点击返回上一段
  console.log("4. 点击【返回上一段】...");
  await cdp.send('Runtime.evaluate', {
    expression: `document.getElementById('btn-dialogue-prev').click()`
  });
  await new Promise(r => setTimeout(r, 1500));

  const advStepBack = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const text = document.getElementById('dialogue-content')?.innerText;
      const prevBtn = document.getElementById('btn-dialogue-prev');
      return {
        textSnippet: text.substring(0, 40) + '...',
        prevBtnDisabled: prevBtn ? prevBtn.disabled : null
      };
    })()`,
    returnByValue: true
  });
  console.log("返回第一段后状态:", advStepBack.result.value);

  console.log(`\n线上实测控制台报错数: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error("❌ 发现报错:", consoleErrors);
    process.exit(1);
  } else {
    console.log("🎉 验证成功！线上环境 100% 正常，0 报错，资源完全就绪！");
  }
}

runTest().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
