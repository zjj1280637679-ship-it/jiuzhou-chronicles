# 九州插件式工具循环

本实现参考 Pi 的极简循环与 DeepSeek Harness 的插件组合思想，不依赖其完整 CLI/SDK。当前游戏使用 GitHub Pages + 个人 API 直连；玩家自行填写端点、模型和所需 Key，未启用时使用本地剧情。站长共享 API 已于 2026-10-22 移除。

## 执行边界

`runtime.js` 只负责追加消息、请求模型、调度原生工具、接收交付和释放资源。模型适配由 `model` 函数注入，进度由 `onEvent` 订阅。世界读取、剧情创作和插画选择工具分别运行在独立 Web Worker，得到结构化克隆的数据，没有页面 DOM 或游戏引擎引用。

- `plugins/world.js`：`read_world` 读取玩家可见的本轮快照。
- `plugins/story.js`：`write_draft` 替换或追加草稿，`read_draft` 读取，`inspect_draft` 检查，`deliver_story` 交付。草稿不会直接改变玩家历史。
- `plugins/illustrations.js`：`list_illustrations` 查询真实目录，`select_illustration` 暂存本轮图片句柄。查询或选择不会立即展示图片；正文交付成功后才附加到交付的 `stage_effects`，由游戏阅读流展示。
- `providers.js`：当前内置个人来源，按填写的端点构造请求；Key 可按端点要求留空，不会切换到站长通道。通用接口与DeepSeek扩展分别适配，见 [API来源](../docs/API-SOURCES.md)。
- `protocol.js`：可替换插件与网关共用的工具契约及纯文本规范化规则。工具按名字稳定排序；注册按配置顺序，避免启动快慢改变行为。
- `worker-entry.js`：独立插件的消息入口。异常变为工具回执；同步卡死的插件在工具超时后被终止，其他插件保持可用。这里的本地工具超时不是模型请求、字数或调用频率上限。

添加可信插件时，提供 `{id,url}`、声明工具并实现 `execute(name,args,context)`。启停只影响该实例的注册和状态；同名冲突插件被拒绝，不覆盖先注册工具。每个工具只接收该插件需要的结构化上下文。

这个隔离边界不承诺网络永不失败，也不把 Worker 当作运行任意不可信脚本的权限沙箱。现有旧剧情树、存档及插画展示仍由原引擎承接，没有宣称整个旧应用已经全部插件化。关键交付插件不可用时，本轮明确失败并保留可恢复的本地玩法；不会用其他插件的结果冒充剧情。插画是可选插件，故障时正文仍可独立交付。

## 插画工具与新增接口

宿主通过 `createGameHarness({illustrations: registry.list({includeLegacy: true}), ...})` 注入本轮目录快照；插件用根模块 `illustration-system.js` 的 `createRegistry({assets})`、`list()` 和 `normalizeSelection()` 统一检索与校验。目录默认开放全部可用场景，`faction` 仅筛选画面设定，不作为玩家阵营的访问限制。

```js
list_illustrations({query: "押解", category: "囚禁"})
select_illustration({id: "qing_prisoner_escort", afterBeat: 2, caption: "雪路上的押解队伍。"})
select_illustration({clear: true})
```

`afterBeat` 指分页前的整稿原始正文段落；追加草稿也按整稿编号，不按本次追加片段重新编号。0 为首段前，N 为第 N 段后，默认 1；超出正文末尾的位置由渲染层放在末尾。同一个位置重新选择会覆盖旧图，不同位置可分别选图。成功返回 `result.selections` 完整快照；无效 ID、URL、段落位置或说明类型返回错误且不改变旧选择。原生调用与兼容 JSON 交付均只在正文通过检查后才附加 `show_illustration` 效果；清空、取消、失败和下一轮请求不会继承上轮待选图片。

新增图片仅需增加可信目录条目和本地文件；新增场景匹配写入场景映射，工具声明、Worker 和模型循环不需要按图片数量增加分支。目录及选图回执不写入正文 `beats[].text`；图片说明、工具 JSON 和查询结果不会用于满足字数目标。

## 交付字数

500／2000／5000 档现在表示**最终交付正文的最低目标**，没有新增输出上限。只计算规范化后的叙事 `beats[].text` 中非空白 Unicode 字符，标点计入字符，汉字另列。排除思考、工具回执、JSON 结构、人物名、sub、选项、插画、元数据以及已被替换的旧草稿。

草稿不足会作为真实检查结果交给 Agent，由它选择补写或修订；可以 `append` 新段落，不必每次重写全文。最终正文规范化后还要通过前端二次检查，之后才写入剧情历史与运行舞台效果。工具参数中包含了正文并不表示正文已经交付。

所有档位都在首次请求的末尾明确写出目标、`beats[].text` 计入范围及排除项；数字目标不进入稳定的系统前缀。原生工具通路按“暂存→检查→补写／修订→交付”执行，未提供工具时只返回剧情 JSON。两种通路在提交历史、插画和效果前均执行相同最低正文检查；兼容通路若正文不足，明确失败且保留原行动，不自动重发收费请求。修改篇幅偏好只影响下一轮，不会降低正在生成这一轮的目标。

没有固定多角色剧本或模型循环次数配额；相同工具操作和结果形成重复停滞时明确结束，玩家也可以取消整轮。传输错误不自动重发收费请求。当前 Worker 的请求/上下文容量仍存在，超出时明确报错，不暗中裁切 native 工具历史。

## DeepSeek 与缓存

个人 API 使用标准 Chat Completions 原生工具请求；共享后端与其 mode 协议已移除。工具 schema 固定排序；固定系统规则与时代背景放前面；行动、目标字数、工具结果及新回复追加到后面；续步保留原始调用 ID 和 arguments 字串，不重写前缀。新循环关闭 thinking；偶发 provider reasoning 只在本轮内存续传，最终剧情及历史均不包含它。

读取官方 `usage.prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens` 累计显示真实命中量。缓存默认由供应商建立，命中属于 best effort，不因为代码采用稳定前缀就宣称必然高命中。切换故事/插件组合或未来历史裁选可能启动新前缀。

来源：[Pi agent loop](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)、[DeepSeek Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[DSH DeepSeek adapter](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-deepseek/README.md)、[DeepSeek 缓存规则](https://api-docs.deepseek.com/guides/kv_cache/)。本项目沿用现有 Chat Completions 通道，未宣称照搬 DSH 的 Anthropic Messages 实现。

## 验证

`node --test test-plugin-harness.cjs test-illustration-harness.cjs test-illustration-registry.cjs test-free-exploration-edges.cjs test-ai-connection-probe.cjs test-providers.cjs test-ai-provider-routing.cjs`

Node 测试使用真实 Worker 线程及模拟模型，包含插件抛错、同步死循环、取消、冲突、正文核算、追加补写、原生调用和网页引擎接线；没有模型费用。插画专项测试覆盖多位置、覆盖与清空、同批次交付后选图、坏句柄、URL拒绝、可选插件故障、取消后隔离，以及插画说明不能凑足 5000 字正文。CI/模拟不能代替真实多步模型、实际缓存和 5000 字交付验收。
