// Small scene-corner status, independent of dialogue/page navigation.
(() => {
  const box = document.getElementById('scene-media-status');
  const label = document.getElementById('scene-media-status-text');
  const retry = document.getElementById('scene-media-retry');
  if (!box || !label || !retry) return;
  let dismiss, revision = 0;
  function render() {
    clearTimeout(dismiss);
    const version = ++revision;
    const state = window.__vnEngine?.currentSceneMediaStatus || {phase: 'idle'};
    const messages = {
      loading: state.retrying ? '正在重试动图，保留首帧…' : '动图加载中，先看首帧…',
      'loading-poster': state.retrying ? '正在重试首帧和动图…' : '首帧与动图加载中…',
      'loading-no-poster': '首帧未能加载，动图仍在加载…',
      slow: '动图加载较慢，保留首帧预览',
      'slow-poster': '首帧和动图加载较慢，可继续阅读',
      'slow-no-poster': '首帧未能加载，动图加载较慢',
      'fallback-loading': '动图未能加载，正在载入首帧…',
      'fallback-slow': '动图未能加载，首帧加载较慢',
      fallback: '动图未能加载，保留首帧预览',
      error: '场景图片未能加载，可继续阅读',
      ready: state.retrying ? '动图已恢复' : ''
    };
    const message = messages[state.phase] || '';
    box.hidden = !message;
    box.dataset.phase = state.phase;
    if (label.textContent !== message) label.textContent = message;
    // Keep the same focusable button while retrying; double taps/held Enter
    // must not fall through to the story when the button disappears.
    retry.hidden = !state.canRetry && !state.retrying;
    retry.setAttribute('aria-disabled', String(!state.canRetry));
    retry.textContent = state.canRetry ? '重试动图' : state.phase === 'ready' ? '已恢复' : '重试中…';
    if (state.phase === 'ready' && state.retrying) {
      const hide = () => {if (version === revision) box.hidden = true;};
      dismiss = setTimeout(() => {
        if (box.contains(document.activeElement)) retry.addEventListener('blur', hide, {once:true});
        else hide();
      }, 3000);
    }
  }
  // Do not let pointer/keyboard events become a story-advance command.
  for (const name of ['pointerdown', 'click', 'keydown', 'keyup']) box.addEventListener(name, e => e.stopPropagation());
  retry.addEventListener('click', () => window.__vnEngine?.sceneMediaLoader?.retry());
  window.addEventListener('jiuzhou:scene-media-status', render);
  render();
})();
