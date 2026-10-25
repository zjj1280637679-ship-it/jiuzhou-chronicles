# 九州插件式工具循环

本实现参考 Pi 的极简循环与 DeepSeek Harness 的插件组合思想，不依赖其完整 CLI/SDK。当前游戏使用 GitHub Pages + 个人 API 直连；玩家自行填写端点、模型和所需 Key，未启用时使用本地剧情。站长共享 API 已于 2026-10-22 移除。

## 执行边界

`runtime.js` 只负责追加消息、请求模型、调度原生工具、接收交付和释放资源。模型适配由 `model` 函数注入，进度由 `onEvent` 订阅。世界读取、剧情创作和插画选择工具分别运行在独立 Web Worker，得到结构化克隆的数据，没有页面 DOM 或游戏引擎引用。

v2.6.2 将 Worker 装载、注册、参数校验与交付归属提取到 `plugin-host.js`；`contracts.js` 校验工具声明使用的类型与字段约束，`effects.js` 统一原生、JSON 兼容和旧图片名的效果规则。模型接口仍为 8 个工具。结构问题、局部状态不变量和后续拆分边界见 [程序结构检查](../docs/ARCHITECTURE-AUDIT.md)。

- `plugins/world.js`：`read_world` 读取玩家可见的本轮快照。
- `plugins/story.js`：`deliver_story({story})` 可直接交付；需要分步写作时，`write_draft` 暂存或追加，最后 `deliver_story({})` 交付已有草稿，`read_draft` 按需回看。旧 `inspect_draft` 留在执行层兼容。草稿不会直接改变玩家历史。
- `plugins/illustrations.js`：`browse_illustrations` 逐层浏览分类，`search_illustrations` 搜索图片短语及内容摘要。`set_scene_background` 暂存背景，`show_illustration` 暂存独立弹窗，两者通常只传一个 `token`，清空时只传 `clear:true`。旧 `list_illustrations`、`select_illustration` 和 `id` 仍能执行，未向新模型重复声明。
- `providers.js`：来源注册与模型卡预设，按选中来源构造请求；不会切换到站长通道。`provider-google.js` 独立适配 Google Gemini 官方兼容接口，默认 `gemini-flash-lite-latest`。通用接口、Google 与 DeepSeek 扩展分别适配，见 [API来源](../docs/API-SOURCES.md)。
- `protocol.js`：执行层通过 `tools` 保留旧契约，模型通过 `forModel(host.tools)` 只看到 8 个常用工具；`modelResult` 精简模型回执，宿主仍保留完整状态。工具按名字稳定排序，注册按配置顺序，避免启动快慢改变行为。最小调用见 [AI 工具接口](../docs/AI-TOOL-API.md)。
- `worker-entry.js`：独立插件的消息入口。异常变为工具回执；同步卡死的插件在工具超时后被终止，其他插件保持可用。这里的本地工具超时不是模型请求、字数或调用频率上限。

添加可信插件时，提供 `{id,url}`、声明工具并实现 `execute(name,args,context)`。启停只影响该实例的注册和状态；同名冲突插件被拒绝，不覆盖先注册工具。每个工具只接收该插件需要的结构化上下文。

内置世界插件仅接收 `world`，剧情插件接收空上下文，图库插件仅接收图库数据。新增插件可在配置里提供 `contextKeys`；未声明的旧自定义插件继续使用私人上下文副本。只有注册的 `deliver_story` 所属插件在交付操作中返回的有效回执可以提交正文；其他工具附带的 `delivery` 不会结束模型循环。

这个隔离边界不承诺网络永不失败，也不把 Worker 当作运行任意不可信脚本的权限沙箱。现有旧剧情树、存档及插画展示仍由原引擎承接，没有宣称整个旧应用已经全部插件化。关键交付插件不可用时，本轮明确失败并保留可恢复的本地玩法；不会用其他插件的结果冒充剧情。插画是可选插件，故障时正文仍可独立交付。

## 插画工具与新增接口

宿主通过 `createGameHarness({illustrationCatalog: registry.snapshot(), illustrationBaseURL: document.baseURI, ...})` 注入可克隆的精简目录，包含分类、短语、旧别名及按需文字分片路径。插件和网页共用 `illustration-system.js` 的注册表。旧 `illustrations` 数组注入继续兼容。目录默认开放全部可用场景，`faction` 仅筛选画面设定，不作为玩家阵营的访问限制。

```js
browse_illustrations({path: "事件/拘押与交涉"})
search_illustrations({query: "后金 押解"})
show_illustration({token: "后金·押解途中", afterBeat: 2, caption: "雪路上的押解队伍。"})
show_illustration({clear: true})
```

`afterBeat` 指分页前的整稿原始正文段落；追加草稿也按整稿编号，不按本次追加片段重新编号。0 为首段前，N 为第 N 段后，默认 1；超出正文末尾的位置由渲染层放在末尾。同位置后一次有效选图覆盖旧图。执行层返回完整 `result.selections` 供宿主更新状态，模型只收到 `{"ok":true}`；无效引用、位置或冲突清空返回错误且不改变旧选择。所有效果只在正文成功交付后生效，取消或失败不提交。

新增图片仅需增加可信目录条目和本地文件；新增场景匹配写入场景映射，工具声明、Worker 和模型循环不需要按图片数量增加分支。目录及选图回执不写入正文 `beats[].text`；图片说明、工具 JSON 和查询结果不会用于满足字数目标。

同一交付混用 JSON 与原生图片操作时，操作过的原生通道优先，包括明确清空；未操作的另一通道仍可使用 JSON 效果。此规则由 `effects.js` 集中管理，不在模型循环和网页各自猜测。

模型提示词最多露出 6 幅当前精选，其余通过分类或搜索发现。分类返回当前层 `children`，搜索每页 8 项并返回 `images`，有后续页时才带 `nextPage`；模型不接收路径、内部 ID、重复的选图规则或全量待选快照。适用与避用说明继续保留。文字资料按需读取，图片只在网页实际展示时请求。

## 篇幅偏好

2026-10-23 按用户要求，界面的 500／2000／5000 档和选项保持不变；仅在发给模型的末尾提示中分别要求 1000／2500／5500 字正文。篇幅只指叙述和对白 `beats[].text`，不包括 JSON、思考、工具、角色名、sub、选项、插画说明或旧草稿。数字偏好不进入稳定系统前缀。

程序不统计或验收正文字数，没有正文不足错误、剩余字数反馈、按差额强制补写或长度拒交；实际篇幅由用户判断。有效但短的正文会直接交付。运行指标只留在内部状态，不输出到游戏或设置界面；玩家只看到简单等待、取消、连接测试结果和可恢复错误。

`inspect_draft` 仅返回草稿是否存在、段落与选项概况。`write_draft` 保留主动 `append`／`replace`，模型可因叙事需要继续创作，程序不因篇幅驱动循环。`deliver_story` 和直接 JSON 都只要求格式正确、含有效非空正文。草稿和选图仍只在成功交付后写入剧情；格式、网络、取消和插件故障继续保留原行动供恢复。

没有固定多角色剧本或模型循环次数配额；相同工具操作和结果形成重复停滞时明确结束，玩家也可以取消整轮。传输错误不自动重发收费请求。所选模型服务的请求/上下文容量仍存在，超出时明确报错，不暗中裁切 native 工具历史。

## DeepSeek 与缓存

个人 API 使用标准 Chat Completions 原生工具请求；共享后端与其 mode 协议已移除。工具 schema 固定排序；固定系统规则与时代背景放前面；行动、目标字数、工具结果及新回复追加到后面；续步保留原始调用 ID 和 arguments 字串，不重写前缀。新循环关闭 thinking；偶发 provider reasoning 只在本轮内存续传，最终剧情及历史均不包含它。

读取官方 `usage.prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens` 内部累计记录真实命中量，不投影到游戏界面。缓存默认由供应商建立，命中属于 best effort，不因为代码采用稳定前缀就宣称必然高命中。切换故事/插件组合或未来历史裁选可能启动新前缀。

来源：[Pi agent loop](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)、[DeepSeek Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[DSH DeepSeek adapter](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-deepseek/README.md)、[DeepSeek 缓存规则](https://api-docs.deepseek.com/guides/kv_cache/)。本项目沿用现有 Chat Completions 通道，未宣称照搬 DSH 的 Anthropic Messages 实现。

## 验证

`npm run test:unit`

Node 测试使用真实 Worker 线程及模拟模型，包含插件抛错、同步死循环、取消、冲突、短正文正常交付、主动追加、原生调用和网页引擎接线；没有模型费用。插画专项测试覆盖多位置、覆盖与清空、同批次交付后选图、坏句柄、URL拒绝、可选插件故障和取消后隔离。CI/模拟不能代替真实模型、实际缓存或用户对篇幅与叙事的判断。
