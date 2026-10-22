# 场景插画与 AI 工具

此目录接入后金形象修订版 16 张、暗黑场景扩展 16 张，游戏使用原尺寸 WebP。旧 24 个图柄及旧图片保留；其中旧后金 6 图标记 `legacy: true`，默认查询隐藏，准确 ID 仍可解析。其余三阵营各 6 图继续可用。

## 唯一清单与文件

- `data/illustrations/catalog.json`：可编辑的唯一正式清单，含 `assets`、`aliases`、`scenes`。
- `data/illustrations/catalog-data.js`：由构建脚本生成，内容与 JSON 相同；网页和 Worker 不需要网络查询图库。
- `data/illustrations/qing/scenes/*.webp`：32 张实际图片。导入只复制，不裁切、缩放或拉伸。
- `illustration-system.js`：UMD 模块；网页 / Worker 全局 `JiuzhouIllustrations`，Node 为 `require("./illustration-system.js")`。
- `harness/plugins/illustrations.js`：独立 AI 插画工具插件。工具执行和查图不会立即打开弹窗或修改存档。

`faction` 表示画面的人物服饰、地域或设定来源，不表示玩家的权限。明方角色进入后金营地，可以查询后金营地图；工具不强制按玩家阵营隔离。画面中的囚犯身份、罪名、胜负和效忠不由图片 ID 推定。

## 新增一张图

1. 放入本地图片，例如 `data/illustrations/qing/scenes/qing_new_scene.webp`。
2. 在 `catalog.json.assets` 新增一条独立元数据：

```json
{
  "id": "qing_new_scene",
  "relativePath": "data/illustrations/qing/scenes/qing_new_scene.webp",
  "faction": "qing",
  "factionName": "后金女真",
  "category": "地点",
  "categoryName": "地点",
  "title": "新场景",
  "description": "画面里实际可见的内容，不替玩家决定结果。",
  "tags": ["检索词"],
  "useWhen": ["与画面相符的剧情处境"],
  "avoidWhen": ["容易混淆的其他地点或事件"],
  "legacy": false
}
```

3. 执行 `node scripts/build-illustration-catalog.cjs`。脚本核验全部 ID、文件、别名、场景引用并重新生成浏览器清单。已有 SHA-256 的资源会核验内容；有意修改该图时同步更新其 `webSha256` 和 `webBytes`，新图片可先不提供这两个可选字段。
4. 执行 `node test-illustration-registry.cjs` 和相关浏览器检查。测试中的当前包数量是发布验收数；增图时同步更新验收期望。

已有素材包可一次导入，当前适配器接收后金包中的 `web/<id>.webp`：

```powershell
node scripts/build-illustration-catalog.cjs --import-pack "绝对路径/pack.json"
```

它逐文件核验源包 SHA-256、复制到 `qing/scenes/`、核验复制后字节并更新同 ID 元数据，不依赖本机输出目录的固定位置。日常构建不读取源包、不需要原始 PNG。

不要为新语义重用已有 ID。旧图弃用时标记 `legacy: true`，仍保留资源以便旧存档和收藏继续显示。`aliases` 只能登记真正等价的明确更名，例如 `{ "old_equivalent_id": "new_id" }`；不按标题、词语或类别猜图。目前别名表为空，旧 `qing_war` 等仍指向其原图。

## 绑定静态剧情和地点

在 `catalog.json.scenes.nodes.<faction>` 写明确的节点 ID 与图 ID：

```json
{
  "nodes": {"qing": {"qing_act1": "qing_campaign_map"}},
  "locations": {"shanhaiguan:pass": "qing_frontier_pass"},
  "ids": {"a_new_scene": "qing_new_scene"}
}
```

`sceneFor({ faction, nodeId, coords, sceneId })` 优先 `scenes.ids[sceneId]`，然后准确节点，最后中性地点默认；无匹配返回 `null`。节点值可设 `null`，明确阻止地点默认图。没有分析正文或猜测囚犯罪名、屠杀、胜负的回退逻辑。

当前 364 个后金节点均作显式保守登记，多数使用中性的山川军图，只有少量正文中明确发生围城、骑军突击、营地夜袭或拘押问讯的节点使用对应事件图。它们是章节配图，不代表已经对全部地点、人物、年代或历史细节作严格复原；不根据节点标题单独断定眼前正在发生什么。

全部 81 个 `qing_act5_*` 节点的实际正文采用终局朝堂模板，即使标题写着攻城、献俘、籍没等词，也统一使用中性军图。静态剧情跨越入关后的年代，盛京秋庭、早期军帐不会被当作北京皇极殿或杭州行宫的实景；外交、考试、财政等节点也不自动配尸骸和囚犯图。黑暗事件图由自由剧情根据实际正文查询、选择，没有硬塞进主线。尚无相符静态剧情的扩展图也已全部注册，随时可由 AI 工具选用。

## 运行时接口

```js
const registry = JiuzhouIllustrations;
registry.list({ query: "囚室", category: "囚禁", faction: "qing" });
registry.resolve("qing_cell_whispers"); // 元数据副本或 null；不猜图
registry.normalizeSelection({ id: "qing_cell_whispers", afterBeat: 2, caption: "隔壁传来低语。" });
registry.compose(story.beats, [{ id: "qing_cell_whispers", afterBeat: 2 }]); // { beats, warnings }
registry.sceneFor({ faction: "qing", nodeId: "qing_act1", coords: "qing:mukden" });
```

`list()` 默认包含全部设定，按 ASCII ID 稳定排序；`includeLegacy: true` 可列弃用图。所有返回值均可克隆，修改调用方拿到的元数据不会改变注册表。模型给出的 URL、文件路径不会替换正式资源；渲染只使用清单中验证过的 `data/illustrations/` 路径。

独立 Worker 可用 `createRegistry({ assets, aliases, scenes })` 创建注册表。最小资产字段只有 `id` 与合法 `relativePath`，其他字段可缺省；无需 DOM 或浏览器默认图库。正常插件从本轮 `context.illustrations` 的可克隆资产数组构造自己的注册表。

## AI 选图

1. `list_illustrations({ query, category, faction })` 返回准确 ID 和图像语义，供模型挑选。筛选均可省略。
2. `set_scene_background({ id })` 暂存持续的舞台背景，只替换桌面背景层及手机上方场景画面，不弹窗、不插入正文段。`{ clear: true }` 恢复当前场景默认背景，不清除弹窗。背景 ID 独立保存在进度、备份和回溯节点中；切换地图、新章节或新篇会恢复相应静态背景。
3. `select_illustration({ id, afterBeat, caption })` 暂存图片互动弹窗。可以重复调用修订同一位置，`clear:true` 只清空本轮弹窗草稿。弹窗不改变舞台背景，背景也不会自动生成弹窗。
4. 成功交付时，背景操作由宿主附加为 `stage_effects` 的 `set_scene_background`，弹窗操作附加为 `show_illustration`。两者独立提交，取消或失败均不提交草稿。不支持顶层 `illustrations` 字段。使用 JSON 兼容通路时，可直接提交以下效果；准确旧 ID 仍然有效，所有通路都由同一个注册表解析。

```json
{
  "beats": [{ "type": "narrator", "text": "你在门外停步，屋内的问讯仍在继续。" }],
  "stage_effects": [{
    "name": "set_scene_background",
    "params": { "id": "qing_holding_cell" }
  }, {
    "name": "show_illustration",
    "params": { "id": "qing_lamplit_questioning", "afterBeat": 1, "caption": "灯下的问讯尚无结论。" }
  }]
}
```

`afterBeat` 是**分页前、整份最终草稿**的正文段索引，不是屏幕上每 90 字分页后的编号；叙述和人物对白都各算一段。省略默认 `1`，`0` 在正文前，`2` 在第二段正文后。要求非负整数；大于正文段数时明确排在结尾并返回告警。同一个 `afterBeat` 最后一次有效选图生效，错误 ID 不会覆盖之前有效选择。不同超尾位置均在结尾按请求位置排序，原请求位置相同才替换。

背景与弹窗共享图库，使用不同工具及独立状态。静态 `sceneFor` 绑定仅作为背景，不隐式插入弹窗段；背景解析不扫描弹窗或正文。切换地点后，旧章节节点的图片不会覆盖新地点背景。

到达显式插画阅读段时，图片以覆盖舞台的独立居中弹窗展示，正文框只显示普通说明文字，不再嵌入大图卡。关闭按钮、Escape 或遮罩可收起，关闭不会跳页；小“画卷”按钮可以重开。查看弹窗时暂停自动播放，长说明独立滚动，坏图可关闭后继续阅读。弹窗切换、关闭或前后翻页均不改变背景。

工具、图柄、说明、思考与 JSON 不属于正文。程序不统计或验收字数；模型/工具次数、耗时、Token 和缓存等运行日志不输出到游戏或设置界面。保留简单等待、取消、连接测试结果与可恢复错误。

`normalizeSelection` 成功返回 `{ ok: true, selection: { id, afterBeat, caption } }`，失败返回 `{ ok: false, error: { code, message } }`。未知 ID 为 `unknown_illustration`；错误位置为 `invalid_illustration_position`。`compose` 跳过无效图并记录告警，不因图柄错误丢弃正文，也不猜成另一张图。

## 验证

```powershell
node scripts/build-illustration-catalog.cjs
node test-illustration-registry.cjs
node test-illustration-harness.cjs
```

注册表测试覆盖真实资源完整性、全部 56 个兼容 ID、32 个新图柄、弃用隐藏、准确查找、跨设定查询、替换与插入位置、未知图错误、原正文不变、白名单字段、Node / 浏览器 / Worker 一致性及 364 个后金静态节点绑定。浏览器测试还需验证实际取图、阅读翻页、移动布局、手动放大与存档恢复；单元测试成功不代表线上已经发布。

旧的 `generate-faction-illustrations.js` 和 `.github/workflows/install-nanming-cinema.yml` 只维护旧 `illustrations-data.*`，不是正式新增图片接口，也不会自动同步当前图库。需要迁移这些流程产生的资源时，应同时更新 `catalog.json` 中准确 ID 的元数据和路径，再执行 `build-illustration-catalog.cjs`；仅修改旧清单不会改变新注册表使用的图片。
