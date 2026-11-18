# 后金第一幕：每页静态镜头图

2026-11-18 按用户反馈，四页不再播放 GIF，而是每页一张静态镜头。范围只含 `qing_act1` 四个实际阅读页，其他幕不变。

| 页 | 剧情镜头 |
|---|---|
| 1 | 风雪急报、侍卫递交文书 |
| 2 | 多尔衮按刀主张南下 |
| 3 | 范文程叩首劝谏 |
| 4 | 三条道路的权衡 |

素材：`data/illustrations/qing/static/qing_act1-page-{1..4}-shot-v1.webp`。

主图采用 836×470 无损 WebP，与此前对应 GIF 首帧 PNG 的 RGB 像素逐一一致。此处“无损”仅指相对已有首帧，原 GIF 色板/抖色产生的损失无法恢复。低分辨率 `-preview.webp` 是 418×235 有损小预览，只在加载或失败时显示，成功后替换为完整无损主图。每页完整请求约 211–248 KB；四页合计 915196 bytes，相对旧四组 GIF+PNG 少 94.39%，并非画质凭空提升。

保持原文精确匹配、回翻/读档稳定、用户背景覆盖优先、当前页才下载。即使启用减少动态，也显示完整静态主图。AI 改写未命中仍沿用幕级原图；本次不扩展到所有幕。加载失败角落提示并可手动重试，不静默失败、不自动翻页。旧素材保留用于回退，但四页正常阅读不请求 GIF。

验证：`npm run test:unit`、`npm test`、`npm run test:content`、`npm run build`，及 `node test-first-act-pages-browser.mjs` / `test-scene-media-browser.mjs` / `test-scene-media-status-browser.mjs`。真实浏览器测试含四页前进/返回/恢复、无 GIF 请求、延迟回调、404/重试。手机尺寸测试不是实际 iPhone Safari。

已知素材局限保留：演员跨页造型不完全一致，手机第四页右侧文臣部分裁切。
