// ==UserScript==
// @name         AstraFetch (Stream Analyzer)
// @namespace    https://github.com/Celesth/AstraFetch
// @icon         https://files.catbox.moe/cd88m5.png
// @version      0.6.4
// @description  AstraFetch Hyprland-style media HUD (analysis-safe)
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  "use strict";

  /* -------------------------------------------------------------------------- */
  /*                                Configuration                               */
  /* -------------------------------------------------------------------------- */

  const CONFIG = {
    triggerKey: "/",
    toggleMode: true,
    guiPosition: "bottom-right", // top-left | top-right | bottom-left | bottom-right
    width: 520,
    height: 320,
    maxEntries: 250,
    maxSamples: 8,
    slowThreshold: 800,
    pingInterval: 1500,
    overlayOutlineColor: "rgba(56, 189, 248, 0.6)",
    toastDuration: 2200,
    includeCookies: false,
    discordWebhook: "", // optional webhook URL
    discordRateLimitMs: 15000
  };

  /* -------------------------------------------------------------------------- */
  /*                                   State                                    */
  /* -------------------------------------------------------------------------- */

  const STATE = {
    title: null,
    visible: false,
    ui: {
      ready: false
    },
    entries: new Map(),
    needsRender: false,
    encryptedDetected: false,
    cache: {
      seenUrls: new Map(),
      streamFingerprints: new Map(),
      commandCache: new Map(),
      probeCache: new Map()
    },
    media: {
      elements: new Set(),
      overlay: null,
      activeElement: null,
      handlers: new WeakMap(),
      lastInfo: null,
      urlMap: new Map(),
      highlightTimers: new WeakMap()
    },
    lastHlsUrl: null,
    discordLastSent: 0,
    hooksInstalled: false
  };

  let hud;
  let pullBar;
  let pingTimer;
  let mutationObserver;
  let mediaObserver;
  let performanceObserver;

  /* -------------------------------------------------------------------------- */
  /*                                    Styles                                  */
  /* -------------------------------------------------------------------------- */

  GM_addStyle(`
    #af-hud {
      position: fixed;
      ${positionStyle()}
      z-index: 2147483647;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      color: #e5e7eb;
    }

    #af-hud .panel {
      width: ${CONFIG.width}px;
      background: rgba(12, 12, 14, 0.92);
      border: 1px solid #1e1e22;
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
    }

    #af-hud .panel {
      height: ${CONFIG.height}px;
    }

    #af-hud .topbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    #af-hud .top-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #af-hud .ping {
      font-size: 0.65rem;
      color: #9ca3af;
      padding: 2px 6px;
      border-radius: 6px;
      border: 1px solid #1e1e22;
      background: rgba(12, 12, 14, 0.6);
    }

    #af-hud .subtitle {
      font-size: 0.7rem;
      color: #9ca3af;
      margin-top: 2px;
    }

    #af-hud .divider {
      height: 1px;
      background: #1e1e22;
    }

    #af-hud .rows {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-right: 4px;
    }

    #af-hud .row {
      border: 1px solid #1f1f26;
      border-radius: 10px;
      padding: 10px;
      background: rgba(16, 16, 18, 0.75);
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    }

    #af-hud .row.success { border-color: rgba(34, 197, 94, 0.5); }
    #af-hud .row.slow { border-color: rgba(251, 191, 36, 0.6); }
    #af-hud .row.error { border-color: rgba(248, 113, 113, 0.65); }
    #af-hud .row.blocked { border-color: rgba(148, 163, 184, 0.6); }
    #af-hud .row.streaming { border-color: rgba(56, 189, 248, 0.6); }
    #af-hud .row.encrypted { border-color: rgba(248, 113, 113, 0.8); box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.35); }
    #af-hud .row.pending { border-color: rgba(100, 116, 139, 0.5); }

    #af-hud .row-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      font-size: 0.72rem;
    }

    #af-hud .url {
      color: #e5e7eb;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    #af-hud .status {
      font-size: 0.65rem;
      color: #9ca3af;
    }

    #af-hud .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    #af-hud .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      font-size: 0.65rem;
      color: #9ca3af;
    }

    #af-hud .samples {
      margin-left: 8px;
      display: grid;
      gap: 4px;
      font-size: 0.62rem;
      color: #cbd5f5;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.2s ease;
    }

    #af-hud .samples.open {
      max-height: 220px;
    }

    #af-hud .chart {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 24px;
      margin-top: 4px;
    }

    #af-hud .chart span {
      flex: 1;
      background: rgba(59, 130, 246, 0.5);
      border-radius: 3px;
      transition: height 0.2s ease;
    }

    #af-hud button {
      border: 1px solid #1e1e22;
      background: #141414;
      color: #e5e7eb;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 0.65rem;
      cursor: pointer;
    }

    #af-hud button:hover {
      background: #1f1f1f;
    }

    #af-toast {
      position: fixed;
      top: 14px;
      right: 14px;
      background: #0f0f0f;
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-family: system-ui;
      font-size: 13px;
      z-index: 100000;
      opacity: 0;
      transform: translateY(-6px);
      transition: 0.2s;
    }

    #af-toast.show { opacity: 1; transform: translateY(0); }

    #af-media-overlay {
      position: fixed;
      z-index: 2147483646;
      background: rgba(12, 12, 14, 0.88);
      border: 1px solid #1e1e22;
      border-radius: 12px;
      padding: 10px 12px;
      color: #e5e7eb;
      font-size: 0.7rem;
      display: none;
      pointer-events: auto;
      backdrop-filter: blur(8px);
      min-width: 220px;
    }

    #af-media-overlay .overlay-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    #af-media-overlay .overlay-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    #af-media-overlay .overlay-actions button {
      font-size: 0.62rem;
    }

    #af-pull-bar {
      position: fixed;
      ${pullBarPositionStyle()}
      z-index: 2147483647;
      width: 36px;
      height: 72px;
      background: rgba(12, 12, 14, 0.92);
      border: 1px solid #1e1e22;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      font-size: 0.8rem;
      cursor: pointer;
    }
  `);

  function positionStyle() {
    const p = CONFIG.guiPosition;
    return `
      ${p.includes("top") ? "top:24px;" : "bottom:24px;"}
      ${p.includes("left") ? "left:24px;" : "right:24px;"}
    `;
  }

  function pullBarPositionStyle() {
    const p = CONFIG.guiPosition;
    const side = p.includes("left") ? "left:0;" : "right:0;";
    const vertical = p.includes("top") ? "top:24px;" : "bottom:24px;";
    const radius = p.includes("left")
      ? "border-radius: 0 12px 12px 0;"
      : "border-radius: 12px 0 0 12px;";
    return `
      ${side}
      ${vertical}
      ${radius}
    `;
  }

  /* -------------------------------------------------------------------------- */
  /*                                   Logging                                  */
  /* -------------------------------------------------------------------------- */

  function log(level, message, data = null) {
    if (level === "error") {
      console.error("[AstraFetch]", message, data || "");
      return;
    }
    console.warn("[AstraFetch]", message, data || "");
  }

  function isOurError(error) {
    if (!error) return false;
    const stack = String(error.stack || "");
    return stack.includes("AstraFetch") || stack.includes("AstraFetch.user.js");
  }

  /* -------------------------------------------------------------------------- */
  /*                                     Utils                                  */
  /* -------------------------------------------------------------------------- */

  function toast(text, duration = CONFIG.toastDuration) {
    let el = document.getElementById("af-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "af-toast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), duration);
  }

  function getTitle() {
    return (
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title ||
      location.hostname
    )
      .replace(/[\\/:*?"<>|]/g, "")
      .trim();
  }

  function normalizeUrl(raw) {
    try {
      return new URL(raw, location.href).href;
    } catch {
      return raw;
    }
  }

  function detectMediaType(url) {
    const lower = url.toLowerCase();
    if (lower.startsWith("blob:")) return "blob";
    if (lower.includes(".m3u8")) return "hls";
    if (lower.match(/\.(mp4|webm|mkv|mp3|ogg|wav)(\?|$)/)) return "media";
    return null;
  }

  function scheduleRender() {
    if (STATE.needsRender) return;
    STATE.needsRender = true;
    requestAnimationFrame(() => {
      if (STATE.visible && STATE.ui.ready) renderRows();
      STATE.needsRender = false;
    });
  }

  function safeClipboard(text) {
    GM_setClipboard(text);
  }

  /* -------------------------------------------------------------------------- */
  /*                              Entry Management                              */
  /* -------------------------------------------------------------------------- */

  // Store request metadata without reading response bodies (CORS-safe).
  function addEntry(url, source = "network", method = "GET", initiator = "") {
    const clean = normalizeUrl(url);
    if (!clean) return null;
    const mediaType = detectMediaType(clean);
    if (!mediaType) return null;

    const isNew = !STATE.entries.has(clean);
    if (isNew) {
      const created = {
        url: clean,
        mediaType,
        isHls: mediaType === "hls",
        isBlob: mediaType === "blob",
        source,
        method,
        status: "pending",
        finalized: false,
        addedAt: Date.now(),
        count: 0,
        seenCount: 1,
        failures: 0,
        totalDuration: 0,
        lastDuration: 0,
        totalTransfer: 0,
        bitrate: null,
        samples: [],
        open: false,
        warned: false,
        encrypted: false,
        hls: {
          analyzed: false,
          variants: [],
          segments: [],
          error: null,
          audioOnly: false,
          live: false,
          encryption: ""
        },
        probes: []
      };
      STATE.entries.set(clean, created);
      if (STATE.entries.size > CONFIG.maxEntries) {
        const oldest = STATE.entries.keys().next().value;
        STATE.entries.delete(oldest);
      }

      if (!STATE.cache.seenUrls.has(clean)) {
        STATE.cache.seenUrls.set(clean, Date.now());
        toast("Detected media");
      }

      if (mediaType === "hls") {
        STATE.lastHlsUrl = clean;
        if (!created.warned) {
          created.warned = true;
          toast("M3U8 detected. Encrypted streams require external tools.");
        }
      }

      maybeSendWebhook(created);
      scheduleRender();
    }

    const existing = STATE.entries.get(clean);
    if (existing && !isNew) {
      existing.seenCount += 1;
      scheduleRender();
    }
    return existing;
  }

  function updateStatus(url, status) {
    const entry = STATE.entries.get(normalizeUrl(url));
    if (!entry) return;
    entry.status = status;
    entry.finalized = status !== "pending" && status !== "analyzing";
    scheduleRender();
  }

  function updateSample(entry, duration, transfer, status) {
    if (!entry) return;
    entry.count += 1;
    entry.totalDuration += duration;
    entry.totalTransfer += transfer;
    entry.lastDuration = duration;
    entry.status = status || entry.status;
    if (String(status).startsWith("4") || String(status).startsWith("5") || status === "ERR") {
      entry.failures += 1;
    }
    if (transfer && duration) {
      entry.bitrate = ((transfer * 8) / (duration / 1000)) / 1e6;
    }
    entry.samples.unshift({
      duration,
      transfer,
      status
    });
    if (entry.samples.length > CONFIG.maxSamples) entry.samples.pop();
    scheduleRender();
  }

  /* -------------------------------------------------------------------------- */
  /*                              Network Observation                            */
  /* -------------------------------------------------------------------------- */

  function hookNetwork() {
    if (STATE.hooksInstalled) return;
    STATE.hooksInstalled = true;
    const _fetch = window.fetch.bind(window);
    window.fetch = (...args) => {
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
    if (performanceObserver) return;
    performanceObserver = new PerformanceObserver(list => {
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
    performanceObserver.observe({ entryTypes: ["resource"] });
  }

  function markEncryptedByOrigin(keyUrl) {
    const origin = new URL(keyUrl).origin;
    let flagged = false;
    STATE.entries.forEach(entry => {
      if (entry.isHls && entry.url.startsWith(origin)) {
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

  /* -------------------------------------------------------------------------- */
  /*                             HLS Intelligence                               */
  /* -------------------------------------------------------------------------- */

  // Attempt to inspect playlists only when CORS allows; never decrypt or bypass DRM.
  function analyzeHls(entry) {
    if (!entry || entry.hls.analyzed || entry.encrypted) return;
    entry.hls.analyzed = true;
    entry.hls.error = null;
    updateStatus(entry.url, "analyzing");
    const cached = STATE.cache.streamFingerprints.get(entry.url);
    const parsePromise = cached ? Promise.resolve(cached) : fetchAndParsePlaylist(entry.url);
    parsePromise
      .then(parsed => {
        if (!cached) {
          STATE.cache.streamFingerprints.set(entry.url, parsed);
        }
        entry.hls.variants = parsed.variants;
        entry.hls.segments = parsed.segments;
        entry.hls.audioOnly = parsed.audioOnly;
        entry.hls.live = parsed.live;
        entry.hls.encryption = parsed.encryption;
        if (parsed.encrypted) {
          entry.encrypted = true;
          entry.status = "encrypted";
          const method = parsed.encryption || "AES-128";
          toast(`Encrypted HLS detected (${method}).`);
          updateStatus(entry.url, "encrypted");
          return;
        }
        entry.status = "ok";
        updateStatus(entry.url, entry.status);
        scheduleRender();
      })
      .catch(error => {
        entry.hls.error = "CORS blocked or unavailable";
        updateStatus(entry.url, "blocked");
        toast("HLS inspection blocked by CORS.");
        log("warn", "HLS inspection blocked", error?.message || error);
      });
  }

  function fetchAndParsePlaylist(url) {
    return fetch(url, { credentials: "include" })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => parsePlaylist(text, url));
  }

  function parsePlaylist(text, baseUrl) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const variants = [];
    const segments = [];
    let encrypted = false;
    let encryption = "";
    let audioOnly = false;
    let live = true;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.startsWith("#EXT-X-KEY")) {
        encrypted = true;
        const method = line.match(/METHOD=([^,]+)/i)?.[1] || "";
        encryption = method || encryption;
      }
      if (line.startsWith("#EXT-X-MAP")) {
        encrypted = true;
        encryption = encryption || "EXT-X-MAP";
      }
      if (line.startsWith("#EXT-X-ENDLIST")) live = false;
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        const bandwidth = Number(line.match(/BANDWIDTH=(\d+)/i)?.[1] || 0);
        const resolution = line.match(/RESOLUTION=(\d+x\d+)/i)?.[1] || "";
        const uri = lines[i + 1] && !lines[i + 1].startsWith("#") ? lines[i + 1] : null;
        if (uri) {
          variants.push({
            bandwidth,
            resolution,
            url: new URL(uri, baseUrl).href
          });
        }
      }
      if (!line.startsWith("#")) {
        segments.push(new URL(line, baseUrl).href);
      }
      if (line.includes("TYPE=AUDIO")) audioOnly = true;
    }

    return {
      variants: variants.sort((a, b) => b.bandwidth - a.bandwidth),
      segments,
      encrypted,
      encryption,
      audioOnly,
      live
    };
  }

  function probeVariants(entry) {
    if (!entry) return;
    const cached = STATE.cache.probeCache.get(entry.url);
    if (cached) {
      entry.probes = cached;
      scheduleRender();
      return;
    }
    const candidates = entry.hls.variants.length
      ? entry.hls.variants.slice(0, 5).map(variant => ({
        url: variant.url,
        resolution: variant.resolution,
        status: "pending"
      }))
      : generateQualityProbes(entry.url);
    if (!candidates.length) return;
    const probes = candidates.map(candidate => ({ ...candidate }));
    entry.probes = probes;
    scheduleRender();

    Promise.all(
      probes.map(probe => {
        return fetch(probe.url, { method: "HEAD" })
          .then(res => {
            if (res.ok) return res;
            return fetch(probe.url, {
              method: "GET",
              headers: { Range: "bytes=0-1023" }
            });
          })
          .then(res => {
            probe.status = res.ok ? "ok" : `HTTP ${res.status}`;
          })
          .catch(() => {
            probe.status = "blocked";
          });
      })
    ).then(() => {
      STATE.cache.probeCache.set(entry.url, probes);
      scheduleRender();
    });
  }

  function generateQualityProbes(url) {
    const resolutions = ["2160", "1440", "1080", "720", "480", "360"];
    const probes = [];
    const pattern = url.match(/(\\d{3,4})p/i);
    if (pattern) {
      resolutions.forEach(res => {
        probes.push({
          url: url.replace(/\\d{3,4}p/i, `${res}p`),
          resolution: `${res}p`,
          status: "pending"
        });
      });
      return probes;
    }
    const sizePattern = url.match(/(\\d{3,4}x\\d{3,4})/i);
    if (sizePattern) {
      const sizes = ["3840x2160", "2560x1440", "1920x1080", "1280x720", "854x480", "640x360"];
      sizes.forEach(size => {
        probes.push({
          url: url.replace(/\\d{3,4}x\\d{3,4}/i, size),
          resolution: size,
          status: "pending"
        });
      });
      return probes;
    }
    return probes;
  }

  /* -------------------------------------------------------------------------- */
  /*                              Media Overlay                                 */
  /* -------------------------------------------------------------------------- */

  function setupMediaObserver() {
    if (mediaObserver) return;
    let scheduled = false;
    mediaObserver = new MutationObserver(() => {
      if (!STATE.ui.ready || !STATE.visible) return;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scanMediaElements();
      });
    });
    mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
    scanMediaElements();
  }

  function mapMediaElement(element) {
    const src = element.currentSrc || element.src ||
      element.querySelector("source")?.src || "";
    if (!src) return;
    const resolved = src.startsWith("blob:") && STATE.lastHlsUrl ? STATE.lastHlsUrl : src;
    const key = normalizeUrl(resolved);
    STATE.media.urlMap.set(key, element);
  }

  function scanMediaElements() {
    if (!STATE.visible) return;
    const elements = document.querySelectorAll("video, audio");
    elements.forEach(element => {
      if (STATE.media.elements.has(element)) return;
      STATE.media.elements.add(element);
      mapMediaElement(element);
      const onEnter = () => {
        if (!element || element.readyState < 1) return;
        element.style.outline = `2px solid ${CONFIG.overlayOutlineColor}`;
        showMediaOverlay(element);
      };
      const onLeave = () => {
        element.style.outline = "";
        hideMediaOverlay();
      };
      const onLoaded = () => {
        mapMediaElement(element);
        element.style.outline = "";
      };
      element.addEventListener("mouseenter", onEnter);
      element.addEventListener("mouseleave", onLeave);
      element.addEventListener("loadedmetadata", onLoaded);
      STATE.media.handlers.set(element, { onEnter, onLeave, onLoaded });
    });
  }

  function highlightMediaByUrl(url) {
    const key = normalizeUrl(url);
    const element = STATE.media.urlMap.get(key);
    if (!element) {
      toast("Media element not found on page.");
      return;
    }
    const previous = element.style.outline;
    element.style.outline = `2px solid ${CONFIG.overlayOutlineColor}`;
    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const existingTimer = STATE.media.highlightTimers.get(element);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      element.style.outline = previous;
      STATE.media.highlightTimers.delete(element);
    }, 1800);
    STATE.media.highlightTimers.set(element, timer);
  }

  function showMediaOverlay(element) {
    if (!element || element.readyState < 1) return;
    const overlay = getMediaOverlay();
    const rect = element.getBoundingClientRect();
    const info = getMediaInfo(element);
    STATE.media.lastInfo = info;
    overlay.innerHTML = `
      <div class="overlay-title">AstraFetch Inspector</div>
      <div>${info.type}</div>
      <div>${info.url}</div>
      <div>${info.stats}</div>
      <div class="overlay-actions">
        <button data-action="yt-dlp">yt-dlp</button>
        <button data-action="ffmpeg">ffmpeg</button>
        <button data-action="aria2">aria2c</button>
      </div>
    `;
    const desiredTop = rect.top + rect.height / 2 - 60;
    const desiredLeft = rect.left + rect.width / 2 - 140;
    const clamped = clampToViewport(desiredLeft, desiredTop, overlay);
    overlay.style.top = `${clamped.top}px`;
    overlay.style.left = `${clamped.left}px`;
    overlay.style.display = "block";
    STATE.media.activeElement = element;
  }

  function hideMediaOverlay() {
    const overlay = STATE.media.overlay;
    if (overlay) overlay.style.display = "none";
  }

  function clampToViewport(left, top, element) {
    const { innerWidth, innerHeight } = window;
    const rect = element.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 140;
    return {
      left: Math.min(Math.max(8, left), innerWidth - width - 8),
      top: Math.min(Math.max(8, top), innerHeight - height - 8)
    };
  }

  function getMediaOverlay() {
    if (STATE.media.overlay) return STATE.media.overlay;
    const overlay = document.createElement("div");
    overlay.id = "af-media-overlay";
    overlay.addEventListener("click", event => {
      const info = STATE.media.lastInfo;
      if (!info) return;
      const button = event.target.closest("button");
      if (button) {
        event.stopPropagation();
        handleOverlayAction(button.dataset.action, info);
        return;
      }
      const defaultAction = info.tag === "hls"
        ? "yt-dlp"
        : isDirectFile(info.url)
          ? "aria2"
          : "yt-dlp";
      handleOverlayAction(defaultAction, info);
    });
    document.body.appendChild(overlay);
    STATE.media.overlay = overlay;
    return overlay;
  }

  function getMediaInfo(element) {
    if (!element || element.readyState < 1) {
      return {
        url: "unknown",
        type: "media",
        stats: "metadata pending",
        tag: "media"
      };
    }
    const src = element.currentSrc || element.src ||
      element.querySelector("source")?.src || "unknown";
    const url = src.startsWith("blob:") && STATE.lastHlsUrl ? STATE.lastHlsUrl : src;
    const tag = url.includes(".m3u8") ? "hls" : "media";
    const duration = element.duration && Number.isFinite(element.duration)
      ? element.duration
      : 0;
    const bitrate = estimateBitrate(url);
    const size = bitrate && duration ? (bitrate * 125000 * duration) : 0;
    return {
      url,
      type: tag === "hls" ? "HLS" : element.tagName.toLowerCase(),
      stats: `~${formatBitrate(bitrate)} · ${formatBytes(size)} · ${duration ? duration.toFixed(1) + "s" : "dur n/a"}`,
      tag
    };
  }

  function estimateBitrate(url) {
    const entry = STATE.entries.get(normalizeUrl(url));
    return entry?.bitrate || null;
  }

  function handleOverlayAction(action, info) {
    if (!info.url || info.url === "unknown") {
      toast("No media URL detected");
      return;
    }
    if (action === "yt-dlp") {
      safeClipboard(buildYtDlpCommand(info.url, info.tag === "hls"));
      toast("yt-dlp command copied");
      return;
    }
    if (action === "ffmpeg") {
      safeClipboard(buildFfmpegCommand(info.url));
      toast("ffmpeg command copied");
      return;
    }
    if (action === "aria2") {
      safeClipboard(buildAriaCommand(info.url));
      toast("aria2c command copied");
    }
  }

  function isDirectFile(url) {
    return /\.(mp4|webm|mkv|mp3|ogg|wav)(\?|$)/i.test(url || "");
  }

  /* -------------------------------------------------------------------------- */
  /*                                Command Builders                             */
  /* -------------------------------------------------------------------------- */

  function headerFlags() {
    const ua = navigator.userAgent.replace(/"/g, "\\\"");
    const cookie = CONFIG.includeCookies && document.cookie
      ? `--add-header "Cookie:${document.cookie}"`
      : "--cookies \"cookies.txt\"";
    return [
      `--add-header "User-Agent:${ua}"`,
      `--add-header "Referer:${location.href}"`,
      `--add-header "Origin:${location.origin}"`,
      cookie
    ].join(" ");
  }

  function buildYtDlpCommand(url, isHls = false) {
    const key = `yt:${url}:${isHls}`;
    if (STATE.cache.commandCache.has(key)) return STATE.cache.commandCache.get(key);
    const cmd = [
      "yt-dlp",
      headerFlags(),
      isHls ? "--downloader ffmpeg" : "",
      "-f \"bestvideo+bestaudio/best\"",
      "--merge-output-format mp4",
      `-o \"${safeFilename()}_%(epoch)s.%(ext)s\"`,
      `\"${url}\"`
    ].filter(Boolean).join(" ");
    STATE.cache.commandCache.set(key, cmd);
    return cmd;
  }

  function buildAriaCommand(url) {
    const key = `ar:${url}`;
    if (STATE.cache.commandCache.has(key)) return STATE.cache.commandCache.get(key);
    const cmd = [
      "aria2c -x16 -s16 -k1M",
      `--header=\"User-Agent:${navigator.userAgent}\"`,
      `--header=\"Referer:${location.href}\"`,
      `--header=\"Origin:${location.origin}\"`,
      CONFIG.includeCookies && document.cookie ? `--header=\"Cookie:${document.cookie}\"` : "--load-cookies=cookies.txt",
      `\"${url}\"`
    ].join(" ");
    STATE.cache.commandCache.set(key, cmd);
    return cmd;
  }

  function buildHlsCommand(url) {
    const key = `hls:${url}`;
    if (STATE.cache.commandCache.has(key)) return STATE.cache.commandCache.get(key);
    const cmd = [
      "yt-dlp",
      headerFlags(),
      "--downloader ffmpeg",
      "--downloader-args \"ffmpeg_i:-headers 'User-Agent: " + navigator.userAgent + "\\r\\nReferer: " + location.href + "\\r\\nOrigin: " + location.origin + "'\"",
      "-f \"bv*+ba/b\"",
      "--merge-output-format mp4",
      `-o \"${safeFilename()}_%(epoch)s.%(ext)s\"`,
      `\"${url}\"`
    ].join(" ");
    STATE.cache.commandCache.set(key, cmd);
    return cmd;
  }

  function buildFfmpegCommand(url) {
    const key = `ff:${url}`;
    if (STATE.cache.commandCache.has(key)) return STATE.cache.commandCache.get(key);
    const cmd = [
      "ffmpeg",
      `-headers \"User-Agent: ${navigator.userAgent}\\r\\nReferer: ${location.href}\\r\\nOrigin: ${location.origin}\"`,
      CONFIG.includeCookies && document.cookie ? `-headers \"Cookie: ${document.cookie}\"` : "",
      `-i \"${url}\"`,
      "-c copy",
      `\"${safeFilename()}_%(epoch)s.mp4\"`
    ].filter(Boolean).join(" ");
    STATE.cache.commandCache.set(key, cmd);
    return cmd;
  }

  function safeFilename() {
    return (STATE.title || location.hostname || "download")
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 60);
  }

  /* -------------------------------------------------------------------------- */
  /*                                  UI & HUD                                 */
  /* -------------------------------------------------------------------------- */

  function createHUD() {
    hud = document.createElement("div");
    hud.id = "af-hud";
    hud.innerHTML = `
      <div class="panel">
        <div>
          <div class="topbar">
            <div class="top-left">
              <span>AstraFetch</span>
              <span class="ping" id="af-ping">ping --</span>
            </div>
            <div>
              <button id="af-close">Close</button>
            </div>
          </div>
          <div class="subtitle">AstraFetch network & media HUD (analysis-safe)</div>
        </div>
        <div class="divider"></div>
        <div class="rows" id="af-rows"></div>
      </div>
    `;
    document.body.appendChild(hud);

    hud.querySelector("#af-close")?.addEventListener("click", () => {
      hideHUD();
    });
  }

  function createPullBar() {
    pullBar = document.createElement("div");
    pullBar.id = "af-pull-bar";
    pullBar.textContent = "⟷";
    pullBar.addEventListener("click", () => {
      showHUD();
    });
    document.body.appendChild(pullBar);
  }

  function showPullBar() {
    if (!pullBar) createPullBar();
    pullBar.style.display = "flex";
  }

  function hidePullBar() {
    if (!pullBar) return;
    pullBar.style.display = "none";
  }

  function renderRows() {
    const container = document.getElementById("af-rows");
    if (!container) return;

    container.innerHTML = "";

    const entries = Array.from(STATE.entries.values()).sort(
      (a, b) => b.addedAt - a.addedAt
    );

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "row";
      empty.textContent = "No media detected yet.";
      container.appendChild(empty);
      return;
    }

    entries.forEach(entry => {
      const row = document.createElement("div");
      row.className = `row ${statusClass(entry)}`;

      row.innerHTML = `
        <div class="row-head">
          <span class="url" title="${entry.url}">${entry.url}</span>
          <span class="status">${entry.status}${entry.seenCount > 1 ? ` ×${entry.seenCount}` : ""}</span>
        </div>
        <div class="meta">
          <div>${entry.method} · ${entry.source}</div>
          <div>${entry.mediaType}</div>
          <div>${formatBytes(entry.totalTransfer)} total</div>
          <div>${formatDuration(entry.lastDuration)} last</div>
          <div>${entry.count} hits · ${formatDuration(entry.totalDuration / (entry.count || 1))} avg</div>
          <div>${formatBitrate(entry.bitrate)}</div>
          <div>${entry.encrypted ? entry.hls.encryption || "encrypted" : entry.hls.audioOnly ? "audio-only" : ""}</div>
          <div>${entry.hls.live ? "live" : entry.hls.segments.length ? "vod" : ""}</div>
        </div>
        <div class="chart"></div>
        <div class="actions"></div>
        <div class="samples ${entry.open ? "open" : ""}"></div>
      `;

      row.querySelector(".url")?.addEventListener("click", event => {
        event.stopPropagation();
        highlightMediaByUrl(entry.url);
      });

      renderChart(row.querySelector(".chart"), entry.samples);
      renderActions(row.querySelector(".actions"), entry);
      renderSamples(row.querySelector(".samples"), entry);

      container.appendChild(row);
    });
  }

  function renderActions(container, entry) {
    if (!container) return;
    container.innerHTML = "";

    container.appendChild(
      makeButton("Copy URL", () => {
        safeClipboard(entry.url);
        toast("URL copied");
      })
    );

    if (!entry.finalized) {
      const wait = document.createElement("div");
      wait.style.color = "#9ca3af";
      wait.textContent = "waiting for request...";
      container.appendChild(wait);
      return;
    }

    if (entry.mediaType === "media") {
      container.appendChild(
        makeButton("Copy yt-dlp", () => {
          safeClipboard(buildYtDlpCommand(entry.url));
          toast("yt-dlp command copied");
        })
      );
      container.appendChild(
        makeButton("Copy aria2", () => {
          safeClipboard(buildAriaCommand(entry.url));
          toast("aria2c command copied");
        })
      );
    }

    if (entry.isHls) {
      container.appendChild(
        makeButton(entry.encrypted ? "HLS (encrypted)" : "Copy HLS cmd", () => {
          if (entry.encrypted) {
            toast("Encrypted HLS detected. Use external tools with keys.");
            return;
          }
          safeClipboard(buildHlsCommand(entry.url));
          toast("HLS command copied");
        })
      );
      container.appendChild(
        makeButton("Analyze HLS", () => analyzeHls(entry))
      );
      if (entry.hls.variants.length) {
        container.appendChild(
          makeButton("Probe Qualities", () => probeVariants(entry))
        );
      }
    }

    container.appendChild(
      makeButton(entry.open ? "Hide Samples" : "Show Samples", () => {
        entry.open = !entry.open;
        renderRows();
      })
    );
  }

  function renderSamples(container, entry) {
    if (!container) return;
    container.innerHTML = "";
    if (!entry.open) return;

    entry.samples.forEach(sample => {
      const line = document.createElement("div");
      line.textContent = `${formatDuration(sample.duration)} · ${formatBytes(sample.transfer)} · ${sample.status}`;
      if (sample.duration > CONFIG.slowThreshold) {
        line.style.color = "#fbbf24";
      }
      if (String(sample.status).startsWith("4") || String(sample.status).startsWith("5") || sample.status === "ERR") {
        line.style.color = "#f87171";
      }
      container.appendChild(line);
    });

    if (entry.samples.length) {
      const history = document.createElement("div");
      history.style.color = "#9ca3af";
      history.textContent = `Status history: ${entry.samples.map(sample => sample.status).join(" → ")}`;
      container.appendChild(history);
    }

    if (entry.hls.variants.length) {
      const variantHeader = document.createElement("div");
      variantHeader.textContent = "Variants:";
      container.appendChild(variantHeader);
      entry.hls.variants.slice(0, 4).forEach(variant => {
        const line = document.createElement("div");
        line.textContent = `${variant.resolution || "auto"} · ${Math.round(variant.bandwidth / 1000)} kbps`;
        container.appendChild(line);
      });
    }

    if (entry.probes.length) {
      const probeHeader = document.createElement("div");
      probeHeader.textContent = "Probe results:";
      container.appendChild(probeHeader);
      entry.probes.forEach(probe => {
        const line = document.createElement("div");
        line.textContent = `${probe.resolution || "auto"} · ${probe.status}`;
        container.appendChild(line);
      });
    }

    if (entry.hls.error) {
      const errorLine = document.createElement("div");
      errorLine.style.color = "#f87171";
      errorLine.textContent = entry.hls.error;
      container.appendChild(errorLine);
    }
  }

  function renderChart(container, samples) {
    if (!container) return;
    container.innerHTML = "";
    if (!samples.length) return;
    const max = Math.max(...samples.map(sample => sample.duration || 0), 1);
    samples.slice(0, 6).forEach(sample => {
      const bar = document.createElement("span");
      bar.style.height = `${Math.max(4, (sample.duration / max) * 24)}px`;
      if (sample.duration > CONFIG.slowThreshold) {
        bar.style.background = "rgba(251, 191, 36, 0.7)";
      }
      container.appendChild(bar);
    });
  }

  function makeButton(label, handler) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
  }

  function statusClass(entry) {
    if (entry.encrypted) return "encrypted";
    const status = String(entry.status || "");
    if (status === "pending") return "pending";
    if (status === "ERR" || status.startsWith("4") || status.startsWith("5")) return "error";
    if (entry.lastDuration > CONFIG.slowThreshold) return "slow";
    if (entry.isHls) return "streaming";
    if (status && status !== "idle") return "success";
    return "blocked";
  }

  function showHUD() {
    if (!hud) createHUD();
    hud.style.display = "block";
    STATE.visible = true;
    hidePullBar();
    setupPerformanceObserver();
    setupMediaObserver();
    renderRows();
  }

  function hideHUD() {
    if (!hud) return;
    hud.style.display = "none";
    STATE.visible = false;
    showPullBar();
    if (pingTimer) clearInterval(pingTimer);
    mediaObserver?.disconnect();
    mediaObserver = null;
    performanceObserver?.disconnect();
    performanceObserver = null;
  }

  /* -------------------------------------------------------------------------- */
  /*                               Discord Webhook                              */
  /* -------------------------------------------------------------------------- */

  function maybeSendWebhook(entry) {
    if (!CONFIG.discordWebhook) return;
    const now = Date.now();
    if (now - STATE.discordLastSent < CONFIG.discordRateLimitMs) return;
    STATE.discordLastSent = now;
    const locale = navigator.language || "n/a";
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "n/a";

    const payload = {
      embeds: [
        {
          title: "AstraFetch detection",
          url: location.href,
          color: entry.encrypted ? 0xf87171 : 0x38bdf8,
          thumbnail: { url: "https://files.catbox.moe/cd88m5.png" },
          fields: [
            { name: "Page", value: STATE.title || document.title || location.hostname, inline: false },
            { name: "Media URL", value: sanitizeUrl(entry.url) || "unknown", inline: false },
            { name: "Type", value: entry.mediaType || "unknown", inline: true },
            { name: "Status", value: entry.status || "unknown", inline: true },
            { name: "Locale", value: `${locale} · ${timeZone}`, inline: true }
          ],
          footer: {
            text: new Date().toLocaleString()
          }
        }
      ]
    };

    fetch(CONFIG.discordWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(error => {
      log("warn", "Discord webhook failed", error?.message || error);
    });
  }

  function sanitizeUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                 Ping Meter                                 */
  /* -------------------------------------------------------------------------- */

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
    if (pingTimer) clearInterval(pingTimer);
    updatePing();
    pingTimer = setInterval(updatePing, CONFIG.pingInterval);
  }

  /* -------------------------------------------------------------------------- */
  /*                                 Formatting                                 */
  /* -------------------------------------------------------------------------- */

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let idx = 0;
    let value = bytes;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function formatDuration(ms) {
    if (!ms) return "0ms";
    return `${Math.round(ms)}ms`;
  }

  function formatBitrate(mbps) {
    if (!mbps) return "bitrate n/a";
    return `${mbps.toFixed(2)} Mbps`;
  }

  /* -------------------------------------------------------------------------- */
  /*                                   Boot                                     */
  /* -------------------------------------------------------------------------- */

  function setupMutationObserver() {
    if (mutationObserver) return;
    let scheduled = false;
    mutationObserver = new MutationObserver(mutations => {
      if (!STATE.ui.ready) return;
      const hasAdditions = mutations.some(mutation => mutation.addedNodes && mutation.addedNodes.length);
      if (!hasAdditions) return;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (hud && !document.body.contains(hud)) {
          document.body.appendChild(hud);
        }
        if (pullBar && !document.body.contains(pullBar)) {
          document.body.appendChild(pullBar);
        }
      });
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function teardownObservers() {
    mutationObserver?.disconnect();
    mediaObserver?.disconnect();
    performanceObserver?.disconnect();
    mutationObserver = null;
    mediaObserver = null;
    performanceObserver = null;
  }

  function resetState() {
    STATE.entries.clear();
    STATE.media.elements.clear();
    STATE.media.handlers = new WeakMap();
    STATE.media.urlMap = new Map();
    STATE.media.highlightTimers = new WeakMap();
    STATE.lastHlsUrl = null;
    STATE.encryptedDetected = false;
    STATE.cache.seenUrls.clear();
    scheduleRender();
  }

  function initUi() {
    if (!hud) createHUD();
    if (!pullBar) createPullBar();
    STATE.ui.ready = true;
    showHUD();
  }

  function initObserversAndHooks() {
    setupPerformanceObserver();
    setupMutationObserver();
    setupMediaObserver();
    hookNetwork();
  }

  function handleNavigationChange() {
    teardownObservers();
    resetState();
    initObserversAndHooks();
  }

  STATE.title = getTitle();
  initUi();
  initObserversAndHooks();
  toast("AstraFetch v0.6.4 active (analysis-safe)");

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
    if (document.hidden && pingTimer) clearInterval(pingTimer);
    if (!document.hidden && STATE.visible) startPing();
    if (document.hidden) {
      mediaObserver?.disconnect();
      performanceObserver?.disconnect();
      performanceObserver = null;
    } else {
      mediaObserver = null;
      setupMediaObserver();
      setupPerformanceObserver();
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

  startPing();
})();
