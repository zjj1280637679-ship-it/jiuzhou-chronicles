// Small reversible GIF trial: opening scene and two second-act branches; only local flame phases animate.
// The canonical illustration catalog, source WebPs and save-file handles stay unchanged.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JiuzhouSceneAnimation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const scenes = Object.freeze({
    qing_act1: 'qing_bg_chongzheng_snow_council',
    qing_act2_iron: 'qing_bg_yipianshi_blizzard_front',
    qing_act2_steppe: 'qing_bg_guihua_golden_tent'
  });
  function pathFor({faction, nodeId, asset, override, reducedMotion} = {}) {
    if (reducedMotion || override || faction !== 'qing' || !asset || scenes[nodeId] !== asset.id) return null;
    return `data/illustrations/qing/animated/${asset.id}.gif`;
  }
  return {scenes, pathFor};
});
