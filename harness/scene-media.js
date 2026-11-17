// Current scene only; explicit user retries never prefetch another scene.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JiuzhouSceneMedia = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create({createImage, onChange, onStatus = () => {}, slowAfterMs = 15000,
    setTimer = setTimeout, clearTimer = clearTimeout}) {
    let key, probe, timer, displayed = null, generation = 0, pair = [], attempt = 0;
    let retryNonce = 0, retryToken = '';
    let status = {phase: 'idle', retrying: false, canRetry: false};
    const failed = new Set();
    function report(phase, canRetry = false) {
      status = {phase, retrying: attempt > 0, canRetry};
      onStatus({...status});
    }
    function stopProbe() {
      clearTimer(timer); timer = null;
      if (probe) {probe.onload = probe.onerror = null; probe.removeAttribute('src'); probe = null;}
    }
    function display(path) {displayed = path || null; onChange(displayed);}
    function load(path, fallback, version, isFallback = false) {
      display(path);
      if (!createImage) {report('idle'); return;}
      report(isFallback ? 'fallback-loading' : 'loading');
      const image = probe = createImage();
      // A slow timer is information, not a timeout or an automatic retry.
      timer = setTimer(() => {
        if (version === generation && probe === image) report(isFallback ? 'fallback-slow' : 'slow', true);
      }, slowAfterMs);
      timer?.unref?.();
      image.onerror = () => {
        if (version !== generation || probe !== image) return;
        stopProbe();
        if (!isFallback && fallback) {
          failed.add(pair[0]);
          load(fallback, null, version, true);
        } else report('error', true);
      };
      image.onload = () => {
        if (version !== generation || probe !== image) return;
        clearTimer(timer); timer = null;
        image.onload = image.onerror = null; probe = null;
        if (!isFallback) failed.delete(pair[0]);
        report(isFallback ? 'fallback' : 'ready', isFallback);
      };
      image.src = path;
    }
    function start() {
      stopProbe(); const version = ++generation;
      const [primary, fallback] = pair;
      if (!primary || !fallback || primary === fallback) {display(primary); report('idle'); return;}
      if (failed.has(primary)) load(fallback, null, version, true);
      else {
        // Cache bust ONLY explicit user retries, never each text refresh.
        const path = attempt ? `${primary}${primary.includes('?') ? '&' : '?'}scene_retry=${retryToken}` : primary;
        load(path, fallback, version);
      }
    }
    return {
      select(primary, fallback = null) {
        const nextKey = JSON.stringify([primary, fallback]);
        if (key === nextKey) {onChange(displayed); return;}
        key = nextKey; pair = [primary, fallback]; attempt = 0; start();
      },
      retry() {
        if (!status.canRetry || !pair[1]) return false;
        failed.delete(pair[0]); attempt++; retryToken = `${Date.now().toString(36)}-${++retryNonce}`; start(); return true;
      },
      getStatus() {return {...status};}
    };
  }
  return {create};
});
