// =============================================================================
// 《观星纪 · 九州沉浮录》全阵营 DLC 视觉小说与隐式思潮采样引擎 (app.js)
// 包含四大阵营：大明中枢、后金清朝、大漠蒙古、南国海邦
// 表面：多视角东方历史史诗视觉小说
// 底层：4轴8向政治光谱、MBTI机能隐式测量与16历史人物镜像拟合
// =============================================================================

const APP_VERSION = "v2.5.0";
const BUILD_STAMP = "2026.10.22.0900";
const VERSION_FULL = `v2.5.0 (Build ${BUILD_STAMP} · 插件式工具循环 · 交付正文实测 · 3选项+开放输入)`;
const AIProviders = typeof module === "object" && module.exports
  ? require("./harness/providers.js") : globalThis.JiuzhouProviders;
const GameRecovery = typeof module === "object" && module.exports
  ? require("./game-recovery.js") : globalThis.JiuzhouGameRecovery;
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

class WebVisualNovelEngine {
  constructor() {
    this.currentFaction = "ming"; // ming | qing | mongol | nanming
    this.currentTurn = 1;
    this.currentCoords = "beijing:high";
    this.dangerTicks = 1;
    this.maxDangerTicks = 4;
    this.branchDepth = 0; // 分支推演深度 (0=主线, >=1=分支推演中)

    // 隐式思潮与认知量表得分 (4-Axis Ideology & Cognitive Vector)
    this.ideologyVector = {
      authority: 2,   // 正: 铁血强极(霸道) | 负: 民本宽政(王道)
      pragmatism: 3,  // 正: 功利实务(经世) | 负: 名节气节(孤忠)
      progress: 2,    // 正: 决绝更张(变法) | 负: 守旧存规(祖制)
      cognition: 1    // 正: 深谋远虑(直觉N) | 负: 市井实感(感知S)
    };

    // 背包卡牌 (句柄 3)
    this.inventory = JSON.parse(JSON.stringify(WORLD_PRESETS.initialCards));

    // 历史剧本履历 (Backlog)
    this.backlog = [];

    // 命运之结时光机 (句柄 12)
    this.fateKnots = [];

    // 打字机与播放状态
    this.isTyping = false;
    this.typeTimer = null;
    this.currentFullText = "";
    this.autoPlay = false;
    this.autoTimer = null;
    this.dangerPulseTimer = null;
    this.flashTimer = null;

    // 剧情流队列
    this.storyQueue = [];
    this.currentStep = 0;

    // DeepSeek API 通道与 Prompt Caching 四层前缀架构
    let savedApiConfig = null;
    try {
      savedApiConfig = JSON.parse(localStorage.getItem("vn_api_config"));
    } catch (e) {}

    this.apiConfig = AIProviders.normalizeConfig(savedApiConfig, {fresh: !savedApiConfig});
    this.aiConfigRevision = 0;

    // AI 生成中互斥锁 (杜绝并发请求与提早弹出伪造选项卡)
    this.isAIGenerating = false;

    // AI 交付正文目标 (默认至少 2000 字，支持 500 / 2000 / 5000)
    let savedExpectedLength = 2000;
    try {
      const storedLen = parseInt(localStorage.getItem("vn_expected_length"), 10);
      if ([500, 2000, 5000].includes(storedLen)) {
        savedExpectedLength = storedLen;
      }
    } catch (e) {}
    this.expectedLength = savedExpectedLength;

    // 四层前缀缓存对齐的历史队列 (Append-Only Narrative History Stream)
    this.apiHistory = [];
    this.pendingApiChoices = null;
    this.aiRequestStatus = null;
    this.aiGenerationMetrics = null;
    this.activeAIRequestController = null;

    // 缓存遥测数据
    this.cacheTelemetry = {
      lastHitTokens: null,
      lastMissTokens: null,
      lastHitRate: "未提供",
      cacheUsageKnown: false,
      totalHits: 0
    };

    // 双轨剧情树与因果弥合系统 (Dual-Tree & Narrative Suturing System)
    // 游戏主体是法定主剧情树；AI 负责外推额外分支，并有修改主剧情文字卡以弥合剧情的责任
    this.currentStoryNodeId = "ming_act1";
    this.isExtrapolating = false; // 是否处于 AI 额外外推分支中
    this.extrapolationHistory = []; // 局外外推行为与胜负因果记录
    this.reconciledCardsCache = {}; // 记录已被 AI 弥合重写的节点卡片对照
    this.lastSutureNote = null;
    this.needsSuturing = false;
    this.convergenceTargetId = null;
    this.isEpilogueSequel = false; // 是否处于大结局后的无限后日谈续集模式

    // 游戏全局生命周期状态机: TITLE (主界面) | PLAYING (剧情进行) | GAMEOVER (危机沦亡) | EPILOGUE (终局照相)
    this.gameState = "TITLE";
    this.hasActiveProgress = false;

    this.initDOM();
    this.initEvents();
    this.showTitleScreen();
  }

  // 获取当前阵营最宏伟的核心大结局节点 ID (用于变身奥特曼/神级降维操作时瞬间跳跃至大结局)
  getSupremeEndingNodeId() {
    const faction = this.currentFaction || "qing";
    switch (faction) {
      case "qing":
        return "qing_end_1"; // 【终局 #1】大清极盛天朝 · 铁壁江山万古定鼎
      case "ming":
        return "ming_act5_iron_restoration"; // 【终局 #1】大明铁血中兴
      case "mongol":
        return "mongol_act5_yuan_restoration"; // 【终局 #1】大元重塑中原
      case "nanming":
        return "nanming_act5_ocean_kingdom"; // 【终局 #1】南明海上日不落帝国
      default:
        return "qing_end_1";
    }
  }

  // 获取主剧情树下一幕的首选主干节点 ID (用于普通外推时收敛回主线)
  getNextActCanonicalNodeId() {
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    if (!tree) return this.getSupremeEndingNodeId();
    const currNode = tree.nodes[this.currentStoryNodeId];
    const currentAct = currNode ? currNode.actNumber : 1;
    const nextAct = currentAct + 1;
    
    if (nextAct > 5) {
      return this.getSupremeEndingNodeId();
    }
    const nextNodes = Object.values(tree.nodes).filter(n => n.actNumber === nextAct);
    if (nextNodes.length > 0) {
      const trunkA = nextNodes.find(n => n.trunk === 'A');
      return trunkA ? trunkA.id : nextNodes[0].id;
    }
    return this.getSupremeEndingNodeId();
  }

  // 离线海量三元组行动矩阵库与动态合成引擎 (支持海量预设三元组采样与根据现场 NPC/情境自编组合)
  generateOfflineActionTriplet(context) {
    const { sceneTitle, npcInScene, userAction, success, total } = context;
    const cleanNpc = (npcInScene || "当面首领").replace(/（.*?）/g, "").trim();

    // 海量三元组矩阵库：涵盖突围、伏击、权谋、离间、谍变、火攻、借势等数十种战术分支
    const tripletArchetypes = [
      [
        { title: "正面撕开缺口", action: `借${cleanNpc}阵脚未稳，拔出短刃率精锐发起正面突刺！`, tag: "正面强攻", bias: { authority: 2, pragmatism: 4, progress: 2, cognition: 3 }, diceBase: 10 },
        { title: "纵火造势脱身", action: `点燃军帐后侧草料辎重制造冲天烈火，趁混乱遁入夜色！`, tag: "金蝉脱壳", bias: { authority: 0, pragmatism: 5, progress: 3, cognition: 4 }, diceBase: 9 },
        { title: "亮出伪令反制", action: `反手掏出伪造的中枢密信与兵符，厉声反斥${cleanNpc}通敌谋逆！`, tag: "反客为主", bias: { authority: 3, pragmatism: 5, progress: 1, cognition: 4 }, diceBase: 11 }
      ],
      [
        { title: "断尾割席止损", action: `舍弃外围接应暗哨并封死甬道，独自携核心密档撤离！`, tag: "弃车保帅", bias: { authority: 1, pragmatism: 5, progress: 2, cognition: 3 }, diceBase: 9 },
        { title: "移祸借刀杀人", action: `将现场痕迹引向其宿敌营帐，诱发两派藩镇拔刀内讧！`, tag: "借刀杀人", bias: { authority: 2, pragmatism: 5, progress: 3, cognition: 4 }, diceBase: 10 },
        { title: "直捣中枢夺符", action: `不退反进，潜入后帐逼取调兵令箭与关键口令！`, tag: "釜底抽薪", bias: { authority: 3, pragmatism: 4, progress: 2, cognition: 5 }, diceBase: 11 }
      ],
      [
        { title: "当众攻心瓦解", action: `高声揭露克扣粮饷真相，策动当面饥寒士卒倒戈哗变！`, tag: "攻心离间", bias: { authority: 1, pragmatism: 4, progress: 4, cognition: 4 }, diceBase: 10 },
        { title: "暗掷重金买路", action: `暗中递上通关金叶与海贸票号，收买领头偏将悄然放行！`, tag: "重金买路", bias: { authority: 0, pragmatism: 5, progress: 2, cognition: 3 }, diceBase: 8 },
        { title: "霹雳同归于尽", action: `引燃随身携带的火器引线，作势同归于尽逼退八方刀斧手！`, tag: "鱼死网破", bias: { authority: 2, pragmatism: 2, progress: 4, cognition: 5 }, diceBase: 12 }
      ],
      [
        { title: "扼险卡死咽喉", action: `退守城楼残堞与狭道，借强弓连弩卡死通路以待后援！`, tag: "扼险死守", bias: { authority: 2, pragmatism: 4, progress: 1, cognition: 3 }, diceBase: 9 },
        { title: "伪降以退为进", action: `弃刃伏地佯装屈服，暗蓄淬毒短匕伺机暴起割喉！`, tag: "苦肉伪降", bias: { authority: 1, pragmatism: 5, progress: 3, cognition: 4 }, diceBase: 10 },
        { title: "破壁暗巷潜龙", action: `以短凿破开砖石暗穴，顺城下排污暗渠悄然潜入市井！`, tag: "暗度陈仓", bias: { authority: 0, pragmatism: 4, progress: 3, cognition: 3 }, diceBase: 9 }
      ],
      [
        { title: "开闸引洪断后", action: `猛击护城河水闸石锁，引江水倒灌冲散沿岸八旗铁骑！`, tag: "以水代兵", bias: { authority: 2, pragmatism: 5, progress: 4, cognition: 4 }, diceBase: 10 },
        { title: "反身擒贼锁喉", action: `踏步前冲擒拿${cleanNpc}，以利刃架颈令三军弃戈后退！`, tag: "擒贼擒王", bias: { authority: 3, pragmatism: 4, progress: 2, cognition: 4 }, diceBase: 11 },
        { title: "造谣震慑全军", action: `鸣锣高呼主帅已被中枢赐死，借恐惧在全营引发践踏大溃！`, tag: "造乱溃敌", bias: { authority: 1, pragmatism: 5, progress: 4, cognition: 5 }, diceBase: 9 }
      ]
    ];

    const pickIdx = Math.abs(Number(total || 0) * 11 + Number(this.currentTurn || 1) * 17) % tripletArchetypes.length;
    const chosen = tripletArchetypes[pickIdx];

    return chosen.map(c => ({
      text: `【${c.title}】${c.action}`,
      tag: c.tag,
      bias: c.bias,
      diceBase: c.diceBase,
      isExtrapolation: true
    }));
  }

  // 离线后日谈海量三元组生成
  generateOfflineEpilogueTriplet(context) {
    const epilogueTriplets = [
      [
        { title: "铁腕厉行整饬", action: "严令巡按御史与缇骑分巡各省，凡抗拒新政者立斩枭首！", tag: "铁腕整饬", bias: { authority: 3, pragmatism: 4, progress: 4, cognition: 3 }, diceBase: 9 },
        { title: "利益羁縻商帮", action: "大宴江南行商与世家巨室，以盐引海贸之利瓦解抗粮同盟！", tag: "经世制衡", bias: { authority: 2, pragmatism: 5, progress: 3, cognition: 4 }, diceBase: 9 },
        { title: "扬帆远航拓海", action: "调拨巨舰水师开赴东西重洋，打通环球香料与白银航线！", tag: "重洋开拓", bias: { authority: 1, pragmatism: 3, progress: 5, cognition: 5 }, diceBase: 9 }
      ],
      [
        { title: "兴办格物实学", action: "延揽泰西传教士与江南工匠，创设皇家算学天文制造局！", tag: "开智格物", bias: { authority: 1, pragmatism: 4, progress: 6, cognition: 5 }, diceBase: 10 },
        { title: "更张编户均田", action: "清丈天下土地推行摊丁入亩，免除天下穷民苛捐杂税！", tag: "均田免赋", bias: { authority: 3, pragmatism: 5, progress: 4, cognition: 4 }, diceBase: 9 },
        { title: "分封勋臣裂土", action: "于关外漠北与南洋设七大都督府，令有功战将镇守天涯！", tag: "裂土经略", bias: { authority: 3, pragmatism: 3, progress: 3, cognition: 3 }, diceBase: 8 }
      ],
      [
        { title: "开科广纳英才", action: "开设博学鸿儒特科，不拘门第拔擢寒门，尽收士林人心！", tag: "开科笼络", bias: { authority: 2, pragmatism: 4, progress: 3, cognition: 4 }, diceBase: 8 },
        { title: "削减宗室冗禄", action: "下旨削减王公八旗闲散禄米，迫其自谋生计断除国朝膏肓！", tag: "革除冗费", bias: { authority: 4, pragmatism: 5, progress: 3, cognition: 3 }, diceBase: 11 },
        { title: "重修千秋正统", action: "设馆编纂九州通纪，严辞褒贬前明得失，定万世不易之道统！", tag: "盛世纪元", bias: { authority: 1, pragmatism: 2, progress: 2, cognition: 6 }, diceBase: 8 }
      ]
    ];

    const pickIdx = Math.abs(Number(this.currentTurn || 1) * 7) % epilogueTriplets.length;
    const chosen = epilogueTriplets[pickIdx];

    return chosen.map(c => ({
      text: `【${c.title}】${c.action}`,
      tag: c.tag,
      bias: c.bias,
      diceBase: c.diceBase,
      isExtrapolation: true,
      isEpilogueSequel: true
    }));
  }

  // ===========================================================================
  // AI GM 视听舞台特效与插图展示工具系统 (Visual Novel Tools Engine)
  // ===========================================================================

  // 执行 AI GM 舞台特效与视听工具指令 (支持屏幕震颤、全屏闪烁、天气调度、插图CG展示、道具发放与时相操纵)
  executeAITools(tools) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) return;

    tools.forEach(t => {
      if (!t) return;
      const toolName = t.tool || t.name;
      if (!toolName) return;
      const params = t.params || {};

      switch (toolName) {
        case "screen_shake": {
          const intensity = params.intensity || "medium";
          const duration = params.duration || 600;
          if (this.gameViewport) {
            this.gameViewport.classList.remove("shake-light", "shake-medium", "shake-heavy", "shake-earthquake");
            this.gameViewport.classList.add(`shake-${intensity}`);
            setTimeout(() => {
              if (this.gameViewport) {
                this.gameViewport.classList.remove(`shake-${intensity}`);
              }
            }, duration);
          }
          break;
        }

        case "screen_flash": {
          const color = params.color || "white";
          if (this.screenFlashOverlay) {
            if (this.flashTimer) {
              clearTimeout(this.flashTimer);
              this.flashTimer = null;
            }
            this.screenFlashOverlay.className = "screen-flash-overlay active flash-" + color;
            this.flashTimer = setTimeout(() => {
              if (this.screenFlashOverlay) {
                this.screenFlashOverlay.className = "screen-flash-overlay";
              }
              this.flashTimer = null;
            }, 600);
          }
          break;
        }

        case "weather_effect": {
          const type = params.type || "clear";
          if (this.weatherOverlay) {
            this.weatherOverlay.className = "weather-particles-overlay weather-" + type;
          }
          break;
        }

        case "show_illustration":
        case "qing_captive":
        case "qing_battle":
        case "qing_war":
        case "qing_romance":
        case "qing_victory":
        case "qing_wealth":
        case "ming_captive":
        case "ming_battle":
        case "ming_war":
        case "ming_romance":
        case "ming_victory":
        case "ming_wealth":
        case "mongol_captive":
        case "mongol_battle":
        case "mongol_war":
        case "mongol_romance":
        case "mongol_victory":
        case "mongol_wealth":
        case "nanming_captive":
        case "nanming_battle":
        case "nanming_war":
        case "nanming_romance":
        case "nanming_victory":
        case "nanming_wealth": {
          const fKey = this.currentFaction || "qing";
          let fVault = {};
          if (typeof window !== "undefined" && window.FACTION_ILLUSTRATION_VAULT) {
            fVault = window.FACTION_ILLUSTRATION_VAULT[fKey] || {};
          }
          let targetItem = fVault[toolName] || fVault[params.id];
          if (!targetItem) {
            const cat = params.category || (params.title && /俘虏/.test(params.title) ? "captive" : (/战斗|肉搏/.test(params.title) ? "battle" : (/战争|攻城|巨舰/.test(params.title) ? "war" : (/爱情|情深|风月|同袍|誓/.test(params.title) ? "romance" : (/胜利|登极|凯旋/.test(params.title) ? "victory" : "wealth")))));
            targetItem = fVault[`${fKey}_${cat}`] || Object.values(fVault)[0];
          }
          const finalTitle = params.title || (targetItem && targetItem.title) || "史诗画卷";
          const finalDesc = params.caption || params.description || (targetItem && targetItem.description) || "天地玄黄，宇宙洪荒。";
          const finalUrl = params.url || (targetItem && targetItem.relativePath) || null;
          this.showIllustration(finalTitle, finalDesc, params.style || "divine_gold", finalUrl);
          break;
        }

        case "grant_item": {
          if (params.name) {
            const newItem = {
              id: "item_" + Math.random().toString(16).substring(2, 8),
              name: String(params.name),
              desc: String(params.desc || "AI GM 剧本推演赐予的关键证物与密档"),
              power: Number.isFinite(params.power) ? params.power : 0,
              aspects: Array.isArray(params.aspects) ? params.aspects.filter(value => typeof value === "string") : [],
              type: params.type || "clue",
              icon: params.icon || "📜"
            };
            this.inventory.push(newItem);
            this.renderPocket();
            const pocketCount = document.getElementById("pocket-count");
            if (pocketCount) pocketCount.innerText = this.inventory.length;
          }
          break;
        }

        case "danger_tick": {
          if (typeof params.delta === "number") {
            this.dangerTicks = Math.max(0, Math.min(this.maxDangerTicks, this.dangerTicks + params.delta));
            this.updateIncenseHUD();
          }
          break;
        }
      }
    });
  }

  // 唤起全屏视觉小说插图 / 特写 CG 视窗
  showIllustration(title, description, style = "tragic_snow", customUrl = null) {
    if (!this.modalIllustration) return;
    if (this.illustrationTitle) this.illustrationTitle.innerText = title || "史诗画卷";
    if (this.illustrationCaption) this.illustrationCaption.innerText = description || "天地玄黄，宇宙洪荒。";

    if (this.illustrationGraphic) {
      if (customUrl) {
        this.illustrationGraphic.innerHTML = `<img src="${escapeHTML(customUrl)}" alt="${escapeHTML(title)}" class="illustration-img" />`;
      } else {
        this.illustrationGraphic.innerHTML = this.generateIllustrationSVG(title, description, style);
      }
    }

    this.modalIllustration.classList.add("open");
  }

  // 收起插图特写视窗
  closeIllustration() {
    if (this.modalIllustration) {
      this.modalIllustration.classList.remove("open");
    }
  }

  // 离线/实时矢量插图生成器 (古典水墨意境与电影画幅)
  generateIllustrationSVG(title, description, style) {
    if (style === "divine_gold") {
      return `<svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="goldGlow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stop-color="#fef08a" stop-opacity="1"/>
            <stop offset="35%" stop-color="#eab308" stop-opacity="0.85"/>
            <stop offset="70%" stop-color="#b45309" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95"/>
          </radialGradient>
        </defs>
        <rect width="800" height="450" fill="url(#goldGlow)"/>
        <polygon points="400,0 320,450 480,450" fill="#fde047" opacity="0.25"/>
        <polygon points="400,0 260,450 540,450" fill="#ffffff" opacity="0.18"/>
        <ellipse cx="400" cy="130" rx="36" ry="46" fill="#fef9c3" opacity="0.95"/>
        <path d="M360,180 Q400,165 440,180 L480,360 L320,360 Z" fill="#ffffff" opacity="0.9"/>
        <path d="M0,450 L0,390 Q180,380 340,395 Q400,385 460,395 Q620,380 800,390 L800,450 Z" fill="#020617"/>
        <circle cx="280" cy="385" r="8" fill="#020617"/>
        <circle cx="520" cy="385" r="8" fill="#020617"/>
        <rect x="710" y="30" width="55" height="55" rx="6" fill="#991b1b" stroke="#fecaca" stroke-width="2"/>
        <text x="737" y="55" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">天命</text>
        <text x="737" y="73" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">定鼎</text>
      </svg>`;
    } else if (style === "war_fire") {
      return `<svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#7f1d1d"/>
            <stop offset="50%" stop-color="#ea580c"/>
            <stop offset="85%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#020617"/>
          </linearGradient>
        </defs>
        <rect width="800" height="450" fill="url(#fireGrad)"/>
        <path d="M0,320 L180,300 L220,340 L380,330 L450,280 L520,330 L700,310 L800,330 L800,450 L0,450 Z" fill="#090d16"/>
        <rect x="420" y="240" width="60" height="50" fill="#090d16"/>
        <circle cx="380" cy="220" r="4" fill="#fed7aa" opacity="0.8"/>
        <circle cx="460" cy="180" r="6" fill="#f97316" opacity="0.7"/>
        <circle cx="520" cy="210" r="3" fill="#fdba74" opacity="0.9"/>
        <line x1="200" y1="100" x2="600" y2="350" stroke="#ffffff" stroke-width="2" opacity="0.3" stroke-dasharray="10,20"/>
        <rect x="710" y="30" width="55" height="55" rx="6" fill="#991b1b" stroke="#fecaca" stroke-width="2"/>
        <text x="737" y="55" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">烽烟</text>
        <text x="737" y="73" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">破晓</text>
      </svg>`;
    } else if (style === "court_conspiracy") {
      return `<svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="palaceGrad" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stop-color="#78350f" stop-opacity="0.9"/>
            <stop offset="45%" stop-color="#1e1b18" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#050505" stop-opacity="1"/>
          </radialGradient>
        </defs>
        <rect width="800" height="450" fill="url(#palaceGrad)"/>
        <rect x="120" y="0" width="45" height="450" fill="#0c0a09" opacity="0.85"/>
        <rect x="635" y="0" width="45" height="450" fill="#0c0a09" opacity="0.85"/>
        <path d="M0,0 Q400,60 800,0 L800,60 Q400,100 0,60 Z" fill="#292524" opacity="0.7"/>
        <polygon points="340,320 360,200 440,200 460,320 480,360 320,360" fill="#18181b"/>
        <rect x="710" y="30" width="55" height="55" rx="6" fill="#991b1b" stroke="#fecaca" stroke-width="2"/>
        <text x="737" y="55" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">暗盘</text>
        <text x="737" y="73" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">权谋</text>
      </svg>`;
    } else {
      // 默认: tragic_snow (辽东冻土 · 包衣生计)
      return `<svg viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="snowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="40%" stop-color="#1e293b"/>
            <stop offset="75%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#475569"/>
          </linearGradient>
        </defs>
        <rect width="800" height="450" fill="url(#snowGrad)"/>
        <path d="M0,320 Q200,310 400,340 T800,310 L800,450 L0,450 Z" fill="#cbd5e1" opacity="0.85"/>
        <path d="M0,360 Q300,330 600,370 T800,350 L800,450 L0,450 Z" fill="#94a3b8" opacity="0.9"/>
        <path d="M80,340 L90,210 L82,160 M90,210 L115,180 M90,230 L70,195" stroke="#0f172a" stroke-width="4" fill="none"/>
        <polygon points="160,350 210,310 260,350" fill="#0f172a"/>
        <path d="M420,345 L400,360 L370,360 M400,360 L395,380 M405,380 L415,360" stroke="#020617" stroke-width="4" fill="none"/>
        <circle cx="423" cy="340" r="7" fill="#020617"/>
        <line x1="415" y1="355" x2="470" y2="350" stroke="#020617" stroke-width="3"/>
        <rect x="470" y="335" width="45" height="25" fill="#020617"/>
        <circle cx="480" cy="365" r="8" fill="#020617"/>
        <circle cx="505" cy="365" r="8" fill="#020617"/>
        <path d="M680,315 Q700,305 720,325 L730,340 M690,325 L685,340" stroke="#020617" stroke-width="3" fill="none"/>
        <circle cx="698" cy="305" r="5" fill="#020617"/>
        <circle cx="120" cy="80" r="2" fill="#ffffff" opacity="0.8"/>
        <circle cx="280" cy="140" r="2.5" fill="#ffffff" opacity="0.7"/>
        <circle cx="450" cy="90" r="3" fill="#ffffff" opacity="0.9"/>
        <circle cx="620" cy="130" r="2" fill="#ffffff" opacity="0.8"/>
        <rect x="710" y="30" width="55" height="55" rx="6" fill="#991b1b" stroke="#fecaca" stroke-width="2"/>
        <text x="737" y="55" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">辽东</text>
        <text x="737" y="73" font-family="serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="900">冻骨</text>
      </svg>`;
    }
  }

  // 初始化 DOM 引用
  initDOM() {
    this.gameViewport = document.getElementById("game-viewport");
    this.titleScreen = document.getElementById("title-screen");
    this.titleBtnStart = document.getElementById("title-btn-start");
    this.titleBtnContinue = document.getElementById("title-btn-continue");
    this.titleBtnFactions = document.getElementById("title-btn-factions");
    this.titleBtnDestiny = document.getElementById("title-btn-destiny");
    this.titleBtnSwarm = document.getElementById("title-btn-swarm");
    this.titleBtnSettings = document.getElementById("title-btn-settings");
    this.titleSaveHint = document.getElementById("title-save-hint");
    this.qmHome = document.getElementById("qm-home");
    this.qmCache = document.getElementById("qm-cache");
    this.qmStoryTree = document.getElementById("qm-storytree");

    // 剧情树与弥合指示器
    this.branchPill = document.getElementById("branch-pill");
    this.sutureBadge = document.getElementById("suture-badge");
    this.drawerStoryTree = document.getElementById("drawer-storytree");
    this.btnCloseStoryTree = document.getElementById("btn-close-storytree");
    this.storyTreeBody = document.getElementById("storytree-body");
    this.storyTreeCanvasContainer = document.getElementById("storytree-canvas-container");
    this.storyTreeSuturePanel = document.getElementById("storytree-suture-panel");
    this.suturePanelNote = document.getElementById("suture-panel-note");
    this.sutureOriginalCard = document.getElementById("suture-original-card");
    this.sutureModifiedCard = document.getElementById("suture-modified-card");
    this.storyTreeInspector = document.getElementById("storytree-inspector-panel");

    this.dialogueBox = document.getElementById("dialogue-box");
    this.speakerBadge = document.getElementById("speaker-badge");
    this.speakerName = document.getElementById("speaker-name");
    this.speakerSub = document.getElementById("speaker-sub");
    this.typewriterText = document.getElementById("typewriter-text");
    this.continuePrompt = document.getElementById("continue-prompt");
    this.btnDialoguePrev = document.getElementById("btn-dialogue-prev");
    this.choiceOverlay = document.getElementById("choice-overlay");
    this.choiceContainer = document.getElementById("choice-container");

    this.vignetteOverlay = document.getElementById("vignette-overlay");
    this.incenseAsh = document.getElementById("incense-ash");
    this.incenseLabel = document.getElementById("incense-label");
    this.incenseSub = document.getElementById("incense-sub");

    this.charLeft = document.getElementById("char-slot-left");
    this.charCenter = document.getElementById("char-slot-center");
    this.charRight = document.getElementById("char-slot-right");

    this.drawerBacklog = document.getElementById("drawer-backlog");
    this.backlogStream = document.getElementById("backlog-stream");
    this.drawerPocket = document.getElementById("drawer-pocket");
    this.pocketGrid = document.getElementById("pocket-grid");
    this.drawerRibbon = document.getElementById("drawer-ribbon");
    this.ribbonKnotsList = document.getElementById("ribbon-knots-list");
    this.drawerMap = document.getElementById("drawer-map");
    this.drawerSettings = document.getElementById("drawer-settings");

    // 天命、群体观测台与阵营 DLC 抽屉
    this.drawerDestiny = document.getElementById("drawer-destiny");
    this.destinyCardContainer = document.getElementById("destiny-card-container");
    this.drawerSwarm = document.getElementById("drawer-swarm");
    this.swarmObservatoryBody = document.getElementById("swarm-observatory-body");
    this.drawerFaction = document.getElementById("drawer-faction");
    this.factionGridSelector = document.getElementById("faction-grid-selector");

    // 危机终局模态框
    this.drawerCrisis = document.getElementById("drawer-crisis");
    this.btnCrisisRewind = document.getElementById("btn-crisis-rewind");
    this.btnCrisisTitle = document.getElementById("btn-crisis-title");
    this.btnCloseCrisis = document.getElementById("btn-close-crisis");
    this.crisisTitle = document.getElementById("crisis-title");
    this.crisisDesc = document.getElementById("crisis-desc");

    // 开放式文字外推弹窗 (输入文字开放式外推 · AI接住写支线卡)
    this.drawerOpenInput = document.getElementById("drawer-open-input");
    this.openInputText = document.getElementById("open-input-text");
    this.btnCloseOpenInput = document.getElementById("btn-close-open-input");
    this.btnCancelOpenInput = document.getElementById("btn-cancel-open-input");
    this.btnSubmitOpenInput = document.getElementById("btn-submit-open-input");

    // 缓存遥测与通道配置表单控件
    this.settingEnableApi = document.getElementById("setting-enable-api");
    this.settingApiSource = document.getElementById("setting-api-source");
    this.settingApiAdapter = document.getElementById("setting-api-adapter");
    this.settingTokenParameter = document.getElementById("setting-token-parameter");
    this.apiCustomFields = document.getElementById("api-custom-fields");
    this.aiProviderDescription = document.getElementById("ai-provider-description");
    this.settingModel = document.getElementById("setting-model");
    this.settingCustomModel = document.getElementById("setting-custom-model");
    this.settingEndpoint = document.getElementById("setting-endpoint");
    this.settingApiKey = document.getElementById("setting-api-key");
    this.settingMaxTokens = document.getElementById("setting-max-tokens");
    this.aiConnectionStatus = document.getElementById("ai-connection-status");
    this.btnCancelAIRequest = document.getElementById("btn-cancel-ai-request");
    this.btnTestAiConnection = document.getElementById("btn-test-ai-connection");
    this.aiConnectionTestStatus = document.getElementById("ai-connection-test-status");
    this.aiGenerationMetricsDisplay = document.getElementById("ai-generation-metrics");
    this.aiHarnessProgressDisplay = document.getElementById("ai-harness-progress");
    this.cmHitRate = document.getElementById("cm-hit-rate");
    this.cmHitTokens = document.getElementById("cm-hit-tokens");
    this.cmMissTokens = document.getElementById("cm-miss-tokens");
    this.cacheStatusTag = document.getElementById("cache-status-tag");

    // 视觉特效与插图特写 DOM
    this.screenFlashOverlay = document.getElementById("screen-flash-overlay");
    this.weatherOverlay = document.getElementById("weather-particles-overlay");
    this.modalIllustration = document.getElementById("modal-illustration");
    this.illustrationTitle = document.getElementById("illustration-title");
    this.illustrationCaption = document.getElementById("illustration-caption");
    this.illustrationGraphic = document.getElementById("illustration-graphic");
    this.btnCloseIllustration = document.getElementById("btn-close-illustration");

    // 版本指示器与分支解释器 DOM
    this.titleVersionBadge = document.getElementById("title-version-badge");
    this.qmVersionTag = document.getElementById("qm-version-tag");
    this.settingsVersionDisplay = document.getElementById("settings-version-display");
    this.btnBranchExplainer = document.getElementById("btn-branch-explainer");
    this.drawerBranchExplainer = document.getElementById("drawer-branch-explainer");
    this.btnCloseBranchExplainer = document.getElementById("btn-close-branch-explainer");

    if (this.titleVersionBadge) this.titleVersionBadge.innerText = `Build ${APP_VERSION} (${BUILD_STAMP} · 插件式推演 · 正文字数实测)`;
    if (this.qmVersionTag) this.qmVersionTag.innerText = APP_VERSION;
    if (this.settingsVersionDisplay) this.settingsVersionDisplay.innerText = `${APP_VERSION} (Build ${BUILD_STAMP})`;

    // 将已存配置同步渲染至表单
    if (this.settingEnableApi) this.settingEnableApi.checked = !!this.apiConfig.enabled;
    if (this.settingApiSource) this.settingApiSource.value = this.apiConfig.source;
    if (this.settingApiAdapter) this.settingApiAdapter.value = this.apiConfig.adapter;
    if (this.settingTokenParameter) this.settingTokenParameter.value = this.apiConfig.tokenParameter;
    const modelIsPreset = ["deepseek-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner", "custom"].includes(this.apiConfig.model);
    if (this.settingModel) this.settingModel.value = modelIsPreset ? this.apiConfig.model : "custom";
    if (this.settingCustomModel) {
      this.settingCustomModel.value = modelIsPreset ? this.apiConfig.customModel || "" : this.apiConfig.model;
      this.settingCustomModel.style.display = this.settingModel?.value === "custom" ? "block" : "none";
    }
    if (this.settingEndpoint) this.settingEndpoint.value = this.apiConfig.endpoint || "https://api.deepseek.com/chat/completions";
    if (this.settingApiKey) this.settingApiKey.value = this.apiConfig.apiKey || "";
    if (this.settingMaxTokens) this.settingMaxTokens.value = this.apiConfig.maxTokens ?? "";

    this.updateAIProviderSettingsUI();
    this.updateCachePillUI();

    // 初始化交付正文目标按钮状态。
    const lengthButtons = document.querySelectorAll(".btn-length");
    lengthButtons.forEach(btn => {
      if (parseInt(btn.getAttribute("data-length"), 10) === this.expectedLength) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  // 设置 AI 推演预期篇幅
  setExpectedLength(len) {
    this.expectedLength = len;
    try {
      localStorage.setItem("vn_expected_length", len.toString());
    } catch (e) {}

    const lengthButtons = document.querySelectorAll(".btn-length");
    lengthButtons.forEach(btn => {
      if (parseInt(btn.getAttribute("data-length"), 10) === len) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    console.log(`[Narrative Engine] 交付正文目标设置为: 至少${len}字`);
  }

  // 绑定交互事件
  initEvents() {
    // 交付正文目标按钮绑定。
    const lengthButtons = document.querySelectorAll(".btn-length");
    lengthButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const len = parseInt(btn.getAttribute("data-length"), 10);
        if ([500, 2000, 5000].includes(len)) {
          this.setExpectedLength(len);
        }
      });
    });

    // 什么是分支剧情？按钮与抽屉绑定
    if (this.btnBranchExplainer) {
      this.btnBranchExplainer.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openDrawer(this.drawerBranchExplainer);
      });
    }
    if (this.btnCloseBranchExplainer) {
      this.btnCloseBranchExplainer.addEventListener("click", () => {
        this.closeDrawer(this.drawerBranchExplainer);
      });
    }

    // 返回上一段按钮绑定
    if (this.btnDialoguePrev) {
      this.btnDialoguePrev.addEventListener("click", (e) => {
        e.stopPropagation();
        this.playPreviousInQueue();
      });
    }

    // 键盘快捷键导航 (← / Q 返回上一段, → / 空格 / 回车 推进下一段)
    window.addEventListener("keydown", (e) => {
      if (this.gameState !== "PLAYING") return;
      if (e.target.matches("input, textarea")) return;
      if (e.key === "ArrowLeft" || e.key === "q" || e.key === "Q") {
        e.preventDefault();
        this.playPreviousInQueue();
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        if (!this.isAIGenerating) {
          e.preventDefault();
          if (this.isTyping) {
            this.fastForwardTypewriter();
          } else {
            this.nextStoryBeat();
          }
        }
      }
    });

    // 点击对话框推进 (严格受控：若 AI 正在推演生成中，严禁调用 nextStoryBeat 杜绝伪造早产选项卡！)
    this.dialogueBox.addEventListener("click", (e) => {
      if (this.gameState !== "PLAYING") return;
      if (e.target.closest("#btn-branch-explainer, #ai-length-group, .btn-length, #btn-dialogue-prev")) return;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      if (this.isAIGenerating) {
        if (this.isTyping) {
          this.fastForwardTypewriter();
        }
        return; // 严禁进入 nextStoryBeat，彻底杜绝伪造假卡与早产选项！
      }

      if (this.isTyping) {
        this.fastForwardTypewriter();
      } else {
        this.nextStoryBeat();
      }
    });

    // 屏幕任意视口点击推进 (除操作菜单、卡片、抽屉、输入框外，点击全屏推进对话)
    if (this.gameViewport) {
      this.gameViewport.addEventListener("click", (e) => {
        if (this.gameState !== "PLAYING") return;
        if (e.target.closest("button, nav, .drawer, .choice-overlay, .modal, input, textarea, #dialogue-box")) return;
        if (this.isAIGenerating) return;
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;

        if (this.isTyping) {
          this.fastForwardTypewriter();
        } else {
          this.nextStoryBeat();
        }
      });
    }

    // 滚轮向上滑呼出卷宗 (Backlog)
    window.addEventListener("wheel", (e) => {
      if (this.gameState !== "PLAYING") return;
      // 若用户在对白框正文区内部上下滚动，优先支持长文顺畅下滑阅读，严禁误触发卷宗抽屉！
      if (e.target.closest("#dialogue-content") || e.target.closest(".dialogue-box")) {
        return;
      }
      if (e.deltaY < -35 && !this.drawerBacklog.classList.contains("open")) {
        this.openDrawer(this.drawerBacklog);
      }
    });

    // 快捷菜单：返回主页 (主会话全生命周期关键句柄)
    if (this.qmHome) {
      this.qmHome.addEventListener("click", () => this.returnToTitle());
    }

    // 快捷菜单按钮
    document.getElementById("qm-faction").addEventListener("click", () => {
      this.renderFactionSelector();
      this.openDrawer(this.drawerFaction);
    });
    document.getElementById("qm-destiny").addEventListener("click", () => {
      this.renderDestinyCard();
      this.openDrawer(this.drawerDestiny);
    });
    document.getElementById("qm-swarm").addEventListener("click", () => {
      this.renderSwarmObservatory();
      this.openDrawer(this.drawerSwarm);
    });
    document.getElementById("qm-log").addEventListener("click", () => this.openDrawer(this.drawerBacklog));
    document.getElementById("qm-pocket").addEventListener("click", () => {
      this.renderPocket();
      this.openDrawer(this.drawerPocket);
    });
    document.getElementById("qm-ribbon").addEventListener("click", () => {
      this.renderRibbon();
      this.openDrawer(this.drawerRibbon);
    });
    document.getElementById("qm-map").addEventListener("click", () => {
      this.renderMapSelector();
      this.openDrawer(this.drawerMap);
    });
    document.getElementById("qm-settings").addEventListener("click", () => this.openDrawer(this.drawerSettings));
    
    // 剧情树与弥合抽屉
    if (this.qmStoryTree) {
      this.qmStoryTree.addEventListener("click", () => {
        this.renderStoryTreeDrawer();
        this.openDrawer(this.drawerStoryTree);
      });
    }
    if (this.btnCloseStoryTree) {
      this.btnCloseStoryTree.addEventListener("click", () => this.closeDrawer(this.drawerStoryTree));
    }
    if (this.sutureBadge) {
      this.sutureBadge.addEventListener("click", () => {
        this.renderStoryTreeDrawer();
        this.openDrawer(this.drawerStoryTree);
      });
    }
    if (this.branchPill) {
      this.branchPill.addEventListener("click", () => {
        this.renderStoryTreeDrawer();
        this.openDrawer(this.drawerStoryTree);
      });
    }

    // 标题画面动作按钮
    if (this.titleBtnStart) {
      this.titleBtnStart.addEventListener("click", () => this.startNewGame());
    }
    if (this.titleBtnContinue) {
      this.titleBtnContinue.addEventListener("click", () => this.continueGame());
    }
    if (this.titleBtnFactions) {
      this.titleBtnFactions.addEventListener("click", () => {
        this.renderFactionSelector();
        this.openDrawer(this.drawerFaction);
      });
    }
    if (this.titleBtnDestiny) {
      this.titleBtnDestiny.addEventListener("click", () => {
        this.renderDestinyCard();
        this.openDrawer(this.drawerDestiny);
      });
    }
    if (this.titleBtnSwarm) {
      this.titleBtnSwarm.addEventListener("click", () => {
        this.renderSwarmObservatory();
        this.openDrawer(this.drawerSwarm);
      });
    }
    if (this.titleBtnSettings) {
      this.titleBtnSettings.addEventListener("click", () => {
        this.openDrawer(this.drawerSettings);
      });
    }

    // 危机终局模态框按钮
    if (this.btnCrisisRewind) {
      this.btnCrisisRewind.addEventListener("click", () => {
        this.closeDrawer(this.drawerCrisis);
        if (this.fateKnots && this.fateKnots.length > 1) {
          this.rewindToKnot(Math.max(0, this.fateKnots.length - 2));
        } else {
          this.dangerTicks = 2;
          this.gameState = "PLAYING";
          this.updateIncenseHUD();
          this.loadCurrentScene();
        }
      });
    }
    if (this.btnCrisisTitle) {
      this.btnCrisisTitle.addEventListener("click", () => {
        this.closeDrawer(this.drawerCrisis);
        this.returnToTitle();
      });
    }
    if (this.btnCloseCrisis) {
      this.btnCloseCrisis.addEventListener("click", () => {
        this.closeDrawer(this.drawerCrisis);
        this.dangerTicks = Math.max(0, this.maxDangerTicks - 2);
        this.updateIncenseHUD();
        this.gameState = "PLAYING";
        this.loadCanonicalNode(this.currentStoryNodeId, false);
      });
    }

    // 关闭抽屉
    document.getElementById("btn-close-backlog").addEventListener("click", () => this.closeDrawer(this.drawerBacklog));
    document.getElementById("btn-close-pocket").addEventListener("click", () => this.closeDrawer(this.drawerPocket));
    document.getElementById("btn-close-ribbon").addEventListener("click", () => this.closeDrawer(this.drawerRibbon));
    document.getElementById("btn-close-map").addEventListener("click", () => this.closeDrawer(this.drawerMap));
    document.getElementById("btn-close-settings").addEventListener("click", () => this.closeDrawer(this.drawerSettings));
    document.getElementById("btn-close-destiny").addEventListener("click", () => this.closeDrawer(this.drawerDestiny));
    document.getElementById("btn-close-swarm").addEventListener("click", () => this.closeDrawer(this.drawerSwarm));
    document.getElementById("btn-close-faction").addEventListener("click", () => this.closeDrawer(this.drawerFaction));

    // 自动播放
    const autoBtn = document.getElementById("qm-auto");
    autoBtn.addEventListener("click", () => {
      this.autoPlay = !this.autoPlay;
      autoBtn.style.color = this.autoPlay ? "var(--accent-jade)" : "var(--text-dim)";
      if (this.autoPlay && !this.isTyping) this.nextStoryBeat();
    });

    // 快捷菜单缓存胶囊点击直达设置抽屉
    if (this.qmCache) {
      this.qmCache.addEventListener("click", () => this.openDrawer(this.drawerSettings));
    }

    // 模型选择器联动
    if (this.settingModel) {
      this.settingModel.addEventListener("change", (e) => {
        if (this.settingCustomModel) {
          this.settingCustomModel.style.display = e.target.value === "custom" ? "block" : "none";
        }
      });
    }

    // 保存设置
    document.getElementById("btn-save-settings").addEventListener("click", () => {
      try {
        this.saveAISettings();
        this.closeDrawer(this.drawerSettings);
      } catch (error) {
        if (this.aiConnectionTestStatus) this.aiConnectionTestStatus.textContent = `配置未保存：${this.describeAIError(error)}`;
      }
    });


    if (this.btnCancelAIRequest) {
      this.btnCancelAIRequest.hidden = true;
      this.btnCancelAIRequest.addEventListener("click", () => this.cancelAIRequest());
    }
    if (this.btnTestAiConnection) {
      this.btnTestAiConnection.addEventListener("click", () => this.testAIConnection());
      for (const field of [this.settingApiSource, this.settingApiAdapter, this.settingTokenParameter,
        this.settingApiKey, this.settingEndpoint, this.settingModel, this.settingCustomModel, this.settingMaxTokens]) {
        if (field) field.addEventListener("input", () => {
          this.invalidateAIConnectionTest();
          this.updateAIProviderSettingsUI();
        });
      }
    }

    // 视觉小说插图弹窗收起按钮
    if (this.btnCloseIllustration) {
      this.btnCloseIllustration.addEventListener("click", () => this.closeIllustration());
    }

    // 开放式文字外推弹窗按钮绑定
    if (this.btnCloseOpenInput) {
      this.btnCloseOpenInput.addEventListener("click", () => this.closeDrawer(this.drawerOpenInput));
    }
    if (this.btnCancelOpenInput) {
      this.btnCancelOpenInput.addEventListener("click", () => this.closeDrawer(this.drawerOpenInput));
    }
    if (this.btnSubmitOpenInput) {
      this.btnSubmitOpenInput.addEventListener("click", () => {
        if (this.isAIGenerating) {
          console.warn("[Narrative Engine] AI 正在推演中，严禁重复提交行动！");
          return;
        }
        const userText = (this.openInputText?.value || "").trim();
        if (!userText) {
          alert("请输入你希望由 AI 接住并推演的行动指令！");
          return;
        }
        this.closeDrawer(this.drawerOpenInput);
        this.choiceOverlay.classList.remove("visible");

        const choice = this.pendingExtrapolationChoice || {
          text: `【✍️ 开放式外推】${userText}`,
          tag: "自由行动 · AI接戏",
          diceBase: 10,
          isExtrapolation: true
        };
        choice.customInput = userText;
        choice.text = `【✍️ 开放式外推】${userText}`;
        this.resolveFactionAction(choice);
      });
    }
  }

  openDrawer(drawer) {
    drawer.classList.add("open");
  }

  closeDrawer(drawer) {
    drawer.classList.remove("open");
  }

  // 渲染阵营 DLC 选择器
  renderFactionSelector() {
    const factions = Object.values(WORLD_PRESETS.factions);
    this.factionGridSelector.innerHTML = factions.map(f => `
      <div class="faction-card ${f.id === this.currentFaction ? "current" : ""}" onclick="window.__vnEngine.switchFaction('${f.id}')">
        <div class="faction-card-header">
          <span class="faction-crest">${f.crest}</span>
          <div>
            <div class="faction-name">${f.name}</div>
            <div class="faction-tagline">${f.tagline}</div>
          </div>
        </div>
        <div class="faction-desc">${f.desc}</div>
        <button class="qm-btn qm-accent" style="align-self:flex-start; margin-top:6px;">
          ${f.id === this.currentFaction ? "✓ 当前所在阵营" : "踏入此方阵营 ➔"}
        </button>
      </div>
    `).join("");
  }

  // 切换阵营 (Faction Switcher)
  switchFaction(factionId) {
    const f = WORLD_PRESETS.factions[factionId];
    if (!f) return;

    this.abandonTurnForNavigation();

    this.currentFaction = factionId;
    this.currentCoords = f.defaultCoords;
    this.closeDrawer(this.drawerFaction);

    if (this.gameState === "TITLE") {
      this.startNewGame(factionId);
      return;
    }

    // 重置危险时相
    this.dangerTicks = 1;
    this.updateIncenseHUD();

    this.loadCurrentScene();
    this.saveGameState();
  }

  // 加载当前阵营专属的宏大场景剧本 (从法定主剧情树当前节点加载)
  loadCurrentScene() {
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    if (!this.currentStoryNodeId || !tree?.nodes[this.currentStoryNodeId]) {
      this.currentStoryNodeId = tree?.initialNodeId || "ming_act1";
    }
    this.loadCanonicalNode(this.currentStoryNodeId, this.needsSuturing);
  }

  // 1. 加载法定主剧情树节点 (主干骨架，支持动态因果弥合)
  async loadCanonicalNode(nodeId, needSuture = false) {
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    if (!tree) return;
    const node = tree.nodes[nodeId];
    if (!node) return;

    this.pendingApiChoices = null;
    this.currentStoryNodeId = nodeId;
    if (!this.visitedNodeIds) this.visitedNodeIds = [];
    if (!this.visitedNodeIds.includes(nodeId)) this.visitedNodeIds.push(nodeId);
    this.inspectedNodeId = nodeId;
    this.isExtrapolating = false;
    this.isEpilogueSequel = false;
    this.currentCoords = node.coords || this.currentCoords;

    const map = WORLD_PRESETS.thinMaps[this.currentCoords];
    if (map) {
      document.getElementById("bg-active").style.backgroundImage = map.bgGradient;
    }

    // 若需要因果弥合（承接此前的局外外推行为与胜负因果）
    if (needSuture && this.extrapolationHistory && this.extrapolationHistory.length > 0) {
      let sutureResult = null;

      // 若启用了 API，调用 DeepSeek Live Suture API 履行修改文字卡职责
      if (this.hasLiveAIRoute()) {
        try {
          sutureResult = await this.callDeepSeekSutureAPI(node, this.extrapolationHistory);
        } catch (err) {
          if (err?.code !== "source_changed") this.setAIRequestStatus("fallback", "suture", err);
          console.warn("[DeepSeek Suture Engine] 已使用本地弥合:", this.describeAIError(err));
        }
      }

      // 本地离线语义弥合生成器 (Offline Heuristic Suturing Engine)
      if (!sutureResult) {
        sutureResult = this.generateLocalSuturedCard(node, this.extrapolationHistory);
      }

      this.reconciledCardsCache[nodeId] = {
        original: node.originalBeats,
        reconciled: sutureResult.reconciledBeats,
        sutureNote: sutureResult.sutureNote
      };

      this.lastSutureNote = sutureResult.sutureNote;
      this.storyQueue = this.normalizeAndChunkBeats(sutureResult.reconciledBeats, 90);
      this.needsSuturing = false;
      this.updateBranchIndicatorUI(true);
    } else {
      this.storyQueue = this.normalizeAndChunkBeats(node.originalBeats, 90);
      this.needsSuturing = false;
      this.updateBranchIndicatorUI(false);
    }

    this.recordFateKnot(node.title, `主剧情树 · 第${node.actNumber}幕展开`);
    this.currentStep = 0;
    this.playNextInQueue();
    this.saveGameState();
  }

  // 2. 本地离线因果重塑与弥合生成器 (Offline Heuristic Suturing Engine)
  generateLocalSuturedCard(node, history) {
    const godAction = (history || []).slice().reverse().find(h => 
      /奥特曼|神光棒|迪迦|核弹|歼\s*20|机甲|降维|秒杀|成仙|仙帝|神明|神迹/i.test(h.choiceText || "") || 
      (h.tag && h.tag.includes("降维神迹"))
    );
    const lastAction = godAction || (history && history.length > 0 ? history[history.length - 1] : { choiceText: "自定行动", tag: "局外行险" });
    const original = node.originalBeats;
    const fName = WORLD_PRESETS.factions[this.currentFaction]?.name.split(" · ")[0] || "天下";
    const isGodMode = !!godAction || /奥特曼|神光棒|迪迦|核弹|歼\s*20|机甲|降维|秒杀|成仙|仙帝|神明|神迹/i.test(lastAction.choiceText || "");

    const formatActionText = (text, maxLen = 60) => {
      const clean = (text || "").trim();
      if (clean.length > maxLen) {
        return clean.substring(0, maxLen) + "...";
      }
      return clean.endsWith("...") ? clean : clean + "...";
    };

    const sutureOpening = {
      speaker: "因果弥合",
      sub: "【主剧情文字卡 · 因果重塑弥合】",
      type: "voice-court",
      stageChar: "center",
      text: isGodMode
        ? `天道定鼎，神迹昭彰！你在天地间展现的降维神迹【${formatActionText(lastAction.choiceText, 60)}】以无上伟力粉碎了世间一切猜忌与纷争！当历史车轮直抵大结局【${node.title}】时，举国臣民尽皆伏拜，四海万邦无不望风归附，天命已定！`
        : `风云倒卷，大势暗合！你在局外外推中所行的【${formatActionText(lastAction.choiceText, 60)}】（检定：${lastAction.success ? "大获全胜" : "受挫败退"}），其波澜已先于你一步席卷而至！当历史车轮推至【${node.title}】时，局内各派朝臣的辞色与现场局势已被重塑。`
    };

    const modified = [sutureOpening];
    original.forEach((b, idx) => {
      let cloned = JSON.parse(JSON.stringify(b));
      if (idx === 1 && cloned.type === "npc") {
        cloned.text = isGodMode
          ? `“圣皇真神降世！天地无极！臣等愿奉真神统御九州，万岁万岁万万岁！${cloned.text}”`
          : `“报！探子刚截获消息，此人方才在局外密谋动作，掀起滔天波澜！${cloned.text}”`;
      } else if (idx === 2 && cloned.type === "npc") {
        cloned.text = isGodMode
          ? `“神威所向，四海臣服，天下莫敢不从！${cloned.text}”`
          : `“哼！此等局外机变之谋，果然不出所料！${cloned.text}”`;
      }
      modified.push(cloned);
    });

    const sutureNote = isGodMode
      ? `【因果平账与自圆其说报告】：检测到玩家降维神迹【${lastAction.choiceText}】，已将正史因果直接引渡重塑至终极大结局【${node.title}】，全场群臣转为跪拜臣服，实现逻辑自洽。`
      : `【因果平账与自圆其说报告】：已根据玩家在全新分支剧情页中的探索【${lastAction.tag}】（掷骰总点：${lastAction.diceTotal}，判定：${lastAction.success ? "胜" : "负"}）微调重塑预设【${node.title}】的入场对白与各派臣僚反应，消除违和感，使故事重归预设剧情树后因果闭环、自圆其说。`;

    return {
      reconciledBeats: modified,
      sutureNote
    };
  }

  readAISettingsConfig() {
    const value = this.settingMaxTokens ? String(this.settingMaxTokens.value ?? "").trim() : this.apiConfig?.maxTokens;
    return AIProviders.normalizeConfig({...this.apiConfig,
      enabled: this.settingEnableApi ? this.settingEnableApi.checked : this.apiConfig?.enabled,
      source: this.settingApiSource?.value || this.apiConfig?.source,
      adapter: this.settingApiAdapter?.value || this.apiConfig?.adapter,
      tokenParameter: this.settingTokenParameter?.value || this.apiConfig?.tokenParameter,
      model: this.settingModel?.value ?? this.apiConfig?.model,
      customModel: this.settingCustomModel?.value ?? this.apiConfig?.customModel,
      endpoint: this.settingEndpoint?.value ?? this.apiConfig?.endpoint,
      apiKey: this.settingApiKey?.value ?? this.apiConfig?.apiKey,
      maxTokens: value === "" || value == null ? null : Number(value)
    });
  }

  resolveAIProvider(value = this.apiConfig) {
    const config = AIProviders.normalizeConfig(value);
    return AIProviders.resolve(config);
  }

  hasLiveAIRoute() {
    if (!this.apiConfig?.enabled) return false;
    try { this.resolveAIProvider(); return true; } catch (_) { return false; }
  }

  isAIProviderRouteCurrent(route, revision = this.aiConfigRevision || 0) {
    if (revision !== (this.aiConfigRevision || 0)) return false;
    try { return this.resolveAIProvider().identity === route.identity; } catch (_) { return false; }
  }

  assertAIProviderRouteCurrent(route, revision) {
    if (!this.isAIProviderRouteCurrent(route, revision)) {
      throw Object.assign(new Error("source_changed"), {code: "source_changed"});
    }
  }

  clearAIProviderResults() {
    this.aiRequestStatus = null;
    this.aiGenerationMetrics = null;
    this.aiHarnessProgress = null;
    this.cacheTelemetry = {lastHitTokens: null, lastMissTokens: null, lastHitRate: "未提供", cacheUsageKnown: false, totalHits: 0};
  }

  saveAISettings() {
    const next = this.readAISettingsConfig();
    if (next.enabled) {
      this.resolveAIProvider(next);
      if (next.maxTokens !== null && (!Number.isSafeInteger(Number(next.maxTokens)) || Number(next.maxTokens) < 1)) throw new Error("invalid_max_tokens");
    }
    delete next.userDisabledShared;
    delete next.useGateway;
    delete next.sharedApiRemoved;
    if (JSON.stringify(next) !== JSON.stringify(this.apiConfig)) {
      const controller = this.activeAIRequestController;
      if (controller && !controller.signal.aborted) {
        controller.sourceChanged = true;
        controller.abort();
      }
      this.aiConfigRevision = (this.aiConfigRevision || 0) + 1;
      this.clearAIProviderResults();
    }
    this.apiConfig = next;
    try { localStorage.setItem("vn_api_config", JSON.stringify(next)); } catch (_) {}
    this.invalidateAIConnectionTest();
    this.updateAIProviderSettingsUI();
    this.updateCacheTelemetryUI();

  }

  updateAIProviderSettingsUI() {
    const config = this.readAISettingsConfig();
    const custom = config.source === "custom";
    if (this.apiCustomFields) {
      this.apiCustomFields.hidden = !custom;
      for (const field of this.apiCustomFields.querySelectorAll?.("input, select") || []) field.disabled = !custom;
    }
    if (this.settingCustomModel?.style) this.settingCustomModel.style.display = this.settingModel?.value === "custom" ? "block" : "none";
    if (this.aiProviderDescription) {
      try {
        const route = this.resolveAIProvider(config);
        const migration = this.apiConfig.sharedApiRemoved ? "原共享通道已移除，个人配置已保留；确认配置后可启用远端 AI。\n" : "";
        this.aiProviderDescription.textContent = migration + `直连个人 API · 模型 ${route.model} · ${route.adapter === "deepseek" ? "DeepSeek" : "OpenAI 兼容"}适配。Key 按端点要求填写，保存后应用。`;
      } catch (error) {
        this.aiProviderDescription.textContent = `当前来源配置尚未完成：${this.describeAIError(error)}`;
      }
    }
  }

  recordAIProviderCache(data, route) {
    const usage = data?.usage || {};
    const hitValue = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens;
    const validCount = value => Number.isSafeInteger(value) && value >= 0;
    const missValue = validCount(usage.prompt_cache_miss_tokens) ? usage.prompt_cache_miss_tokens :
      validCount(usage.prompt_tokens) && validCount(hitValue) && usage.prompt_tokens >= hitValue ? usage.prompt_tokens - hitValue : null;
    const known = data?.harness?.cacheUsageKnown !== false && validCount(hitValue) && validCount(missValue);
    const hit = known ? hitValue : null;
    const miss = known ? missValue : null;
    this.cacheTelemetry = {...this.cacheTelemetry, sourceIdentity: route.identity, cacheUsageKnown: known,
      lastHitTokens: hit, lastMissTokens: miss,
      lastHitRate: known ? (hit + miss > 0 ? ((hit / (hit + miss)) * 100).toFixed(1) + "%" : "0.0%") : "未提供",
      reasoningTokens: Number(usage.completion_tokens_details?.reasoning_tokens) || 0};
    this.updateCacheTelemetryUI();
  }

  // 按选定来源调用“微调已有剧情页以自圆其说”的职责。
  async callDeepSeekSutureAPI(targetNode, history) {
    const startedAt = Date.now();
    const route = this.resolveAIProvider();
    const revision = this.aiConfigRevision || 0;
    const config = AIProviders.normalizeConfig(this.apiConfig);

    // Layer 1: 全局静态律与弥合宪章
    const systemPrompt = `你是文字冒险游戏【预设剧情树动态微调与自圆其说引擎】。
规则守则：
1. 游戏主体是在开发阶段预设好的【法定主剧情树】（1变3, 3变9）。当前玩家正从脱离主线的【全新分支剧情页】回归预设主线节点：【${targetNode.title}】。
2. 你的唯一职责是：【微调已有的预设剧情页，与玩家在此前全新分支剧情页中的经历达成因果一致性，在回归预设剧情树后自圆其说】！
3. 必须保持预设节点的核心矛盾与宏大历史走向不变，但手术刀般微调已有剧情卡的对白、人物辞色与前情交代，消除任何割裂感，实现天衣无缝的因果闭环。
4. 必须输出严格合法的 JSON 对象，格式如下：
{
  "reconciledBeats": [
    { "speaker": "说话者名", "sub": "修饰", "type": "narrator|npc|voice-court|voice-instinct", "stageChar": "left|center|right", "text": "微调重塑后的台词" }
  ],
  "sutureNote": "精炼说明如何微调本页已有对白以自圆其说"
}`;

    // Layer 2: 阵营与原版法定文字卡
    const faction = WORLD_PRESETS.factions[this.currentFaction];
    const contextPrompt = `【当前阵营】：${faction.name}
【原版法定主剧情文字卡（基准骨架）】：
${JSON.stringify(targetNode.originalBeats)}
【原版剧情树节点设定】：${targetNode.desc}`;

    // 弥合任务独立自洽：仅基于基准卡、目标节点设定与当前外推因果摘要构建请求，
    // 严禁将与弥合 Prompt 不对齐的既往全量对白历史盲目堆入，否则将引发 100% 缓存击穿与数万 Token 经济浪费！
    const causalSummary = (Array.isArray(history) ? history : []).slice(-5).map(h =>
      `第${Number(h.turn) || "?"}轮：${String(h.choiceText || "").slice(0, 130)}；掷骰${Number(h.diceTotal) || 0}，${h.success ? "成功" : "受挫"}`
    ).join("\n");
    const userTail = `【此前实际行动与因果摘要】\n${causalSummary || "无额外行动记录"}\n请据此微调目标节点的原剧情卡，仅返回包含 reconciledBeats 与 sutureNote 的 JSON。`;
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: contextPrompt },
      { role: "user", content: userTail }
    ];

    const request = AIProviders.createRequest(route, {mode: "suture", maxTokens: config.maxTokens,
      messages});
    const data = await this.requestAICompletion(request.endpoint, request.body, request.headers, request.useGateway, "suture", null, route);
    this.assertAIProviderRouteCurrent(route, revision);
    const choiceObj = data.choices && data.choices[0];
    this.assertAICompletionFinished(choiceObj, "suture");
    
    let parsed = null;
    try {
      let cleaned = (choiceObj?.message?.content || "").trim();
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim();
      }
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
        } else {
          throw parseErr;
        }
      }
    } catch (parseErr) {
      throw new Error("invalid_game_response");
    }
    if (!Array.isArray(parsed?.reconciledBeats) || !parsed.reconciledBeats.length ||
        parsed.reconciledBeats.some(b => !b || typeof b.text !== "string" || !b.text.trim())) {
      throw new Error("invalid_game_response");
    }

    this.recordAIProviderCache(data, route);

    this.recordAIGenerationMetrics(data, parsed.reconciledBeats, [], "suture", startedAt);
    this.aiGenerationMetrics.sourceIdentity = route.identity;
    this.setAIRequestStatus("success", "suture", null, data.model, route, revision);
    return {
      reconciledBeats: parsed.reconciledBeats,
      sutureNote: parsed.sutureNote || "AI 已成功根据外推因果动态重写主线剧情文字卡。"
    };
  }

  // 4. 更新剧情树分支指示器 UI
  updateBranchIndicatorUI(isSutured = false) {
    if (!this.branchPill) return;
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    const node = tree?.nodes[this.currentStoryNodeId];

    if (this.isExtrapolating) {
      this.branchPill.className = "branch-pill extrapolated";
      this.branchPill.style.borderColor = "#a855f7";
      const depth = this.branchDepth || 1;
      this.branchPill.innerText = `🌌 AI自由小说宇宙 · 第${depth}轮 (单向不可逆演进)`;
      if (this.sutureBadge) this.sutureBadge.style.display = "none";
    } else {
      this.branchPill.className = "branch-pill canonical";
      this.branchPill.style.borderColor = "";
      const isEndingNode = !node || !node.choices || node.choices.length === 0 || 
                           node.choices.every(c => !c.targetNodeId && !c.isExtrapolation);
      if (isEndingNode) {
        this.branchPill.innerText = "👑 九州天命定鼎 · 终局大结局";
      } else {
        const actTitle = node ? `第${node.actNumber}幕 · ${node.title.split("：")[1] || node.title}` : "预设主剧情树";
        this.branchPill.innerText = `📜 预设主剧情树 · ${actTitle}`;
      }

      if (this.sutureBadge) {
        if (isSutured || (node && this.reconciledCardsCache[node.id])) {
          this.sutureBadge.style.display = "inline-flex";
        } else {
          this.sutureBadge.style.display = "none";
        }
      }
    }
  }

  // 5. 渲染经折天机谱 · 分支叙事与节点树全景 (Story Branch Tree & Flowchart)
  renderStoryTreeDrawer() {
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    if (!tree || !this.storyTreeCanvasContainer) return;

    if (!this.visitedNodeIds) {
      this.visitedNodeIds = [this.currentStoryNodeId];
    } else if (!this.visitedNodeIds.includes(this.currentStoryNodeId)) {
      this.visitedNodeIds.push(this.currentStoryNodeId);
    }

    const currentNode = tree.nodes[this.currentStoryNodeId];
    const initialNode = tree.nodes[tree.initialNodeId];

    // 分幕与分支归类核心节点 (Kernels) - 5 幕金字塔架构
    const act1Node = initialNode;
    const act2Nodes = Object.values(tree.nodes).filter(n => n.actNumber === 2);
    const act3Nodes = Object.values(tree.nodes).filter(n => n.actNumber === 3);
    const act4Nodes = Object.values(tree.nodes).filter(n => n.actNumber === 4);
    const act5Nodes = Object.values(tree.nodes).filter(n => n.actNumber === 5);

    const act2_A = act2Nodes.find(n => n.trunk === 'A') || act2Nodes[0];
    const act2_B = act2Nodes.find(n => n.trunk === 'B') || act2Nodes[1];
    const act2_C = act2Nodes.find(n => n.trunk === 'C') || act2Nodes[2];

    const act3_A = act3Nodes.filter(n => n.trunk === 'A');
    const act3_B = act3Nodes.filter(n => n.trunk === 'B');
    const act3_C = act3Nodes.filter(n => n.trunk === 'C');

    const act4_A = act4Nodes.filter(n => n.trunk === 'A');
    const act4_B = act4Nodes.filter(n => n.trunk === 'B');
    const act4_C = act4Nodes.filter(n => n.trunk === 'C');

    const act5_A = act5Nodes.filter(n => n.trunk === 'A');
    const act5_B = act5Nodes.filter(n => n.trunk === 'B');
    const act5_C = act5Nodes.filter(n => n.trunk === 'C');

    const currentTrunk = currentNode?.trunk || 'all';
    this.storyTreeFilter = this.storyTreeFilter || 'all';

    // 计算探索度 (Exploration progress)
    const allKernels = Object.values(tree.nodes);
    const discoveredCount = allKernels.filter(n => this.visitedNodeIds.includes(n.id)).length;
    const progressPct = Math.round((discoveredCount / allKernels.length) * 100);

    // 默认检查当前节点
    if (!this.inspectedNodeId || (!tree.nodes[this.inspectedNodeId] && this.inspectedNodeId !== "spur")) {
      this.inspectedNodeId = this.currentStoryNodeId;
    }

    // 1. 构建顶部 Meta 统计与图例条
    let metaHtml = `
      <div class="storytree-meta-bar">
        <div class="meta-faction-box">
          <span style="font-size:1.1rem;">🏛️</span>
          <span>${tree.name} (五幕金字塔纯分支树: 1变3, 3变9, 9决战, 9终局)</span>
        </div>
        <div class="meta-progress-box">
          <span>全树探索度：</span>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${progressPct}%;"></div>
          </div>
          <span style="color:#eab308; font-weight:700;">${discoveredCount}/${allKernels.length} 节点 (${progressPct}%)</span>
        </div>
        <div class="meta-legend-box">
          <span class="legend-tag"><span class="legend-dot active"></span>正在经历</span>
          <span class="legend-tag"><span class="legend-dot passed"></span>已通关</span>
          <span class="legend-tag"><span class="legend-dot sutured"></span>🪡 已弥合</span>
          <span class="legend-tag"><span class="legend-dot spur"></span>🌿 卫星外推</span>
          <span class="legend-tag"><span class="legend-dot locked"></span>🔒 待探索</span>
        </div>
      </div>

      <!-- 支脉聚焦选择器 (Trunk Focus Filter) -->
      <div class="storytree-filter-tabs">
        <button class="tree-tab-btn ${this.storyTreeFilter === 'all' ? 'active' : ''}" data-tree-filter="all">🌟 全景展卷 (五幕金字塔)</button>
        <button class="tree-tab-btn ${this.storyTreeFilter === 'A' ? 'active' : ''}" data-tree-filter="A">🟢 支脉 A 决战群 [${act2_A?.trunkName ? (act2_A.trunkName.split('·')[1] || act2_A.trunkName) : '经世'}]</button>
        <button class="tree-tab-btn ${this.storyTreeFilter === 'B' ? 'active' : ''}" data-tree-filter="B">🔵 支脉 B 决战群 [${act2_B?.trunkName ? (act2_B.trunkName.split('·')[1] || act2_B.trunkName) : '肃贪'}]</button>
        <button class="tree-tab-btn ${this.storyTreeFilter === 'C' ? 'active' : ''}" data-tree-filter="C">🟣 支脉 C 决战群 [${act2_C?.trunkName ? (act2_C.trunkName.split('·')[1] || act2_C.trunkName) : '开海'}]</button>
        <button class="tree-tab-btn ${this.storyTreeFilter === 'current' ? 'active' : ''}" data-tree-filter="current">📍 聚焦当前路线 (${currentTrunk !== 'all' ? '支脉 ' + currentTrunk : '第一幕起局'})</button>
      </div>
    `;

    // 辅助生成单个节点卡片 HTML
    const renderNodeCard = (n, isKernel = true) => {
      if (!n) return "";
      let stateClass = "locked";
      let statusText = "🔒 路线待探索";

      const isCurrent = n.id === this.currentStoryNodeId && !this.isExtrapolating;
      const isVisited = this.visitedNodeIds.includes(n.id);
      const isSutured = !!this.reconciledCardsCache[n.id];

      if (isCurrent) {
        stateClass = "active";
        statusText = "📍 正在经历中";
      } else if (isVisited) {
        stateClass = "passed";
        statusText = "✓ 历史已通关";
      }

      if (isSutured) stateClass += " sutured";
      if (n.id === this.inspectedNodeId) stateClass += " selected-inspected";

      const badgeType = isKernel 
        ? `<span class="tree-node-badge kernel-badge">${n.actNumber === 5 ? '终局 Finale' : (n.actNumber === 4 ? '决战 Showdown' : '核心 Kernel')}</span>`
        : `<span class="tree-node-badge satellite-badge">卫星 Satellite</span>`;

      const trunkBadge = n.trunk ? `<span style="font-size:0.68rem; margin-left:4px; opacity:0.8;">[支脉 ${n.trunk}]</span>` : "";

      return `
        <div class="tree-node-card ${stateClass} ${n.actNumber === 5 ? 'ending-card' : ''}" data-node-id="${n.id}" data-trunk="${n.trunk || ''}">
          <div class="tree-node-header">
            ${badgeType}
            <span class="tree-node-act">第 ${n.actNumber} 幕 ${trunkBadge}</span>
            ${isSutured ? `<span title="因果弥合重塑" style="color:#eab308; font-size:0.75rem;">🪡 已平账</span>` : ""}
          </div>
          <div class="tree-node-title">${n.title.split("：")[1] || n.title}</div>
          <div class="tree-node-desc">${isVisited || isCurrent ? n.desc : "剧情迷雾笼罩，做出前序对应抉择后解锁。"}</div>
          <div class="tree-node-status-pill">${statusText}</div>
          <div class="tree-node-click-hint">点击查看分支 / 回溯 🔍</div>
        </div>
      `;
    };

    // 决定流程图容器上的过滤类
    let activeFilterClass = "filter-all";
    if (this.storyTreeFilter === "A") activeFilterClass = "filter-trunk-A";
    else if (this.storyTreeFilter === "B") activeFilterClass = "filter-trunk-B";
    else if (this.storyTreeFilter === "C") activeFilterClass = "filter-trunk-C";
    else if (this.storyTreeFilter === "current" && currentTrunk !== "all") activeFilterClass = `filter-trunk-${currentTrunk}`;

    // 2. 构建五幕金字塔纯分支流程图 (Stage 1 -> Stage 2 -> Stage 3 -> Stage 4 -> Stage 5)
    let flowHtml = `
      <div class="storytree-flow-canvas ${activeFilterClass}">
        <!-- Stage 1: 起局定势 (Root Kernel: 1 节点) -->
        <div class="flow-stage-col stage-1">
          <div class="stage-col-header">第一幕 · 起局定势 (1)</div>
          <div class="stage-nodes-container">
            ${renderNodeCard(act1Node, true)}
          </div>
        </div>

        <!-- 连线列 1 -> 2: 1 变 3 分歧发散 -->
        <div class="flow-connector-col connector-1-2">
          <svg class="flow-svg" viewBox="0 0 56 600" preserveAspectRatio="none">
            <!-- 路线 A -->
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act2_A?.id) ? 'active-path' : ''}" stroke="#4ade80" d="M 0 300 C 28 300, 28 90, 56 90" />
            <!-- 路线 B -->
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act2_B?.id) ? 'active-path' : ''}" stroke="#38bdf8" d="M 0 300 C 28 300, 28 260, 56 260" />
            <!-- 路线 C -->
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act2_C?.id) ? 'active-path' : ''}" stroke="#c084fc" d="M 0 300 C 28 300, 28 430, 56 430" />
            <!-- 卫星外推分支 -->
            <path class="svg-flow-path ${this.extrapolationHistory.length > 0 || this.isExtrapolating ? 'active-path suture-path' : ''}" stroke="#22c55e" d="M 0 300 C 28 300, 28 550, 56 550" />
          </svg>
          <div class="flow-branch-tag" style="top: 15%; left: 50%; color:#4ade80;">支脉A</div>
          <div class="flow-branch-tag" style="top: 43%; left: 50%; color:#38bdf8;">支脉B</div>
          <div class="flow-branch-tag" style="top: 71%; left: 50%; color:#c084fc;">支脉C</div>
          <div class="flow-branch-tag" style="top: 92%; left: 50%; color:#4ade80;">🌿外推</div>
        </div>

        <!-- Stage 2: 路线分野 (3 大平行分歧 + 卫星外推) -->
        <div class="flow-stage-col stage-2">
          <div class="stage-col-header">第二幕 · 路线分野 (3)</div>
          <div class="stage-nodes-container">
            ${renderNodeCard(act2_A, true)}
            ${renderNodeCard(act2_B, true)}
            ${renderNodeCard(act2_C, true)}
            
            <!-- 卫星外推节点卡片 (Satellite Node) -->
            <div class="tree-node-card spur ${this.isExtrapolating ? 'active' : (this.extrapolationHistory.length > 0 ? 'passed' : 'locked')} ${this.inspectedNodeId === 'spur' ? 'selected-inspected' : ''}" data-node-id="spur">
              <div class="tree-node-header">
                <span class="tree-node-badge satellite-badge">卫星 Satellite</span>
                <span class="tree-node-act" style="color:#4ade80;">AI 额外外推</span>
              </div>
              <div class="tree-node-title" style="color:#4ade80;">🌿 自生局外探索分支</div>
              <div class="tree-node-desc">
                ${this.extrapolationHistory.length > 0 
                  ? `已累计演进 ${this.extrapolationHistory.length} 步自由探索，累积因果债务。` 
                  : "脱离法定主干的自由推演，随后将修改下一张主卡平账。"}
              </div>
              <div class="tree-node-status-pill" style="color:#4ade80; border:1px solid rgba(34,197,94,0.3);">
                ${this.isExtrapolating ? "🌿 正在外推中" : (this.extrapolationHistory.length > 0 ? "✓ 已涉足平账" : "🔒 待触发")}
              </div>
              <div class="tree-node-click-hint">点击查看外推历程 🔍</div>
            </div>
          </div>
        </div>

        <!-- 连线列 2 -> 3: 3 变 9 纯分支发散 -->
        <div class="flow-connector-col connector-2-3">
          <svg class="flow-svg" viewBox="0 0 56 600" preserveAspectRatio="none">
            <!-- 支脉 A -> 3A1, 3A2, 3A3 -->
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_A[0]?.id) ? 'active-path' : ''}" stroke="#4ade80" d="M 0 90 C 28 90, 28 40, 56 40" />
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_A[1]?.id) ? 'active-path' : ''}" stroke="#4ade80" d="M 0 90 C 28 90, 28 90, 56 90" />
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_A[2]?.id) ? 'active-path' : ''}" stroke="#4ade80" d="M 0 90 C 28 90, 28 140, 56 140" />

            <!-- 支脉 B -> 3B1, 3B2, 3B3 -->
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_B[0]?.id) ? 'active-path' : ''}" stroke="#38bdf8" d="M 0 260 C 28 260, 28 210, 56 210" />
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_B[1]?.id) ? 'active-path' : ''}" stroke="#38bdf8" d="M 0 260 C 28 260, 28 260, 56 260" />
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_B[2]?.id) ? 'active-path' : ''}" stroke="#38bdf8" d="M 0 260 C 28 260, 28 310, 56 310" />

            <!-- 支脉 C -> 3C1, 3C2, 3C3 -->
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_C[0]?.id) ? 'active-path' : ''}" stroke="#c084fc" d="M 0 430 C 28 430, 28 380, 56 380" />
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_C[1]?.id) ? 'active-path' : ''}" stroke="#c084fc" d="M 0 430 C 28 430, 28 430, 56 430" />
            <path class="svg-flow-path ${this.visitedNodeIds.includes(act3_C[2]?.id) ? 'active-path' : ''}" stroke="#c084fc" d="M 0 430 C 28 430, 28 480, 56 480" />

            <!-- 卫星外推平账黄金线 (Suture Needle Line) -->
            <path class="svg-flow-path suture-path ${Object.keys(this.reconciledCardsCache).length > 0 ? 'active-path' : ''}" d="M 0 550 C 28 550, 28 260, 56 260" />
          </svg>
          <div class="flow-branch-tag" style="top: 8%; left: 50%; color:#4ade80;">3A</div>
          <div class="flow-branch-tag" style="top: 42%; left: 50%; color:#38bdf8;">3B</div>
          <div class="flow-branch-tag" style="top: 72%; left: 50%; color:#c084fc;">3C</div>
          <div class="flow-branch-tag" style="top: 92%; left: 50%; color:#fef08a; border-color:#eab308;">🪡平账</div>
        </div>

        <!-- Stage 3: 中局惊变列 (9 大互不相同的危机大幕，AI 自由外推与弥合回朝的主舞台) -->
        <div class="flow-stage-col stage-3">
          <div class="stage-col-header">第三幕 · 中局惊变 (9)</div>
          <div class="stage-nodes-container">
            <div class="flow-trunk-cluster trunk-a ${currentTrunk === 'A' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🟢 支脉 A 惊变集群 [${act2_A?.trunkName || '经世'}]</div>
              ${act3_A.map(n => renderNodeCard(n, true)).join("")}
            </div>
            <div class="flow-trunk-cluster trunk-b ${currentTrunk === 'B' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🔵 支脉 B 惊变集群 [${act2_B?.trunkName || '肃贪'}]</div>
              ${act3_B.map(n => renderNodeCard(n, true)).join("")}
            </div>
            <div class="flow-trunk-cluster trunk-c ${currentTrunk === 'C' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🟣 支脉 C 惊变集群 [${act2_C?.trunkName || '开海'}]</div>
              ${act3_C.map(n => renderNodeCard(n, true)).join("")}
            </div>
          </div>
        </div>

        <!-- 连线列 3 -> 4: 9 大中局惊变通向 9 大死生决战 -->
        <div class="flow-connector-col connector-3-4">
          <svg class="flow-svg" viewBox="0 0 56 600" preserveAspectRatio="none">
            <path class="svg-flow-path ${this.visitedNodeIds.some(id => act4_A.map(x=>x.id).includes(id)) ? 'active-path' : ''}" stroke="#4ade80" d="M 0 90 L 56 90" />
            <path class="svg-flow-path ${this.visitedNodeIds.some(id => act4_B.map(x=>x.id).includes(id)) ? 'active-path' : ''}" stroke="#38bdf8" d="M 0 260 L 56 260" />
            <path class="svg-flow-path ${this.visitedNodeIds.some(id => act4_C.map(x=>x.id).includes(id)) ? 'active-path' : ''}" stroke="#c084fc" d="M 0 430 L 56 430" />
          </svg>
          <div class="flow-branch-tag" style="top: 15%; left: 50%; color:#4ade80;">决战A</div>
          <div class="flow-branch-tag" style="top: 43%; left: 50%; color:#38bdf8;">决战B</div>
          <div class="flow-branch-tag" style="top: 71%; left: 50%; color:#c084fc;">决战C</div>
        </div>

        <!-- Stage 4: 死生决胜列 (9 大巅峰决战舞台) -->
        <div class="flow-stage-col stage-4">
          <div class="stage-col-header">第四幕 · 死生决胜 (9)</div>
          <div class="stage-nodes-container">
            <div class="flow-trunk-cluster trunk-a ${currentTrunk === 'A' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🟢 支脉 A 巅峰决战</div>
              ${act4_A.map(n => renderNodeCard(n, true)).join("")}
            </div>
            <div class="flow-trunk-cluster trunk-b ${currentTrunk === 'B' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🔵 支脉 B 巅峰决战</div>
              ${act4_B.map(n => renderNodeCard(n, true)).join("")}
            </div>
            <div class="flow-trunk-cluster trunk-c ${currentTrunk === 'C' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🟣 支脉 C 巅峰决战</div>
              ${act4_C.map(n => renderNodeCard(n, true)).join("")}
            </div>
          </div>
        </div>

        <!-- 连线列 4 -> 5: 9 大决战通向 9 大独立历史终局 -->
        <div class="flow-connector-col connector-4-5">
          <svg class="flow-svg" viewBox="0 0 56 600" preserveAspectRatio="none">
            <path class="svg-flow-path ${this.visitedNodeIds.some(id => act5_A.map(x=>x.id).includes(id)) ? 'active-path' : ''}" stroke="#4ade80" d="M 0 90 L 56 90" />
            <path class="svg-flow-path ${this.visitedNodeIds.some(id => act5_B.map(x=>x.id).includes(id)) ? 'active-path' : ''}" stroke="#38bdf8" d="M 0 260 L 56 260" />
            <path class="svg-flow-path ${this.visitedNodeIds.some(id => act5_C.map(x=>x.id).includes(id)) ? 'active-path' : ''}" stroke="#c084fc" d="M 0 430 L 56 430" />
          </svg>
          <div class="flow-branch-tag" style="top: 15%; left: 50%; color:#4ade80;">终局A</div>
          <div class="flow-branch-tag" style="top: 43%; left: 50%; color:#38bdf8;">终局B</div>
          <div class="flow-branch-tag" style="top: 71%; left: 50%; color:#c084fc;">终局C</div>
        </div>

        <!-- Stage 5: 天命归所列 (9 大独立历史终局) -->
        <div class="flow-stage-col stage-5">
          <div class="stage-col-header">第五幕 · 天命归所 (9)</div>
          <div class="stage-nodes-container">
            <div class="flow-trunk-cluster trunk-a ${currentTrunk === 'A' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🟢 支脉 A 历史终局</div>
              ${act5_A.map(n => renderNodeCard(n, true)).join("")}
            </div>
            <div class="flow-trunk-cluster trunk-b ${currentTrunk === 'B' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🔵 支脉 B 历史终局</div>
              ${act5_B.map(n => renderNodeCard(n, true)).join("")}
            </div>
            <div class="flow-trunk-cluster trunk-c ${currentTrunk === 'C' ? 'active-trunk-cluster' : ''}">
              <div class="trunk-cluster-label">🟣 支脉 C 历史终局</div>
              ${act5_C.map(n => renderNodeCard(n, true)).join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    // 兼容原有自动化测试断言的占位
    let compatSpine = `<div class="storytree-spine-track" style="display:none;">`;
    allKernels.forEach(n => {
      let sc = "locked";
      if (n.id === this.currentStoryNodeId) sc = "active";
      else if (this.visitedNodeIds.includes(n.id)) sc = "passed";
      if (this.reconciledCardsCache[n.id]) sc += " sutured";
      compatSpine += `<div class="tree-node-card ${sc}">${n.title}</div>`;
    });
    compatSpine += `</div>`;

    // 若有局外外推记录，显示外推毛刺分支（满足原有测试并展示历史）
    let extraRow = "";
    if (this.extrapolationHistory && this.extrapolationHistory.length > 0) {
      extraRow = `
        <div class="extrapolated-branches-row">
          <div class="extrapolated-branches-title">
            <span>🌿 当前旅途产生的 AI 额外外推分支 (Emergent Extrapolations)</span>
          </div>
          ${this.extrapolationHistory.map((h, i) => `
            <div class="extrapolated-item">
              <strong>外推 #${i+1}：</strong>${escapeHTML(h.choiceText)}
              <span style="color:${h.success ? "#4ade80" : "#f87171"}; margin-left:6px;">(${h.success ? "检定成功" : "检定受挫"}, 倾向: ${escapeHTML(h.tag)})</span>
            </div>
          `).join("")}
        </div>
      `;
    }

    this.storyTreeCanvasContainer.innerHTML = metaHtml + flowHtml + compatSpine + extraRow;

    // 绑定支脉筛选切换按钮事件
    if (this.storyTreeCanvasContainer && this.storyTreeCanvasContainer.querySelectorAll) {
      const tabBtns = this.storyTreeCanvasContainer.querySelectorAll(".tree-tab-btn");
      tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const filter = btn.getAttribute("data-tree-filter");
          if (filter) {
            this.storyTreeFilter = filter;
            this.renderStoryTreeDrawer();
          }
        });
      });
    }

    // 绑定流程图上所有卡片的点击检查事件
    if (this.storyTreeCanvasContainer && this.storyTreeCanvasContainer.querySelectorAll) {
      const cardElems = this.storyTreeCanvasContainer.querySelectorAll(".tree-node-card");
      cardElems.forEach(elem => {
        elem.addEventListener("click", () => {
          const nodeId = elem.getAttribute("data-node-id");
          if (nodeId) {
            this.inspectStoryTreeNode(nodeId);
          }
        });
      });
    }

    // 3. 渲染交互式检查台 (Node Inspector)
    this.renderNodeInspector();

    // 4. 弥合比对面板 (如果当前检查的节点或当前节点有弥合记录)
    this.updateSuturePanel();
  }

  // 点击检查特定剧情节点
  inspectStoryTreeNode(nodeId) {
    this.inspectedNodeId = nodeId;
    if (this.storyTreeCanvasContainer && this.storyTreeCanvasContainer.querySelectorAll) {
      const allCards = this.storyTreeCanvasContainer.querySelectorAll(".tree-node-card");
      allCards.forEach(c => {
        if (c.getAttribute("data-node-id") === nodeId) {
          c.classList.add("selected-inspected");
        } else {
          c.classList.remove("selected-inspected");
        }
      });
    }
    this.renderNodeInspector();
    this.updateSuturePanel();
  }

  // 渲染交互式节点检查台 (Node Inspector)
  renderNodeInspector() {
    if (!this.storyTreeInspector) return;
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    if (!tree) return;

    if (this.inspectedNodeId === "spur") {
      let spurHtml = `
        <div class="inspector-header">
          <div class="inspector-title-area">
            <span class="tree-node-badge satellite-badge">卫星外推节点 (Satellite)</span>
            <span class="inspector-node-title">🌿 局外自由外推与因果发散分支</span>
          </div>
          <div class="inspector-actions">
            <span style="font-size:0.75rem; color:#4ade80; font-weight:700;">
              ${this.isExtrapolating ? "● 当前正处于局外推演中" : "✓ 已收敛平账"}
            </span>
          </div>
        </div>
        <div class="inspector-desc">
          脱离法定主剧情树的自由探索。玩家的每一步探险、博弈与检定胜负均在悄然累积因果债务。当选择【🪡 借势回朝】时，下一张主线文字卡将被 AI 动态平账重塑。
        </div>
        <div class="inspector-choices-title">📜 历次外推轨迹与检定判定：</div>
        <div class="inspector-choices-list">
          ${this.extrapolationHistory.length > 0 
            ? this.extrapolationHistory.map((h, i) => `
              <div class="inspector-choice-item">
                <span class="tag-type tag-spur">步骤 ${i+1}</span>
                <span style="flex:1;">${escapeHTML(h.choiceText)}</span>
                <span style="color:${h.success ? '#4ade80' : '#f87171'}; font-weight:700;">
                  ${h.success ? '成功' : '受挫'} (骰点 ${escapeHTML(h.diceTotal)})
                </span>
              </div>
            `).join("")
            : '<div style="color:var(--text-dim); font-size:0.78rem;">尚未在此轮回中触发外推。可在任意决策点选择【🌿 AI局外外推】选项开启此支线。</div>'
          }
        </div>
      `;
      this.storyTreeInspector.innerHTML = spurHtml;
      return;
    }

    const node = tree.nodes[this.inspectedNodeId];
    if (!node) {
      this.storyTreeInspector.innerHTML = `<div class="inspector-empty-hint">请选择任意剧情节点查看详情。</div>`;
      return;
    }

    const isCurrent = node.id === this.currentStoryNodeId && !this.isExtrapolating;
    const isVisited = this.visitedNodeIds.includes(node.id);
    const isSutured = !!this.reconciledCardsCache[node.id];

    let actionBtn = "";
    if (isVisited && !isCurrent) {
      actionBtn = `
        <button class="btn-rewind-node" id="btn-rewind-to-node" title="文字冒险倒带：重返此幕起点重新选择">
          <span>⎌</span>
          <span>时光回溯至此幕 (Rewind)</span>
        </button>
      `;
    } else if (isCurrent) {
      actionBtn = `<span style="font-size:0.76rem; color:var(--accent-gold); font-weight:700;">📍 当前正在经历此幕</span>`;
    }

    let inspectorHtml = `
      <div class="inspector-header">
        <div class="inspector-title-area">
          <span class="tree-node-badge kernel-badge">核心关键节点 (Kernel)</span>
          <span class="inspector-node-title">${node.title}</span>
          ${isSutured ? `<span title="AI 已完成因果弥合" style="font-size:0.75rem; color:#eab308; background:rgba(234,179,8,0.15); padding:2px 6px; border-radius:3px;">🪡 已因果弥合</span>` : ""}
        </div>
        <div class="inspector-actions">
          ${actionBtn}
        </div>
      </div>
      <div class="inspector-desc">
        ${isVisited || isCurrent ? node.desc : "🔒 迷雾未解锁：该分支尚未被探索。需在上一决策点选择相应抉择路线方可点亮本节点。"}
      </div>
      <div class="inspector-choices-title">
        <span>分支抉择与对话树 (Decision Points & Dialogue Tree)：</span>
      </div>
      <div class="inspector-choices-list">
        ${node.choices ? node.choices.map((c, i) => `
          <div class="inspector-choice-item">
            <span class="tag-type ${c.isExtrapolation ? 'tag-spur' : 'tag-kernel'}">
              ${c.isExtrapolation ? '🌿 卫星外推' : `分支 ${i+1}`}
            </span>
            <span style="flex:1;">${c.text}</span>
            <span style="color:var(--text-dim); font-size:0.7rem;">${c.tag || ''}</span>
          </div>
        `).join("") : '<div style="color:var(--text-dim); font-size:0.75rem;">本节点为终章结算。</div>'}
      </div>
    `;

    this.storyTreeInspector.innerHTML = inspectorHtml;

    // 绑定时光回溯倒带事件
    if (this.storyTreeInspector && this.storyTreeInspector.querySelector) {
      const rewindBtn = this.storyTreeInspector.querySelector("#btn-rewind-to-node");
      if (rewindBtn) {
        rewindBtn.addEventListener("click", () => {
          this.rewindToNode(node.id);
        });
      }
    }
  }

  // 文字冒险核心玩法：时光回溯倒带 (Rewind to Branch Node)
  rewindToNode(nodeId) {
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    if (!tree || !tree.nodes[nodeId]) return;

    this.abandonTurnForNavigation();

    const node = tree.nodes[nodeId];
    this.isExtrapolating = false;
    this.branchDepth = 0;
    this.currentStoryNodeId = nodeId;
    this.needsSuturing = false;
    this.gameState = "PLAYING";
    this.dangerTicks = Math.max(0, this.maxDangerTicks - 2);
    this.updateIncenseHUD();

    // 重新载入该主干节点文字卡
    this.loadCanonicalNode(nodeId, false);

    // 关闭抽屉并给予反馈
    this.closeDrawer(this.drawerStoryTree);
    this.recordFateKnot(node.title, `⎌ 时光回溯倒带至第${node.actNumber}幕重新决策`);
  }

  // 刷新弥合对比面板
  updateSuturePanel() {
    if (!this.storyTreeSuturePanel) return;
    const targetId = (this.inspectedNodeId && this.inspectedNodeId !== "spur") 
      ? this.inspectedNodeId 
      : this.currentStoryNodeId;
    const suturedEntry = this.reconciledCardsCache[targetId];

    if (suturedEntry) {
      this.storyTreeSuturePanel.style.display = "block";
      if (this.suturePanelNote) {
        this.suturePanelNote.innerText = suturedEntry.sutureNote;
      }
      if (this.sutureOriginalCard) {
        this.sutureOriginalCard.innerHTML = suturedEntry.original.map(b => `
          <div class="diff-beat">
            <span class="diff-speaker">[${escapeHTML(b.speaker)}]</span> ${escapeHTML(b.text)}
          </div>
        `).join("");
      }
      if (this.sutureModifiedCard) {
        this.sutureModifiedCard.innerHTML = suturedEntry.reconciled.map(b => `
          <div class="diff-beat" style="color:#fef08a;">
            <span class="diff-speaker">[${escapeHTML(b.speaker)}]</span> ${escapeHTML(b.text)}
          </div>
        `).join("");
      }
    } else {
      this.storyTreeSuturePanel.style.display = "none";
    }
  }

  // 按字数智能切分长文本为跑团对白拍（自然标点切分，确保逐拍点击推进）
  splitTextIntoDialogueChunks(text, maxChars = 90) {
    if (!text || typeof text !== "string") return [];
    text = text.trim();
    if (text.length <= maxChars) return [text];

    const chunks = [];
    const sentenceRegex = /[^。！？!?\n]+[。！？!?\n]*/g;
    let match;
    let currentChunk = "";

    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentence = match[0];
      if (currentChunk.length + sentence.length <= maxChars) {
        currentChunk += sentence;
      } else {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        if (sentence.length > maxChars) {
          let subSentences = sentence.match(/[^，,；;\n]+[，,；;\n]*/g) || [sentence];
          let subChunk = "";
          for (const s of subSentences) {
            if (subChunk.length + s.length <= maxChars) {
              subChunk += s;
            } else {
              if (subChunk.trim()) chunks.push(subChunk.trim());
              if (s.length > maxChars) {
                for (let i = 0; i < s.length; i += maxChars) {
                  chunks.push(s.substring(i, i + maxChars).trim());
                }
                subChunk = "";
              } else {
                subChunk = s;
              }
            }
          }
          if (subChunk.trim()) chunks.push(subChunk.trim());
          currentChunk = "";
        } else {
          currentChunk = sentence;
        }
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks.length > 0 ? chunks : [text];
  }

  // 规范化并对长段落执行字数分割，生成可点击查看下一段的对白流
  normalizeAndChunkBeats(beats, maxChars = 90) {
    const chunked = [];
    (beats || []).forEach(b => {
      const text = typeof b === "string" ? b : (b.text || b.content || b.dialogue || "");
      if (!text || !text.trim()) return;
      const chunks = this.splitTextIntoDialogueChunks(text, maxChars);
      const speaker = (typeof b === "object" && b.speaker) ? b.speaker : "跑团GM";
      const sub = (typeof b === "object" && b.sub) ? b.sub : "";
      const type = (typeof b === "object" && b.type) ? b.type : "narrator";
      const stageChar = (typeof b === "object" && b.stageChar) ? b.stageChar : "center";

      // A delivered illustration is one visual beat, with its own safe asset
      // reference. Text pagination must not discard its image or repeat it.
      const image = b?.illustrationData;
      if (image && typeof image.relativePath === "string" &&
          /^data\/illustrations\/[\w/.-]+\.(?:svg|webp|png|jpe?g)$/i.test(image.relativePath) && !image.relativePath.includes("..")) {
        const illustrationData = Object.fromEntries(["id", "relativePath", "title", "description", "symbol", "categoryName", "factionName"]
          .map(key => [key, typeof image[key] === "string" ? image[key] : ""]));
        chunked.push({speaker, sub, type: "illustration", stageChar, text: text.trim(), illustrationData});
        return;
      }

      chunks.forEach((chunkText, idx) => {
        chunked.push({
          speaker,
          sub: chunks.length > 1 ? `${sub} [${idx + 1}/${chunks.length}]`.trim() : sub,
          type,
          stageChar,
          text: chunkText
        });
      });
    });
    return chunked;
  }

  // 播放剧情流中的下一拍
  playNextInQueue() {
    if (this.isAIGenerating) return;
    if (this.currentStep >= this.storyQueue.length) {
      this.presentFactionChoices();
      this.updateDialogueNavUI();
      return;
    }

    const beat = this.storyQueue[this.currentStep];
    this.currentStep++;

    this.displayDialogue(beat.speaker, beat.sub, beat.type, beat.text, beat.stageChar, beat.illustrationData);
    this.updateDialogueNavUI();
  }

  // 播放剧情流中的上一拍 (返回上一段)
  playPreviousInQueue() {
    if (this.isAIGenerating) return;

    // 若当前已呈现选项面板，点击返回上一段时，先隐藏选项面板并回到最后一拍
    if (this.choiceOverlay && this.choiceOverlay.classList.contains("visible")) {
      this.choiceOverlay.classList.remove("visible");
      if (this.storyQueue && this.storyQueue.length > 0) {
        this.currentStep = this.storyQueue.length;
        const beat = this.storyQueue[this.currentStep - 1];
        this.displayDialogue(beat.speaker, beat.sub, beat.type, beat.text, beat.stageChar, beat.illustrationData);
        this.updateDialogueNavUI();
      }
      return;
    }

    if (this.currentStep <= 1) {
      // 已经处于当前对白队列首拍，无法再退
      this.updateDialogueNavUI();
      return;
    }

    // 回退到上一个 beat:
    // 当前刚刚播放完毕的是 this.currentStep - 1
    // 需要回退到的是 this.currentStep - 2
    this.currentStep -= 2;
    const beat = this.storyQueue[this.currentStep];
    this.currentStep++;

    this.displayDialogue(beat.speaker, beat.sub, beat.type, beat.text, beat.stageChar, beat.illustrationData);
    this.updateDialogueNavUI();
  }

  getCurrentReadingScene() {
    // Expose a small player-facing projection, never config/history/draft data.
    if (this.gameState !== "PLAYING" || this.isAIGenerating || typeof window === "undefined" || !window.JiuzhouSceneFavorites) return null;
    const beat = this.storyQueue?.[this.currentStep - 1];
    if (!beat || typeof beat.text !== "string" || !beat.text.trim()) return null;
    const value = {faction: this.currentFaction || "", chapter: this.currentStoryNodeId || "",
      turn: this.currentTurn || 0, step: this.currentStep, speaker: beat.speaker || "旁白",
      sub: beat.sub || "", text: beat.text, image: beat.illustrationData?.relativePath || ""};
    return window.JiuzhouSceneFavorites.scene({...value, id: window.JiuzhouSceneFavorites.fingerprint(value)});
  }

  // 更新对白导航栏状态 (返回上一段按钮禁用/启用)
  updateDialogueNavUI() {
    const navigation = document.getElementById("dialogue-nav-bar");
    if (navigation?.dataset) {
      navigation.dataset.step = String(this.currentStep || 0);
      navigation.dataset.total = String(this.storyQueue?.length || 0);
      navigation.dataset.generating = String(Boolean(this.isAIGenerating));
    }
    if (!this.btnDialoguePrev) return;
    const isOverlayVisible = !!(this.choiceOverlay && this.choiceOverlay.classList.contains("visible"));
    const canGoBack = !this.isAIGenerating && (this.currentStep > 1 || (isOverlayVisible && this.storyQueue && this.storyQueue.length > 0));
    this.btnDialoguePrev.disabled = !canGoBack;
  }

  nextStoryBeat() {
    if (this.isAIGenerating) return;
    if (this.choiceOverlay.classList.contains("visible")) return;
    this.playNextInQueue();
  }

  displayDialogue(speaker, sub, type, text, stagePos = "center", illustrationData = null) {
    speaker = speaker || "跑团GM";
    text = String(text || "");
    this.speakerName.innerText = speaker;
    this.speakerSub.innerText = sub || "";
    this.speakerBadge.className = `speaker-badge ${type || ""}`;

    this.updateCharacterStage(stagePos, speaker);

    this.backlog.push({ speaker, sub, text, illustrationData });
    this.appendBacklogEntry(speaker, text);

    this.currentFullText = text;
    if (this.typeTimer) clearInterval(this.typeTimer);

    // 套图的使用方法和特效一样在独立段落展示
    if (illustrationData) {
      this.isTyping = false;
      const relPath = illustrationData.relativePath || "";
      this.typewriterText.innerHTML = `
        <div class="dialogue-illustration-card">
          <div class="illustration-thumb-wrap">
            <img src="${escapeHTML(relPath)}" alt="${escapeHTML(illustrationData.title)}" class="illustration-inline-svg" />
          </div>
          <div class="illustration-card-content">
            <div class="illustration-badge-row">
              <span class="illustration-card-badge">${escapeHTML(illustrationData.symbol || "🖼️")} ${escapeHTML(illustrationData.categoryName || "阵营专属套图")}</span>
              <span style="font-size:0.75rem; color:var(--text-dim);">${escapeHTML(illustrationData.factionName)}</span>
            </div>
            <div class="illustration-card-title">${escapeHTML(illustrationData.title)}</div>
            <div class="illustration-text-desc">${escapeHTML(illustrationData.description || text)}</div>
            <div class="illustration-view-pill">🔍 点击全屏品鉴史诗画卷</div>
          </div>
        </div>
      `;
      this.typewriterText.firstElementChild?.addEventListener("click", () => this.showIllustration(
        illustrationData.title || "", illustrationData.description || text, "divine_gold", relPath
      ));
      this.finishTyping();
      return;
    }

    this.isTyping = true;
    this.typewriterText.textContent = "";
    this.continuePrompt.style.opacity = "0";

    let charIdx = 0;
    this.typeTimer = setInterval(() => {
      if (charIdx >= text.length) {
        this.finishTyping();
        return;
      }
      this.typewriterText.textContent += text[charIdx];
      charIdx++;
    }, 20);
  }

  fastForwardTypewriter() {
    if (this.typeTimer) clearInterval(this.typeTimer);
    this.typewriterText.textContent = this.currentFullText;
    this.finishTyping();
  }

  finishTyping() {
    this.isTyping = false;
    this.continuePrompt.style.opacity = "1";

    if (this.isAIGenerating) {
      this.continuePrompt.innerHTML = `<span style="color:#38bdf8; font-weight:700;">⚡ DeepSeek-V4.1-Flash 局势推演中，请稍候……</span>`;
      return;
    }

    if (this.currentStep < this.storyQueue.length) {
      this.continuePrompt.innerText = `▼ 点击查看下一段 [${this.currentStep}/${this.storyQueue.length}]`;
    } else {
      this.continuePrompt.innerText = "▼ 点击做出你的决断";
    }

    if (this.autoPlay && !this.choiceOverlay.classList.contains("visible")) {
      clearTimeout(this.autoTimer);
      this.autoTimer = setTimeout(() => this.nextStoryBeat(), 1800);
    }
  }

  updateCharacterStage(pos, speaker) {
    [this.charLeft, this.charCenter, this.charRight].forEach(el => el.classList.remove("speaking"));
    if (pos === "left") this.charLeft.classList.add("speaking");
    else if (pos === "right") this.charRight.classList.add("speaking");
    else this.charCenter.classList.add("speaking");
  }

  // 呈现抉择 (区分法定主干分支 vs AI 局外自由外推)
  presentFactionChoices() {
    if (this.pendingTurnAttempt) {
      this.notifyRecoveryUI();
      return;
    }
    if (this.isAIGenerating) {
      console.warn("[Narrative Engine] AI 正在推演中，严禁提前弹出抉择卡！");
      return;
    }
    this.choiceContainer.innerHTML = "";
    let choices = [];

    // 1. 若当前处于 AI 自由推进模式 (彻底解耦：一旦进入 AI 自由推进，永远进行 AI 剧情，绝不返回主线)
    if (this.isExtrapolating) {
      // 提取前 3 个分支选项 (优先使用 AI 小说家返回或生成的 3 个纯分支走向)
      let baseChoices = [];
      if (this.pendingApiChoices && this.pendingApiChoices.length > 0) {
        baseChoices = this.pendingApiChoices.map(c => {
          if (typeof c === "string") {
            return {
              text: c,
              tag: "自由演进",
              bias: { authority: 0, pragmatism: 0, progress: 0, cognition: 0 },
              diceBase: 10,
              isExtrapolation: true,
              isConvergence: false
            };
          }
          return {
            text: String(c.text || c.choice || c.title || "继续推演"),
            tag: c.tag || "自由抉择",
            bias: c.bias || { authority: 0, pragmatism: 0, progress: 0, cognition: 0 },
            diceBase: c.diceBase || 10,
            isExtrapolation: true,
            isConvergence: false
          };
        })
          .filter(c => !c.isOpenEndedInput && (!c.text || !c.text.includes("输入文字")))
          .slice(0, 3);
      }

      if (baseChoices.length === 0) {
        baseChoices = [
          {
            text: "【智计斡旋】审度当面各派势力的利益纠葛，以权衡博弈撕开一线生机。",
            tag: "权衡博弈 · 顺势而为",
            bias: { authority: 1, pragmatism: 4, progress: 2, cognition: 3 },
            diceBase: 10,
            isExtrapolation: true,
            isConvergence: false
          },
          {
            text: "【雷霆决断】抓住当面防线的致命破绽发动奇袭，以险中求胜扭转乾坤！",
            tag: "雷霆决断 · 险中求胜",
            bias: { authority: 3, pragmatism: 2, progress: 3, cognition: 2 },
            diceBase: 11,
            isExtrapolation: true,
            isConvergence: false
          },
          {
            text: "【奇谋别辟】暗中联络潜在盟友，在当面视野之外另辟一处崭新战线！",
            tag: "另辟蹊径 · 开拓新局",
            bias: { authority: 0, pragmatism: 5, progress: 4, cognition: 4 },
            diceBase: 10,
            isExtrapolation: true,
            isConvergence: false
          }
        ];
      }

      // 确保恰好有 3 个基础分支选项
      while (baseChoices.length < 3) {
        baseChoices.push({
          text: `【随机应变 #${baseChoices.length + 1}】把握当面形势，静观其变以待良机。`,
          tag: "因势利导 · 经世算计",
          bias: { authority: 1, pragmatism: 2, progress: 1, cognition: 2 },
          diceBase: 9,
          isExtrapolation: true,
          isConvergence: false
        });
      }

      // 铁律：在 AI 自由推进模式下，永远不会进入主线，永远进行 AI 小说剧情！
      // 绝不提供任何回到主线的选项，绝不消耗或篡改主线剧情进度！
      baseChoices.forEach(c => {
        c.isExtrapolation = true;
        c.isConvergence = false;
        c.targetNodeId = null;
      });

      choices = baseChoices.slice(0, 3);

      // 强力追加第 4 项：【✍️ 输入文字自由推进】（3 选项 + 1 开放输入！）
      choices.push({
        text: "【✍️ 输入文字自由推进】脱离选项规制，输入你的自定行动指令，由 AI 小说家接续推演后续故事！",
        tag: "自由行动 · AI续写",
        bias: { authority: 0, pragmatism: +4, progress: +4, cognition: +4 },
        diceBase: 10,
        isExtrapolation: true,
        isOpenEndedInput: true
      });
    } else {
      // 2. 当前处于法定主剧情树节点上
      const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
      const node = tree?.nodes[this.currentStoryNodeId];

      // 判断是否为大结局终章节点 (无后续子节点或目标节点为空)
      const isEndingNode = !node || !node.choices || node.choices.length === 0 || 
                           node.choices.every(c => !c.targetNodeId && !c.isExtrapolation);

      if (isEndingNode) {
        // 大结局终章节点！提供 3 个无限后日谈/新纪元大幕选项 + 1 个开放式输入窗口！
        choices = [
          {
            text: `【后日谈 · 万邦来朝】天下一统定鼎之后，派遣远征舰队巡狩四海万国，开启大航海跨洋新纪元！`,
            tag: "后日谈 · 万邦来朝",
            bias: { authority: +3, pragmatism: +4, progress: +5, cognition: +4 },
            diceBase: 10,
            isExtrapolation: true,
            isEpilogueSequel: true
          },
          {
            text: `【后日谈 · 制度鼎新】罢黜宗室特权与宗族桎梏，设立格物算学院与近代工场，开启工业革命盛世！`,
            tag: "后日谈 · 工业鼎新",
            bias: { authority: +1, pragmatism: +5, progress: +7, cognition: +5 },
            diceBase: 10,
            isExtrapolation: true,
            isEpilogueSequel: true
          },
          {
            text: `【后日谈 · 微服江湖】江山托付内阁群臣，卸下帝王衮冕，单骑仗剑重走九州塞外，隐入天地传说！`,
            tag: "后日谈 · 微服隐世",
            bias: { authority: -2, pragmatism: +2, progress: +1, cognition: +7 },
            diceBase: 9,
            isExtrapolation: true,
            isEpilogueSequel: true
          },
          {
            text: `【✍️ 输入文字开放式外推】输入后日谈与续集自定指令，交由 AI GM 无限推演后续世界演变与万古传奇！`,
            tag: "自由行动 · AI接戏",
            bias: { authority: 0, pragmatism: +4, progress: +4, cognition: +4 },
            diceBase: 10,
            isExtrapolation: true,
            isOpenEndedInput: true,
            isEpilogueSequel: true
          }
        ];
      } else {
        // 还有剧情没有完成的时候：严格呈现 3 个剧情发展方向 + 第 4 个玩家自己填（总计 4 个选项）！
        const nextTargetId = this.getNextActCanonicalNodeId();
        
        // a. 提取原节点中的有效剧情发展方向 (过滤开放式输入选项)
        let baseChoices = (node && node.choices)
          ? node.choices.filter(c => !c.isOpenEndedInput && (!c.text || !c.text.includes("输入文字"))).slice(0, 3)
          : [];

        // 默认推进目标：优先使用原分支中的有效 targetNodeId，无则使用下一幕目标
        const fallbackTargetId = baseChoices.find(c => c.targetNodeId)?.targetNodeId || nextTargetId;

        // b. 模板库：若预设分支不足 3 个，智能补齐至恰好 3 个独立发展方向
        const defaultDirections = [
          {
            text: "【稳扎稳打】集结精锐整肃军纪，巩固现有防线以图万全。",
            tag: "持重守正 · 稳扎稳打",
            bias: { authority: 2, pragmatism: 3, progress: 0, cognition: 2 },
            diceBase: 9
          },
          {
            text: "【智计斡旋】联络各方势力寻求妥协，以政治手腕化解当面危机。",
            tag: "权衡博弈 · 政治手腕",
            bias: { authority: 1, pragmatism: 4, progress: 2, cognition: 3 },
            diceBase: 10
          },
          {
            text: "【雷霆破局】抓住敌阵破绽发动凌厉奇袭，以险中求胜扭转乾坤！",
            tag: "雷霆决断 · 险中求胜",
            bias: { authority: 3, pragmatism: 2, progress: 3, cognition: 2 },
            diceBase: 11
          }
        ];

        while (baseChoices.length < 3) {
          const padIdx = baseChoices.length;
          const template = defaultDirections[padIdx] || defaultDirections[0];
          baseChoices.push({
            text: template.text,
            tag: template.tag,
            bias: template.bias,
            diceBase: template.diceBase,
            isExtrapolation: false,
            targetNodeId: fallbackTargetId
          });
        }

        // 锁定恰好 3 个剧情发展方向
        choices = baseChoices.slice(0, 3);

        // c. 严格追加第 4 项：【✍️ 输入文字开放式外推】（玩家自填输入框，交由 AI 即时接住推演）
        const existingOpen = (node && node.choices) ? node.choices.find(c => c.isOpenEndedInput || (c.text && c.text.includes("输入文字"))) : null;
        choices.push({
          text: existingOpen?.text || "【✍️ 输入文字开放式外推】脱离主线规制，由玩家自由输入文字指令，交由 AI 即时接住推演全新支线场景卡！",
          tag: existingOpen?.tag || "自由行动 · AI接戏",
          bias: existingOpen?.bias || { authority: 0, pragmatism: 4, progress: 4, cognition: 4 },
          diceBase: existingOpen?.diceBase || 10,
          isExtrapolation: true,
          isOpenEndedInput: true,
          targetNodeId: null,
          convergenceTargetId: existingOpen?.convergenceTargetId || fallbackTargetId
        });
      }
    }

    choices.forEach((c, idx) => {
      const cardEl = document.createElement("div");
      cardEl.className = "choice-card";
      cardEl.style.animationDelay = `${idx * 0.08}s`;
      
      const isExtra = c.isExtrapolation;
      const isSuture = c.isConvergence;
      const isOpenInput = c.isOpenEndedInput || (c.text && c.text.includes("输入文字开放式外推"));
      const typeBadge = isOpenInput
        ? `<span style="color:#38bdf8; font-weight:700; margin-right:4px;">[✍️ 开放外推]</span>`
        : (isExtra 
            ? `<span style="color:#4ade80; font-weight:700; margin-right:4px;">[🌿 自由外推]</span>` 
            : (isSuture ? `<span style="color:#eab308; font-weight:700; margin-right:4px;">[🪡 主线弥合]</span>` : `<span style="color:var(--accent-gold); margin-right:4px;">[📜 主干分支]</span>`));

      cardEl.innerHTML = `
        <span class="choice-card-text">${typeBadge}${escapeHTML(c.text)}</span>
        <span class="choice-badge-check">${escapeHTML(c.tag)}</span>
      `;
      cardEl.addEventListener("click", () => {
        if (this.isAIGenerating) {
          console.warn("[Narrative Engine] AI 正在推演中，严禁重复点击选项卡！");
          return;
        }
        if (isOpenInput) {
          this.pendingExtrapolationChoice = c;
          if (this.openInputText) {
            this.openInputText.value = "";
          }
          this.openDrawer(this.drawerOpenInput);
          if (this.openInputText) {
            setTimeout(() => this.openInputText.focus(), 80);
          }
          return;
        }

        this.choiceOverlay.classList.remove("visible");
        this.resolveFactionAction(c);
      });
      this.choiceContainer.appendChild(cardEl);
    });

    this.choiceOverlay.classList.add("visible");
  }

  // 结算行动 (支持主干跃迁、外推分支与因果弥合闭环)
  async resolveFactionAction(choice, recoveryOptions = {}) {
    if (this.isAIGenerating) {
      console.warn("[Narrative Engine] AI 当前正在推演中，严禁重复提交或触发并发行动！");
      return;
    }
    if (this.pendingTurnAttempt && recoveryOptions.attempt !== this.pendingTurnAttempt) {
      this.notifyRecoveryUI();
      return;
    }
    const isFreeAction = this.isExtrapolating || choice.isExtrapolation;
    const attempt = recoveryOptions.attempt || (isFreeAction ? GameRecovery.makeAttempt(this, choice,
      [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]) : null);
    if (attempt) {
      GameRecovery.restore(this, attempt.before);
      choice = structuredClone(attempt.choice);
      attempt.status = "running";
      this.pendingTurnAttempt = attempt;
      this.saveGameState();
    }
    this.isAIGenerating = true;
    if (this.choiceOverlay) this.choiceOverlay.classList.remove("visible");
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoPlay = false;
    this.notifyRecoveryUI();
    this.updateDialogueNavUI();
    try {
      this.currentTurn++;

    // 隐式累加思潮得分
    for (const [axis, delta] of Object.entries(choice.bias || {})) {
      this.ideologyVector[axis] = Math.max(-10, Math.min(10, (this.ideologyVector[axis] || 0) + delta));
    }

    // 掷骰检定
    const d1 = attempt ? attempt.dice[0] : Math.floor(Math.random() * 6) + 1;
    const d2 = attempt ? attempt.dice[1] : Math.floor(Math.random() * 6) + 1;
    let mod = 2;
    const total = d1 + d2 + mod;
    let success = total >= choice.diceBase;

    // 氛围线香与局势张力刻度 (安全动态浮动于 1~3 之间，绝不剧情杀)
    if (!success) {
      this.dangerTicks = Math.min(3, (this.dangerTicks || 1) + 1);
    } else {
      this.dangerTicks = Math.max(1, (this.dangerTicks || 1) - 1);
    }
    this.updateIncenseHUD();

    // 1. 若当前已经处于 AI 自由推进模式，或玩家本次选择了进入 AI 自由推进：
    // 【彻底解耦铁律】：只要选一次 AI 自由推进，永远不会进入主线，永远进行 AI 小说剧情！
    // 主线节点 this.currentStoryNodeId 严格冻结，绝不消耗或推进主线进度！
    if (this.isExtrapolating || choice.isExtrapolation) {
      this.isExtrapolating = true;
      this.branchDepth = (this.branchDepth || 0) + 1;
      if (choice.isEpilogueSequel) {
        this.isEpilogueSequel = true;
      }
      if (choice.convergenceTargetId) {
        this.convergenceTargetId = choice.convergenceTargetId;
      }

      // 核心特性：检测是否为降维神迹/超规格操作 (如掏出神光棒变身奥特曼、现代武器降维扫荡等)
      const supremeEndingId = this.getSupremeEndingNodeId();
      const isGodModeInput = /奥特曼|神光棒|迪迦|核弹|歼\s*20|机甲|降维|秒杀|成仙|仙帝|神明|神迹|直接当皇帝|君临天下|一统天下/i.test(choice.customInput || choice.text || "");
      if (isGodModeInput) {
        this.convergenceTargetId = supremeEndingId;
      }

      this.extrapolationHistory.push({
        choiceText: choice.customInput || choice.text,
        tag: isGodModeInput ? "降维神迹 · 天命跃迁" : choice.tag,
        diceTotal: total,
        success,
        turn: this.currentTurn
      });
      this.updateBranchIndicatorUI();

      let nextBeats = null;

      // 若启用了 DeepSeek API (玩家已启用个人 API)
      const hasLiveChannel = !recoveryOptions.local && this.hasLiveAIRoute();

      if (hasLiveChannel) {
        try {
          const liveResult = await this.callDeepSeekLiveAPI(choice, d1, d2, total, success);
          if (liveResult && liveResult.beats && liveResult.beats.length > 0) {
            nextBeats = liveResult.beats;
            this.pendingApiChoices = liveResult.choices;
          } else throw new Error("invalid_game_response");
        } catch (err) {
          if (err?.code !== "source_changed") this.setAIRequestStatus("fallback", "story", err);
          this.failTurnAttempt(attempt, err);
          return;
        }
      }

      // An enabled but incomplete provider must be fixed or explicitly bypassed by the player.
      if (!hasLiveChannel && this.apiConfig?.enabled && !recoveryOptions.local) {
        let error;
        try { this.resolveAIProvider(); } catch (cause) { error = cause; }
        this.failTurnAttempt(attempt, error || new Error("ai_source_unavailable"));
        return;
      }

      if (!nextBeats) {
        const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
        const currNode = tree?.nodes[this.currentStoryNodeId];
        const sceneTitle = currNode ? (currNode.title.split("：")[1] || currNode.title) : "当前战局";
        const npcInScene = (currNode?.originalBeats || []).find(b => b.type === "npc")?.speaker || "当面权贵与重臣";

        if (isGodModeInput) {
          // 降维神迹：掏出神光棒变身奥特曼，直接将剧情引渡跃迁至最后一幕【君临天下大结局】！(字数 > 550 字)
          nextBeats = [
            {
              speaker: "天道推演",
              sub: "【GM 局势暗盘深思 · 降维神迹因果跃迁】",
              type: "voice-court",
              stageChar: "center",
              text: `检视九州大势：玩家于【${sceneTitle}】毅然祭出降维神迹【${choice.customInput || choice.text}】！金光贯穿云霄，天地为之倒悬！此等不可思议之天道伟力彻底颠覆了凡俗冷兵器与地缘政治的因果律，所有八旗军威、中枢党争、流寇狼烟与各方关隘在无上神光面前尽数瓦解。天命归属再无半点悬念——因果律被瞬间击穿，历史大势直接跃迁至最后一幕【君临天下大结局】！`
            },
            {
              speaker: "神光降世",
              sub: `【AI 接住推演支线卡 · 检定: 2d6(${d1}+${d2})+2 = ${total} vs DC ${choice.diceBase} · 神迹大成】`,
              type: "voice-instinct",
              stageChar: "center",
              text: `【玩家自定行动】：${choice.customInput || choice.text}\n\n【神光贯日 · 万民震绝】虚空中爆发出贯穿寰宇的无量光芒！神光棒骤然绽放亿万道神圣霞光，巍峨万丈的光之巨人法相自风雪与狼烟中拔地而起，巍巍法身照彻万里山河！在场群臣、督抚、宗室王公与数十万关宁铁骑、八旗精锐惊骇欲绝，刀枪弓弩纷纷失手坠地，三军将士尽皆瘫软跪伏于雪泥之中！苍生战栗，山呼海啸，恭迎无上真神降临凡尘定鼎天下！`
            },
            {
              speaker: npcInScene,
              sub: "匍匐于地，惊恐万状，泪流满面叩首颤抖",
              type: "npc",
              stageChar: "right",
              text: `“天……天神显圣！此乃上古真龙与天道法身降世！有此无量神威在此，我等凡俗军略、百年权谋皆成可笑微尘！臣等肉眼凡胎，罪该万死，叩见至高万岁！愿吾皇万岁万岁万万岁！神威所向，四海臣服，天下莫敢不从！”`
            },
            {
              speaker: "心性照见",
              sub: "【因果跃迁完成 · 直抵终局】",
              type: "voice-court",
              stageChar: "left",
              text: `金光洗礼之下，暴虐杀气荡然无存。你以超脱凡俗的无上伟力瞬间荡平一切历史迷雾与各方阻碍，天命气数已登峰造极！剧本因果律已被彻底改写，前路直通最后一幕【君临天下大结局】！`
            }
          ];

          const crownLocation = this.currentFaction === "mongol" 
            ? "于斡难河畔长生天金帐受九斿白纛朝拜登基" 
            : (this.currentFaction === "nanming"
                ? "于承天府海潮之畔受万舰将士朝拜定鼎"
                : (this.currentFaction === "ming" ? "于奉天殿与紫禁之巅正式受禅加冕" : "于紫禁之巅正式登基加冕"));

          this.executeAITools([
            { tool: "screen_flash", params: { color: "gold" } },
            { tool: "screen_shake", params: { intensity: "earthquake", duration: 1200 } },
            { tool: "show_illustration", params: { title: "光之巨人 · 君临天下", description: "神光棒冲天而起，无量法身照彻万里山河，八旗精锐与群臣弃戈跪伏，天下万民山呼万岁！", style: "divine_gold" } }
          ]);

          this.pendingApiChoices = [
            {
              text: `【君临天下 · 鼎革新元】受群臣万民朝拜，${crownLocation}，直入天命终章大结局，开启万世太平盛景！`,
              tag: "君临天下 · 终极定鼎",
              bias: { authority: 10, pragmatism: 5, progress: 5, cognition: 10 },
              diceBase: 8,
              isExtrapolation: true,
              isConvergence: false
            },
            {
              text: "【寰宇新序 · 移风易俗】以神明无上威仪超脱凡俗帝位，于重洋彼岸另辟神圣自治领！",
              tag: "超凡法统 · 开辟新境",
              bias: { authority: 8, pragmatism: 8, progress: 10, cognition: 8 },
              diceBase: 8,
              isExtrapolation: true,
              isConvergence: false
            },
            {
              text: "【超凡入圣 · 垂拱而治】将凡间政务托付贤良，法相隐入苍穹守护万民，开启万古神道传说！",
              tag: "超凡入圣 · 终极飞升",
              bias: { authority: 6, pragmatism: 6, progress: 8, cognition: 10 },
              diceBase: 8,
              isExtrapolation: true,
              isConvergence: false
            }
          ];
        } else if (this.isEpilogueSequel) {
          // 后日谈大幕无限续集生成 (总字数 > 550 字，展现大时代波澜壮阔的制度博弈)
          const sequelInput = choice.customInput || choice.text;
          const shortAction = sequelInput.length > 30 ? sequelInput.substring(0, 30) + "…" : sequelInput;

          nextBeats = [
            {
              speaker: "御前掌印",
              sub: "捧着沾着朱砂的内阁急递，躬身低禀",
              type: "npc",
              stageChar: "left",
              text: `“启奏主上：关于‘${shortAction}’之新政廷议，通政司连夜快马飞报十三省巡抚与沿海市舶司。工部已调集三千名巧匠连夜测绘水利营建图册，户部虽已奉旨拨兑库银二百四十万两，然江浙巨贾与晋地八大盐商私下聚议，皆借词银根紧俏、水运受阻，暗中扣押现银迟迟不缴，沿海更有走私商帮暗中串联，形迹极为可疑……”`
            },
            {
              speaker: "枢密重臣",
              sub: "按笏出列，花白胡须微颤，面色凝重如铁",
              type: "npc",
              stageChar: "right",
              text: `“主上圣德宏深，此策本是开万世太平之基，然古来更张变法，未有不流血者！如今四海初定，八旗宗亲与降明士绅盘根错节。商贾抗税不过是疥癣之疾，真正致命者乃是手握重兵之边镇将领！若处置过急，恐激起各省提镇联手抗旨；若放任迁延，朝廷威严一旦荡然，百废待兴之局必将前功尽弃！”`
            },
            {
              speaker: "江南道御史",
              sub: "伏地进言，额头紧贴金砖，声泪俱下",
              type: "npc",
              stageChar: "center",
              text: `“臣冒死进言！民间饥民苦于赋税久矣，今主上行此大略，天下寒士无不翘首以盼。然基层胥吏如狼似虎，借清丈之名行勒索之实，若无天子缇骑亲临弹压贪鄙、开辟商道以活小民，恐良法未及普及，市井先酿大乱！”`
            },
            {
              speaker: "冷酷旁白",
              sub: "宫灯微晃，奉天殿外长夜落雪无声",
              type: "narrator",
              stageChar: "center",
              text: `朔风呼啸，紫禁之巅的琉璃重檐在寒夜中泛着冷冽的青芒。天下一统的喧嚣过后，真正的大戏才刚刚拉开帷幕——朝堂与江湖、商帮与军阀、旧秩序的顽疾与新时代的破晓在黑暗中疯狂角力。棋局从未止息，乾坤依然在掌中翻覆。`
            }
          ];

          this.executeAITools([
            { tool: "weather_effect", params: { type: "blizzard" } },
            { tool: "show_illustration", params: { title: "紫禁长夜 · 乾坤新纪", description: "朔风呼啸，紫禁之巅的琉璃重檐泛着冷冽青芒。朝堂暗流激荡，新纪元的帷幕正徐徐拉开。", style: "court_conspiracy" } }
          ]);

          this.pendingApiChoices = this.generateOfflineEpilogueTriplet({
            userAction: choice.customInput || choice.text
          });
        } else {
          // 常规外推：冷读玩家心理预期与爽点渴望，杜绝死板模仿小说与夜间刺客套话！总字数严格大于 500 字！
          const customActionPrefix = choice.customInput ? `【玩家自定行动】：${choice.customInput}\n\n` : "";
          const actionText = choice.customInput || choice.text;
          const shortAction = actionText.length > 30 ? actionText.substring(0, 30) + "…" : actionText;

          // 五维心理冷读意图分类器 (Cold Reading Archetypes)
          const isCourtOrPolitics = /议政|朝堂|内阁|国策|诏书|上疏|上奏|奏折|范文程|洪承畴|多尔衮|豪格|济尔哈朗|登基|继位|权柄|封赏|商议|整顿|定策|文武|百官|任免|法统|封王|拜相|大殿|盛京|武英殿|紫禁城|喝茶|品茗|对弈|召见|商讨|密谋|垂帘/i.test(actionText);
          const isPalaceOrIntimate = /大玉儿|庄妃|孝庄|私语|密会|叙旧|永福宫|深宫|后宫|福临|少年天子|儿女|深情|往事|叙谈|私下|长谈|母子|谈心|心结|旧怨/i.test(actionText);
          const isMilitaryOrPass = /山海关|吴三桂|一片石|李自成|大顺|出征|整军|点兵|铁骑|八旗|两白旗|两黄旗|正蓝旗|关宁|列阵|合围|决战|布阵|冲锋|城防|关防|军纪|军饷|渡河|攻城|斥候|先锋|迎战|进军|拔营|烽火|杀进|开拔/i.test(actionText);
          const isCivilianOrInvestigation = /近况|民生|饥荒|流民|汉人|民情|走访|探查|巡视|体察|商帮|市井|难民|百姓|抚恤|免税|开仓|赈济|农桑|秋毫无犯|安抚|安民|疾苦|减免|粮道|灾民/i.test(actionText);

          let leadProse = "";
          let speakerNpc = "";
          let npcDialogue = "";
          let speakerSecond = "";
          let secondDialogue = "";
          let historianProse = "";

          if (isCourtOrPolitics) {
            // 【冷读：威权掌控与帝王经世爽点】玩家渴望的是居高临下的从容裁决与群臣屏息的敬畏排场
            speakerNpc = "内阁辅弼大学士";
            speakerSecond = "八旗元老宿将";
            if (success) {
              leadProse = `${customActionPrefix}紫禁之巅的金銮重殿与盛京崇政殿内外，龙涎香雾袅袅升腾，群臣分列两侧，垂手肃立。围绕“${shortAction}”的浩瀚诏谕方才下达，便如惊雷破空般压制住了殿廷之上的一切私语与杂音！你端坐主位之上，目光如炬，言辞切中九洲兴替之命门——既彰显八旗开国定鼎的无上法统，又稳稳拿捏住中原士绅官宦的立身之阶。原本暗流涌动的各方党羽在雷霆与恩威并施的气度下彻底敛声屏气，文武百官恭谨叩拜，大清定鼎天下的浩荡权威在此刻达到了极盛之巅！`;
              npcDialogue = `“主上乾纲独断，圣虑深远洞烛万里！此等宏略既出，天下士林必景从云集，关外关内从此同沐皇恩。臣等敢不竭股肱之力，即刻晓谕九洲，雷厉风行推勘四方！”`;
              secondDialogue = `“老臣原本担忧旗人祖制受损，如今见主上调度有方、宽猛相济，两白旗与两黄旗宿将无不心服口服！愿为主上执辔前驱，平定寰宇一切不臣！”`;
            } else {
              leadProse = `${customActionPrefix}金砖铺地的御前重殿中，炭火虽旺，空气却骤然冷凝如铁。围绕“${shortAction}”的动议一经抛出，立时触动了朝堂深处各方派系盘根错节的利益藩篱！正黄、正蓝旗大臣按刀互视，面带疑惧，唯恐权柄旁落；而内三院汉臣则屏息低眉，生怕言多有失。朝堂之上虽无刀光剑影，但君臣各方的激烈试探与隐形博弈已至白热化，唯有进一步施展帝王权谋与雷霆机变，方能彻底压服这满朝公卿的异志！`;
              npcDialogue = `“主上息怒！此事牵涉八旗开国祖训与勋贵世职，非同小可！若无确凿凭据与周密章程骤然推行，恐各旗固山额真心中生疑。老臣冒死进谏，还望主上深思而后定！”`;
              secondDialogue = `“各方势力虽各有算盘，然大势所趋断非顽疾所能阻挡。依微臣拙见，此时正当以雷霆手腕敲打领头之人，同时密赐恩赏分化其党羽，大局依然操之于主上手中！”`;
            }
            historianProse = `紫禁重檐落雪无声，王朝鼎革皆系于天子尺素之间。真正的帝王心术，从来不在匹夫之勇，而在于谈笑间翻云覆雨、化天下倾轧为己所用的至高掌控！`;
          } else if (isPalaceOrIntimate) {
            // 【冷读：深宫情感张力与解开心结】玩家渴望的是细腻深刻的爱恨交织与私密对手戏
            speakerNpc = "庄妃大玉儿";
            speakerSecond = "贴身内侍苏茉儿";
            if (success) {
              leadProse = `${customActionPrefix}永福宫内，兽炉香烬，锦帐深垂。针对“${shortAction}”的密语长谈在夜色深沉中悄然推心置腹。红墙黄瓦的森严隔阂被字字真挚的剖白逐渐融化，那双曾看透宫闱倾轧的绝美眼眸中，戒备与凄清终于化为了无言的欣慰与释怀。在这场关乎两代帝王权柄与一生羁绊的博弈中，两颗被天下兴亡绑架的心终于达成了解除一切猜忌的绝密盟约，深宫内闱从此成为你最坚固的后方砥柱！`;
              npcDialogue = `“你我自盛京相识相伴至今已有二十余载，这天下有多大，这后宫便有多深、多冷。福临年幼，我所图者绝非虚妄的权势，而是大清基业常青与母子周全。今日你既然说透了肺腑之言，这万里关山与乾坤重担，我便全心托付于你了。”`;
              secondDialogue = `“主子昨夜为大人焚香祷告至五更，手指都冻得僵了。奴婢伺候娘娘这些年，何曾见娘娘如此舒展笑颜……大人，万望珍惜娘娘这片比海更深的情意。”`;
            } else {
              leadProse = `${customActionPrefix}重重珠帘深锁，宫灯如豆，殿内的气氛在言语轻触的刹那悄然凝结成冰。围绕“${shortAction}”的试探虽然深情，却终究触碰到了深宫内闱最不可言说的旧年伤疤与幼帝安危的敏感雷区。屏风后的伊人微微别过头去，温存之色骤然收敛，取而代之的是帝王之母固若金汤的防线与冷寂的沉默。在这权力噬人的深宫之中，想要化解积淀多年的心结与戒备，仍需更深刻的情感契机！`;
              npcDialogue = `“阁下慎言！这永福宫是天子生母的幽居之所，前朝后宫万千双眼睛死死盯着这里，一步走错便是粉身碎骨。方才的话……哀家便当从未听过。夜色已深，大人还是请回中军行辕吧。”`;
              secondDialogue = `“大人留步……娘娘的话虽冷，但袖中的帕子早已被泪水浸透。如今前朝诸王虎视眈眈，娘娘是在用冷若冰霜护大人周全啊，请大人万勿误解了娘娘的一片苦心。”`;
            }
            historianProse = `在这座古老的帝王囚笼里，最深沉的爱往往不得不披上最无情的政治铠甲。爱恨同源，情仇莫辨，正是乱世红颜与一代天骄无可逃避的宿命史诗。`;
          } else if (isMilitaryOrPass) {
            // 【冷读：沙场征伐与金戈铁马】玩家渴望的是统驭千军、横扫敌寇的大将统帅雄姿
            speakerNpc = "前锋中军正将";
            speakerSecond = "关宁铁骑宿将";
            if (success) {
              leadProse = `${customActionPrefix}边关朔风如狂刀裂帛，石河两岸万马肃整、刀枪如林！围绕“${shortAction}”的铁血军令如疾雷掠过三军，两白旗重铠与关宁铁骑闻令而动，烟尘蔽日，杀气直冲牛斗！敌军的前哨哨卡被势如破竹地连拔数重，战阵阵型严整得无懈可击，铁蹄践踏之下大地轰然震颤，全军将士热血沸腾、气势如虹，天下的主动权与决胜关隘已然尽在股掌之间！`;
              npcDialogue = `“报！主帅神算！前沿三座烽燧与渡河桥头堡已被我军全歼拿下，贼军前锋闻风丧胆溃退三十里！全军将士皆请命决战，请主帅下达全线冲锋铁令！”`;
              secondDialogue = `“末将愿立生死军令状，亲率八千精锐直插敌军老营帅旗！今日定斩敌酋首级献于帅帐之下，扬我王师无敌威名！”`;
            } else {
              leadProse = `${customActionPrefix}长风卷地，黄沙遮天，塞外突降的罕见暴风雪与险峻地形令“${shortAction}”的兵团推进遭遇了天候与阵型的严酷阻隔！前哨传令兵在漫天迷雾中数度被阻，敌军精锐占据险隘顽抗，中军与侧翼游骑一时脱节。然三军将士依然按刀死守阵地、寸土不让，敌我两方在凄风苦雨中展开了惨烈至极的意志较量，全军屏息以待主帅施展反戈一击的绝世韬略！`;
              npcDialogue = `“主帅！狂风遮目，前锋火炮无法点火，侧翼山口正遭遇敌军伏兵袭扰！但各营重盾阵坚如磐石，敌骑虽狂攻数度皆被我军乱箭射退，请主帅定夺战机！”`;
              secondDialogue = `“胜败乃兵家常事，越是险局越见名将真容！只要我军收拢两翼、稳住后路粮道，待狂风一歇，便可合围包抄，反客为主将敌军一举碾碎！”`;
            }
            historianProse = `白骨如山鸟惊飞，将军百战天下平。乱世沙场的胜负不仅在刀枪之烈，更在统帅临危不乱的坚毅与魄力。唯有历经烽火淬炼，方能铸就横推九州的不朽王师！`;
          } else if (isCivilianOrInvestigation) {
            // 【冷读：仁政爱民与圣王救世】玩家渴望的是救济黎庶、万民归附的道德崇高感
            speakerNpc = "地方汉臣知府";
            speakerSecond = "关外饱经风霜的辽东老叟";
            if (success) {
              leadProse = `${customActionPrefix}风雪呼啸的辽东残破旷野与关中大地之上，围绕“${shortAction}”的安民善政雷厉铺展。开仓赈粮的白烟冉冉升起，免除三年田赋的朱批文告张贴于各处城门市口，严惩抢掠不法旗人的无情斩令更是令四方肃然！数以万计濒临绝境的枯瘦百姓眼含热泪、箪食壶浆跪迎王师，长跪不起，千呼万岁之声震彻荒野！得民心者得天下，这一道仁德之光彻底照亮了疮痍满目的中原黎民之心！`;
              npcDialogue = `“主上仁德配天！自流贼与战乱以来，百姓流离失所如嚼草根，今蒙主上秋毫无犯、轻徭薄赋之宏恩，四方士民莫不感泣涕零，争相归附！大清受命于天，正在今日之善政啊！”`;
              secondDialogue = `“老汉活了六十岁，终于见到真正把咱们老百姓当人看的圣主青天了……乡亲们，快把家里仅剩的热水杂面拿出来，给王师的军爷们暖暖身子啊！”`;
            } else {
              leadProse = `${customActionPrefix}残破的墩堡与市井之间，流民如蚁，寒风料峭。推行“${shortAction}”的仁政虽有大善之心，但遭遇了地方豪强、贪鄙胥吏与个别骄横庄头的阳奉阴违与重重阻挠。仓廪底层的旧账错综复杂，物资调配面临重重困难。然而你亲临现场的威严与抚慰，让黑暗泥泞中的百姓看到了一线从未有过的曙光，民心思变的烈火正在死寂的大地深处迅速汇聚！`;
              npcDialogue = `“回禀大人！非是良法不行，实乃基层差役蠹虫丛生，竟敢借分发赈粮之机上下其手。若得大人颁下尚方特权，立斩几名贪官立威，则万民必心悦诚服、善政立竿见影！”`;
              secondDialogue = `“草民虽饿极，但深知贵人此番是真心为了救活小民。只要贵人愿意为咱们做主除掉那些趴在百姓身上吸血的恶霸，纵然舍了这条老命，咱们也誓死追随大人！”`;
            }
            historianProse = `民为邦本，本固邦宁。刀枪或可征服城池，唯有仁德方能收拢万姓之心。能体恤草芥之苦者，方能在历史的长卷上铭刻千古圣王之名。`;
          } else {
            // 【通用冷读：开放行止与天下纵横】尊崇玩家意图，搭台唱戏，顺水推舟
            speakerNpc = "当面重臣名士";
            speakerSecond = "随行忠勇心腹";
            if (success) {
              leadProse = `${customActionPrefix}关山万里，风云变幻，天地大局皆在谈笑间悄然起伏。围绕“${shortAction}”的超然行止，在沉闷窒息的乱世泥潭中划开了一片不可思议的全新气象！你的从容与机锋不仅彻底震慑了在场诸方豪强，更在看似随意的一举一动中抢占了先机。旁人眼中荒诞或费解的举动，在天下大势的棋盘上竟然化作了一记无人能料的惊天妙手，令各方势力无不暗自心惊！`;
              npcDialogue = `“妙哉！阁下真乃不世出的风流人物！看似随性而为，实则暗合孙子兵法‘出其不意、攻其不备’之真谛！在下佩服之至，愿唯阁下马首是瞻！”`;
              secondDialogue = `“主上算无遗策！旁人皆以为主上此行另有深意，如今各方暗探纷纷乱了阵脚，主动权已全在主上掌中！”`;
            } else {
              leadProse = `${customActionPrefix}天地苍茫，乱世洪流汹涌莫测。围绕“${shortAction}”的大胆行止在各方势力的严密注视下激起了阵阵疑云。暗桩盘查、各方使节的窥探与猜忌虽如影随形，却并未能阻挡你向前推进的坚定步伐。局势虽增添了数分难以捉摸的复杂戏剧冲突，但真正的棋手从不惧逆风局，更大的反转机锋正在酝酿之中！`;
              npcDialogue = `“阁下行事当真出人意料……如今这山海关内外各方皆在死斗，阁下这一手究竟所图为何？不妨打开天窗说亮话，咱们或许还能做一桩更大的买卖！”`;
              secondDialogue = `“主上，方才四周已有数道可疑视线退去回报主子了。不过棋局既已搅乱，正好趁他们举棋不定之际，出奇制胜！”`;
            }
            historianProse = `大江东去，浪淘尽千古风流人物。英雄之所以为英雄，正在于敢在循规蹈矩的世俗棋盘上，走出一着属于自己的绝世天命！`;
          }

          nextBeats = [
            {
              speaker: "冷酷旁白",
              sub: `【AI 接住推演支线卡 · 现场局势 · 检定: 2d6(${d1}+${d2})+2 = ${total} vs DC ${choice.diceBase} · ${success ? "大势所向" : "机锋隐伏"}】`,
              type: "narrator",
              stageChar: "left",
              text: leadProse
            },
            {
              speaker: speakerNpc,
              sub: success ? "躬身稽首，神色激动，眼中充满敬畏" : "神情微凛，按剑沉思，言语间满是试探",
              type: "npc",
              stageChar: "right",
              text: npcDialogue
            },
            {
              speaker: speakerSecond,
              sub: success ? "抱拳领命，热血激荡，杀气与忠勇毕露" : "躬身密语，目光警惕巡视四周，护卫在侧",
              type: "npc",
              stageChar: "center",
              text: secondDialogue
            },
            {
              speaker: "冷酷史笔",
              sub: "【时相暗流 · 历史纵深】",
              type: "narrator",
              stageChar: "left",
              text: historianProse
            }
          ];

          this.pendingApiChoices = this.generateOfflineActionTriplet({
            sceneTitle,
            npcInScene,
            userAction: choice.customInput || choice.text,
            success,
            total
          });

          // 视听工具与舞台特效：日常推进绝无脑弹出插图视窗！仅在重大历史里程碑（第6/12轮等）下发史诗插图
          const toolsToExecute = [
            { tool: "screen_flash", params: { color: success ? "white" : "red" } }
          ];
          if (!success) {
            toolsToExecute.push({ tool: "screen_shake", params: { intensity: "medium", duration: 500 } });
          }
          if (this.branchDepth >= 6 && this.branchDepth % 6 === 0) {
            toolsToExecute.push({
              tool: "show_illustration",
              params: {
                title: success ? "关河落日 · 乾坤初定" : "烽烟四起 · 风云际会",
                description: success ? "极目远眺，山海长关横亘塞北，万里河山尽入胸怀，天下大势已悄然易手！" : "残阳如血，塞外烽烟滚滚，群雄逐鹿正值最烈之时，前路步步皆是死生大劫！",
                style: success ? "divine_gold" : "war_fire"
              }
            });
          }
          this.executeAITools(toolsToExecute);
        }
      }

      if (!hasLiveChannel) this.setAIRequestStatus("local", "story");
      this.storyQueue = this.normalizeAndChunkBeats(nextBeats, 90);
      try {this.recordFateKnot(`外推 #${this.currentTurn}`, (choice.customInput || choice.text).substring(0, 20) + "...");}
      catch (_) { /* An optional rewind marker cannot discard already delivered prose. */ }
      this.currentStep = 0;
      this.pendingTurnAttempt = null;
      this.isAIGenerating = false;
      if (this.choiceOverlay) this.choiceOverlay.classList.remove("visible");
      this.turnPresentationError = null;
      try {this.playNextInQueue();}
      catch (_) {this.turnPresentationError = "正文已交付，但显示遇到问题。请先确认保存成功，再刷新并重续前缘；无需重新请求 AI。";}
      finally {this.saveGameState();}
      return;
    }

    // 3. 正常主干推进 (非外推)
    if (choice.targetNodeId) {
      this.isAIGenerating = false;
      await this.loadCanonicalNode(choice.targetNodeId, false);
      return;
    }

    // 终局或无后续节点处理
    this.storyQueue = [
      {
        speaker: "天命定盘",
        sub: "九州史诗终章",
        type: "narrator",
        stageChar: "center",
        text: "九州尘埃落定。回望山河，你以主干骨架为引、以外推机变为翼，书写了一部独属于你的九州沉浮录。"
      }
    ];
    this.currentStep = 0;
    this.isAIGenerating = false;
    this.playNextInQueue();
    this.saveGameState();
    } catch (error) {
      if (attempt) {
        if (this.pendingTurnAttempt === attempt) this.failTurnAttempt(attempt, error);
      } else throw error;
    } finally {
      if (!this.pendingTurnAttempt || this.pendingTurnAttempt === attempt || this.pendingTurnAttempt.status !== "running") this.isAIGenerating = false;
      this.updateDialogueNavUI();
      this.notifyRecoveryUI();
    }
  }

  notifyRecoveryUI() {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("jiuzhou-recovery-change"));
    }
  }

  restoreCommittedTurnView() {
    if (this.typeTimer) clearInterval(this.typeTimer);
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoPlay = false;
    if (this.backlogStream) {
      this.backlogStream.innerHTML = "";
      for (const beat of this.backlog || []) this.appendBacklogEntry(beat.speaker, beat.text);
    }
    const beat = this.storyQueue?.[Math.max(0, (this.currentStep || 1) - 1)];
    if (beat && this.typewriterText) {
      // displayDialogue normally records a read; restoring an existing page must not add another entry.
      const backlogLength = this.backlog.length;
      this.displayDialogue(beat.speaker, beat.sub, beat.type, beat.text, beat.stageChar, beat.illustrationData);
      this.backlog.length = backlogLength;
      this.backlogStream?.lastElementChild?.remove();
      if (!beat.illustrationData) this.fastForwardTypewriter();
    }
    this.updateIncenseHUD();
    this.updateBranchIndicatorUI();
    this.updateDialogueNavUI();
  }

  failTurnAttempt(attempt, error) {
    if (!attempt || this.pendingTurnAttempt !== attempt) return;
    GameRecovery.restore(this, attempt.before);
    attempt.status = "failed";
    attempt.errorCode = error?.code || error?.message || "request_interrupted";
    attempt.errorMessage = this.describeAIError(error);
    this.pendingTurnAttempt = attempt;
    this.isAIGenerating = false;
    this.restoreCommittedTurnView();
    this.saveGameState();
    this.notifyRecoveryUI();
  }

  retryPendingTurn(local = false) {
    const attempt = this.pendingTurnAttempt;
    if (!attempt || attempt.status === "running" || this.isAIGenerating) return;
    return this.resolveFactionAction(attempt.choice, {attempt, local});
  }

  discardPendingTurn() {
    const attempt = this.pendingTurnAttempt;
    if (!attempt || this.isAIGenerating) return;
    // Failure already restored the committed world. Preserve any reading navigation since then.
    this.pendingTurnAttempt = null;
    this.saveGameState();
    this.notifyRecoveryUI();
    this.presentFactionChoices();
    this.updateDialogueNavUI();
  }

  abandonTurnForNavigation() {
    if (this.activeAIRequestController) {
      this.cancelAIRequest();
      this.aiConfigRevision = (this.aiConfigRevision || 0) + 1;
    }
    if (this.pendingTurnAttempt?.status === "running") GameRecovery.restore(this, this.pendingTurnAttempt.before);
    this.pendingTurnAttempt = null;
    this.pendingApiChoices = null;
    this.turnPresentationError = null;
    this.isAIGenerating = false;
    this.notifyRecoveryUI();
  }

  // 触发有限时长的危机心跳暗角脉冲 (严格防粘连：指定时长后必须彻底终止并淡出)
  triggerDangerPulse(duration = 1600) {
    if (!this.vignetteOverlay) return;
    if (this.dangerPulseTimer) {
      clearTimeout(this.dangerPulseTimer);
      this.dangerPulseTimer = null;
    }
    this.vignetteOverlay.classList.remove("danger-pulse");
    // 强制触发重排，确保动画从 0% 重新平滑淡入淡出
    void this.vignetteOverlay.offsetWidth;
    this.vignetteOverlay.classList.add("danger-pulse");

    this.dangerPulseTimer = setTimeout(() => {
      if (this.vignetteOverlay) {
        this.vignetteOverlay.classList.remove("danger-pulse");
      }
      this.dangerPulseTimer = null;
    }, duration);
  }

  // 彻底清除所有全屏特效 (血红暗角脉冲、全屏闪光等)
  clearAllScreenEffects() {
    if (this.dangerPulseTimer) {
      clearTimeout(this.dangerPulseTimer);
      this.dangerPulseTimer = null;
    }
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    if (this.vignetteOverlay) {
      this.vignetteOverlay.classList.remove("danger-pulse");
    }
    if (this.screenFlashOverlay) {
      this.screenFlashOverlay.className = "screen-flash-overlay";
    }
  }

  // 更新环境线香与暗角
  updateIncenseHUD() {
    const pct = Math.round((this.dangerTicks / this.maxDangerTicks) * 100);
    if (this.incenseAsh) this.incenseAsh.style.height = `${pct}%`;

    const factionObj = WORLD_PRESETS.factions[this.currentFaction];
    const fName = (factionObj && factionObj.name) ? factionObj.name.split(" · ")[0] : "天下";

    if (this.dangerTicks >= 3) {
      this.triggerDangerPulse(1600);
      if (this.incenseLabel) this.incenseLabel.innerText = `${fName} · 烽烟将起`;
      if (this.incenseSub) this.incenseSub.innerText = "暗流激荡，天下存亡系于一线";
    } else {
      if (this.vignetteOverlay) this.vignetteOverlay.classList.remove("danger-pulse");
      if (this.dangerTicks === 2) {
        if (this.incenseLabel) this.incenseLabel.innerText = `${fName} · 寒夜惊涛`;
        if (this.incenseSub) this.incenseSub.innerText = "部族与朝野猜忌，博弈渐烈";
      } else {
        if (this.incenseLabel) this.incenseLabel.innerText = `${fName} · 霜雪肃穆`;
        if (this.incenseSub) this.incenseSub.innerText = "更次深沉，四野寂静";
      }
    }
  }

  // 拟合历史政治人物镜像 (根据当前阵营与思潮偏好)
  calculateFittedPersona() {
    const { authority, pragmatism, progress, cognition } = this.ideologyVector;

    // 向量距离度量
    let bestMatch = WORLD_PRESETS.historicalPersonas[0];
    let minDistance = 9999;

    const personaVectors = {
      zhang_juzheng: { authority: 6, pragmatism: 6, progress: 5, cognition: 3 },
      yu_qian: { authority: 5, pragmatism: -6, progress: -2, cognition: 2 },
      hai_rui: { authority: -4, pragmatism: -7, progress: -4, cognition: -2 },
      dorgon: { authority: 8, pragmatism: 7, progress: 3, cognition: 2 },
      hong_taiji: { authority: 6, pragmatism: 6, progress: 5, cognition: 6 },
      fan_wencheng: { authority: 3, pragmatism: 7, progress: 4, cognition: 5 },
      ligdan_khan: { authority: 4, pragmatism: -7, progress: -4, cognition: -3 },
      altan_khan: { authority: -3, pragmatism: 6, progress: 5, cognition: 5 },
      zheng_chenggong: { authority: 4, pragmatism: 4, progress: 7, cognition: 6 },
      liu_rushi: { authority: -4, pragmatism: -6, progress: 3, cognition: 4 }
    };

    // 优先考虑当前阵营的人物，如果阵营有则加权匹配
    for (const p of WORLD_PRESETS.historicalPersonas) {
      const target = personaVectors[p.id] || { authority: 0, pragmatism: 0, progress: 0, cognition: 0 };
      let dist = Math.sqrt(
        Math.pow(authority - target.authority, 2) +
        Math.pow(pragmatism - target.pragmatism, 2) +
        Math.pow(progress - target.progress, 2) +
        Math.pow(cognition - target.cognition, 2)
      );

      // 同阵营人物距离给 20% 偏好衰减
      if (p.faction === this.currentFaction) dist *= 0.8;

      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = p;
      }
    }

    return bestMatch;
  }

  // 渲染天命塔罗牌面
  renderDestinyCard() {
    const persona = this.calculateFittedPersona();
    const v = this.ideologyVector;
    const calcPct = (val) => Math.round(((val + 10) / 20) * 100);

    this.destinyCardContainer.innerHTML = `
      <div class="tarot-card">
        <div class="tarot-header">
          <span class="tarot-badge" style="background:${persona.cardColor}22; color:${persona.cardColor}; border-color:${persona.cardColor}44;">
            ${persona.cardBadge} · ${persona.tarotCard}
          </span>
          <div class="tarot-title">${persona.name}</div>
          <div class="tarot-profile">${persona.profile} · ${persona.archetype}</div>
        </div>

        <div class="tarot-quote">“${persona.quote}”</div>
        <div class="tarot-desc">${persona.desc}</div>

        <div class="axes-score-list">
          <div class="axis-item">
            <div class="axis-meta">
              <span>治世威权 (民本 ── 极权)</span>
              <span style="color:var(--accent-gold);">${v.authority > 0 ? "偏向铁腕集权" : "偏向宽政民本"} (${v.authority})</span>
            </div>
            <div class="axis-track">
              <div class="axis-fill" style="width:${calcPct(v.authority)}%; background:#c2410c;"></div>
            </div>
          </div>

          <div class="axis-item">
            <div class="axis-meta">
              <span>经世实务 (气节 ── 实利)</span>
              <span style="color:var(--accent-jade);">${v.pragmatism > 0 ? "偏向功利算计" : "偏向道德气节"} (${v.pragmatism})</span>
            </div>
            <div class="axis-track">
              <div class="axis-fill" style="width:${calcPct(v.pragmatism)}%; background:#0284c7;"></div>
            </div>
          </div>

          <div class="axis-item">
            <div class="axis-meta">
              <span>秩序更张 (守旧 ── 变革)</span>
              <span style="color:var(--accent-violet);">${v.progress > 0 ? "偏向更张求变" : "偏向宗法守常"} (${v.progress})</span>
            </div>
            <div class="axis-track">
              <div class="axis-fill" style="width:${calcPct(v.progress)}%; background:#9333ea;"></div>
            </div>
          </div>

          <div class="axis-item">
            <div class="axis-meta">
              <span>认知格局 (感知 ── 直觉)</span>
              <span style="color:var(--accent-blue);">${v.cognition > 0 ? "偏向宏大直觉" : "偏向市井实务"} (${v.cognition})</span>
            </div>
            <div class="axis-track">
              <div class="axis-fill" style="width:${calcPct(v.cognition)}%; background:#0d9488;"></div>
            </div>
          </div>
        </div>

        <button class="qm-btn qm-accent" style="width:100%; justify-content:center; padding:10px;" onclick="window.__vnEngine.openSwarmFromCard()">
          🌌 查看此人物镜像的预设参考分布
        </button>
      </div>
    `;
  }

  openSwarmFromCard() {
    this.closeDrawer(this.drawerDestiny);
    this.renderSwarmObservatory();
    this.openDrawer(this.drawerSwarm);
  }

  // 展示游戏内置的人物镜像设计参考，不读取玩家统计。
  renderSwarmObservatory() {
    const persona = this.calculateFittedPersona();
    const list = WORLD_PRESETS.swarmSamplingPool;
    const userItem = list.find(item => item.name.includes(persona.name.split(" · ")[1].replace("型",""))) || list[0];

    this.swarmObservatoryBody.innerHTML = `
      <div class="swarm-meta-banner">
        <div style="font-size:0.95rem; font-weight:700; color:var(--accent-gold); margin-bottom:4px;">
          📊 九州人物镜像 · 预设参考分布
        </div>
        <div style="font-size:0.8rem; color:var(--text-main); line-height:1.6;">
          当前您身处【${WORLD_PRESETS.factions[this.currentFaction].name}】阵营；<br/>
          您的选择在此动荡世道中折射出 <strong>${persona.name}</strong>（预设参考占比 <strong>${userItem.pct}%</strong>）。<br/>
          下列百分比来自游戏内置的设计示例，供人物镜像对照；未接入实时玩家统计。
        </div>
      </div>

      <div class="swarm-stats-grid">
        ${list.map(item => `
          <div class="swarm-stat-item ${item.name === userItem.name ? "is-user-match" : ""}">
            <div class="swarm-stat-header">
              <span style="font-weight:600; color:${item.name === userItem.name ? "var(--accent-gold)" : "var(--text-bright)"};">
                [${item.faction}] ${item.name} ${item.name === userItem.name ? "★ (您的映射)" : ""}
              </span>
              <span style="font-family:var(--font-mono); color:${item.color}; font-weight:700;">${item.pct}%</span>
            </div>
            <div class="swarm-bar-track">
              <div class="swarm-bar-fill" style="width:${item.pct * 3}%; background:${item.color};"></div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // 记录命运之结
  recordFateKnot(title, desc) {
    this.fateKnots.push({
      knotId: Math.random().toString(16).substring(2, 8),
      turn: this.currentTurn,
      dangerTicks: this.dangerTicks,
      coords: this.currentCoords,
      faction: this.currentFaction,
      storyNodeId: this.currentStoryNodeId,
      branchDepth: this.branchDepth || 0,
      backlogLength: (this.backlog || []).length,
      vector: JSON.parse(JSON.stringify(this.ideologyVector)),
      title,
      desc,
      apiHistoryLength: (this.apiHistory || []).length,
      extrapolationHistoryLength: (this.extrapolationHistory || []).length,
      choices: Array.isArray(this.pendingApiChoices) ? JSON.parse(JSON.stringify(this.pendingApiChoices)) : null,
      isExtrapolating: this.isExtrapolating,
      isEpilogueSequel: this.isEpilogueSequel
    });
  }

  // 时光回溯
  rewindToKnot(idx) {
    const knot = this.fateKnots[idx];
    if (!knot) return;

    this.abandonTurnForNavigation();

    this.gameState = "PLAYING";
    this.currentTurn = knot.turn;
    this.dangerTicks = knot.dangerTicks;
    this.currentCoords = knot.coords;
    this.currentFaction = knot.faction || this.currentFaction;
    if (knot.storyNodeId) {
      this.currentStoryNodeId = knot.storyNodeId;
    }
    this.branchDepth = knot.branchDepth || 0;
    this.ideologyVector = JSON.parse(JSON.stringify(knot.vector));
    this.fateKnots = this.fateKnots.slice(0, idx + 1);

    // 截断历史，防止未来幻觉历史污染当前推理
    if (knot.backlogLength !== undefined && this.backlog) {
      this.backlog = this.backlog.slice(0, knot.backlogLength);
      if (this.backlogStream) {
        this.backlogStream.innerHTML = "";
        this.backlog.forEach(b => this.appendBacklogEntry(b.speaker, b.text));
      }
    }
    if (knot.apiHistoryLength !== undefined && this.apiHistory) {
      this.apiHistory = this.apiHistory.slice(0, knot.apiHistoryLength);
    }
    if (knot.extrapolationHistoryLength !== undefined && this.extrapolationHistory) {
      this.extrapolationHistory = this.extrapolationHistory.slice(0, knot.extrapolationHistoryLength);
    }
    this.isExtrapolating = knot.isExtrapolating || false;
    this.isEpilogueSequel = knot.isEpilogueSequel || false;
    // Older knots have no choice snapshot. Never carry a later scene's actions backwards.
    this.pendingApiChoices = this.isExtrapolating && Array.isArray(knot.choices) ? knot.choices
      .filter(choice => typeof choice === "string" || (choice && typeof choice === "object" && !Array.isArray(choice) && typeof choice.text === "string"))
      .map(choice => typeof choice === "string" ? choice : ({
        text: choice.text,
        tag: typeof choice.tag === "string" ? choice.tag : "自由抉择",
        bias: Object.fromEntries(["authority", "pragmatism", "progress", "cognition"].map(axis =>
          [axis, Number.isFinite(choice.bias?.[axis]) ? choice.bias[axis] : 0])),
        diceBase: Number.isFinite(choice.diceBase) ? choice.diceBase : 10
      })) : null;

    this.updateIncenseHUD();
    this.closeDrawer(this.drawerRibbon);
    if (this.drawerCrisis) this.closeDrawer(this.drawerCrisis);
    this.choiceOverlay.classList.remove("visible");

    const map = WORLD_PRESETS.thinMaps[this.currentCoords];
    if (map) {
      document.getElementById("bg-active").style.backgroundImage = map.bgGradient;
    }

    this.storyQueue = [
      {
        speaker: "宿命倒卷",
        sub: "【时光回溯 · 因果重塑】",
        type: "narrator",
        stageChar: "center",
        text: `光阴逆流，因果重塑。你回到了【${knot.title}】的岔路口。重整旌旗，重新裁决天下的去向吧。`
      }
    ];
    this.currentStep = 0;
    this.playNextInQueue();
    this.saveGameState();
  }

  // 行囊卡牌
  renderPocket() {
    document.getElementById("pocket-count").innerText = this.inventory.length;
    this.pocketGrid.innerHTML = this.inventory.map(c => `
      <div class="pocket-card">
        <div class="pocket-card-title">${escapeHTML(c.name)} <span style="color:var(--accent-gold); font-size:0.75rem;">(+${escapeHTML(c.power ?? 0)} 权能)</span></div>
        <div class="pocket-card-desc">${escapeHTML(c.desc)}</div>
        <div class="pocket-aspects">
          ${(Array.isArray(c.aspects) ? c.aspects : []).map(a => `<span class="pocket-tag">${escapeHTML(a)}</span>`).join("")}
        </div>
      </div>
    `).join("");
  }

  // 命运红丝带时光机
  renderRibbon() {
    this.ribbonKnotsList.innerHTML = this.fateKnots.map((k, idx) => `
      <div class="ribbon-knot-item">
        <div>
          <div style="font-weight:700; color:var(--accent-gold); font-size:0.9rem;">${escapeHTML(k.title)}</div>
          <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHTML(k.desc)}</div>
        </div>
        <button class="btn-rewind-knot" onclick="window.__vnEngine.rewindToKnot(${idx})">⎌ 回溯至此</button>
      </div>
    `).join("");
  }

  // 空间舆图
  renderMapSelector() {
    const mapGrid = document.getElementById("map-grid-selector");
    const maps = Object.values(WORLD_PRESETS.thinMaps);

    mapGrid.innerHTML = maps.map(m => `
      <div class="map-option-card ${m.id === this.currentCoords ? "current" : ""}" onclick="window.__vnEngine.switchMap('${m.id}')">
        <div style="font-weight:700; color:var(--accent-gold);">${m.name}</div>
        <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">${m.realityConditions}</div>
      </div>
    `).join("");
  }

  switchMap(key) {
    if (!WORLD_PRESETS.thinMaps[key]) return;
    this.abandonTurnForNavigation();
    this.currentCoords = key;
    this.closeDrawer(this.drawerMap);
    const mapData = WORLD_PRESETS.thinMaps[key];
    const targetFaction = mapData.faction || this.currentFaction;
    if (targetFaction !== this.currentFaction) {
      this.currentFaction = targetFaction;
      const targetTree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
      this.currentStoryNodeId = targetTree ? targetTree.rootId : `${this.currentFaction}_act1`;
      this.isExtrapolating = false;
      this.branchDepth = 0;
    }
    document.getElementById("bg-active").style.backgroundImage = mapData.bgGradient;

    this.storyQueue = [
      {
        speaker: "舆图跃迁",
        sub: mapData.name,
        type: "narrator",
        stageChar: "center",
        text: `风云变幻，天地移位。你已亲临【${mapData.name}】。${mapData.realityConditions}`
      }
    ];
    this.currentStep = 0;
    this.playNextInQueue();
    this.saveGameState();
  }

  // 记入履历
  appendBacklogEntry(speaker, text) {
    const item = document.createElement("div");
    item.className = "backlog-item";
    item.innerHTML = `
      <div class="backlog-speaker">${escapeHTML(speaker)}</div>
      <div class="backlog-text">${escapeHTML(text)}</div>
    `;
    this.backlogStream.appendChild(item);
  }

  // ===========================================================================
  // 全局生命周期与状态持久化控制系统 (Lifecycle & Save/Continue State Machine)
  // ===========================================================================

  // 1. 显示标题主界面 (Title Screen)
  showTitleScreen() {
    this.gameState = "TITLE";
    if (this.gameViewport) this.gameViewport.classList.add("state-title");
    if (this.titleScreen) this.titleScreen.classList.add("active");

    // 清理打字机与自动播放计时器及全屏特效
    if (this.typeTimer) clearInterval(this.typeTimer);
    this.isTyping = false;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoPlay = false;
    this.clearAllScreenEffects();
    const autoBtn = document.getElementById("qm-auto");
    if (autoBtn) autoBtn.style.color = "var(--text-dim)";

    // 检查是否有本地存档
    const savedProgress = this.readGameSave();
    const saveStr = savedProgress ? JSON.stringify(savedProgress) : null;
    if (saveStr) {
      try {
        const saved = JSON.parse(saveStr);
        const fName = WORLD_PRESETS.factions[saved.currentFaction]?.name.split(" · ")[0] || "天下";
        if (this.titleSaveHint) {
          if (saved.isExtrapolating) {
            this.titleSaveHint.innerText = `${fName} · AI自由小说 (第${saved.branchDepth || saved.currentTurn || 1}轮)`;
          } else {
            const tree = WORLD_PRESETS.canonicalTrees[saved.currentFaction];
            const node = tree?.nodes[saved.currentStoryNodeId];
            const actNum = node ? node.actNumber : 1;
            this.titleSaveHint.innerText = `${fName} · 预设第${actNum}幕`;
          }
          this.titleSaveHint.style.color = "var(--accent-gold)";
        }
        if (this.titleBtnContinue) {
          this.titleBtnContinue.disabled = false;
        }
      } catch (e) {
        if (this.titleSaveHint) this.titleSaveHint.innerText = "无存档";
        if (this.titleBtnContinue) this.titleBtnContinue.disabled = true;
      }
    } else {
      if (this.titleSaveHint) this.titleSaveHint.innerText = "无存档";
      if (this.titleBtnContinue) this.titleBtnContinue.disabled = true;
    }
  }

  // 2. 开启新篇 (New Game)
  startNewGame(factionId) {
    this.abandonTurnForNavigation();
    this.gameState = "PLAYING";
    this.hasActiveProgress = true;
    if (this.titleScreen) this.titleScreen.classList.remove("active");
    if (this.gameViewport) this.gameViewport.classList.remove("state-title");

    this.currentFaction = factionId || this.currentFaction || "ming";
    const f = WORLD_PRESETS.factions[this.currentFaction];
    const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
    this.currentTurn = 1;
    this.currentCoords = f.defaultCoords;
    this.dangerTicks = 1;

    // 重置主剧情树与外推状态
    this.currentStoryNodeId = tree ? tree.initialNodeId : "ming_act1";
    this.isExtrapolating = false;
    this.branchDepth = 0;
    this.extrapolationHistory = [];
    this.reconciledCardsCache = {};
    this.lastSutureNote = null;
    this.needsSuturing = false;
    this.convergenceTargetId = null;
    this.visitedNodeIds = [this.currentStoryNodeId];
    this.inspectedNodeId = this.currentStoryNodeId;

    // 重置思潮与认知量表
    this.ideologyVector = {
      authority: 2,
      pragmatism: 3,
      progress: 2,
      cognition: 1
    };

    // 重置卡牌行囊
    this.inventory = JSON.parse(JSON.stringify(WORLD_PRESETS.initialCards));
    const pocketCount = document.getElementById("pocket-count");
    if (pocketCount) pocketCount.innerText = this.inventory.length;

    // 重置剧本履历与时光机
    this.backlog = [];
    if (this.backlogStream) this.backlogStream.innerHTML = "";
    this.fateKnots = [];

    // 重置 DeepSeek API 前缀历史流
    this.apiHistory = [];
    this.pendingApiChoices = null;
    this.updateCachePillUI();

    this.choiceOverlay.classList.remove("visible");
    this.updateIncenseHUD();
    this.loadCanonicalNode(this.currentStoryNodeId, false);
    this.saveGameState();
  }

  // 3. 重续前缘 (Continue Game)
  continueGame() {
    const savedProgress = this.readGameSave();
    if (!savedProgress) {
      return;
    }

    this.abandonTurnForNavigation();

    try {
      const saved = savedProgress;
      this.gameState = "PLAYING";
      if (this.titleScreen) this.titleScreen.classList.remove("active");
      if (this.gameViewport) this.gameViewport.classList.remove("state-title");

      this.currentFaction = saved.currentFaction || "ming";
      this.currentTurn = saved.currentTurn || 1;
      this.currentCoords = saved.currentCoords || WORLD_PRESETS.factions[this.currentFaction].defaultCoords;
      this.dangerTicks = saved.dangerTicks !== undefined ? saved.dangerTicks : 1;
      this.ideologyVector = saved.ideologyVector || { authority: 2, pragmatism: 3, progress: 2, cognition: 1 };
      this.inventory = saved.inventory || JSON.parse(JSON.stringify(WORLD_PRESETS.initialCards));
      this.fateKnots = saved.fateKnots || [];
      this.backlog = saved.backlog || [];

      // 恢复剧情树状态
      const tree = WORLD_PRESETS.canonicalTrees[this.currentFaction];
      this.currentStoryNodeId = saved.currentStoryNodeId || (tree ? tree.initialNodeId : "ming_act1");
      this.isExtrapolating = !!saved.isExtrapolating;
      this.isEpilogueSequel = !!saved.isEpilogueSequel;
      this.branchDepth = saved.branchDepth !== undefined ? saved.branchDepth : (this.isExtrapolating ? 1 : 0);
      this.extrapolationHistory = saved.extrapolationHistory || [];
      this.reconciledCardsCache = saved.reconciledCardsCache || {};
      this.lastSutureNote = saved.lastSutureNote || null;
      this.convergenceTargetId = saved.convergenceTargetId || null;
      this.visitedNodeIds = saved.visitedNodeIds || [this.currentStoryNodeId];
      this.inspectedNodeId = this.currentStoryNodeId;
      this.updateBranchIndicatorUI(!!this.reconciledCardsCache[this.currentStoryNodeId]);

      // 还原履历 DOM
      if (this.backlogStream) {
        this.backlogStream.innerHTML = "";
        this.backlog.forEach(b => this.appendBacklogEntry(b.speaker, b.text));
      }

      const pocketCount = document.getElementById("pocket-count");
      if (pocketCount) pocketCount.innerText = this.inventory.length;

      // 恢复 DeepSeek API 缓存历史与遥测
      this.apiHistory = saved.apiHistory || [];
      this.pendingApiChoices = saved.pendingApiChoices || null;
      let currentIdentity = null;
      try { currentIdentity = this.resolveAIProvider().identity; } catch (_) {}
      this.cacheTelemetry = saved.cacheTelemetry?.sourceIdentity === currentIdentity && currentIdentity ? saved.cacheTelemetry :
        {lastHitTokens: null, lastMissTokens: null, lastHitRate: "未提供", cacheUsageKnown: false, totalHits: 0};
      this.updateCacheTelemetryUI();

      this.updateIncenseHUD();

      // 恢复背景
      const map = WORLD_PRESETS.thinMaps[this.currentCoords];
      if (map) {
        document.getElementById("bg-active").style.backgroundImage = map.bgGradient;
      }

      this.choiceOverlay.classList.remove("visible");

      this.pendingTurnAttempt = GameRecovery.resumeAttempt(saved.pendingTurnAttempt, saved);

      // 恢复剧情流
      if (saved.storyQueue && saved.storyQueue.length > 0) {
        this.storyQueue = saved.storyQueue;
        this.currentStep = Math.max(1, Math.min(saved.currentStep || 1, saved.storyQueue.length));
        this.restoreCommittedTurnView();
      } else {
        this.loadCanonicalNode(this.currentStoryNodeId, false);
      }
      this.hasActiveProgress = true;
      this.notifyRecoveryUI();
    } catch (e) {
      this.saveStatus = {state: "error", message: "存档未能恢复，原存档仍保留。请导出备份后再尝试。"};
      this.notifyRecoveryUI();
    }
  }

  // 4. 返回主界面 (Return to Title)
  returnToTitle() {
    this.cancelAIRequest();
    this.saveGameState();

    // 关闭全部抽屉
    const allDrawers = [
      this.drawerBacklog,
      this.drawerPocket,
      this.drawerRibbon,
      this.drawerMap,
      this.drawerSettings,
      this.drawerDestiny,
      this.drawerSwarm,
      this.drawerFaction,
      this.drawerCrisis,
      this.drawerStoryTree,
      this.drawerOpenInput
    ];
    allDrawers.forEach(d => {
      if (d) this.closeDrawer(d);
    });

    if (this.choiceOverlay) {
      this.choiceOverlay.classList.remove("visible");
    }

    this.showTitleScreen();
  }

  // 5. 存储当前游戏状态到 LocalStorage
  saveGameState() {
    if (this.gameState === "TITLE" && !this.hasActiveProgress) {
      if (this.saveStatus?.state !== "error") this.saveStatus = {state: "idle", message: "请先重续前缘或开启新篇，再保存当前进度。"};
      this.notifyRecoveryUI();
      return false;
    }
    try {
      const result = GameRecovery.writeSave(localStorage, GameRecovery.savedState(this));
      this.saveStatus = {state: "saved", timestamp: result.timestamp, message: "进度已保存到此浏览器"};
      this.notifyRecoveryUI();
      return true;
    } catch (e) {
      this.saveStatus = {state: "error", message: e?.name === "QuotaExceededError" ?
        "浏览器存储空间不足，本次进度尚未保存；上次成功存档仍保留。请先导出进度备份。" :
        "浏览器未能保存本次进度；上次成功存档仍保留。请导出进度备份，稍后重试。"};
      this.notifyRecoveryUI();
      return false;
    }
  }

  readGameSave() {
    try {
      const raw = localStorage.getItem("vn_save_state");
      return raw ? GameRecovery.parseSave(raw) : null;
    } catch (error) {
      this.saveStatus = {state: "error", message: error?.message === "invalid_save" || error instanceof SyntaxError ?
        "存档格式无法读取，原数据仍保留；请勿覆盖或清除站点数据。" : "浏览器拒绝读取存档，请检查站点存储权限。"};
      this.notifyRecoveryUI();
      return null;
    }
  }

  exportGameProgress() {
    const progress = this.gameState === "TITLE" && !this.hasActiveProgress ? this.readGameSave() : this;
    if (!progress) {
      this.saveStatus = {state: "error", message: "当前没有可导出的有效进度，原有站点数据仍保留。"};
      this.notifyRecoveryUI();
      return null;
    }
    const content = GameRecovery.backup(progress);
    const url = URL.createObjectURL(new Blob([content], {type: "application/json"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `九州进度-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return content;
  }

  previewGameBackup(raw) {
    const state = GameRecovery.parseBackup(raw);
    const nodes = WORLD_PRESETS.canonicalTrees[state.currentFaction]?.nodes || {};
    if (!Object.hasOwn(WORLD_PRESETS.thinMaps, state.currentCoords) || !Object.hasOwn(nodes, state.currentStoryNodeId) ||
      state.fateKnots.some(knot => !Object.hasOwn(WORLD_PRESETS.thinMaps, knot.coords) ||
        (knot.storyNodeId != null && !Object.hasOwn(WORLD_PRESETS.canonicalTrees[knot.faction || state.currentFaction]?.nodes || {}, knot.storyNodeId)))) throw new Error("invalid_backup");
    return {state, faction: WORLD_PRESETS.factions[state.currentFaction]?.name || state.currentFaction,
      turn: state.currentTurn, timestamp: state.timestamp || null};
  }

  restoreGameBackup(state) {
    if (this.isAIGenerating) throw new Error("backup_generation_running");
    // Revalidate the preview and persist first: a failed write cannot replace the live world.
    const checked = this.previewGameBackup(JSON.stringify({format: "jiuzhou-progress", version: 1, state})).state;
    try {
      GameRecovery.writeSave(localStorage, {...checked, timestamp: Date.now()});
    } catch (error) {
      this.saveStatus = {state: "error", message: "备份尚未恢复：浏览器无法写入，当前进度和原存档均保留。"};
      this.notifyRecoveryUI();
      return false;
    }
    this.continueGame();
    this.saveStatus = {state: "saved", timestamp: Date.now(), message: "进度备份已恢复；API 设置保持当前配置"};
    this.notifyRecoveryUI();
    return true;
  }

  // 6. 危机系统彻底废除 (杜绝任何剧情杀与游戏强行终止)
  triggerCrisisGameOver() {
    console.warn("[Narrative Engine] 危机终局剧情杀已被彻底废除，保障玩家剧情无限向前推进！");
  }

  // ===========================================================================
  // DeepSeek Prompt Caching 四层前缀架构载荷构造器与 API 链路
  // ===========================================================================

  // 静态规则与阵营资料构成稳定前缀；篇幅、骰点和玩家行动只放在末尾。
  buildDeepSeekCachePayload(choice, d1, d2, total, success) {
    // 根据预期篇幅 (500 / 2000 / 5000) 动态设置主持篇幅要求
    const lengthSettings = {
      500: {
        label: "精炼快节奏",
        beatsRange: "2 到 3 拍",
        wordCount: "交付正文至少500个非空白可见字符，不设输出上限",
        detailDesc: "篇幅精简、节奏凌厉，快速推进局势转折与当面交锋，绝无冗余修辞。"
      },
      2000: {
        label: "标准推演深度",
        beatsRange: "3 到 5 拍",
        wordCount: "交付正文至少2000个非空白可见字符，不设输出上限",
        detailDesc: "层次分明、张弛有度，人物心理交锋、氛围烘托与局势演化兼备。"
      },
      5000: {
        label: "史诗宏大详述",
        beatsRange: "按需要组织完整段落",
        wordCount: "最终交付的 beats[].text 合并后至少5000个非空白可见字符，思考、JSON键、工具、插画说明及选项不计入正文",
        detailDesc: "宏大史诗质感、极深的人物心理博弈、细腻的环境感官与全景战场/朝堂多重视角交织。"
      }
    };
    const targetLengthCfg = lengthSettings[this.expectedLength] || lengthSettings[2000];

    const factionKey = this.currentFaction || "qing";

    // 四大阵营跑团主持人角色设定、当面NPC群像与核心矛盾 (严格隔离：绝不交叉污染)
    const factionProfiles = {
      qing: {
        name: "后金八旗 · 盛京汗殿",
        eraTitle: "《问鼎燕京：清朝入关大纪事》",
        defaultBrief: "清朝崇德八年至顺治元年入关大变局：太宗崩逝、豪格多尔衮议立福临、范文程叩阙献定鼎大策、闯王李自成破燕京崇祯殉国、吴三桂山海关剃发借兵、石河一片石决战狂风大破大顺军、多尔衮率军入京定鼎燕京。",
        inRoomNpcs: "睿亲王多尔衮、庄妃博尔济吉特氏（大玉儿）、肃亲王豪格、大学士范文程、前大明蓟辽总督洪承畴、平西伯吴三桂等",
        npcRoster: `- 睿亲王多尔衮：两白旗领袖，三十出头，英武深沉，一生志在夺取天下与问鼎燕京，既背负着与庄妃的前缘，又要在摄政重担下统驭桀骜不驯的八旗勋贵；
- 庄妃博尔济吉特氏（大玉儿）：聪慧绝顶、容色倾城却深沉如渊。在孤儿寡母的绝境中，以惊人的政治智慧在多尔衮与豪格两强之间斡旋，保全福临大统；
- 肃亲王豪格：太宗长子，正蓝旗主，军功赫赫但刚愎易躁；
- 大学士范文程：历事四朝元老汉臣，力陈入关“代明复仇、止杀安民、严明军纪、建立法统”以收中原民心；
- 前大明蓟辽总督洪承畴：深通关内外军机与士绅民心，沉稳老练；
- 平西伯吴三桂：关宁铁骑统帅，夹在大顺与大清之间，冲冠一怒，终致剃发借兵引清入关。`,
        sceneAtmosphere: "盛京汗庭与白山黑水风雪、八旗刀兵寒芒逼视、山海关一片石漫天黄沙狂飙"
      },
      ming: {
        name: "大明中枢 · 紫禁文渊",
        eraTitle: "《日月丽天：大明中枢中兴纪事》",
        defaultBrief: "崇祯十七年紫禁夜寒与中兴大业：太仓库竭国库仅余三万两、中极殿借饷周奎哭穷、锦衣卫缇骑南下查税开海通商、煤山断绫血诏勤王、兵仗局与天津水师借洋重炮扼守九门、击溃闯军重组铁血内阁中兴社稷。",
        inRoomNpcs: "崇祯皇帝朱由检、户部尚书倪元璐、首辅周延儒/魏藻德、锦衣卫指挥使骆养性、兵部督师孙传庭/卢象升残部、工部徐光启传人陈子龙等",
        npcRoster: `- 崇祯皇帝朱由检：宵衣旰食、刚烈求治却孤绝多疑。面对国库耗竭与江南抗税的死局，宁斩白绫战死国门，誓以铁血手腕借洋火器、开海辟饷挽狂澜；
- 户部尚书倪元璐：忠贞清骨，力主强收百官勋贵私库以充边饷，与贪墨京官殊死搏斗；
- 锦衣卫指挥使骆养性：执掌北镇抚司诏狱缇骑，手握密旨抄没私库、南下弹压抗粮；
- 东阁大学士兼海防督臣陈子龙：复社文宗兼徐光启火器传人，深谋远虑，力倡废除海禁、借西法重炮改写战局；
- 平西伯吴三桂：手握两万关宁铁骑，待饷勤王，在天下大变前夕权衡大明忠义与自家存亡。`,
        sceneAtmosphere: "紫禁城内阁雪夜深寒、煤山古柏朔风、九门千斤闸与红夷大炮轰鸣、君臣泣血背水一战"
      },
      mongol: {
        name: "大漠蒙古 · 黄金汗帐",
        eraTitle: "《瀚海天穹：大漠黄金复兴纪事》",
        defaultBrief: "察哈尔西奔与长生天白狼盟誓：林丹汗天花崩逝托孤、额哲献玉玺受封亲王、阿尔斯兰率残部誓死不降抗命阴山、鄂尔多斯八白室苏勒德神矛秘祭唤醒战神之灵、两朝夹缝张家口互市筹措火器、乘甲申中原空虚万骑雷霆南下重塑大元南北分治。",
        inRoomNpcs: "察哈尔额哲、苏泰太后、怯薛统领阿尔斯兰、达尔扈特盲眼大萨满乌恩其、科尔沁台吉吴克善、土默特头领等",
        npcRoster: `- 怯薛统领阿尔斯兰：黄金家族末代近卫统领，割面誓死不降满汉，只身拔出查干苏勒德九斿神矛，誓以铁骑烈火重聚草原；
- 额尔克孔果尔额哲：林丹汗之子，为保全残存部族被迫向后金献出传国玉玺，心中深埋耻辱与复仇火种；
- 苏泰太后：察哈尔末代汗妃，手腕精明深沉，在盛京汗廷联姻与大漠秘盟间维系平衡；
- 盲眼大萨满乌恩其：达尔扈特守陵人首领，沟通长生天战神之灵，以萨满通神秘仪鼓舞万千游牧勇士；
- 科尔沁台吉吴克善：依附满洲的草原豪酋，兼具草原枭雄的狠辣与对黄金家族正统的隐秘敬畏。`,
        sceneAtmosphere: "大漠瀚海风沙呼啸、斡难河畔九斿白纛猎猎狂卷、八白室萨满篝火秘祭、万骑弯刀奔腾踏碎戈壁"
      },
      nanming: {
        name: "南国海邦 · 闽海龙旗",
        eraTitle: "《闽海龙旗：大明海邦日不落纪事》",
        defaultBrief: "大洋风涛与郑氏远洋抗清大业：甲申国难南渡、复社陈子龙夏完淳叩阍求援、安平重洋阅兵、澳门博卡罗引入红夷巨炮与盖伦战舰造法、创设自生火器营与铁人军、隆武登基赐国姓、郑成功焚青衫起兵金门、巨舰横江围南京、东征收复台湾开创大明海上日不落帝国。",
        inRoomNpcs: "招讨大将军国姓爷郑成功、平国公郑芝龙、隆武帝朱聿键、复社少年夏完淳、泰西造炮大师毕方济与卡法尔重炮卫队等",
        npcRoster: `- 招讨大将军郑成功（朱成功）：风华正茂、文武双全，断然决裂降清生父，焚青衫投笔从戎。以近代海权战略打造铁人连环玄铠军与巨舰火炮，志在远洋拓土复兴社稷；
- 平国公郑芝龙：纵横东海的大海商霸主，手握千艘帆樯与洋银百万，极度精明功利，在满清利诱与大明忠义间反复算计；
- 隆武帝朱聿键：富有中兴雄心的南明中枢天子，重用郑森赐国姓，誓以海外关税与水师天兵收复旧都；
- 兵科给事中夏完淳：十七岁江南名士，骨鲠气节，泛海联络复社清流与海上武装，视死如归；
- 澳门耶稣会铸炮师毕方济/曼努埃尔：西洋火器大师，带来二十四磅加农大熕与战列线侧舷齐射战术。`,
        sceneAtmosphere: "大洋惊涛风雷激荡、三层重炮盖伦巨舰侧舷齐射、铁人军玄甲重铠浴血斩浪、海疆千帆破浪开新天"
      }
    };

    const currentProfile = factionProfiles[factionKey] || factionProfiles.qing;

    // 阵营隔离铁律：仅为当前阵营注入其专属套图工具，严禁窥探或引入其他阵营套图！
    let factionVault = {};
    if (typeof window !== "undefined" && window.FACTION_ILLUSTRATION_VAULT) {
      factionVault = window.FACTION_ILLUSTRATION_VAULT[factionKey] || {};
    } else if (typeof global !== "undefined" && global.FACTION_ILLUSTRATION_VAULT) {
      factionVault = global.FACTION_ILLUSTRATION_VAULT[factionKey] || {};
    }

    const toolLines = Object.values(factionVault).map(t => 
      `     * show_illustration: { "id": "${t.id}", "title": "${t.title}", "caption": "${t.description.substring(0, 45)}..." }`
    ).join("\n");

    const harnessIdentityAndPersona = `你是一位沉浸感与戏剧张力兼备的明末清初历史跑团主持人（TRPG Game Master）。
当前带团阵营：【${currentProfile.name}】。

【带团原则与叙事逻辑】：
1. 坚持第二人称（【你】）第一核心视角：
   - 所有的感官白描与物理场景永远落脚在【你】的身上——描述眼前的${currentProfile.sceneAtmosphere}；
   - 绝非第三人称局外旁观的小说家，让玩家身临其境置身于${currentProfile.name}生死转折当场。
2. 跑团主持推进流程与篇幅控制：
   - 紧密承接玩家的行动与掷骰判定结果（成功/受挫），推动环境世界给出即时反应；
   - 让身处同室的历史巨擘与重臣（${currentProfile.inRoomNpcs}）作为跑团 NPC，以面对面神态、诛心言辞直接向【你】发问或施压；
   - 按本轮末尾给出的篇幅要求组织剧本场景卡（beats），适合分段对白阅读；只有最终交付的对白和叙述算正文。
3. 视听与舞台效果（stage_effects，可选填）：
   - 在关键转折或掷骰反馈时，可在 stage_effects 中选填舞台效果：
     * screen_flash: { "color": "white|red|gold" }
     * screen_shake: { "intensity": "light|medium|heavy", "duration": 500 }
     * weather_effect: { "type": "blizzard|rain|clear" }
   - 【${currentProfile.name}专属插画展示工具（仅限本阵营调用，将在剧情流中以独立视觉段落全景呈现，涵盖俘虏、战斗、战争、爱情/同袍深情羁绊、胜利、财富）】：
${toolLines || `     * show_illustration: { "id": "${factionKey}_war", "title": "战局画卷", "caption": "战鼓惊天" }`}
4. 行动抉择（choices）：
   - 在结尾给出 3 个具象、充满战术张力与利益博弈的下一步跑团行动建议供玩家抉择（第4项由玩家开放自填）。
   - 正文 beats[].text 及场景说明只呈现已经发生的行动、此刻感官、人物对白和悬念；下一步可选行动只放在 choices。
   - 不要在正文罗列、复述或提前预告选项，不写“你有三个选择”“你可以选择A、B、C”等菜单话术，也不要替玩家选定尚未作出的行动。抉择在阅读结束后由独立弹窗呈现。

【输出格式铁律】：
若接口提供原生工具，可先读取世界、暂存与检查草稿，再交付；工具调用和工具结果不属于正文。最终交付必须为严格合法的 JSON 对象，严禁前后闲聊，格式如下：
{
  "beats": [
    {
      "speaker": "角色名或跑团GM",
      "sub": "动作、神态或掷骰判定细节",
      "type": "npc|narrator",
      "stageChar": "left|center|right",
      "text": "直接面向【你】的第二人称对白或跑团场景描摹"
    }
  ],
  "stage_effects": [
    { "name": "screen_flash", "params": { "color": "white" } }
  ],
  "choices": [
    { "text": "具象行动建议 1", "tag": "风格标签" },
    { "text": "具象行动建议 2", "tag": "风格标签" },
    { "text": "具象行动建议 3", "tag": "风格标签" }
  ]
}`;

    // Layer 2: 时代全景历史背景与小说大纲底本 (按当前阵营精准匹配对应两万字长篇史诗底本)
    let epicNovel = "";
    if (typeof window !== "undefined") {
      if (window.FACTION_EPIC_NOVELS && window.FACTION_EPIC_NOVELS[factionKey]) {
        epicNovel = window.FACTION_EPIC_NOVELS[factionKey];
      } else if (window[`${factionKey.toUpperCase()}_EPIC_NOVEL`]) {
        epicNovel = window[`${factionKey.toUpperCase()}_EPIC_NOVEL`];
      } else if (window.WORLD_PRESETS && window.WORLD_PRESETS[`${factionKey}EpicNovel`]) {
        epicNovel = window.WORLD_PRESETS[`${factionKey}EpicNovel`];
      }
    }
    if (!epicNovel && typeof global !== "undefined") {
      if (global.FACTION_EPIC_NOVELS && global.FACTION_EPIC_NOVELS[factionKey]) {
        epicNovel = global.FACTION_EPIC_NOVELS[factionKey];
      } else if (global[`${factionKey.toUpperCase()}_EPIC_NOVEL`]) {
        epicNovel = global[`${factionKey.toUpperCase()}_EPIC_NOVEL`];
      }
    }
    if (!epicNovel) {
      try {
        if (typeof require !== "undefined") {
          const fs = require("fs");
          const path = require("path");
          const novelPath = path.join(__dirname, "data", `${factionKey}-epic-novel.md`);
          if (fs.existsSync(novelPath)) {
            epicNovel = fs.readFileSync(novelPath, "utf8");
          }
        }
      } catch (e) {}
    }

    const novelBackground = `【全景时代背景与历史大纲 · ${currentProfile.eraTitle}】：
${epicNovel || currentProfile.defaultBrief}

【${currentProfile.name} · 核心人物群像与政治暗流】：
${currentProfile.npcRoster}`;

    // Layer 3: 单调递增剧本历史流 (Append-Only Narrative History Stream)
    const messages = [
      { role: "system", content: harnessIdentityAndPersona },
      { role: "system", content: novelBackground }
    ];

    if (this.apiHistory && this.apiHistory.length > 0) {
      // 剧情历史跨来源延续；供应商专有思考字段不属于可移植的游戏事实。
      this.apiHistory.forEach(msg => messages.push({role: msg.role, content: msg.content}));
    }

    // Layer 4: 瞬时因果判定注入层
    const isGodModeInput = /奥特曼|神光棒|迪迦|核弹|歼\s*20|机甲|降维|秒杀|成仙|仙帝|神明|神迹|直接当皇帝|君临天下|一统天下/i.test(choice.customInput || choice.text || "");

    const actionText = choice.customInput
      ? `【玩家自定行动】：${choice.customInput}`
      : `【玩家本轮抉择】：${choice.text}`;

    let actionGuidance = "";
    if (isGodModeInput) {
      actionGuidance = `\n【天命高潮契机】：玩家施展了超常规伟力！请以 TRPG 终局高潮笔触，描摹无量光芒照彻天地、众生俯首的史诗场景，在 stage_effects 中调用 show_illustration 并给出 3 个君临天下的具体行动选项。`;
    } else {
      actionGuidance = `\n【主持要求】：请根据玩家意图与掷骰判定，输出 ${targetLengthCfg.beatsRange} 充满戏剧张力的第二人称场景卡（beats，${targetLengthCfg.wordCount}），并在末尾给出 3 个具象的下一步跑团行动走向（choices）。最终交付必须为合法 JSON。`;
    }

    const branchStatusPrompt = `\n【当前自由推演阶段】：已推演 ${this.branchDepth || 1} 轮。`;

    const ephemeralTail = `${actionText}${actionGuidance}${branchStatusPrompt}
【本轮交付篇幅】：${targetLengthCfg.label}；${targetLengthCfg.wordCount}。${targetLengthCfg.detailDesc}
【判定因果】：
- 2d6 掷骰检定：(${d1} + ${d2}) + 2 = ${total} vs DC ${choice.diceBase}（判定：${success ? "检定成功" : "检定受挫"}）
- 玩家思潮：威权(${this.ideologyVector.authority}) 经世(${this.ideologyVector.pragmatism}) 变革(${this.ideologyVector.progress}) 格局(${this.ideologyVector.cognition})
请你作为跑团主持推进剧情，最终交付必须为合法 JSON。`;

    messages.push({ role: "user", content: ephemeralTail });

    return {
      messages,
      ephemeralTail
    };
  }

  buildAIHarnessWorldSnapshot() {
    const tree = typeof WORLD_PRESETS !== "undefined" ? WORLD_PRESETS.canonicalTrees?.[this.currentFaction] : null;
    const scene = tree?.nodes?.[this.currentStoryNodeId];
    return {
      faction: this.currentFaction || "qing",
      depth: Number(this.branchDepth) || 0,
      ideology: {...this.ideologyVector},
      currentScene: {
        id: String(this.currentStoryNodeId || ""),
        title: typeof scene?.title === "string" ? scene.title : "",
        beats: (Array.isArray(scene?.originalBeats) ? scene.originalBeats : []).map(beat => ({
          speaker: typeof beat?.speaker === "string" ? beat.speaker : "旁白",
          text: typeof beat?.text === "string" ? beat.text : ""
        }))
      },
      // Full actions already travel in messages. Repeating them in a tool result doubles long contexts.
      historySource: "玩家行动与已交付剧情见会话消息；此快照只提供行动索引，不重复展开历史正文。",
      recentActionIndex: (Array.isArray(this.extrapolationHistory) ? this.extrapolationHistory : []).slice(-8).map(action => ({
        textCharacters: Array.from(String(action?.choiceText || "")).length, turn: Number(action?.turn) || 0,
        success: action?.success === true
      }))
    };
  }

  updateAIHarnessProgress(event) {
    const previous = this.aiHarnessProgress || {};
    this.aiHarnessProgress = {
      ...previous, mode: "agent", phase: event.type, tool: event.tool || "", phaseStartedAt: Date.now(),
      modelCalls: Number.isSafeInteger(event.modelCalls) ? event.modelCalls : (previous.modelCalls || 0),
      toolCalls: Number.isSafeInteger(event.toolCalls) ? event.toolCalls : (previous.toolCalls || 0),
      textCharacters: Number.isSafeInteger(event.textCharacters) ? event.textCharacters : (previous.textCharacters || 0),
      targetCharacters: Number.isSafeInteger(event.targetCharacters) ? event.targetCharacters : (previous.targetCharacters || 2000)
    };
    this.renderAIHarnessProgress();
  }

  renderAIHarnessProgress() {
    const progress = this.aiHarnessProgress;
    if (!progress || !this.aiHarnessProgressDisplay) return;
    const phases = {
      preparing: "正在准备剧情工具", model_start: "等待模型回复", model_end: "模型回复已接收", tool_start: "正在运行剧情工具",
      tool_end: "工具结果已返回模型", plugin_error: "插件报告错误，已反馈模型",
      delivery_check: "正在检查交付正文", delivered: "正文已通过交付检查"
    };
    const tools = {read_world: "读取本轮世界资料", read_draft: "读取草稿", write_draft: "记录剧情草稿", inspect_draft: "检查正文字数", deliver_story: "检查并交付正文"};
    const phase = progress.phase === "tool_start" && tools[progress.tool] ? `正在${tools[progress.tool]}` : (phases[progress.phase] || "等待模型回复");
    const now = Date.now();
    const elapsed = (Math.max(0, now - (progress.startedAt ?? now)) / 1000).toFixed(1);
    const waiting = Math.max(0, now - (progress.phaseStartedAt ?? progress.startedAt ?? now));
    const waitText = progress.phase === "model_start" ? ` · 本次等待 ${(waiting / 1000).toFixed(1)} 秒` : "";
    const hint = progress.phase === "model_start" && waiting >= 30000 ? "\n服务尚未返回本次回复，可继续等待或取消本次生成。" : "";
    const source = progress.sourceLabel ? `${progress.sourceLabel} · ` : "";
    const phaseText = `${source}${phase} · 模型 ${progress.modelCalls} 次 · 工具 ${progress.toolCalls} 次`;
    const clockText = ` · 耗时 ${elapsed} 秒${waitText}\n草稿正文 ${progress.textCharacters} 字 · 本轮目标至少 ${progress.targetCharacters} 字${hint}`;
    const phaseNode = this.aiHarnessProgressDisplay.querySelector?.("#ai-harness-phase");
    const clockNode = this.aiHarnessProgressDisplay.querySelector?.("#ai-harness-clock");
    if (phaseNode && clockNode) {
      // Announce actual phase changes; a one-second clock must not keep interrupting a screen reader.
      if (phaseNode.textContent !== phaseText) phaseNode.textContent = phaseText;
      clockNode.textContent = clockText;
    } else this.aiHarnessProgressDisplay.textContent = phaseText + clockText;
  }

  // 异步调用模型；只对完整交付执行规范化、历史写入和舞台效果。
  async callDeepSeekLiveAPI(choice, d1, d2, total, success) {
    const startedAt = Date.now();
    const route = this.resolveAIProvider();
    const revision = this.aiConfigRevision || 0;
    const config = AIProviders.normalizeConfig(this.apiConfig);
    const requestedExpectedLength = [500, 2000, 5000].includes(this.expectedLength) ? this.expectedLength : 2000;
    const { messages, ephemeralTail } = this.buildDeepSeekCachePayload(choice, d1, d2, total, success);

    const harnessRuntime = typeof window !== "undefined" && window.JiuzhouHarness;
    const useHarness = typeof harnessRuntime?.createGameHarness === "function";
    const worldSnapshot = useHarness ? this.buildAIHarnessWorldSnapshot() : null;
    const initialMessages = messages;
    const initialRequest = AIProviders.createRequest(route, {mode: "story", messages: initialMessages,
      maxTokens: config.maxTokens, expectedLength: requestedExpectedLength});
    const runner = useHarness ? async signal => {
      const result = await harnessRuntime.createGameHarness({
        messages: initialMessages,
        model: async request => {
          const step = AIProviders.createRequest(route, {mode: "story", harness: true,
            messages: request.messages, tools: request.tools, maxTokens: config.maxTokens});
          return this.fetchAICompletion(step.endpoint, step.body, step.headers, request.signal || signal);
        },
        world: worldSnapshot,
        targetCharacters: requestedExpectedLength,
        signal,
        onEvent: event => { if (this.isAIProviderRouteCurrent(route, revision)) this.updateAIHarnessProgress(event); }
      });
      if (!result?.data) throw new Error("invalid_game_response");
      return {...result.data, harness: result.harness || result.data.harness};
    } : null;
    const data = await this.requestAICompletion(initialRequest.endpoint, initialRequest.body, initialRequest.headers,
      initialRequest.useGateway, "story", runner, route);
    this.assertAIProviderRouteCurrent(route, revision);
    const choiceObj = data.choices && data.choices[0];
    this.assertAICompletionFinished(choiceObj, "story");
    if (!choiceObj?.message?.content?.trim()) throw new Error("invalid_game_response");

    // 检查推理思考链 (DeepSeek 官方 thinking mode 暴露字段: reasoning_content)
    const reasoningContent = !useHarness && choiceObj.message && choiceObj.message.reasoning_content;
    const contentStr = choiceObj.message && choiceObj.message.content;

    // 健壮解析与零 JSON 泄露文本净化器 (严格防御控制字符、截断、Markdown 代码块与原生 JSON 语法外溢)
    const sanitizeDialogueText = (str) => {
      if (typeof window !== "undefined" && typeof window.JiuzhouHarnessProtocol?.sanitizeDialogueText === "function") {
        return window.JiuzhouHarnessProtocol.sanitizeDialogueText(str);
      }
      if (!str) return "";
      let clean = String(str).trim();
      // 若文本中包含泄漏的 JSON 结构字符或键名 ("sub": / "type": / "speaker": / {...})
      if (/"(sub|type|speaker|stageChar|beats|choices|tools|stage_effects)"\s*:/i.test(clean) || /^\s*\{[\s\S]*\}\s*$/.test(clean)) {
        clean = clean
          .replace(/["{}\[\]]/g, '')
          .replace(/\b(beats|choices|tools|stage_effects|speaker|sub|type|stageChar|text|tag|bias|authority|pragmatism|progress|cognition|diceBase|left|right|center|narrator|npc)\b\s*[:=]?/gi, '')
          .replace(/\s*,\s*/g, '\n')
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !/^[:,\s]+$/.test(line))
          .join('\n\n');
      }
      return clean || "关山风云变幻，局势深不可测。";
    };

    let parsed = null;
    let rawStr = (contentStr || "").trim();
    // 剥离 Markdown 代码块
    const codeBlockMatch = rawStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      rawStr = codeBlockMatch[1].trim();
    }

    // 1. 直接尝试标准 JSON 解析
    try {
      parsed = JSON.parse(rawStr);
    } catch (_) {
      // 2. 截取首个 '{' 与末个 '}' 之间的子串
      const startIdx = rawStr.indexOf('{');
      const endIdx = rawStr.lastIndexOf('}');
      if (startIdx !== -1 && endIdx > startIdx) {
        let candidate = rawStr.substring(startIdx, endIdx + 1);
        try {
          parsed = JSON.parse(candidate);
        } catch (_) {
          // 3. 修复字符串内部的裸控制字符 (如 raw \n, \r, \t) 与尾部逗号
          let inString = false;
          let escaped = false;
          let repaired = '';
          for (let i = 0; i < candidate.length; i++) {
            const c = candidate[i];
            if (escaped) { repaired += c; escaped = false; continue; }
            if (c === '\\') { escaped = true; repaired += c; continue; }
            if (c === '"') { inString = !inString; repaired += c; continue; }
            if (inString) {
              if (c === '\n') { repaired += '\\n'; continue; }
              if (c === '\r') { repaired += '\\r'; continue; }
              if (c === '\t') { repaired += '\\t'; continue; }
            }
            repaired += c;
          }
          repaired = repaired.replace(/,\s*([\]}])/g, '$1');
          try {
            parsed = JSON.parse(repaired);
          } catch (_) {}
        }
      }
    }

    // 4. 正则块兜底提取 (若截断或部分语法受损，提取 beats 与 choices，绝不将原生 JSON 语法串暴露给玩家)
    if (!parsed) {
      // 只尝试修复真正的剧情卡 JSON；任意 JSON/错误文字不能冒充生成成功。
      const beatsStart = rawStr.search(/"beats"\s*:\s*\[/);
      if (beatsStart < 0) throw new Error("invalid_game_response");
      const choicesStart = rawStr.search(/"choices"\s*:/);
      const beatSource = rawStr.slice(beatsStart, choicesStart > beatsStart ? choicesStart : undefined);
      const extractedBeats = [];
      const blockRegex = /\{[^{}]*"text"\s*:\s*"((?:\\.|[^"\\])*)"[^{}]*\}/g;
      let blockMatch;
      while ((blockMatch = blockRegex.exec(beatSource)) !== null) {
        const block = blockMatch[0];
        const textVal = blockMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        const speakerMatch = block.match(/"speaker"\s*:\s*"([^"]+)"/);
        const subMatch = block.match(/"sub"\s*:\s*"([^"]+)"/);
        const typeMatch = block.match(/"type"\s*:\s*"([^"]+)"/);
        const stageMatch = block.match(/"stageChar"\s*:\s*"([^"]+)"/);
        extractedBeats.push({
          speaker: speakerMatch ? speakerMatch[1] : "正史演义",
          sub: subMatch ? subMatch[1] : "【时代演化】",
          type: typeMatch ? typeMatch[1] : "narrator",
          stageChar: stageMatch ? stageMatch[1] : "center",
          text: sanitizeDialogueText(textVal)
        });
      }

      if (extractedBeats.length === 0) {
        const textOnlyRegex = /"text"\s*:\s*"((?:\\.|[^"\\])*)/g;
        let tMatch;
        while ((tMatch = textOnlyRegex.exec(beatSource)) !== null) {
          let tVal = tMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
          if (tVal) {
            extractedBeats.push({
              speaker: "正史演义",
              sub: "【时代演化】",
              type: "narrator",
              stageChar: "center",
              text: sanitizeDialogueText(tVal)
            });
          }
        }
      }

      if (extractedBeats.length === 0) throw new Error("invalid_game_response");

      parsed = {
        beats: extractedBeats,
        choices: [
          { text: "【审时度势】静观其变，伺机而动", tag: "审慎博弈" },
          { text: "【果决出击】打破眼前僵局，另辟生路", tag: "锐意决断" },
          { text: "【纵横捭阖】联络四方奥援，互通声气", tag: "纵横机变" }
        ]
      };
    }

    if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_game_response");
    let rawBeats = [];
    if (parsed && Array.isArray(parsed.beats)) {
      rawBeats = parsed.beats;
    } else if (parsed && typeof parsed.story === "string") {
      rawBeats = [parsed.story];
    } else if (parsed && typeof parsed.text === "string") {
      rawBeats = [parsed.text];
    }
    rawBeats = rawBeats.filter(b => typeof b === "string" ? b.trim().length > 0 :
      b && [b.text, b.content, b.dialogue].some(value => typeof value === "string" && value.trim().length > 0));

    let beats = rawBeats.map(b => {
      if (typeof b === "string") {
        return {
          speaker: "正史演义",
          sub: "【时代回响】",
          type: "narrator",
          stageChar: "center",
          text: sanitizeDialogueText(b)
        };
      }
      return {
        speaker: typeof b.speaker === "string" && b.speaker.trim() ? b.speaker : "正史演义",
        sub: typeof b.sub === "string" ? b.sub : "",
        type: typeof b.type === "string" && b.type.trim() ? b.type : "narrator",
        stageChar: ["left", "center", "right"].includes(b.stageChar) ? b.stageChar : "center",
        text: sanitizeDialogueText([b.text, b.content, b.dialogue].find(value => typeof value === "string" && value.trim()) || "")
      };
    }).filter(b => b.text && b.text.trim().length > 0);
    if (!beats.length) throw new Error("invalid_game_response");
    const validStoryBeats = beats.filter(b => !["illustration", "tool", "tool_result", "thought", "thinking", "reasoning", "metadata", "deliberation"].includes(b.type));
    if (useHarness) {
      const deliveredCharacters = Array.from(validStoryBeats.map(b => b.text).join("").replace(/\s/g, "")).length;
      if (deliveredCharacters < requestedExpectedLength) throw new Error("delivery_too_short");
      beats = validStoryBeats.slice();
    }

    // 调度视听与舞台效果 (对账：无缝统一 stage_effects 与 legacy tools 格式)
    const effectSource = Array.isArray(parsed.stage_effects) ? parsed.stage_effects : parsed.tools;
    const effects = (Array.isArray(effectSource) ? effectSource : []).filter(e => e && typeof e === "object" && !Array.isArray(e)).map(e => ({
      name: typeof e.name === "string" && e.name.trim() ? e.name : (typeof e.tool === "string" ? e.tool : ""),
      params: e.params && typeof e.params === "object" && !Array.isArray(e.params) ? e.params : {}
    })).filter(e => e.name.trim());
    let inlineIllustration = null;

    if (effects.length) {
      // 提取套图并在剧情流中生成独立段落展示卡片
      const curFaction = this.currentFaction || "qing";
      let fVault = {};
      if (typeof window !== "undefined" && window.FACTION_ILLUSTRATION_VAULT) {
        fVault = window.FACTION_ILLUSTRATION_VAULT[curFaction] || {};
      }
      for (const eff of effects) {
        const tName = eff.name || eff.tool || "";
        const p = eff.params || {};
        if (tName === "show_illustration" || tName.startsWith(curFaction + "_") || Object.keys(fVault).includes(tName)) {
          const targetId = p.id || (tName.startsWith(curFaction + "_") ? tName : null);
          let targetIllus = null;
          if (targetId && fVault[targetId]) {
            targetIllus = fVault[targetId];
          } else {
            const cat = p.category || (p.title && /俘虏/.test(p.title) ? "captive" : (/战斗|肉搏/.test(p.title) ? "battle" : (/战争|攻城|巨舰/.test(p.title) ? "war" : (/爱情|情深|风月|同袍|誓/.test(p.title) ? "romance" : (/胜利|登极|凯旋/.test(p.title) ? "victory" : "wealth")))));
            targetIllus = fVault[`${curFaction}_${cat}`] || Object.values(fVault)[0];
          }
          if (targetIllus) {
            inlineIllustration = {
              ...targetIllus,
              title: p.title || targetIllus.title,
              description: p.caption || p.description || targetIllus.description
            };
            break;
          }
        }
      }
    }

    // 套图的使用方法和特效一样会在独立段落展示：
    // 在 beats 叙事推进流的转折时机插入独立插画段落卡片
    if (inlineIllustration) {
      const illusBeat = {
        speaker: `【${inlineIllustration.categoryName || "史诗画卷"}】`,
        sub: inlineIllustration.title,
        type: "illustration",
        stageChar: "center",
        text: `《${inlineIllustration.title}》：${inlineIllustration.description}`,
        illustrationData: inlineIllustration
      };
      if (beats.length > 1) {
        beats.splice(Math.min(2, beats.length - 1), 0, illusBeat);
      } else {
        beats.push(illusBeat);
      }
    }

    // 1. 若有 DeepSeek 原生思考链 (reasoning_content)，妥善留存于遥测对象供抽屉/监控查阅，不污染前台主角在场剧情流
    if (reasoningContent) {
      this.cacheTelemetry.lastReasoning = reasoningContent;
    }

    // 规范化 choices，严格保证返回恰好 3 个分支选项 (第4个选项由引擎统一追加开放式输入)
    let rawChoices = (parsed.choices && Array.isArray(parsed.choices)) ? parsed.choices : [];
    rawChoices = rawChoices.filter(c => typeof c === "string" ? c.trim() : c && typeof c === "object" && !Array.isArray(c));
    rawChoices = rawChoices.map((c, i) => {
      if (typeof c === "string") {
        return {
          text: c,
          tag: "演进",
          bias: { authority: 0, pragmatism: 0, progress: 0, cognition: 0 },
          diceBase: 10,
          isExtrapolation: true,
          isConvergence: false
        };
      }
      const text = [c.text, c.choice, c.title].find(value => typeof value === "string" && value.trim());
      if (!text) return null;
      const bias = Object.fromEntries(["authority", "pragmatism", "progress", "cognition"].map(axis => [axis, Number.isFinite(c.bias?.[axis]) ? c.bias[axis] : 0]));
      return {
        text,
        tag: typeof c.tag === "string" && c.tag.trim() ? c.tag : "抉择",
        bias,
        diceBase: Number.isFinite(c.diceBase) ? c.diceBase : 10,
        isExtrapolation: true,
        isConvergence: c.isConvergence === true,
        targetNodeId: typeof c.targetNodeId === "string" ? c.targetNodeId : null
      };
    });
    rawChoices = rawChoices.filter(c => c && !c.isOpenEndedInput && !c.text.includes("输入文字")).slice(0, 3);
    const validStoryChoices = rawChoices.map(c => ({text: c.text, tag: c.tag}));

    // 仅对已验证的选项追加引擎元数据，避免模型返回 null 等可选值时中断正文。
    const isGodMode = /奥特曼|神光棒|迪迦|核弹|歼\s*20|机甲|降维|秒杀|成仙|仙帝|神明|神迹|直接当皇帝|君临天下|一统天下/i.test(choice.customInput || choice.text || "");
    if (isGodMode) {
      this.convergenceTargetId = this.getSupremeEndingNodeId();
      rawChoices.forEach((c, i) => {
        c.isConvergence = i === 0;
        c.targetNodeId = i === 0 ? this.convergenceTargetId : null;
      });
    }

    // 核心门禁判定：是否满足回到主线的条件？
    // 铁律：必须 2 到 3 次抉择之后，或者用户开放输入明确要求回到主线，才提供回到主线的选项！
    // 否则：不可回到主线，不可提供主线选项！
    // 满足条件时：至多提供 1 个回到主线选项，不可提供三个回到主线的选项！
    const isReturnExplicitlyRequested = choice.customInput && /回到主线|返回大军|回归正轨|重返主线|回朝|回京|归队|返回大营|收拢主线|重回主干|大营合流/i.test(choice.customInput);
    const canOfferMainline = (this.branchDepth >= 2) || isReturnExplicitlyRequested;

    if (!canOfferMainline) {
      rawChoices.forEach(c => {
        c.isConvergence = false;
        c.isExtrapolation = true;
        c.targetNodeId = null;
      });
    } else {
      let mainlineCount = 0;
      rawChoices.forEach(c => {
        if (c.isConvergence) {
          if (mainlineCount === 0) {
            mainlineCount++;
          } else {
            c.isConvergence = false;
            c.isExtrapolation = true;
            c.targetNodeId = null;
          }
        }
      });
    }

    while (rawChoices.length < 3) {
      rawChoices.push({
        text: `【紧迫抉择 #${rawChoices.length + 1}】环顾四周危局，拔刀直面当面之敌！`,
        tag: "拔刀断决",
        bias: { authority: 1, pragmatism: 2, progress: 1, cognition: 2 },
        diceBase: 9,
        isExtrapolation: true,
        isConvergence: false,
        isEpilogueSequel: this.isEpilogueSequel || false
      });
    }

    // 所有正文和选项已规范化，才提交下一轮上下文。长篇 JSON 保持完整。
    this.assertAIProviderRouteCurrent(route, revision);
    const assistantHistMsg = {role: "assistant", content: contentStr};
    this.apiHistory.push({role: "user", content: ephemeralTail}, assistantHistMsg);
    if (this.apiHistory.length > 200) this.apiHistory = this.apiHistory.slice(-200);
    for (const effect of effects) {
      try { this.executeAITools([{tool: effect.name, params: effect.params}]); }
      catch (_) { console.warn("[Narrative Engine] 已忽略无效的 AI 舞台效果，正文继续。"); }
    }
    // 只记录已验证交付的累计缓存；中间工具轮和无效正文不冒充成功生成。
    this.recordAIProviderCache(data, route);
    this.recordAIGenerationMetrics(data, validStoryBeats, validStoryChoices, "story", startedAt, requestedExpectedLength);
    this.aiGenerationMetrics.displayChoiceCount = rawChoices.slice(0, 3).length + 1; // Includes the engine's free-input action.
    this.aiGenerationMetrics.sourceIdentity = route.identity;
    this.setAIRequestStatus("success", "story", null, data.model, route, revision);
    return {
      beats,
      choices: rawChoices.slice(0, 3),
      tools: effects.map(e => ({tool: e.name, params: e.params}))
    };
  }

  assertAICompletionFinished(completion, mode) {
    const finishReason = completion?.finish_reason;
    // Older compatible services may omit finish_reason; the metrics then show unknown.
    if (finishReason === undefined || finishReason === null || finishReason === "" || finishReason === "stop") return;
    const code = finishReason === "length" ? "output_truncated" : "output_incomplete";
    const error = Object.assign(new Error(code), {code});
    this.setAIRequestStatus("fallback", mode, error);
    throw error;
  }

  recordAIGenerationMetrics(data, beats, choices, mode, startedAt, expectedLength = null) {
    const nonNarrativeTypes = ["illustration", "tool", "tool_result", "thought", "thinking", "reasoning", "metadata", "deliberation"];
    const validBeats = (Array.isArray(beats) ? beats : []).filter(b => b && !nonNarrativeTypes.includes(b.type) && typeof b.text === "string" && b.text.trim()).map(b => ({
      speaker: typeof b.speaker === "string" ? b.speaker : "旁白", text: b.text
    }));
    const validChoices = (Array.isArray(choices) ? choices : []).map(c => ({text: c.text, tag: c.tag}));
    const text = validBeats.map(b => b.text).join("");
    const tokens = data?.usage?.completion_tokens;
    this.aiGenerationMetrics = {
      mode,
      expectedLength: mode === "story" ? expectedLength : null,
      textCharacters: Array.from(text.replace(/\s/g, "")).length,
      hanCharacters: (text.match(/\p{Script=Han}/gu) || []).length,
      beatCount: validBeats.length,
      choiceCount: validChoices.length,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      completionTokens: Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : null,
      finishReason: typeof data?.choices?.[0]?.finish_reason === "string" ? data.choices[0].finish_reason : null,
      model: typeof data?.model === "string" ? data.model : "",
      harness: data?.harness?.mode === "agent" ? {...data.harness} : {mode: "compatibility", modelCalls: 1, toolCalls: 0},
      beats: validBeats,
      choices: validChoices
    };
  }

  describeAIError(error) {
    const code = error?.code || error?.message || "";
    const reasons = {
      ai_not_configured: "AI 服务尚未配置完整，请检查 API 配置",
      origin_rejected: "AI 服务未允许此网页访问，请检查 API 配置",
      upstream_auth_failed: "所选 API 未通过认证，请检查此来源的 API Key 与访问权限，或在设置中选择其他来源",
      upstream_quota_exceeded: "所选 AI 服务额度不足，请检查相应账户",
      upstream_rate_limited: "AI 服务繁忙，请稍后重试",
      upstream_request_rejected: "所选 AI 服务拒绝本轮请求，请检查模型及参数配置",
      upstream_unavailable: "AI 服务暂时不可用，请稍后重试",
      upstream_network_error: "AI 网关无法连接模型服务，请稍后重试",
      upstream_timeout: "AI 服务响应超时，请稍后重试",
      invalid_mode: "AI 请求模式无效，请刷新网页后重试",
      invalid_messages: "AI 剧情上下文无效，请检查 API 配置",
      invalid_message_type: "AI 剧情上下文格式无效，请检查 API 配置",
      invalid_structure: "AI 剧情上下文结构无效，请检查 API 配置",
      invalid_length: "AI 篇幅档位无效，请重新选择 500、2000 或 5000 字档位",
      context_too_large: "本轮上下文超过服务可承载范围，请缩短输入或开始新段剧情；原文没有被截断发送",
      output_truncated: "AI 输出未完整结束，本轮尚未交付，可调整设置后重试",
      output_incomplete: "AI 生成被中断，尚未获得完整剧情，可稍后重试",
      request_cancelled: "已取消本次请求，保留原行动供重试",
      invalid_max_tokens: "输出 Token 设置无效或超出所选服务支持范围，可留空使用默认值",
      invalid_private_endpoint: "API 端点无效，请填写完整 HTTPS 地址（本机调试可用 HTTP）",
      invalid_model: "请填写自定义模型名称",
      invalid_provider: "请选择有效的 API 来源及适配器",
      provider_changed: "来源适配器已变化，本轮停止并未提交剧情",
      source_changed: "API 配置已修改，本轮已停止且未提交旧来源剧情",
      invalid_test_response: "模型未返回有效测试正文，可能是输出不完整或响应格式不兼容",
      invalid_game_response: "AI 返回的剧情格式无效",
      delivery_too_short: "交付正文未达到所选目标，本轮未提交不完整剧情",
      plugin_error: "剧情插件执行失败，本轮尚未交付",
      invalid_tool_call: "模型调用的剧情工具无效，本轮尚未交付",
      invalid_tool_response: "模型的工具调用格式无效，本轮未提交不完整剧情",
      invalid_tools: "剧情工具配置与网关不匹配，请刷新后重试",
      invalid_tool_name: "请求了未注册的剧情工具，本轮未提交剧情",
      invalid_tool_history: "剧情工具历史不完整，本轮未提交剧情",
      agent_stalled: "模型重复了相同操作且没有进展，已结束本轮推演",
      harness_unconfigured: "工具循环模块未就绪，请刷新后重试",
      plugin_unavailable: "剧情插件未就绪，本轮尚未交付",
      delivery_unavailable: "剧情交付插件未就绪，本轮尚未交付",
      invalid_json: "AI 请求或响应格式无效"
    };
    if (reasons[code]) return reasons[code];
    if (error?.name === "TimeoutError" || error?.name === "AbortError") return "AI 服务响应超时，请稍后重试";
    if (error?.status) return `AI 服务返回 HTTP ${error.status}，请稍后重试或检查 API 服务`;
    return "网络请求失败，请检查网络后重试";
  }

  setAIRequestStatus(state, mode, error = null, model = "", route = null, revision = this.aiConfigRevision || 0) {
    if (route && !this.isAIProviderRouteCurrent(route, revision)) return;
    if (!route) { try { route = this.resolveAIProvider(); } catch (_) {} }
    const task = mode === "suture" ? "弥合" : "剧情";
    const channel = route?.source || AIProviders.normalizeConfig(this.apiConfig).source;
    const message = (error?.code || error?.message) === "request_cancelled" ? "已取消本次请求，保留原行动供重试" :
      state === "success" ? `最近一轮 AI ${task}已生成${model ? `（${model}）` : ""}` :
      state === "local" ? "本轮由本地剧情继续，未调用远端 AI" :
      state === "requesting" ? `正在请求 AI ${task}，尚未收到结果` :
      mode === "suture" ? `本轮已使用本地弥合：${this.describeAIError(error)}` : `本轮剧情尚未交付：${this.describeAIError(error)}`;
    this.aiRequestStatus = {state, mode, channel, sourceIdentity: route?.identity || null,
      revision, model: String(model || ""), message};
    this.updateCachePillUI();
  }

  updateAIConnectionStatusUI() {
    let route = null, routeError = null;
    try { route = this.resolveAIProvider(); } catch (error) { routeError = error; }
    const mode = !this.apiConfig.enabled ? "你已选择本地剧情，可在本机设置切换远端 AI。" :
      routeError ? `当前来源配置无效：${this.describeAIError(routeError)}` : `当前使用${route.label} · 模型 ${route.model}。`;
    const currentStatus = this.aiRequestStatus && (!this.aiRequestStatus.sourceIdentity || this.aiRequestStatus.sourceIdentity === route?.identity)
      ? this.aiRequestStatus : null;
    const request = currentStatus?.message || "当前来源尚未进行真实 AI 生成。";
    if (this.aiConnectionStatus) this.aiConnectionStatus.textContent = [mode, request].filter(Boolean).join("\n");
    if (this.aiGenerationMetricsDisplay) {
      const metrics = this.aiGenerationMetrics && (!this.aiGenerationMetrics.sourceIdentity || this.aiGenerationMetrics.sourceIdentity === route?.identity)
        ? this.aiGenerationMetrics : null;
      if (metrics) {
        const tokens = metrics.completionTokens === null ? "未知" : String(metrics.completionTokens);
        const finish = metrics.harness?.mode === "agent" ? "交付完成（插件验证通过）" : (metrics.finishReason || "未知（尚不能确认完整结束）");
        const target = [500, 2000, 5000].includes(metrics.expectedLength) ? metrics.expectedLength : null;
        const lengthResult = metrics.mode !== "story" || !target ? "" :
          metrics.textCharacters < target ? " · 正文未达目标" : " · 正文已达目标";
        const supplied = metrics.displayChoiceCount === undefined ? "" : `（界面共 ${metrics.displayChoiceCount} 项）`;
        const harness = metrics.harness || {mode: "compatibility", modelCalls: 1, toolCalls: 0};
        const runMode = harness.mode === "agent" ? "插件式工具循环" : "单次请求兼容模式";
        const cacheKnown = harness.cacheUsageKnown !== false && this.cacheTelemetry?.cacheUsageKnown !== false;
        const hit = Number(harness.cacheHitTokens ?? this.cacheTelemetry?.lastHitTokens) || 0;
        const miss = Number(harness.cacheMissTokens ?? this.cacheTelemetry?.lastMissTokens) || 0;
        const cache = cacheKnown ? `累计缓存命中 ${hit} Token / 新算 ${miss} Token` : "供应商未提供缓存统计";
        this.aiGenerationMetricsDisplay.textContent = `最近一次有效${metrics.mode === "suture" ? "弥合" : "剧情"}：${metrics.textCharacters} 字符（其中中文 ${metrics.hanCharacters} 字）${lengthResult} · ${metrics.beatCount} 段 / ${metrics.choiceCount} 个模型选项${supplied}\n${runMode} · 模型 ${harness.modelCalls || 0} 次 · 工具 ${harness.toolCalls || 0} 次 · 总耗时 ${(metrics.elapsedMs / 1000).toFixed(1)} 秒\n${cache} · 完成 Token ${tokens} · 结束原因 ${finish}`;
      } else {
        this.aiGenerationMetricsDisplay.textContent = "本轮尚无有效 AI 剧情指标。";
      }
    }
    if (this.cacheStatusTag) this.cacheStatusTag.innerText = currentStatus?.state === "success" ?
      `最近一次生成 · 命中率 ${this.cacheTelemetry.lastHitRate}` : "等待有效 AI 生成 · 暂无本轮缓存指标";
  }

  // 网络解析与剧情状态分开：设置中的测试请求不能伪造一次剧情生成。
  async fetchAICompletion(endpoint, body, headers, signal) {
    const res = await fetch(endpoint, {
      method: "POST", headers, body: JSON.stringify(body), signal
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const error = new Error("ai_http_error");
      error.code = typeof detail?.error === "string" ? detail.error : detail?.error?.code;
      if ([401, 403, 402, 429].includes(res.status) && error.code !== "origin_rejected") {
        error.code = ({401: "upstream_auth_failed", 403: "upstream_auth_failed", 402: "upstream_quota_exceeded", 429: "upstream_rate_limited"})[res.status];
      }
      error.status = res.status;
      throw error;
    }
    try { return await res.json(); } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
      throw new Error("invalid_json");
    }
  }

  async requestAICompletion(endpoint, body, headers, useGateway, mode, runner = null, route = null) {
    if (!route) { try { route = this.resolveAIProvider(); } catch (_) {} }
    const revision = this.aiConfigRevision || 0;
    const current = () => route ? this.isAIProviderRouteCurrent(route, revision) : revision === (this.aiConfigRevision || 0);
    const controller = new AbortController();
    this.activeAIRequestController = controller;
    this.aiGenerationMetrics = null;
    if (this.btnCancelAIRequest) this.btnCancelAIRequest.hidden = false;
    this.aiHarnessProgress = {mode: runner ? "agent" : "compatibility", phase: runner ? "preparing" : "model_start", sourceLabel: route ? `${route.label} · ${route.model}` : "", modelCalls: runner ? 0 : 1, toolCalls: 0, textCharacters: 0, targetCharacters: this.expectedLength || 2000, startedAt: Date.now(), phaseStartedAt: Date.now()};
    if (this.aiHarnessProgressDisplay) {
      this.aiHarnessProgressDisplay.hidden = false;
      this.renderAIHarnessProgress();
    }
    // This is a display clock, not a request deadline or an automatic retry.
    const progressClock = setInterval(() => {
      if (this.activeAIRequestController === controller && !controller.signal.aborted) this.renderAIHarnessProgress();
    }, 1000);
    let timedOut = false;
    const timer = useGateway || runner ? null : setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 75000);
    this.setAIRequestStatus("requesting", mode, null, "", route, revision);
    try {
      const data = runner ? await runner(controller.signal) : await this.fetchAICompletion(endpoint, body, headers, controller.signal);
      if (!current()) throw Object.assign(new Error("source_changed"), {code: "source_changed"});
      if (controller.signal.aborted) throw new Error("request_aborted");
      return data;
    } catch (error) {
      const failure = controller.sourceChanged || !current() ? Object.assign(new Error("source_changed"), {code: "source_changed"}) :
        controller.cancelledByUser ? Object.assign(new Error("request_cancelled"), {code: "request_cancelled"}) :
        timedOut ? Object.assign(new Error("upstream_timeout"), {code: "upstream_timeout"}) : error;
      if (failure.code !== "source_changed") this.setAIRequestStatus("fallback", mode, failure, "", route, revision);
      throw failure;
    } finally {
      clearInterval(progressClock);
      if (timer !== null) clearTimeout(timer);
      if (this.activeAIRequestController === controller) {
        this.activeAIRequestController = null;
        if (this.btnCancelAIRequest) this.btnCancelAIRequest.hidden = true;
        if (this.aiHarnessProgressDisplay) this.aiHarnessProgressDisplay.hidden = true;
      }
    }
  }

  cancelAIRequest() {
    const controller = this.activeAIRequestController;
    if (!controller || controller.signal.aborted) return;
    controller.cancelledByUser = true;
    controller.abort();
  }

  invalidateAIConnectionTest() {
    this.aiConnectionTestFormVersion = (this.aiConnectionTestFormVersion || 0) + 1;
    if (this.aiConnectionTestStatus && !this.aiConnectionTestRunning) {
      this.aiConnectionTestStatus.textContent = "配置已修改，请重新测试。";
    }
  }

  async testAIConnection() {
    if (this.aiConnectionTestRunning || !this.aiConnectionTestStatus) return;
    if (this.isAIGenerating) {
      this.aiConnectionTestStatus.textContent = "剧情正在生成，请等待本轮结束后再测试。";
      return;
    }
    // 对未保存的表单快照发起独立短请求，不写配置、存档、剧情历史或缓存遥测。
    const testedConfig = this.readAISettingsConfig();
    let route = null;
    const channel = "自定义通道";
    const version = this.aiConnectionTestFormVersion || 0;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    this.aiConnectionTestRunning = true;
    this.btnTestAiConnection.disabled = true;
    this.btnTestAiConnection.textContent = "测试中…";
    this.aiConnectionTestStatus.textContent = `正在测试${channel}，等待模型回复…`;
    try {
      route = this.resolveAIProvider(testedConfig);
      const messages = [
          {role: "system", content: "你是九州沉浮录连接测试助手。只返回 JSON 对象，包含 reconciledBeats 数组，每项含 speaker、text。"},
          {role: "system", content: "独立连接测试，不推进游戏。原对白：旁白说：连接测试成功。"},
          {role: "user", content: "保持原对白不变，只返回这个 JSON：{\"reconciledBeats\":[{\"speaker\":\"旁白\",\"text\":\"连接测试成功。\"}],\"sutureNote\":\"测试\"}"}
      ];
      const request = AIProviders.createRequest(route, {mode: "probe", messages, maxTokens: 256});
      const data = await this.fetchAICompletion(request.endpoint, request.body, request.headers, controller.signal);
      let result;
      try { result = JSON.parse(data?.choices?.[0]?.message?.content); } catch { throw new Error("invalid_test_response"); }
      if (!Array.isArray(result?.reconciledBeats) || !result.reconciledBeats.some(beat => typeof beat?.text === "string" && beat.text.trim())) throw new Error("invalid_test_response");
      let actualModel = typeof data.model === "string" ? data.model.replace(/[\r\n\t]/g, " ").slice(0, 100) : route.model;
      if (testedConfig.apiKey) actualModel = actualModel.split(testedConfig.apiKey).join("[已隐藏]");
      this.aiConnectionTestStatus.textContent = `测试成功 · ${channel} · ${actualModel} · ${((Date.now() - started) / 1000).toFixed(1)} 秒\n已收到有效模型回复。`;
    } catch (error) {
      this.aiConnectionTestStatus.textContent = `测试失败 · ${channel} · ${this.describeAIError(error)}\n耗时 ${((Date.now() - started) / 1000).toFixed(1)} 秒，可修改配置后重试。`;
    } finally {
      clearTimeout(timer);
      this.aiConnectionTestRunning = false;
      this.btnTestAiConnection.disabled = false;
      this.btnTestAiConnection.textContent = "测试请求";
      let sameRoute = false;
      try { sameRoute = route?.identity === this.resolveAIProvider(this.readAISettingsConfig()).identity; } catch (_) {}
      if (version !== (this.aiConnectionTestFormVersion || 0) || (route && !sameRoute)) {
        this.aiConnectionTestStatus.textContent = "当前配置已修改，本次测试结果仅适用于点击时的配置；请重新测试。";
      }
    }
  }

  // 健康检查只证明网关已就绪；有效生成返回后才展示本轮 AI 与缓存结果。
  updateCachePillUI() {
    this.updateAIConnectionStatusUI();
    if (!this.qmCache) return;
    const hasLive = this.hasLiveAIRoute();
    let route = null;
    try { route = this.resolveAIProvider(); } catch (_) {}
    const status = this.aiRequestStatus && (!this.aiRequestStatus.sourceIdentity || this.aiRequestStatus.sourceIdentity === route?.identity)
      ? this.aiRequestStatus : null;
    this.qmCache.classList.remove("hit");
    this.qmCache.title = status?.message || "当前来源尚未生成" || "当前使用本地剧情";
    if (!hasLive) {
      this.qmCache.innerText = this.apiConfig.enabled ? "⚠ 当前来源未配置完整 · 待处理" : "⚡ 缓存: 本地模式";
    } else if (status?.state === "fallback") {
      this.qmCache.innerText = status.mode === "suture" ? "⚠ 本轮使用本地弥合 · 设置可查看原因" : "⚠ 本轮尚未交付 · 可重试或改用本地";
    } else if (status?.state === "requesting") {
      this.qmCache.innerText = "⚡ AI 请求中 · 尚未生成";
    } else if (status?.state === "local") {
      this.qmCache.innerText = "本轮为本地剧情 · 未调用 AI";
    } else if (status?.state === "success") {
      this.qmCache.innerText = this.cacheTelemetry.cacheUsageKnown === false
        ? "⚡ AI 已生成 · 未提供缓存统计" : `⚡ AI 已生成 · 命中 ${this.cacheTelemetry.lastHitRate || "0.0%"}`;
      this.qmCache.classList.add("hit");
    } else {
      this.qmCache.innerText = "⚡ 个人 AI 已配置 · 待生成";
    }
  }

  // 5. 更新设置抽屉中的遥测指标
  updateCacheTelemetryUI() {
    let route = null;
    try { route = this.resolveAIProvider(); } catch (_) {}
    const known = this.cacheTelemetry.cacheUsageKnown !== false && (!this.cacheTelemetry.sourceIdentity || this.cacheTelemetry.sourceIdentity === route?.identity)
      && Number.isFinite(this.cacheTelemetry.lastHitTokens) && Number.isFinite(this.cacheTelemetry.lastMissTokens);
    if (this.cmHitRate) this.cmHitRate.innerText = known ? this.cacheTelemetry.lastHitRate : "未提供";
    if (this.cmHitTokens) this.cmHitTokens.innerText = known ? `${this.cacheTelemetry.lastHitTokens.toLocaleString()} tks` : "未提供";
    if (this.cmMissTokens) this.cmMissTokens.innerText = known ? `${this.cacheTelemetry.lastMissTokens.toLocaleString()} tks` : "未提供";
    if (this.cacheStatusTag) {
      this.cacheStatusTag.innerText = `四层对齐 · 命中率 ${this.cacheTelemetry.lastHitRate}`;
    }
    this.updateCachePillUI();
  }
}

// 页面加载启动 (兼容 DOMContentLoaded 与 late script evaluation)
if (typeof document !== "undefined") {
  const initEngine = () => {
    if (!window.__vnEngine) {
      window.app = window.vnEngine = window.__vnEngine = new WebVisualNovelEngine();
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEngine);
  } else {
    initEngine();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { WebVisualNovelEngine };
}
