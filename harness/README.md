# 九州插件式工具循环

本实现参考 Pi 的极简循环与 DeepSeek Harness 的插件组合思想，不依赖其完整 CLI/SDK。当前公开游戏仍使用 GitHub Pages + Cloudflare Worker；模型密钥只由共享 Worker 持有。

## 执行边界

`runtime.js` 只负责追加消息、请求模型、调度原生工具、接收交付和释放资源。模型适配由 `model` 函数注入，进度由 `onEvent` 订阅。世界读取和剧情创作工具分别运行在独立 Web Worker，得到结构化克隆的数据，没有页面 DOM 或游戏引擎引用。

- `plugins/world.js`：`read_world` 读取玩家可见的本轮快照。
- `plugins/story.js`：`write_draft` 替换或追加草稿，`read_draft` 读取，`inspect_draft` 检查，`deliver_story` 交付。草稿不会直接改变玩家历史。
- `providers.js`：独立注册共享/自定义来源，按明确选择构造模型请求；Key不决定路由。通用接口与DeepSeek扩展分别适配，见 [API来源](../docs/API-SOURCES.md)。
- `protocol.js`：可替换插件与网关共用的工具契约及纯文本规范化规则。工具按名字稳定排序；注册按配置顺序，避免启动快慢改变行为。
- `worker-entry.js`：独立插件的消息入口。异常变为工具回执；同步卡死的插件在工具超时后被终止，其他插件保持可用。这里的本地工具超时不是模型请求、字数或调用频率上限。

添加可信插件时，提供 `{id,url}`、声明工具并实现 `execute(name,args,context)`。启停只影响该实例的注册和状态；同名冲突插件被拒绝，不覆盖先注册工具。共享后端的工具契约也要独立注册，不能让浏览器把共享模型变成任意功能代理。

这个隔离边界不承诺网络永不失败，也不把 Worker 当作运行任意不可信脚本的权限沙箱。现有旧剧情树、存档及插画展示仍由原引擎承接，没有宣称整个旧应用已经全部插件化。关键交付插件不可用时，本轮明确失败并保留可恢复的本地玩法；不会用其他插件的结果冒充剧情。

## 交付字数

500／2000／5000 档现在表示**最终交付正文的最低目标**，没有新增输出上限。只计算规范化后的叙事 `beats[].text` 中非空白 Unicode 字符，标点计入字符，汉字另列。排除思考、工具回执、JSON 结构、人物名、sub、选项、插画、元数据以及已被替换的旧草稿。

草稿不足会作为真实检查结果交给 Agent，由它选择补写或修订；可以 `append` 新段落，不必每次重写全文。最终正文规范化后还要通过前端二次检查，之后才写入剧情历史与运行舞台效果。工具参数中包含了正文并不表示正文已经交付。

没有固定多角色剧本或模型循环次数配额；相同工具操作和结果形成重复停滞时明确结束，玩家也可以取消整轮。传输错误不自动重发收费请求。当前 Worker 的请求/上下文容量仍存在，超出时明确报错，不暗中裁切 native 工具历史。

## DeepSeek 与缓存

共享后端新增 `mode:"agent"` 的独立模型适配器，保留旧 `story/suture` 与连接测试。工具 schema 固定排序；固定系统规则与时代背景放前面；行动、目标字数、工具结果及新回复追加到后面；续步保留原始调用 ID 和 arguments 字串，不重写前缀。新循环关闭 thinking；偶发 provider reasoning 只在本轮内存续传，最终剧情及历史均不包含它。

读取官方 `usage.prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens` 累计显示真实命中量。缓存默认由供应商建立，命中属于 best effort，不因为代码采用稳定前缀就宣称必然高命中。切换故事/插件组合或未来历史裁选可能启动新前缀。

来源：[Pi agent loop](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)、[DeepSeek Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[DSH DeepSeek adapter](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-deepseek/README.md)、[DeepSeek 缓存规则](https://api-docs.deepseek.com/guides/kv_cache/)。本项目沿用现有 Chat Completions 通道，未宣称照搬 DSH 的 Anthropic Messages 实现。

## 验证

`node --test test-plugin-harness.cjs test-free-exploration-edges.cjs test-shared-ai-connection.cjs test-ai-connection-probe.cjs test-providers.cjs test-ai-provider-routing.cjs`

Node 测试使用真实 Worker 线程及模拟模型，包含插件抛错、同步死循环、取消、冲突、正文核算、追加补写、原生调用和网页引擎接线；没有模型费用。浏览器模拟运行 `node test-shared-ai-browser.mjs`。CI/模拟不能代替公开 Worker 的真实多步模型、实际缓存和 5000 字交付验收。
