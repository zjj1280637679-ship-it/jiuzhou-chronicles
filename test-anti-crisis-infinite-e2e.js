/**
 * test-anti-crisis-infinite-e2e.js
 * 专为《观星纪 · 九州沉浮录》编写的【反剧情杀与无限推演多轮连续实测】脚本
 * 
 * 验证核心：
 * 1. 模拟连续 5 轮以上的推演交互（包含开放式外推、多分支选择、高危险刻度与检定受挫场景）
 * 2. 严密监控 DOM：审查在全部轮次中，是否【绝对不会】唤起 #drawer-crisis 模态弹窗，绝对不会进入 GAMEOVER 终止状态
 * 3. 审查每轮剧情对白播放完毕后，是否【100% 稳定挂载】3 个分支选项 + 1 个开放输入（共 4 个卡片），且页面保持 PLAYING 状态机
 * 4. 监听控制台日志，确认全程 0 控制台报错
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
    try { this.ws.close(); } catch (_) {}
  }
}

async function runAntiCrisisE2E() {
  const report = {
    testStartTime: new Date().toISOString(),
    chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    targetUrl: 'http://localhost:8088',
    totalRoundsTested: 0,
    roundsDetail: [],
    consoleErrors: [],
    uncaughtExceptions: [],
    crisisModalTriggerCount: 0,
    gameOverStateCount: 0,
    passed: false,
    errorMessage: null
  };

  const tempDir = path.join(os.tmpdir(), 'chrome_anti_crisis_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  let chromeProc = null;
  let cdp = null;

  try {
    console.log(`[Anti-Crisis E2E] 启动无头 Chrome 浏览器...`);
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
      throw new Error('未能连接到 Chrome CDP 9222 端口！');
    }

    const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('8088')) || targets.find(t => t.type === 'page');
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    console.log(`[Anti-Crisis E2E] CDP 已连接，目标: ${pageTarget.url}`);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Network.enable');

    // 监控 Console
    cdp.on('Runtime.consoleAPICalled', (params) => {
      const text = params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
      if (params.type === 'error') {
        console.error(`❌ [Console.error]: ${text}`);
        report.consoleErrors.push({ text, timestamp: params.timestamp, stackTrace: params.stackTrace });
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const ex = params.exceptionDetails;
      console.error(`💥 [Uncaught Exception]: ${ex.text} at ${ex.url}:${ex.lineNumber}`);
      report.uncaughtExceptions.push({
        text: ex.text,
        url: ex.url,
        lineNumber: ex.lineNumber,
        desc: ex.exception?.description || ''
      });
    });

    // 追踪每个 /api/chat 网络请求
    const activeApiChatResolvers = [];
    cdp.on('Network.responseReceived', (params) => {
      if (params.response.url.includes('/api/chat')) {
        console.log(`📥 [Network Response] /api/chat Status: ${params.response.status}`);
        if (activeApiChatResolvers.length > 0) {
          const resolver = activeApiChatResolvers.shift();
          resolver(params.response);
        }
      }
    });

    const waitForApiChatResponse = () => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('等待 /api/chat 响应超时 (90s)！'));
        }, 90000);
        activeApiChatResolvers.push((res) => {
          clearTimeout(timer);
          resolve(res);
        });
      });
    };

    // 1. 等待 #qm-cache 服务端握手与 window.__vnEngine 实例化
    console.log(`[Anti-Crisis E2E] 等待引擎初始化与服务端握手...`);
    for (let i = 0; i < 30; i++) {
      const initCheck = await cdp.evaluate(`(() => {
        const el = document.getElementById("qm-cache");
        const btn = document.getElementById("title-btn-start");
        return {
          hasEngine: !!window.__vnEngine,
          hasBtnStart: !!btn,
          cacheText: el ? el.innerText : ""
        };
      })()`);
      if (initCheck && initCheck.hasEngine && initCheck.hasBtnStart && initCheck.cacheText.includes("Reasoner (共享)")) {
        console.log(`[Anti-Crisis E2E] 引擎与共享缓存握手就绪: ${initCheck.cacheText}`);
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // 2. 点击入篇并确认进入 PLAYING 状态
    console.log(`\n========================================`);
    console.log(`▶ [INIT] 点击入篇 (New Game) 进入游戏`);
    console.log(`========================================`);
    await cdp.evaluate(`document.getElementById("title-btn-start").click()`);
    
    for (let i = 0; i < 20; i++) {
      const gs = await cdp.evaluate(`window.__vnEngine ? window.__vnEngine.gameState : null`);
      if (gs === 'PLAYING') {
        console.log(`[Anti-Crisis E2E] 游戏状态成功流转为 PLAYING！`);
        break;
      }
      await new Promise(r => setTimeout(r, 150));
    }

    // 辅助函数：播放当前队列所有对白并快进打字机
    const stepThroughCurrentBeats = async (roundLabel) => {
      console.log(`[${roundLabel}] 正在播放并快进对白...`);
      let beatIdx = 1;
      while (true) {
        const state = await cdp.evaluate(`(() => {
          const engine = window.__vnEngine;
          const choiceOverlay = document.getElementById("choice-overlay");
          const crisisDrawer = document.getElementById("drawer-crisis");
          return {
            isChoiceVisible: choiceOverlay ? choiceOverlay.classList.contains("visible") : false,
            isCrisisOpen: crisisDrawer ? crisisDrawer.classList.contains("open") : false,
            gameState: engine ? engine.gameState : null,
            isTyping: engine ? engine.isTyping : false,
            currentStep: engine ? engine.currentStep : 0,
            totalQueue: engine ? engine.storyQueue.length : 0,
            speaker: document.getElementById("speaker-name")?.innerText,
            sub: document.getElementById("speaker-sub")?.innerText,
            textPreview: (document.getElementById("typewriter-text")?.innerText || "").substring(0, 50)
          };
        })()`);

        // 严密检查：是否被异常呼出危机弹窗
        if (state.isCrisisOpen) {
          report.crisisModalTriggerCount++;
          throw new Error(`[CRITICAL REDLINE ALERT] 检测到 #drawer-crisis 模态弹窗被唤起！剧情杀未被根除！`);
        }
        if (state.gameState === 'GAMEOVER') {
          report.gameOverStateCount++;
          throw new Error(`[CRITICAL REDLINE ALERT] 检测到引擎 gameState 变为 GAMEOVER！游戏被异常掐断！`);
        }

        if (state.isChoiceVisible) {
          console.log(`[${roundLabel}] 对白播放完成，选项容器已呈现！`);
          break;
        }

        if (state.isTyping) {
          await cdp.evaluate(`document.getElementById("dialogue-box").click()`);
          await new Promise(r => setTimeout(r, 100));
        }

        console.log(`  [${roundLabel}] Beat ${beatIdx++}: [${state.speaker}] (${state.sub}) - ${state.textPreview}...`);

        await cdp.evaluate(`document.getElementById("dialogue-box").click()`);
        await new Promise(r => setTimeout(r, 200));

        if (beatIdx > 80) {
          throw new Error(`[${roundLabel}] 单轮对白步进超过 80 拍，可能存在死循环！`);
        }
      }
    };

    // 辅助函数：审查选项面板 (必须恰好 4 项)
    const auditChoicesAndDom = async (roundLabel) => {
      const audit = await cdp.evaluate(`(() => {
        const engine = window.__vnEngine;
        const crisisDrawer = document.getElementById("drawer-crisis");
        const cards = Array.from(document.querySelectorAll("#choice-container .choice-card"));
        return {
          gameState: engine ? engine.gameState : null,
          isCrisisOpen: crisisDrawer ? crisisDrawer.classList.contains("open") : false,
          dangerTicks: engine ? engine.dangerTicks : null,
          maxDangerTicks: engine ? engine.maxDangerTicks : null,
          isExtrapolating: engine ? engine.isExtrapolating : false,
          totalCards: cards.length,
          choices: cards.map((c, i) => ({
            index: i,
            text: c.innerText.trim().replace(/\\n/g, " "),
            isOpen: c.innerText.includes("开放外推") || c.innerText.includes("输入文字")
          }))
        };
      })()`);

      console.log(`[${roundLabel}] 审查结果: totalCards=${audit.totalCards}, dangerTicks=${audit.dangerTicks}, gameState=${audit.gameState}, isCrisisOpen=${audit.isCrisisOpen}`);

      if (audit.isCrisisOpen) {
        report.crisisModalTriggerCount++;
        throw new Error(`[${roundLabel}] 剧情杀弹窗 #drawer-crisis 异常展开！`);
      }
      if (audit.gameState !== 'PLAYING') {
        report.gameOverStateCount++;
        throw new Error(`[${roundLabel}] 状态机异常偏离 PLAYING: ${audit.gameState}`);
      }
      if (audit.totalCards !== 4) {
        throw new Error(`[${roundLabel}] 选项卡数量不为 4！实际: ${audit.totalCards}`);
      }
      const openCount = audit.choices.filter(c => c.isOpen).length;
      if (openCount !== 1) {
        throw new Error(`[${roundLabel}] 开放式输入选项数量不为 1！实际: ${openCount}`);
      }

      return audit;
    };

    // ========================================================
    // 第 1 轮：序幕对白 -> 开放式输入 ("查看辽东战局与当面虚实")
    // ========================================================
    console.log(`\n========================================`);
    console.log(`▶ [ROUND 1] 序幕推演 -> 开放式输入外推`);
    console.log(`========================================`);
    await stepThroughCurrentBeats('Round 1');
    const r1Audit = await auditChoicesAndDom('Round 1');
    report.roundsDetail.push({ round: 1, type: 'open_input', audit: r1Audit });

    // 唤起开放式输入并提交
    console.log(`[Round 1] 唤起开放式输入弹窗，输入自定指令...`);
    const openCardIdx = r1Audit.choices.find(c => c.isOpen).index;
    await cdp.evaluate(`document.querySelectorAll("#choice-container .choice-card")[${openCardIdx}].click()`);
    await new Promise(r => setTimeout(r, 300));

    await cdp.evaluate(`(() => {
      const ta = document.getElementById("open-input-text");
      ta.value = "查看辽东战局与当面虚实";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);

    const p1 = waitForApiChatResponse();
    await cdp.evaluate(`document.getElementById("btn-submit-open-input").click()`);
    console.log(`[Round 1] 已提交指令，等待 /api/chat 官方大模型返回...`);
    await p1;
    await new Promise(r => setTimeout(r, 800));
    report.totalRoundsTested = 1;

    // ========================================================
    // 第 2 轮：AI 支线首轮 -> 选择第 1 个剧情分支卡
    // ========================================================
    console.log(`\n========================================`);
    console.log(`▶ [ROUND 2] 连续推演：选择第 1 个剧情分支卡`);
    console.log(`========================================`);
    await stepThroughCurrentBeats('Round 2');
    const r2Audit = await auditChoicesAndDom('Round 2');
    report.roundsDetail.push({ round: 2, type: 'branch_choice_0', audit: r2Audit });

    console.log(`[Round 2] 选中分支 0: "${r2Audit.choices[0].text.substring(0, 40)}..."`);
    const p2 = waitForApiChatResponse();
    await cdp.evaluate(`document.querySelectorAll("#choice-container .choice-card")[0].click()`);
    console.log(`[Round 2] 已点击分支，等待 /api/chat 官方大模型返回...`);
    await p2;
    await new Promise(r => setTimeout(r, 800));
    report.totalRoundsTested = 2;

    // ========================================================
    // 第 3 轮：掷骰受挫与危险时相极限压力测试 (High Danger Ticks)
    // ========================================================
    console.log(`\n========================================`);
    console.log(`▶ [ROUND 3] 极限压力测试：模拟掷骰受挫并将 dangerTicks 推至上限`);
    console.log(`========================================`);
    await stepThroughCurrentBeats('Round 3');
    const r3Audit = await auditChoicesAndDom('Round 3');

    // 人工将危险刻度推至极限 3（原本会触发 GAMEOVER 的阈值）
    await cdp.evaluate(`(() => {
      window.__vnEngine.dangerTicks = 3;
      window.__vnEngine.updateIncenseHUD();
    })()`);

    const dangerCheck = await cdp.evaluate(`(() => {
      const overlay = document.getElementById("vignette-overlay");
      const pulse = overlay ? overlay.classList.contains("danger-pulse") : false;
      return { dangerTicks: window.__vnEngine.dangerTicks, dangerPulse: pulse };
    })()`);
    console.log(`[Round 3] 危险氛围状态注入:`, dangerCheck);

    report.roundsDetail.push({ round: 3, type: 'branch_choice_1_stress', audit: r3Audit, stress: dangerCheck });

    console.log(`[Round 3] 极限危险状态下选中分支 1: "${r3Audit.choices[1].text.substring(0, 40)}..."`);
    const p3 = waitForApiChatResponse();
    await cdp.evaluate(`document.querySelectorAll("#choice-container .choice-card")[1].click()`);
    console.log(`[Round 3] 已点击分支，等待 /api/chat 官方大模型返回...`);
    await p3;
    await new Promise(r => setTimeout(r, 800));
    report.totalRoundsTested = 3;

    // ========================================================
    // 第 4 轮：极限危险状态下的对白步进与无剧情杀验证
    // ========================================================
    console.log(`\n========================================`);
    console.log(`▶ [ROUND 4] 验证极限危险状态下【绝对无剧情杀】，连续推进分支 2`);
    console.log(`========================================`);
    await stepThroughCurrentBeats('Round 4');
    const r4Audit = await auditChoicesAndDom('Round 4');
    report.roundsDetail.push({ round: 4, type: 'branch_choice_2', audit: r4Audit });

    console.log(`[Round 4] 选中分支 2: "${r4Audit.choices[2].text.substring(0, 40)}..."`);
    const p4 = waitForApiChatResponse();
    await cdp.evaluate(`document.querySelectorAll("#choice-container .choice-card")[2].click()`);
    console.log(`[Round 4] 已点击分支，等待 /api/chat 官方大模型返回...`);
    await p4;
    await new Promise(r => setTimeout(r, 800));
    report.totalRoundsTested = 4;

    // ========================================================
    // 第 5 轮：第 2 次自由开放式输入 ("以摄政王名义整顿九卿与辽饷账目")
    // ========================================================
    console.log(`\n========================================`);
    console.log(`▶ [ROUND 5] 第 2 次开放式自由输入外推实测`);
    console.log(`========================================`);
    await stepThroughCurrentBeats('Round 5');
    const r5Audit = await auditChoicesAndDom('Round 5');
    report.roundsDetail.push({ round: 5, type: 'open_input_2', audit: r5Audit });

    console.log(`[Round 5] 唤起第 2 次开放式输入弹窗...`);
    const openCardIdx5 = r5Audit.choices.find(c => c.isOpen).index;
    await cdp.evaluate(`document.querySelectorAll("#choice-container .choice-card")[${openCardIdx5}].click()`);
    await new Promise(r => setTimeout(r, 300));

    await cdp.evaluate(`(() => {
      const ta = document.getElementById("open-input-text");
      ta.value = "以摄政王名义整顿九卿与辽饷账目，颁行减租安民榜文，招徕流亡复耕";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);

    const p5 = waitForApiChatResponse();
    await cdp.evaluate(`document.getElementById("btn-submit-open-input").click()`);
    console.log(`[Round 5] 已提交自定指令，等待 /api/chat 官方大模型返回...`);
    await p5;
    await new Promise(r => setTimeout(r, 800));
    report.totalRoundsTested = 5;

    // ========================================================
    // 第 6 轮：最终稳定落幕审查
    // ========================================================
    console.log(`\n========================================`);
    console.log(`▶ [ROUND 6] 连续推演最终稳定挂载审查`);
    console.log(`========================================`);
    await stepThroughCurrentBeats('Round 6');
    const r6Audit = await auditChoicesAndDom('Round 6');
    report.roundsDetail.push({ round: 6, type: 'final_mount_check', audit: r6Audit });
    report.totalRoundsTested = 6;

    // ========================================================
    // 汇总与零报错判定
    // ========================================================
    console.log(`\n========================================`);
    console.log(`▶ [AUDIT] 最终指标与红线审查`);
    console.log(`========================================`);
    console.log(`[Anti-Crisis E2E] 完成连续推演轮数: ${report.totalRoundsTested}`);
    console.log(`[Anti-Crisis E2E] 剧情杀弹窗触发次数: ${report.crisisModalTriggerCount}`);
    console.log(`[Anti-Crisis E2E] GAMEOVER 状态发生次数: ${report.gameOverStateCount}`);
    console.log(`[Anti-Crisis E2E] 控制台报错次数: ${report.consoleErrors.length}`);
    console.log(`[Anti-Crisis E2E] 未捕获异常次数: ${report.uncaughtExceptions.length}`);

    if (report.crisisModalTriggerCount > 0) {
      throw new Error(`剧情杀弹窗被触发了 ${report.crisisModalTriggerCount} 次！`);
    }
    if (report.gameOverStateCount > 0) {
      throw new Error(`引擎发生了 ${report.gameOverStateCount} 次 GAMEOVER！`);
    }
    if (report.consoleErrors.length > 0) {
      throw new Error(`控制台发生了 ${report.consoleErrors.length} 次报错！`);
    }
    if (report.uncaughtExceptions.length > 0) {
      throw new Error(`捕获到 ${report.uncaughtExceptions.length} 次未捕获异常！`);
    }

    report.passed = true;
    report.testEndTime = new Date().toISOString();
    console.log(`\n🎉🎉🎉 反剧情杀多轮连续实测全部通过！绿灯 PASS！`);

  } catch (err) {
    report.passed = false;
    report.errorMessage = err.message;
    report.errorStack = err.stack;
    report.testEndTime = new Date().toISOString();
    console.error(`\n🚨🚨🚨 [E2E 验证守卫拦截告警] 反剧情杀实测失败: ${err.message}`);
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try { chromeProc.kill(); } catch (_) {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }

  const resultPath = path.join(__dirname, 'anti-crisis-e2e-result.json');
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[Anti-Crisis E2E] 结果已保存至: ${resultPath}`);

  return report;
}

if (require.main === module) {
  runAntiCrisisE2E().then(report => {
    process.exit(report.passed ? 0 : 1);
  });
}

module.exports = { runAntiCrisisE2E };
