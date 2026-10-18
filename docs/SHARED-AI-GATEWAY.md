# 《九州沉浮录》共享 AI 接入说明

## 当前状态

- 新网站仍是 GitHub Pages 静态站，`api/chat.js` 与 `api/config.js` 仅适用于 Vercel，GitHub Pages 本身无法运行它们。
- 现在前端优先检查已有 Cloudflare Worker 的 `GET /health`，仅当 `configured=true`、`enabled=true`、`jiuzhouEnabled=true` 才视为共享 AI 可用。
- 新路由：`POST /api/jiuzhou/turn`，代码位于 **starport-persona** 仓库 `deepseek-worker/src/index.js`。
- **共享 AI 默认关闭**：Worker `JIUZHOU_ENABLED="false"`，不能将“代码已提交”误称作“付费 AI 已启用”。

## 如何上线（站长操作）

1. 合并此仓库的前端改动和 **starport-persona** 仓库对应的 Worker 改动。
2. 确认已有 Worker `starport-deepseek-gateway` 已部署新版代码，并配置 **Secret** `DEEPSEEK_API_KEY` 与 `TURNSTILE_SECRET`；它们绝不应写入 GitHub 静态代码。
3. 先确认 DeepSeek 账户的预算和关闭方法。按需先用极低余额／独立测试 Key 测试。每 IP 3次/分钟、Turnstile **并不是全局费用上限**。
4. 在 `starport-persona/deepseek-worker/wrangler.toml` 中，将 `JIUZHOU_ENABLED` 由 `false` 改为 `true`，再由站长部署 Worker。不要在未批准付费消耗的情况下自动开启。
5. 在 GitHub Pages 打开 `https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/`，检查 Worker `/health` 的 `jiuzhouEnabled:true`。进入故事，开启实时 AI，选择一次自由剧情；验证 Turnstile 后应生成真正的 `beats` 和 `choices`，而不是本地模板。
6. 分别测试回合失败、网络断开、取消 Turnstile、关闭远端模式：都应保留离线故事的可玩性。

## 数据与费用

- 静态文件 `ai-gateway-config.js` 只存放**公开** Worker URL 与公开 Turnstile Site Key。
- 每次 AI 调用会向服务端发送当前阵营背景的有界节选、最近游戏行动、玩家当前输入及掷骰情况。
- 模型固定为 Worker 环境变量 `DEEPSEEK_MODEL`，前端选择不会强制服务器启用昂贵模型。
- 服务端限定每个请求的上下文和输出 Token，必须通过 Turnstile，沿用 `GM_LIMITER` 频率限制；若不合格、关闭或上游超时，回到本地推演。
- 基于公网 IP 的限流并非账户级限额；实际正式开放仍需额外的服务端日预算/全局配额或供应商账务保护。
- 缩短的小说片段并非完整十万字底本。单轮输出上限也可能达不到网页上声称的最长五千字，需根据预算重新设计分段生成。
- 旧版本地 `server.js` 的 `POST /api/config` 没有可靠站长身份验证，不应暴露在公网。共享 AI 方案完全不使用它，游客设置不会 POST 上传平台 Key。

## 两条后端路线不要混用

- GitHub Pages：`公开网页 -> Cloudflare Worker -> DeepSeek`，此改动采用这一条。
- Vercel：`公开网页 -> /api/chat.js -> DeepSeek`，已有代码并不代表在 GitHub Pages 自动生效；若另行用 Vercel 部署，仍需重新审查密钥权限与费用保护。
