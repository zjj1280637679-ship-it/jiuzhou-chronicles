# 个人 API 与独立适配

游戏由静态网页直接调用玩家选定的个人 API。站长共享 API 已于 2026-10-22 退出当前调用路径；不再加载默认网关、检查后台健康或向共享服务回退。旧接入和排查仅作 [历史档案](history/README.md) 保存。

- 新访客默认使用本地剧情，在线 AI 在设置中自行启用。
- 旧 `source:shared` 配置改为关闭状态的个人来源。已有端点、模型、Key、适配器和 Token 参数保留，确认并保存后才启用，不自动使用旧凭据。
- 已选 `source:custom` 的在线/离线偏好保持原样，包括无 Key 的兼容端点。
- API 地址支持 `/v1` 基础地址和完整 Chat Completions 地址。只补全已知 `/v1` 基础路径；完整地址和自定义路径保持原样。
- 请求直接发往所填地址，Key 非空才发送 Bearer 认证。个人配置保存在当前浏览器，未硬编码到公开源码；不上传站长后台。服务商需允许浏览器跨域调用。
- 测试使用当前未保存的表单，只发短请求，不保存设置、推进剧情或伪造生成指标。
- 独立适配器仍可通过 `register` 注册。通用接口不附 DeepSeek 专有参数；DeepSeek 适配保留原生工具回执与必要推理续传。
- 设置提供 DeepSeek、Google Gemini、自定义／本机 API 三张预设卡。Google 卡自动填写官方地址与 `gemini-flash-lite-latest`，开启远端 AI；只需填写该服务的 Key，可先测试再保存。各卡在当前页面保留未保存草稿，首次切换到另一服务不会沿用上一服务的 Key 或输出 Token 设置。
- 多轮工具循环、内部缓存统计、手动取消、原行动恢复继续可用；运行日志与诊断指标不输出到 UI。2026-10-23 起篇幅仅作为提示词偏好，模型要求比原档位多 500 字，程序不统计或验收字数。输出参数支持 max_tokens/max_completion_tokens，留空使用所选服务默认值。

个人来源迁移回归验证旧配置和进度保留、未保存配置短测、隔离工具执行及短正文正常交付。模型回复为测试夹具时没有使用个人模型额度；不能据此声称已验证任意供应商或国内全网可达。Google 已有真实请求记录见下节，亦不代表本次清理重新付费测试。

## Google Gemini（2026-10-24）

- 独立来源 `source:google` 由 `harness/provider-google.js` 注册，不改变自定义接口和 DeepSeek 的协议行为。
- 官方 OpenAI 兼容地址：`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`。也接受该地址的 `/v1beta/openai` 基础路径；Key 只放 Bearer 认证头，不放 URL、模型提示词或正文。
- 默认模型为 `gemini-flash-lite-latest`；仍可编辑具体模型和接口。latest 是会变动的别名，不根据名称猜测具体底层版本。
- 连接短测／弥合使用 JSON 对象响应；工具循环传原生工具表并保留调用 ID、参数字符串及 Google 扩展签名，不附 DeepSeek 的 `thinking` 参数，也不在工具请求中强加 JSON 响应格式。
- 输出 Token 留空时不加游戏上限。测试按钮的既有短测范围保持独立；不将它作为剧情输出上限。
- 使用用户提供的 Key 做了实际短测和实际隔离插件工具链，`write_draft → deliver_story` 完成，两段有效正文和两个建议选项成功交付。兼容接口回报 `model:gemini-flash-lite-latest`；另一次原生请求回报 `modelVersion:gemini-3.5-flash-lite`。这是本次响应观察，不是别名的永久映射；未统计正文字数。
- 实际API验证经本机网络代理完成；不能据此声称中国无代理直连可达。本地浏览器已验证卡片选择、自动预填和手机布局；本次内置浏览器的真实连接短测未确认成功，不能与命令行真实请求或离线模拟合并报为端到端通过。未把测试 Key 写入源码、报告或公开网页。

官方依据：[OpenAI 兼容接口](https://ai.google.dev/gemini-api/docs/openai)、[工具调用签名](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures#signatures-for-openai-compatibility)、[latest 别名](https://ai.google.dev/gemini-api/docs/models#latest)、[原生响应 modelVersion](https://ai.google.dev/api/generate-content#GenerateContentResponse)。

离线回归：`node --test test-google-provider.cjs`（包含来源隔离、模型卡、未保存配置及工具签名往返）。普通回归继续使用模拟回复。

## GitHub Actions 真实验收（2026-10-26）

仓库 Actions Secret `GEMINI_API_KEY` 已通过官方兼容接口验证。[真实工具链记录](https://github.com/zjj1280637679-ship-it/jiuzhou-chronicles/actions/runs/40218051867) 使用默认 `gemini-flash-lite-latest`、游戏提示词、正式提供方适配器与隔离 Node Workers；短语直选、分类搜索、弹窗、背景及剧情交付两条用例通过，共 6 次请求，无工具错误或额度重试。选图只传 `token`，检索期间只请求文字 JSON。

该诊断通过独立工作流运行，使用 GitHub Secret 的值，脚本读取后从子 Worker 可继承的环境中移除。密钥不进入公开源码、静态构建或模型消息。验收专用的篇幅偏好、请求预算及按服务端提示等待分钟额度的重试仅作用于该脚本；游戏请求设置保持原样。此次记录不等同于浏览器跨域或实体手机网络验证。
