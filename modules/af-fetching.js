(() => {
  "use strict";

  const AstraFetch = globalThis.AstraFetch;
  const { STATE, refs } = AstraFetch;
  const { addEntry, updateStatus, updateSample, log, toast, normalizeUrl } = AstraFetch;

  function hookNetwork() {
    const _fetch = window.fetch?.bind(window);
    if (!_fetch) return;
    const wrappedFetch = (...args) => {
      const url = String(args[0]);
      const method = (args[1]?.method || "GET").toUpperCase();
      const entry = addEntry(url, "fetch", method, "fetch");
      const start = performance.now();
      return _fetch(...args)
        .then(res => {
          const duration = performance.now() - start;
          updateStatus(url, `${res.status}`);
          updateSample(entry, duration, 0, res.status);
          return res;
        })
        .catch(error => {
          const duration = performance.now() - start;
          updateStatus(url, "ERR");
          updateSample(entry, duration, 0, "ERR");
          log("error", "fetch error", error?.message || error);
          throw error;
        });
    };
    try {
      window.fetch = wrappedFetch;
    } catch (error) {
      try {
        Object.defineProperty(window, "fetch", {
          configurable: true,
          writable: true,
          value: wrappedFetch
        });
      } catch (defineError) {
        log("warn", "fetch hook skipped (read-only)", defineError?.message || defineError);
      }
    }

    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (_method, url) {
      this._afMeta = {
        url: String(url),
        method: String(_method || "GET").toUpperCase(),
        start: 0
      };
      addEntry(String(url), "xhr", this._afMeta.method, "xmlhttprequest");
      return _open.apply(this, arguments);
    };

    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this._afMeta) this._afMeta.start = performance.now();
      this.addEventListener("loadend", () => {
        if (!this._afMeta) return;
        const duration = performance.now() - this._afMeta.start;
        updateStatus(this._afMeta.url, `${this.status || "ERR"}`);
        updateSample(
          STATE.entries.get(normalizeUrl(this._afMeta.url)),
          duration,
          0,
          this.status || "ERR"
        );
      });
      return _send.apply(this, arguments);
    };
  }

  function setupPerformanceObserver() {
    if (!("PerformanceObserver" in window)) return;
    if (refs.performanceObserver) return;
    refs.performanceObserver = new PerformanceObserver(list => {
      if (!STATE.ui.ready || !STATE.visible) return;
      list.getEntries().forEach(entry => {
        if (entry.entryType !== "resource") return;
        const url = normalizeUrl(entry.name);
        const tracked = addEntry(url, entry.initiatorType || "resource", "GET", entry.initiatorType);
        if (!tracked) return;
        const size = entry.transferSize || entry.encodedBodySize || 0;
        if (!size) {
          tracked.status = tracked.status === "pending" ? "unknown" : tracked.status;
        }
        updateSample(tracked, entry.duration || 0, size, tracked.status);
        if (url.includes(".key")) {
          markEncryptedByOrigin(url);
        }
      });
    });
    refs.performanceObserver.observe({ entryTypes: ["resource"] });
  }

  function markEncryptedByOrigin(keyUrl) {
    const origin = new URL(keyUrl).origin;
    let flagged = false;
    STATE.entries.forEach(entry => {
      if (entry.tag === "hls" && entry.url.startsWith(origin)) {
        entry.encrypted = true;
        entry.status = "encrypted";
        flagged = true;
      }
    });
    if (flagged && !STATE.encryptedDetected) {
      STATE.encryptedDetected = true;
      toast("Encrypted HLS detected. Switching to analysis-only mode.");
      log("warn", "Encrypted HLS detected", origin);
    }
  }

  Object.assign(AstraFetch, {
    hookNetwork,
    setupPerformanceObserver
  });
})();
