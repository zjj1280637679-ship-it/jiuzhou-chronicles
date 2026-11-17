// Small reversible GIF trial: opening scene and two second-act branches; NPC-inclusive v2 artwork with localized firelight animation.
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
    // Shared by desktop and mobile; original NPC GIF and WebP stay available for rollback.
    const version = nodeId === 'qing_act1' ? 'photoreal-v1' : 'npc-v2';
    return `data/illustrations/qing/animated/${asset.id}-${version}.gif`;
  }
  return {scenes, pathFor};
});
