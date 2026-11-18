// Ten approved 3-second limited-frame story-action GIFs; identical paths on desktop/mobile.
// The canonical illustration catalog, source WebPs and save-file handles stay unchanged.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JiuzhouSceneAnimation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const scenes = Object.freeze({
  "qing_act1": "qing_bg_chongzheng_snow_council",
  "qing_act2_iron": "qing_bg_yipianshi_blizzard_front",
  "qing_act3_iron_cannon": "qing_bg_shanhaiguan_cannon_slope",
  "qing_act3_iron_slaughter": "qing_bg_yangzhou_meihualing_ruins",
  "qing_act2_civil": "qing_bg_neisanyuan_office",
  "qing_act3_civil_exam": "qing_bg_confucius_dawn_court",
  "qing_act3_civil_mourn": "qing_bg_tongzhou_mourning_camp",
  "qing_act2_steppe": "qing_bg_guihua_golden_tent",
  "qing_act3_steppe_charge": "qing_bg_lengkou_breached_pass",
  "qing_act3_steppe_lama": "qing_bg_rehe_autumn_altar"
});
  // A page is the actual displayed beat, not the node or its numeric position.
  // Exact content matching survives back/restore while refusing unrelated AI prose.
  const firstActPages = Object.freeze([
  {
    "text": "塞外冰封千里，崇政殿外两黄旗与两白旗侍卫甲胄森冷如铁。崇祯殉节密报与李闯入京急报横陈案头。",
    "path": "data/illustrations/qing/static/qing_act1-page-1-shot-v1.webp"
  },
  {
    "text": "“明帝既死，天赐良机！发八旗重兵南下劫掠人口金帛，回师关外坐山观虎斗！”",
    "path": "data/illustrations/qing/static/qing_act1-page-2-shot-v1.webp"
  },
  {
    "text": "“王爷差矣！昔日抢掠乃部落所为，今日中原无主，正当代天申讨，以仁义收抚海内人心！”",
    "path": "data/illustrations/qing/static/qing_act1-page-3-shot-v1.webp"
  },
  {
    "text": "“是行部落掠夺之实、效汉化定鼎之治，抑或联合漠南蒙古，三条大道在此分晓。”",
    "path": "data/illustrations/qing/static/qing_act1-page-4-shot-v1.webp"
  }
]);
  function pathFor({faction, nodeId, asset, override, reducedMotion, pageText} = {}) {
    if (override || faction !== 'qing' || !asset || scenes[nodeId] !== asset.id) return null;
    // Shared by desktop and mobile; original NPC GIF and WebP stay available for rollback.
    const page = nodeId === 'qing_act1' && firstActPages.find(p => p.text === pageText);
    if (page) return page.path; // Static full-quality shots also serve reduced-motion users.
    if (reducedMotion) return null;
    const version = 'action-v1';
    return `data/illustrations/qing/animated/${asset.id}-${version}.gif`;
  }
  // The PNG is decoded from this exact final GIF, not the old scene illustration.
  // Reduced-motion users also see this first frame, without downloading the GIF.
  function posterFor(input = {}) {
    const path = pathFor({...input, reducedMotion:false});
    return path ? (path.endsWith('.webp') ? path.replace(/\.webp$/, '-preview.webp') : path.replace(/\.gif$/, '-first-frame.png')) : null;
  }
  return {scenes, firstActPages, pathFor, posterFor};
});
