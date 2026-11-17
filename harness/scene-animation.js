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
  function pathFor({faction, nodeId, asset, override, reducedMotion} = {}) {
    if (reducedMotion || override || faction !== 'qing' || !asset || scenes[nodeId] !== asset.id) return null;
    // Shared by desktop and mobile; original NPC GIF and WebP stay available for rollback.
    const version = 'action-v1';
    return `data/illustrations/qing/animated/${asset.id}-${version}.gif`;
  }
  // The PNG is decoded from this exact final GIF, not the old scene illustration.
  // Reduced-motion users also see this first frame, without downloading the GIF.
  function posterFor(input = {}) {
    const path = pathFor({...input, reducedMotion:false});
    return path ? path.replace(/\.gif$/, '-first-frame.png') : null;
  }
  return {scenes, pathFor, posterFor};
});
