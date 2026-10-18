# 九州沉浮录 · Chronicles of Nine Provinces : Destiny Mirror

> **东方史诗文字冒险与自适应 AI GM 引擎 (Visual Novel & Interactive Fiction)**  
> 融合近十万字明清易代历史底本、四大阵营剧情树、独立万金油展示套图、谷歌电影级生图与 DeepSeek 官方满血前缀推理。

🌐 **在线直接畅玩 (Live Demo)**:  
👉 **[https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/](https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/)**

---

## 🌟 核心特色与系统

### 1. 四大阵营近十万字史诗同人底本与全向剧情树
- **大清中枢 (Qing Court)**：八旗定策、崇政殿誓盟、范文程入关定鼎策、山海关一片石鏖战。
- **大明中枢 (Ming Empire)**：太仓库竭、东南漕税博弈、煤山挽澜誓死勤王、铁血内阁重整山河。
- **大漠蒙古 (Mongol Steppe)**：察哈尔西奔、黄金家族直系统摄、迎奉九游白纛苏勒德神矛、铁骑横扫戈壁。
- **南国海邦 (Southern Seas & Nanming)**：闽海龙旗、郑氏远洋舰队、佛郎机西洋火炮、隆武誓师拓土重洋。

### 2. 24 张阵营独立展示套图与谷歌原生电影级生图
- **四大阵营 × 六大情境万金油套图**：
  - 俘虏 (`captive`)、战斗 (`battle`)、战争 (`war`)、情缘/同袍结义 (`romance`)、胜利 (`victory`)、财富 (`wealth`)
- **严格阵营隔离**：各阵营独立视觉基因与叙事透镜，互不混淆。
- **集成谷歌原生电影级画幅生图**：如山海关一片石万骑踏阵（`data/illustrations/qing/war.jpg`）。

### 3. 双轨解耦与单向不可逆 AI 自由推演
- **法定主线剧情 0 消耗冻结**：基准主干对白随走随存，时光机精准悔棋。
- **AI 自由外推单向演化**：
  - 玩家自主行动与掷骰裁决。
  - 3 个全新的具体走向分支 + 1 个自定开放输入框。
  - 预期长度控制：**少于500字**、**少于2000字**、**少于5000字**自由调节。
  - 动态适时展示阵营套图，大结局画卷绝不触发强制 Game Over，自由开启新篇。

### 4. 纯双模式引擎 (Dual-Mode Engine)
- **本地自洽 GM 模式 (默认 0 门槛畅玩)**：
  - 纯前端 JavaScript 状态机与内建故事树，无需注册、无需 API Key、零网络延迟即点即玩。
- **远端实时 AI 模式 (可选启用)**：
  - 支持官方 DeepSeek V4-Pro / V4.1-Flash / Reasoner (R1) / Chat 原生协议。
  - 严格支持四层前缀缓存（Prompt Caching）与命中率遥测。

### 5. 沉浸式 ADV / AVG 视觉小说交互
- **返回上一段**：支持对白与套图卡片双向平滑回退与前进。
- **血红危机特效**：危机事件震动与血红警示，安全平滑平息与终止，绝无死锁。
- **全端自适应响应式布局**：完美兼容 PC 桌面宽屏与移动端手机竖屏/横屏。

---

## 🚀 本地运行与开发

本游戏为**零外部依赖纯前端单页架构**，既可静态运行，也可配合 Node.js 网关运行：

### 方法 1：直接双击打开
直接用任何现代浏览器（Chrome / Edge / Firefox / Safari）双击打开 `index.html` 即可畅玩！

### 方法 2：使用 Node.js 网关（推荐）
```bash
# 复制配置文件模板
cp config.example.json config.json
# （可选）在 config.json 中填入您的 DeepSeek API Key

# 启动本地服务
npm start
# 或 node server.js
```
然后在浏览器中打开：[http://localhost:8088](http://localhost:8088)。

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

## 🔌 GitHub Pages 共享 AI 接入（待站长启用）

GitHub Pages **不会**运行 `api/chat.js` 或 `api/config.js`。本项目已增加对原有 Cloudflare Worker 的共享 AI 连接（独立的 `/api/jiuzhou/turn` 路由），但默认关闭付费开关，不能将 GitHub 提交等同于已经可调用 DeepSeek。上线步骤、访客验证、配额与失败降级请参见 [共享 AI 网关说明](docs/SHARED-AI-GATEWAY.md)。
