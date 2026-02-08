(() => {
  "use strict";

  const AstraFetch = globalThis.AstraFetch;
  const { CONFIG, STATE, refs } = AstraFetch;

  function updatePing() {
    const el = document.getElementById("af-ping");
    if (!el) return;
    const start = performance.now();
    fetch(location.origin, { method: "HEAD", cache: "no-store" })
      .then(() => {
        const ms = Math.round(performance.now() - start);
        el.textContent = `ping ${ms}ms`;
      })
      .catch(() => {
        el.textContent = "ping blocked";
      });
  }

  function startPing() {
    updatePing();
    refs.pingTimer = setInterval(updatePing, CONFIG.pingInterval);
  }

  Object.assign(AstraFetch, {
    startPing
  });
})();
