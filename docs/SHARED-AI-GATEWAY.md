# 《九州沉浮录》共享 AI 接入说明

## 当前状态

- 2026-10-19 真实生产浏览器检查发现：Turnstile 脚本加载成功，但验证 iframe 返回 HTTP 400，客户端回调错误码 `400020`。Cloudflare 定义该码为 **Site Key 无效**；请求在访问验证阶段停止，尚未到达剧情模型。随后在站长已登录的 Cloudflare 控制台核对：现有 `starport-mingqing-ai` 控件的公开 Site Key 末尾为 `Cu3Gq`，两个仓库误写成 `Cu3G`，漏掉最后一个 `q`；本次已修正。允许域名正是 `zjj1280637679-ship-it.github.io`，无需迁移网址或重建控件。未读取或更换 Secret。参见 [Cloudflare 客户端错误码](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/)。
- 同次控制台检查确认：生产 Worker 由 `starport-persona` 的 `main` 经 Cloudflare 原生 Git 构建部署，源提交为 `47e7d58`，`AI_LIMITER` 与 `GM_LIMITER` 两个绑定均存在；`/health` 与 GitHub Pages 来源预检正常。GitHub 内另一个无凭据的跳过任务不能代表此原生部署状态。修复后的真实 Turnstile → DeepSeek 回合仍须在上线后验收，不能由模拟测试推断。
- 设置现在区分“网关已就绪”“真实 AI 已生成”和“本轮使用本地剧情/弥合”；访问验证或生成失败会显示原因。“重新检查连接”只检查健康状态，不触发付费模型请求。
- 公开 `endpoint` 支持 HTTPS 自定义域名源（也可与网页同源）；不接受用户名、密码、路径、查询参数或片段。当前地址保持不变。自定义域名仍需正确绑定 Worker，并在服务端允许网页 Origin、在 Turnstile 允许网页域名。

- 新网站仍是 GitHub Pages 静态站，`api/chat.js` 与 `api/config.js` 仅适用于 Vercel，GitHub Pages 本身无法运行它们。
- 前端检查已有 Cloudflare Worker 的 `GET /health`，要求 `configured=true`、`enabled=true`、`jiuzhouEnabled=true`；新版健康响应若明确返回 `jiuzhouReady=false`，也会显示尚未就绪。健康检查通过仅代表网关配置就绪，真实可用性仍需通过 Turnstile 并成功生成一轮剧情。
- 新路由：`POST /api/jiuzhou/turn`，代码位于 **starport-persona** 仓库 `deepseek-worker/src/index.js`。
- 共享 AI 是否开放以生产 Worker 的健康状态为准；仓库中的开关、代码提交和模拟测试均不能证明已成功调用真实模型。

## 如何上线（站长操作）

1. 合并此仓库的前端改动和 **starport-persona** 仓库对应的 Worker 改动。
2. 确认已有 Worker `starport-deepseek-gateway` 已部署新版代码，并配置 **Secret** `DEEPSEEK_API_KEY` 与 `TURNSTILE_SECRET`；它们绝不应写入 GitHub 静态代码。
3. 先确认 DeepSeek 账户的预算和关闭方法。按需先用极低余额／独立测试 Key 测试。每 IP 3次/分钟、Turnstile **并不是全局费用上限**。
4. 确认 `starport-persona/deepseek-worker/wrangler.toml` 中 `JIUZHOU_ENABLED` 已按站长意愿设为 `true` 并部署，且 `AI_LIMITER`、`GM_LIMITER` 绑定就绪；若计划保持关闭，则保留离线模式。
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
