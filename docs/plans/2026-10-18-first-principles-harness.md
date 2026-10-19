# 通用互动小说 Harness (第一性原理极简架构) 实施方案

> **历史方案档案 — 非当前生效的执行指令**  
> **方案标称日期：2026-10-18（来源：文件名，原文未提供具体时分秒，不得捏造）。**  
> **核对时点：2026-10-19 09:03:46 UTC**（`jiuzhou-chronicles@02b83d91`）；当前实现可能已完成部分、替换部分或尚未完成，不能从文内的 Task 编号直接判定状态。  
> **现行决策**：2026-10-19 08:08:20–08:08:40 UTC 的前后端提交明确取消九州验证码、邀请码、站长开关和应用层配额。本文件任何较早的框架或“REQUIRED SUB-SKILL”字样仅属**历史引用**，不再向自动代理授予执行权限。  
> **优先阅读**：[UTC 时间线与当前事实](../CURRENT-STATE-AND-DECISIONS.md)。未经新的明确指令，不执行本文件任务。


> **For Antigravity:** REQUIRED SUB-SKILL: Load executing-plans to implement this plan task-by-task.

**Goal:** 贯彻第一性原理，将系统重构为统一的“3个AI剧情发展方向 + 1个玩家自填输入（共4选项）”通用互动叙事 Harness，预设对话树承担“API免费离线兜底”与“AI世界观参考”双重职责。

**Architecture:** 
1. **统一决策规范 (3+1 Rule)**：不论是预设主线、AI自由外推、终局后日谈还是离线模式，UI 界面永远严格呈现 4 张卡片（前 3 张为具体剧情发展方向，第 4 张永远为 `【✍️ 输入文字开放式外推】` 供玩家自填）。
2. **预设对话树的双重使命**：
   - **使命 A（API 免费离线兜底）**：在无 API Key 或离线状态下，作为确定性的对话分支树供玩家完整体验，Act 1~4 全节点严格保证“3主干+1开放输入”。
   - **使命 B（AI 世界观参考与前缀缓存）**：在线状态下，整棵树作为高质量 In-Context Few-Shot 与宏观因果骨架固化在 Prompt Cache 静态层（Layer 2），由 DeepSeek-V4.1 原生思考模式驱动无限推演。
3. **架构鲁棒性强化**：修复地图坐标击穿缓存前缀问题（移至动态尾部 Layer 4）、时光机回退时同步修剪 `apiHistory`、全四大阵营神迹登基文案自适应。

**Tech Stack:** JavaScript (ES6+ / Node.js 24), DeepSeek-V4.1-Flash (Thinking Mode & Prompt Caching), Web Components / Canvas.

---

### Task 1: 规范化 `skills-data.js` 四大阵营主剧情树选项结构 (离线免费兜底强化)

**Files:**
- Modify: `d:\deepseek\ai-gm-harness-prototype\skills-data.js`

**Tasks:**
1. 核查并补齐 `ming`、`mongol`、`nanming` 阵营在 Act 1 与 Act 2 的第 4 选项，统一标记 `isOpenEndedInput: true` 并命名为 `【✍️ 输入文字开放式外推】`。
2. 扩充 `ming`、`mongol`、`nanming` 在 Act 3 与 Act 4 的节点选项：从原本生硬的“1主干+1外推（2选项）”规范升级为标准“3个剧情发展方向 + 1个开放输入（4选项）”，使离线免费模式下四大阵营手感完全一致。

---

### Task 2: 重构 `app.js` 的 `presentFactionChoices()` 选项呈现引擎 (严格贯彻 3+1 铁律)

**Files:**
- Modify: `d:\deepseek\ai-gm-harness-prototype\app.js:1350-1540`

**Tasks:**
1. 彻底移除原 `choices = node.choices` 的脆弱直出逻辑。
2. 重构主干节点渲染：
   - 提取前 3 个有效剧情发展方向（若预设不足 3 个，智能补齐至恰好 3 个）；
   - 强制追加第 4 项 `【✍️ 输入文字开放式外推】`（玩家自填输入框）。
3. 确保外推模式（`isExtrapolating`）与大结局终章（`isEndingNode`）同样严格执行“3发展方向 + 1自填输入”逻辑，彻底消灭界面偶发 2 或 3 个选项的 Bug。

---

### Task 3: 优化 Prompt Cache 前缀对齐与时光机历史回溯 (架构健壮性补丁)

**Files:**
- Modify: `d:\deepseek\ai-gm-harness-prototype\app.js:2060-2090, 2480-2560`

**Tasks:**
1. **Layer 2 静态化**：将动态地图坐标 `this.currentCoords` 从 Layer 2（阵营静态规范层）剥离，移入 Layer 4（动态瞬时尾部），确保 Token-0 至 Layer 2 末尾全服 100% 永恒命中 KV Cache。
2. **时光机历史同步修剪**：在 `recordFateKnot` 中记录 `apiHistory.length` 快照，在 `rewindToKnot` 悔棋回溯时光机时，将 `apiHistory` 同步截断，杜绝“未来幻觉历史污染模型”。
3. **神级跃迁文案阵营自适应**：离线 GM 局势深思与跃迁选项文案根据 `this.currentFaction` 动态匹配（如大明“紫禁受禅”、大清“盛京定鼎”、蒙古“长生天金帐称汗”、南明“承天府万舰朝宗”）。

---

### Task 4: 编写全量回归测试套件并运行验证

**Files:**
- Create: `d:\deepseek\ai-gm-harness-prototype\test-first-principles-harness.js`
- Test: 验证四大阵营所有常规节点与外推场景选项数 strictly === 4，验证离线与在线双模式，验证神迹跃迁与无限续集。

---

### Task 5: 提示词深度重塑与“引渡目标”彻底废除 (FNAC 第一性原理文学范式)

**Files:**
- Modify: `d:\deepseek\ai-gm-harness-prototype\app.js`

**Tasks:**
1. **角色形态与反套话重构**：贯彻“你现在是《观星纪 · 九州沉浮录》的【残酷历史戏剧执笔人】形态，彻底放弃【假大空的抽象宏大叙事与套话陈词】与【居高临下的机械评判、说教旁白与图引渡约束】，唯一使命是用【见肉见血的残酷现实、鲜活撕裂的人物对白与极致命运张力】让用户【沉沦于生死抉择的真实戏剧深渊中】”。
2. **强制思考链 FNAC 风格锚定**：
   - 情感基底 F（Feel）：你想让人物活在什么痛里（极致情绪）
   - 叙事倾向 N（Narrative）：定语 ➕ 补偿/攻击/保存/解构（必须发生什么）
   - 美学逻辑 A（Aesthetic）：极简/残酷/神圣/魔性/几何/空洞（镜头类型）
   - 语境燃料 C（Context）：一句场景，一句敌人（活着的世界与死敌）
3. **彻底废除“引渡目标”与图节点路由**：从 JSON Schema、系统提示词与请求 Tail 中彻底移除 `targetNodeId`、`convergenceTargetId`、`jumpToEnding`。AI 纯粹生成 3 个具体剧烈冲突的剧情发展方向，第 4 选项由 Harness 引擎自动提供开放输入。
4. **离线兜底套话清洗**：清洗原本抽象空洞的“历史长河”、“万民争睹”式套话，重塑为刀刀见血、充满现场呼吸感的硬核对白与动作抉择。

