# 《观星纪 · 九州沉浮录》纯本地基准版本（独立对照，不是当前线上后端）

> **档案创建：2026-10-19 08:37:57 UTC**，提交 `jiuzhou-chronicles@02dda2e9`。  
> **当前云端对照的代码冻结点：前端 2026-10-19 09:03:46 UTC (`02b83d91`)，Worker 2026-10-19 08:52:17 UTC (`starport-persona@81f8a19f`)。**后续变更不自动纳入本说明。  
> **现行决策参见**：[UTC 时序与权威决策](../docs/CURRENT-STATE-AND-DECISIONS.md)。本地对照不能覆盖当前生产方案。

## 起源与历史位置

此目录在云端接入过程之后创建，用于独立比较本地 Node 网关与 GitHub Pages + Cloudflare Worker 的行为。旧文档所述“云端仍有 Turnstile 验证、长文人为截断”指向**2026-10-19 08:08 UTC 之前的历史版本**，不是当前主干的事实。

截至上述冻结点，九州主干**已主动取消邀请码、Turnstile、站长开关、项目限流与自行设置的输出封顶**；不可为排查 AI 不稳定而擅自恢复。供应商平台限制、网络超时及实际长篇效果仍需验证。

## 当前架构对照（严格区分部署）

| 维度 | 本地对照 `pure-local/` | 正式 GitHub Pages + Worker |
| --- | --- | --- |
| 入口 | `node pure-local/server.js`，本地 `/api/chat`、`/api/config` | 静态 `index.html`，远程 `/api/jiuzhou/turn` |
| AI Key | 本机环境变量/配置文件，必要时历史实现还会扫描本机凭据 | Cloudflare Worker Secret，网页不持有共享 Key |
| 邀请码/验证码 | 无 | **已取消**，不是待恢复功能 |
| 模型 | 本地可配置 | 由 Worker 的 `DEEPSEEK_MODEL` 决定 |
| 历史 | 本地实现的行为应独立测试 | 最新最多 8 个完整回合与 120000 字符上下文预算，**非无限历史** |
| 真实长篇效果 | 未完成同条件对照实测 | 2026-10-19 有 5000 档单次 3064 正文字符的样本，**未达 3500–4800 字目标** |
| 安全 | `POST /api/config` 当前未认证，**不要直接公网暴露** | 独立 Worker 来源检查；不能当作身份认证 |

## 使用方式（本地开发）

根目录共享的 `data/`、`styles.css` 等资源供此独立目录复用。可通过环境变量 `DEEPSEEK_API_KEY` 或本地配置文件提供测试用 Key（不要提交真实凭据）：

```bash
node pure-local/server.js
# 或 Linux/macOS：
PORT=8099 node pure-local/server.js
```

PowerShell 可使用 `$env:PORT=8099; node pure-local/server.js`。默认开发地址 `http://localhost:8088`。

> **测试状态：待验收。** 此目录的代码与主干前端不同；不能把本地短请求的速度、无跨域体验或某一次成功自动推断为云端已修复、永久秒级响应或 100% Prompt Cache 命中。
