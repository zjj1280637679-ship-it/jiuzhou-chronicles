# 《九州沉浮录》当前状态与决策记录（权威入口）

> 状态基准：2026-10-19；以 `jiuzhou-chronicles/main` 前端代码、`starport-persona/main` 中 `deepseek-worker/src/index.js` 的已查看版本为依据。代码仓库不等于线上部署现场；GitHub Actions 的模拟通过不代表所有真实游戏回合稳定。此文档优先于旧计划、旧截图说明与历史方案。变更代码时须同步更新此处。

## 1. 已确定的产品决策：不要擅自恢复任何访问门槛

- **主页、离线剧情和共享 AI 均不要求邀请码、密码、站长手动批准或 Turnstile 验证**。邀请码是项目方在 2026-10-19 主动取消的方案，不是遗漏待修的功能。
- 九州专属共享 Worker 路由不使用旧 `AI_ENABLED`、`JIUZHOU_ENABLED` 开关或 `AI_LIMITER`、`GM_LIMITER` 项目限流；并未人为设定九州输出 Token 配额。其他作品的旧路由可以继续保留各自的管理机制，**不可反向套用到九州**。
- 不应把“AI 生成不稳定”直接归因为没有邀请码，也不得通过重新加密码、验证码、客户端假锁、隐藏 AI 入口等手段冒充修复。任何恢复这些门槛的变更都需项目方新的明确指令。
- API Key 必须留在后端 Secret；网页只包含 Worker 公共 URL。现有 Worker 的 `Origin` 精确匹配属于请求来源检查，**不能视为身份认证或防滥用保证**。
- 已取消的是**站点自行加的配额和门槛**，不是 DeepSeek/Cloudflare 的供应商额度、平台限制、超时或网络故障。

## 2. 当前真实调用路径与作用域

```text
GitHub Pages: /index.html + app.js
   ├─ 预置离线剧情树：浏览器本地执行（无需模型）
   └─ 共享在线剧情 / 剧情弥合：
      ai-gateway-config.js 中的公共 HTTPS Worker 地址
      → GET /health（连接状态，仅表示有服务端 Key，非生成成功）
      → POST /api/jiuzhou/turn（story / suture）
      → Worker 的服务端 DeepSeek Secret → DeepSeek
```

- 浏览器端在共享模式不携带站长 DeepSeek Key；Worker 使用其环境变量 `DEEPSEEK_MODEL` 选择模型。前端下拉框的模型设置**不代表**可以切换共享模型。
- 前端填写个人 Key 时会切换为私人直连端点（这是调试路径，可能受 CORS 等限制）；个人 Key 会被现有前端保存进浏览器 `localStorage`，不能写作“只保存在后端”。
- 根目录 `server.js` 与 `api/chat.js`、`api/config.js` 是**不同的本地 / Vercel 部署路径**，GitHub Pages 不执行它们。请勿混用它们的调用成功与否作为共享 Worker 线上结论。
- `pure-local/` 是历史独立对照实现，**不是**当前 GitHub Pages 的实际实现；它的 README 见对应状态说明。
- 线上 Worker 是否同步部署了最新 GitHub `main`，必须通过线上探测核实，不能仅凭仓库提交推断。

## 3. AI 稳定性：已确认的事实与尚未完成的验收

| 维度 | 2026-10-19 的可靠结论 | 不应声称 |
| --- | --- | --- |
| 基础接线 | 已有 GitHub Actions 模拟前端浏览器与 Worker 测试通过记录；公开 Worker 有过真实联通测试记录 | “测试绿灯 = 每次在线生成成功” |
| 连接状态 | `GET /health` 的 `jiuzhouReady:true` 只表示 Worker 配置了服务端 Key | “健康检查通过 = 模型可用且回复正确” |
| 生成验证 | 设置中的“测试请求”会消耗一次真实、较短的模型请求；有真实生成记录 | “短测试通过 = 长篇与无限续玩可靠” |
| 长篇输出 | 2026-10-19 单次 5000 档样本由 1353、1486 提升到 3064 **正文字符**（其中 2691 汉字） | “5000 字稳定达标” |
| 续玩 / 上下文 | 有过一次 2170 字玩家输入、成功引用末尾人物的真实验证 | “无限上下文”、“无限轮历史都送给模型” |
| 恢复 | 取消、异常、截断回退和不写入半轮历史具有代码及模拟验证 | “所有网络与浏览器中绝不死锁” |
| 配额 | Worker 对九州不自行截断为旧小 Token 限额，范围检查为 `1..393216` | “实际单次一定能输出 393216 Token” |

历史实测的准确细节见 [共享 AI 网关说明](SHARED-AI-GATEWAY.md)，不能把“目标篇幅”写成“已交付篇幅”。

### 待处理缺陷 / 风险（尚未修复，不得误标已解决）

1. **长篇不达标且偶发短回**：5000 档要求约 3500–4800 正文字，但已有真实样本只有 3064 正文字符；需要多轮真实验收，不用调高 `max_tokens` 代替质量与长度测试。
2. **客户端富文本渲染安全**：`app.js` 的打字机 `innerHTML += text[charIdx]`、快进 `innerHTML = this.currentFullText`，以及剧情选项/履历/弥合详情等动态模板会写入 `innerHTML`。AI 输出或自由文本可能被当作 HTML 解释；应改成 `textContent`/安全 DOM 结点，不能只依赖模型输出净化。
3. **本地 Node 网关不应当公网暴露**：根目录 `server.js` 的 `POST /api/config` 无鉴权，可以修改 Key、模型及上游地址；`pure-local/server.js` 有类似配置路径。这是本地/自托管问题，**不是**当前 GitHub Pages 的 Worker 路由。
4. **前端明文保留私有 Key**：`app.js` 将个人测试用 Key 写入 `localStorage`，不适合共享设备；应另行评估改为仅会话内持有。
5. **历史长度和存档受限**：发给 Worker 的历史最多为近期 8 个完整回合、总文本预算 120000 字符；本地 `localStorage` 也可能因累积长篇失败。不得标记为真正无限历史。
6. **共享 Worker 不使用邀请码或站点限流**：这是明确的当前产品选择；有潜在资源滥用和赠送额度被消耗风险，但不允许自动改成密码拦截。若需要后续保护方案必须另行讨论并得到明确授权。

## 4. 变更边界与 AI 代理工作约束

- 先确认“目标—条件—现状—证据”，再修改代码；不以代理自设的预算、频率、安全、输出长度、登录许可等条件替代项目方要求。
- 修稳定性时先定位是 `/health`、`/api/jiuzhou/turn`、上游模型、JSON 校验、客户端解析/渲染、还是历史恢复的问题；每层单独报错和验收。
- **不能未经授权更改**当前无邀请码、无 Turnstile、无站长开关、无额外项目输出封顶的决定。
- 标清测试种类：静态审查／模拟测试／真实 Worker 短回合／真实长篇连续回合／生产浏览器手测。禁止混作“已全链路验证”。
- 不要静默把失败伪装为 AI 成功；展示本地回退与上游真实返回的区别。
- 旧实施方案只可作为历史资料引用，不是生效中的需求规格；产生冲突时以此决策记录与后续项目方明确指令为准。

## 5. 相关文档

- [共享 AI 网关、已做测试与未达标项](SHARED-AI-GATEWAY.md)
- [根目录入口说明](../README.md)
- [纯本地独立对照（不代表云端线上）](../pure-local/README.md)
- [历史方案档案](plans/2026-10-18-first-principles-harness.md)
- 后端源码：[starport-persona/deepseek-worker/src/index.js](https://github.com/zjj1280637679-ship-it/starport-persona/blob/main/deepseek-worker/src/index.js)
