// Current scene only. No branch traversal or speculative image downloads.
// A fallback is a replacement on failure, never a second CSS background layer.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JiuzhouSceneMedia = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create({createImage, onChange}) {
    let key, probe, displayed = null, generation = 0;
    const failed = new Set();
    return {
      select(primary, fallback = null) {
        const nextKey = JSON.stringify([primary, fallback]);
        if (key === nextKey) {onChange(displayed); return;} // Restore display without re-requesting.
        key = nextKey;
        const version = ++generation;
        if (probe) {
          probe.onload = probe.onerror = null;
          probe.removeAttribute('src');
          probe = null;
        }
        const selected = failed.has(primary) ? fallback : primary;
        displayed = selected || null;
        onChange(displayed);
        if (!selected || selected !== primary || !fallback || primary === fallback || !createImage) return;
        // This shares the current resource URL with its display, not another asset.
        // The static fallback is requested only if the GIF actually fails.
        const image = probe = createImage();
        image.onerror = () => {
          if (version !== generation) return; // Ignore stale errors after navigation.
          failed.add(primary);
          image.onload = image.onerror = null;
          probe = null;
          displayed = fallback;
          onChange(displayed);
        };
        image.onload = () => {
          if (version !== generation) return;
          image.onload = image.onerror = null;
          probe = null;
        };
        image.src = primary;
      }
    };
  }
  return {create};
});
