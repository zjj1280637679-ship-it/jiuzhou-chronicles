// Current scene only: its real first frame stays visible until its GIF loads.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JiuzhouSceneMedia = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create({createImage, onChange, onStatus = () => {}, slowAfterMs = 15000,
    setTimer = setTimeout, clearTimer = clearTimeout}) {
    let key, timer, displayed = null, generation = 0, pair = [], attempt = 0;
    let retryNonce = 0, retryToken = '', probes = {}, state;
    let status = {phase:'idle', retrying:false, canRetry:false};
    const failed = new Set();
    function report(phase, canRetry = false) {
      const next = {phase, retrying:attempt > 0, canRetry};
      if (JSON.stringify(next) !== JSON.stringify(status)) {status = next; onStatus({...status});}
    }
    function stop() {
      clearTimer(timer); timer = null;
      for (const image of Object.values(probes)) {
        image.onload = image.onerror = null;
        image.removeAttribute('src');
      }
      probes = {};
    }
    function display(path) {displayed = path || null; onChange(displayed);}
    function update() {
      const {gif, poster, slow} = state;
      if (gif === 'ready') {clearTimer(timer); report('ready'); return;}
      if (gif === 'error') {
        if (poster !== 'pending') clearTimer(timer);
        report(poster === 'ready' ? 'fallback' : poster === 'error' ? 'error' : slow ? 'fallback-slow' : 'fallback-loading', poster !== 'pending' || slow);
      } else {
        const phase = slow ? 'slow' : 'loading';
        report(poster === 'ready' ? phase : poster === 'error' ? `${phase}-no-poster` : `${phase}-poster`, slow || poster === 'error');
      }
    }
    function watch(kind, path, version) {
      const image = probes[kind] = createImage();
      image.fetchPriority = kind === 'poster' ? 'high' : 'low';
      function finish(ok) {
        if (version !== generation || probes[kind] !== image) return;
        image.onload = image.onerror = null; delete probes[kind];
        state[kind] = ok ? 'ready' : 'error';
        if (kind === 'gif') {
          if (ok) {failed.delete(pair[0]); display(path);}
          else failed.add(pair[0]); // Keep the currently displayed first frame.
        }
        update();
      }
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = path;
    }
    function start(retry = false) {
      // An already visible first frame remains in place during a user retry.
      const keepPoster = retry && state?.poster === 'ready';
      const previousPoster = state?.posterPath;
      stop(); const version = ++generation;
      const [primary, poster] = pair;
      if (!primary || !poster || primary === poster) {state = null; display(primary); report('idle'); return;}
      const bust = path => attempt ? `${path}${path.includes('?') ? '&' : '?'}scene_retry=${retryToken}` : path;
      const posterPath = keepPoster ? previousPoster : bust(poster);
      state = {gif:failed.has(primary) ? 'error' : 'pending', poster:keepPoster ? 'ready' : 'pending', posterPath, slow:false};
      display(posterPath);
      if (!createImage) {report('idle'); return;}
      update();
      // Informational only: never cancels, renews or retries downloads by itself.
      timer = setTimer(() => {if (version === generation) {state.slow = true; update();}}, slowAfterMs);
      timer?.unref?.();
      if (!keepPoster) watch('poster', posterPath, version);
      if (state.gif === 'pending') watch('gif', bust(primary), version);
    }
    return {
      select(primary, poster = null) {
        const nextKey = JSON.stringify([primary, poster]);
        if (key === nextKey) {onChange(displayed); return;}
        key = nextKey; pair = [primary, poster]; attempt = 0; start();
      },
      retry() {
        if (!status.canRetry || !pair[1]) return false;
        failed.delete(pair[0]); attempt++; retryToken = `${Date.now().toString(36)}-${++retryNonce}`; start(true); return true;
      },
      getStatus() {return {...status};}
    };
  }
  return {create};
});
