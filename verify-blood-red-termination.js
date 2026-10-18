/**
 * verify-blood-red-termination.js
 * 专门验证血红特效 (vignette-overlay.danger-pulse 与 screen-flash-overlay.flash-red)
 * 是否在指定时间内彻底终止、淡出并清除类名，绝无残留与无限延续
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
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails);
      throw new Error(`Runtime.evaluate Exception: ${desc}`);
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
  console.log('>>> 验证全屏血红特效有限时长与自动终止套件');
  console.log('===============================================================\n');

  // 1. 静态 CSS 规则审查
  console.log('[1/3] 审查 styles.css 中血红暗角动画规范:');
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

  // 严禁存在 heartbeat-vignette 2s infinite
  if (css.includes('heartbeat-vignette 2s infinite') || css.includes('heartbeat-vignette infinite')) {
    throw new Error('FAIL: styles.css 中仍然存在无限循环 (infinite) 的 heartbeat-vignette 动画！');
  }
  console.log('  [PASS] styles.css 已彻底移除 infinite 无限循环定义');

  // 必须以 opacity: 0 归零收尾
  if (!css.includes('100% { opacity: 0; transform: scale(1); }')) {
    throw new Error('FAIL: @keyframes heartbeat-vignette 尾帧未归零 (opacity: 0)！');
  }
  console.log('  [PASS] heartbeat-vignette 100% 尾帧严格归零 (opacity: 0) 平滑淡出');

  // 2. 静态 JS 逻辑审查
  console.log('\n[2/3] 审查 app.js 中特效终止定时器与清理方法:');
  const js = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  if (!js.includes('triggerDangerPulse(duration = 1600)')) {
    throw new Error('FAIL: app.js 缺少 triggerDangerPulse 方法！');
  }
  console.log('  [PASS] app.js 已实装 triggerDangerPulse(duration) 有限播放控制器');

  if (!js.includes('clearAllScreenEffects()')) {
    throw new Error('FAIL: app.js 缺少 clearAllScreenEffects 方法！');
  }
  console.log('  [PASS] app.js 已实装 clearAllScreenEffects() 全场景清理机制');

  // 3. 真机无头 Chrome CDP 实测
  console.log('\n[3/3] 启动无头 Chrome 进行真机运行时特效生命周期与自动终止测试:');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const debugPort = 9245;
  const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-bloodred-test-'));

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
    await new Promise(r => setTimeout(r, 1200));

    // 等待引擎初始化完成
    for (let i = 0; i < 20; i++) {
      const ready = await client.evaluate(`!!(window.__vnEngine || window.vnEngine)`);
      if (ready) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // 进入游戏
    await client.evaluate(`
      (() => {
        const btn = document.getElementById("title-btn-start");
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // 测试 1: 触发 danger-pulse，验证初始出现，并在 1.8 秒后彻底终止并移除类名
    console.log('  -> 测试用例 1: 触发 dangerTicks >= 3 危机暗角心跳...');
    const triggerRes = await client.evaluate(`
      (() => {
        const engine = window.__vnEngine || window.vnEngine;
        engine.dangerTicks = 3;
        engine.updateIncenseHUD();
        const overlay = document.getElementById("vignette-overlay");
        return {
          hasPulseClass: overlay.classList.contains("danger-pulse")
        };
      })()
    `);

    if (!triggerRes.hasPulseClass) {
      throw new Error(`FAIL: 触发后 vignette-overlay 未能包含 danger-pulse 类名！`);
    }
    console.log('    [PASS] 危机暗角已成功触发呈现 (含有 danger-pulse 类)');

    console.log('    等待 1800ms 观察特效是否自动终止并自动剥除类名...');
    await new Promise(r => setTimeout(r, 1800));

    const checkTerminated = await client.evaluate(`
      (() => {
        const overlay = document.getElementById("vignette-overlay");
        return {
          hasPulseClass: overlay.classList.contains("danger-pulse")
        };
      })()
    `);

    if (checkTerminated.hasPulseClass) {
      throw new Error(`FAIL: 1800ms 后 vignette-overlay 依然残留 danger-pulse 类名，未彻底终止！`);
    }
    console.log('    [PASS] 1800ms 后 danger-pulse 成功自动终止，类名彻底被清空！');

    // 测试 2: 触发 screen_flash red 刀光血影特效，并在 700ms 后验证清空
    console.log('  -> 测试用例 2: 触发 screen_flash red 刀光全屏闪烁...');
    const flashTrigger = await client.evaluate(`
      (() => {
        const engine = window.__vnEngine || window.vnEngine;
        engine.executeAITools([{ tool: "screen_flash", params: { color: "red" } }]);
        const flashOverlay = document.getElementById("screen-flash-overlay");
        return {
          className: flashOverlay.className
        };
      })()
    `);

    if (!flashTrigger.className.includes("active") || !flashTrigger.className.includes("flash-red")) {
      throw new Error(`FAIL: screen_flash red 触发异常: ${JSON.stringify(flashTrigger)}`);
    }
    console.log('    [PASS] screen_flash red 已启动 (active flash-red)');

    console.log('    等待 800ms 观察闪烁层是否复位...');
    await new Promise(r => setTimeout(r, 800));

    const flashAfter = await client.evaluate(`
      (() => {
        const flashOverlay = document.getElementById("screen-flash-overlay");
        return {
          className: flashOverlay.className,
          hasActive: flashOverlay.classList.contains("active")
        };
      })()
    `);

    if (flashAfter.hasActive) {
      throw new Error(`FAIL: 800ms 后 screen-flash-overlay 仍然残留 active 状态！`);
    }
    console.log('    [PASS] 800ms 后 screen-flash-overlay 完全复位为无激活状态');

    // 测试 3: 多次快速失败/连续触发，验证定时器互斥与干净收敛
    console.log('  -> 测试用例 3: 模拟连续 3 次掷骰受挫高频触发...');
    await client.evaluate(`
      (() => {
        const engine = window.__vnEngine || window.vnEngine;
        engine.triggerDangerPulse(1200);
        setTimeout(() => engine.triggerDangerPulse(1200), 200);
        setTimeout(() => engine.triggerDangerPulse(1200), 400);
      })()
    `);

    console.log('    等待 1800ms 观察高频触发后最终是否干净收敛...');
    await new Promise(r => setTimeout(r, 1800));

    const finalConvergence = await client.evaluate(`
      (() => {
        const overlay = document.getElementById("vignette-overlay");
        const flashOverlay = document.getElementById("screen-flash-overlay");
        return {
          vignetteClean: !overlay.classList.contains("danger-pulse"),
          flashClean: !flashOverlay.classList.contains("active")
        };
      })()
    `);

    if (!finalConvergence.vignetteClean || !finalConvergence.flashClean) {
      throw new Error(`FAIL: 高频连续触发后未能干净收敛: ${JSON.stringify(finalConvergence)}`);
    }
    console.log('    [PASS] 高频连续触发后 100% 干净收敛，所有血红图层完全淡出！');

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
  console.log('🎉 全部血红特效自动终止测试 100% 顺利通过！(无残留 · 零死锁 · 优雅收敛)');
  console.log('===============================================================');
}

runTests().catch(err => {
  console.error('\n❌ 验证测试报错:', err);
  process.exit(1);
});
