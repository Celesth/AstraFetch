(() => {
  "use strict";

  const AstraFetch = globalThis.AstraFetch;
  const { CONFIG, STATE, refs } = AstraFetch;
  const {
    getTitle,
    scheduleRender,
    toast,
    log,
    isOurError,
    createHUD,
    createConsole,
    showHUD,
    hideHUD,
    setupMediaObserver,
    setupPerformanceObserver,
    hookNetwork
  } = AstraFetch;

  function setupMutationObserver() {
    if (refs.mutationObserver) return;
    let scheduled = false;
    refs.mutationObserver = new MutationObserver(mutations => {
      if (!STATE.ui.ready) return;
      const hasAdditions = mutations.some(mutation => mutation.addedNodes && mutation.addedNodes.length);
      if (!hasAdditions) return;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (refs.hud && !document.body.contains(refs.hud)) {
          document.body.appendChild(refs.hud);
        }
        if (refs.consolePanel && !document.body.contains(refs.consolePanel)) {
          document.body.appendChild(refs.consolePanel);
        }
      });
    });
    refs.mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function teardownObservers() {
    refs.mutationObserver?.disconnect();
    refs.mediaObserver?.disconnect();
    refs.performanceObserver?.disconnect();
    refs.mutationObserver = null;
    refs.mediaObserver = null;
    refs.performanceObserver = null;
  }

  function resetState() {
    STATE.entries.clear();
    STATE.groupState.clear();
    STATE.media.elements.clear();
    STATE.media.handlers = new WeakMap();
    STATE.lastHlsUrl = null;
    STATE.encryptedDetected = false;
    STATE.cache.seenUrls.clear();
    scheduleRender();
  }

  function initUi() {
    if (!refs.hud) createHUD();
    if (!refs.consolePanel) createConsole();
    STATE.ui.ready = true;
    showHUD();
  }

  function initObserversAndHooks() {
    setupPerformanceObserver?.();
    setupMutationObserver();
    setupMediaObserver?.();
    hookNetwork?.();
  }

  function handleNavigationChange() {
    teardownObservers();
    resetState();
    initObserversAndHooks();
  }

  STATE.title = getTitle();
  initUi();
  initObserversAndHooks();
  toast("AstraFetch active (analysis-safe)");

  document.addEventListener("keydown", event => {
    if (event.key !== CONFIG.triggerKey) return;
    CONFIG.toggleMode ? (STATE.visible ? hideHUD() : showHUD()) : showHUD();
  });

  document.addEventListener("keyup", event => {
    if (!CONFIG.toggleMode && event.key === CONFIG.triggerKey) {
      hideHUD();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && refs.pingTimer) clearInterval(refs.pingTimer);
    if (!document.hidden && STATE.visible) AstraFetch.startPing?.();
    if (document.hidden) {
      refs.mediaObserver?.disconnect();
      refs.performanceObserver?.disconnect();
      refs.performanceObserver = null;
    } else {
      refs.mediaObserver = null;
      setupMediaObserver?.();
      setupPerformanceObserver?.();
    }
  });

  window.addEventListener("popstate", handleNavigationChange);

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    handleNavigationChange();
  };

  window.addEventListener("error", event => {
    if (!event?.error) return;
    if (!isOurError(event.error)) return;
    log("error", "Script error", event.error.message || event.error);
  });

  window.addEventListener("unhandledrejection", event => {
    if (!isOurError(event.reason)) return;
    log("error", "Unhandled rejection", event.reason?.message || event.reason);
  });

  AstraFetch.startPing?.();
})();
