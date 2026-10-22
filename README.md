> **2026-10-23 更新**：界面不再显示生成运行日志或诊断指标；舞台背景和独立图片弹窗使用不同工具与状态，关闭弹窗不跳页、不改背景。接口见 [美术演出说明](docs/ILLUSTRATIONS.md#ai-选图)。篇幅按钮仍为 500／2000／5000，仅在模型提示词中分别要求 1000／2500／5500 字正文。程序不统计或验收字数，也不会因正文较短拒绝交付或强制补写。
>
> **2026-10-22 更新**：用户已移除站长共享 API。当前游戏仅使用个人 API 或本地剧情，保留原 GitHub Pages 网址；不再依赖 Cloudflare。原共享设置会关闭自动远端请求并保留已填写的个人配置，需确认后手动启用。下文旧部署与测试记录按其历史时间理解。

# 九州沉浮录 · Chronicles of Nine Provinces : Destiny Mirror

> **东方史诗文字冒险与自适应 AI GM 引擎 (Visual Novel & Interactive Fiction)**  
> 融合明清易代历史底本、四大阵营剧情树、预置展示插画与 DeepSeek 在线剧情推演。**AI 接线已建立，长篇实际质量及续玩稳定性仍在验收。**

🌐 **在线直接畅玩 (Live Demo)**:  
👉 **[https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/](https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/)**

> **时序说明：以下“当前”仅截至 2026-10-19 09:03:46 UTC 的代码快照**（`jiuzhou-chronicles@02b83d91`，后端 `starport-persona@81f8a19f` 时间 2026-10-19 08:52:17 UTC）。访问门槛的**历史引入与随后撤销**见 [带 UTC 时间线的权威决策记录](docs/CURRENT-STATE-AND-DECISIONS.md)。任何未来计划不是现有功能。

---

## 🌟 核心特色与系统

### 1. 四大阵营近十万字史诗同人底本与全向剧情树
- **大清中枢 (Qing Court)**：八旗定策、崇政殿誓盟、范文程入关定鼎策、山海关一片石鏖战。
- **大明中枢 (Ming Empire)**：太仓库竭、东南漕税博弈、煤山挽澜誓死勤王、铁血内阁重整山河。
- **大漠蒙古 (Mongol Steppe)**：察哈尔西奔、黄金家族直系统摄、迎奉九游白纛苏勒德神矛、铁骑横扫戈壁。
- **南国海邦 (Southern Seas & Nanming)**：闽海龙旗、郑氏远洋舰队、佛郎机西洋火炮、隆武誓师拓土重洋。

### 2. 24 个阵营插画展示槽位与部分已安装图像素材
- **四大阵营 × 六大情境万金油套图**：
  - 俘虏 (`captive`)、战斗 (`battle`)、战争 (`war`)、情缘/同袍结义 (`romance`)、胜利 (`victory`)、财富 (`wealth`)
- **严格阵营隔离**：各阵营独立视觉基因与叙事透镜，互不混淆。
- **集成谷歌原生电影级画幅生图**：如山海关一片石万骑踏阵（`data/illustrations/qing/war.jpg`）。

### 3. 双轨解耦与单向不可逆 AI 自由推演
- **法定主线剧情 0 消耗冻结**：基准主干对白随走随存，时光机精准悔棋。
- **AI 自由外推单向演化**：
  - 玩家自主行动与掷骰裁决。
  - 3 个全新的具体走向分支 + 1 个自定开放输入框。
  - 预期长度偏好：500 / 2000 / 5000 档；**请求篇幅不等于稳定达到目标字数**。
  - 动态适时展示阵营套图，大结局画卷绝不触发强制 Game Over，自由开启新篇。

### 4. 纯双模式引擎 (Dual-Mode Engine)
- **本地自洽 GM 模式 (默认 0 门槛畅玩)**：
  - 纯前端 JavaScript 状态机与内建故事树，无需注册、无需 API Key、零网络延迟即点即玩。
- **远端实时 AI 模式 (可选启用)**：
  - 在线 AI 使用设置里填写的个人端点和模型；也支持不需要 Key 的兼容端点。
  - 展示部分缓存命中遥测，但**不保证 100% 命中率**或永久无损的上下文记忆。

### 5. 沉浸式 ADV / AVG 视觉小说交互
- **返回上一段**：支持对白与套图卡片双向平滑回退与前进。
- **血红危机特效**：危机事件震动与血红警示，安全平滑平息与终止，绝无死锁。
- **全端自适应响应式布局**：完美兼容 PC 桌面宽屏与移动端手机竖屏/横屏。

---

## 🚀 本地运行与开发

游戏主体是无第三方 npm 生产依赖的静态前端；**在线 AI 需要玩家配置可由浏览器访问的个人 Chat Completions 接口**。根目录 Node 网关为本地/自托管替代路径，非 GitHub Pages 正式后端。

### 方法 1：直接双击打开
直接双击 `index.html` 可尝试离线剧情；`file://` 不等于线上站点，跨域和 AI 联通行为不保证一致。

### 方法 2：使用 Node.js 网关（推荐）
```bash
# 复制配置文件模板
cp config.example.json config.json
# （可选）在 config.json 中填入您的 DeepSeek API Key

# 启动本地服务
npm start
# 或 node server.js
```
然后在浏览器中打开：[http://localhost:8088](http://localhost:8088)。注意根目录 `server.js` 的配置写入接口目前没有认证，**不要直接暴露公网**。

---

## 📁 目录结构

```text
├── index.html                  # 主界面与视觉小说 AVG 舞台
├── styles.css                  # 视觉小说与水墨古典响应式样式表
├── app.js                      # 核心状态机、推演引擎、ADV 渲染器
├── skills-data.js              # 技能树与设计句柄数据
├── config.example.json         # API 配置文件模板
├── server.js                   # Node.js 本地开发服务与 API 网关
├── data/
│   ├── faction-novels.js       # 四大阵营十万字史诗小说合集
│   ├── illustrations/          # 24 张阵营独立展示套图
│   │   ├── illustrations-data.js
│   │   ├── qing/
│   │   ├── ming/
│   │   ├── mongol/
│   │   └── nanming/
│   ├── qing-epic-novel.md      # 大清中枢长篇底本
│   ├── ming-epic-novel.md      # 大明中枢长篇底本
│   ├── mongol-epic-novel.md    # 大漠蒙古长篇底本
│   └── nanming-epic-novel.md   # 南国海邦长篇底本
└── docs/                       # 开发设计架构文档与演进方案
```

---

## 📜 开源协议

本项目采用 [MIT 许可证](LICENSE)。

## 🔌 GitHub Pages 共享 AI 接入

截至上述冻结点，GitHub Pages **不会**运行 `api/chat.js` 或 `api/config.js`；在线 AI 通过 Cloudflare Worker 的 `/api/jiuzhou/turn` 使用服务端 DeepSeek Key。项目方**已主动取消**九州邀请码、Turnstile、站长开关、自设限流及额外输出封顶；DeepSeek/Cloudflare 自身的平台限制仍存在。[共享 AI 网关说明](docs/SHARED-AI-GATEWAY.md) 记录具体测试。

**尚未完成（截至 2026-10-19 09:03:46 UTC）**：真实 5000 档曾生成 3064 正文字符（2691 汉字），没有达到 3500–4800 字目标；连续多轮稳定性未被证明。动态 `innerHTML` 渲染、私有 Key 浏览器持久化、本地 Node 配置接口无鉴权及有限历史窗口也尚未修复。**不得把这些待修项写成已修复，也不得为了修稳定性擅自重加邀请码或验证码。**
