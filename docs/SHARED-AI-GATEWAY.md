# 《九州沉浮录》共享 AI 接入

## 当前行为

2026-10-19，用户明确要求取消 AI 此前添加的站长限制，并选择“连频率及输出上限也取消”。九州网页直接调用现有 Cloudflare Worker，再由 Worker 使用服务端 DeepSeek Key：

`GitHub Pages → POST /api/jiuzhou/turn → DeepSeek`

- 不加载 Turnstile，不请求验证码或令牌，不需要站长批准开关。
- 九州路由不读取 `AI_ENABLED` / `JIUZHOU_ENABLED`，不使用 `AI_LIMITER` / `GM_LIMITER`。
- 不再裁剪为 1800、2400、4700 或 8000 Token；不再以 44000 字符拒绝回复，也不设置共享生成的 54 / 75 秒截止时间。
- 按访客设置发送 `max_tokens`，仅遵照 [DeepSeek 官方参数范围](https://api-docs.deepseek.com/api/create-chat-completion/) `1..393216`；未指定时采用供应商默认值。篇幅按钮是访客请求偏好，不是服务器配额。
- 本机远端／离线开关只保存访客偏好。共享通道就绪后默认启用；访客仍可主动选择离线。
- API Key 只保存在 Worker Secret 中。网页公开配置仅包含 Worker 地址，未读取或更改 Secret。

仍保留来源和游戏输入结构验证，接口继续服务九州剧情与弥合两种游戏任务。`starport-persona` 的其他作品接口继续使用各自现有设置；九州不依赖这些设置。

## 配置和部署

- 游戏入口：https://zjj1280637679-ship-it.github.io/jiuzhou-chronicles/
- 网关：https://starport-deepseek-gateway.zjj1280637679.workers.dev
- Worker 源码：`starport-persona/deepseek-worker/src/index.js`。
- Cloudflare 已连接后端仓库 `main` 自动构建发布；GitHub Pages 发布本游戏仓库 `main`。GitHub 的手动 Worker 部署只是备用，不需要另建 Token。
- 前端只以 `/health` 的 `jiuzhouReady:true` 判断九州就绪，不再使用旧的站长开关、Turnstile 或限流字段判断。
- `jiuzhouAccess:{challenge:false,rateLimit:false,outputLimit:"provider"}` 描述九州实际策略。旧健康字段服务其他作品，不代表九州有同样门槛。

GitHub Pages 是静态站点，不执行仓库里的 Vercel `api/chat.js` 或 `api/config.js`。本次沿用现有网址和 Worker，没有迁移平台。更换公开 HTTPS 网关源时，需同时配置对应服务端来源；公开配置不接受凭据、路径、查询或片段。

## 验证和失败显示

设置区区分网关就绪、实际生成和本地回退；“重新检查连接”只读取健康状态，不调用模型。AI 回复格式无效、上游认证或网络失败时显示原因；不把本地文本标成真实模型输出。

Node 和移动端浏览器模拟覆盖直接请求、不加载验证服务、大输出参数原值转发、旧开关 false 时可用、失败回退和剧情弥合。模拟结果不等于真实模型已成功；上线后的真实验收需另行记录。

## 本次排查经过

最初生产控件返回 `400020`。在站长已登录的 Cloudflare 控制台实查，两个仓库的公开 Site Key 均漏了末尾 `q`，允许域名正确。修正后控件能够显示，但实际服务端验证仍失败。用户随后明确要求取消该验证及其他自设门槛，因此本版本移除整条九州 Turnstile 链路；这不是通过更换网址解决，也不宣称已经修复旧作品的所有 Siteverify 配置。
