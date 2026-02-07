(() => {
  "use strict";

  const GM = globalThis.AstraFetchGM || {
    GM_addStyle,
    GM_addElement,
    GM_setClipboard,
    GM_xmlhttpRequest
  };

  globalThis.AstraFetchGM = GM;

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

  const STATE = {
    title: null,
    visible: false,
    ui: {
      ready: false,
      search: {
        query: "",
        tags: new Set()
      },
      highlightedUrl: ""
    },
    entries: new Map(),
    needsRender: false,
    groupState: new Map(),
    encryptedDetected: false,
    cache: {
      seenUrls: new Map(),
      streamFingerprints: new Map(),
      commandCache: new Map(),
      probeCache: new Map()
    },
    console: {
      open: false,
      logs: [],
      armed: false
    },
    media: {
      elements: new Set(),
      overlay: null,
      activeElement: null,
      handlers: new WeakMap()
    },
    lastHlsUrl: null,
    discordLastSent: 0
  };

  const refs = {
    hud: null,
    consolePanel: null,
    pingTimer: null,
    mutationObserver: null,
    mediaObserver: null,
    performanceObserver: null
  };

  const AstraFetch = (globalThis.AstraFetch = {
    CONFIG,
    STATE,
    GM,
    refs
  });

  /* -------------------------------------------------------------------------- */
  /*                                   Logging                                  */
  /* -------------------------------------------------------------------------- */

  function log(level, message, data = null) {
    const entry = {
      level,
      message,
      data,
      time: new Date().toLocaleTimeString()
    };
    STATE.console.logs.unshift(entry);
    if (STATE.console.logs.length > 100) STATE.console.logs.pop();
    AstraFetch.renderConsole?.();
  }

  function isOurError(error) {
    if (!error) return false;
    const stack = String(error.stack || "");
    return stack.includes("AstraFetch") || stack.includes("af-");
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

  function classify(url, initiator) {
    const lower = url.toLowerCase();
    if (lower.startsWith("blob:")) return "blob";
    if (lower.includes(".m3u8")) return "hls";
    if (lower.match(/\.(mp4|webm|mkv|mp3|ogg|wav)(\?|$)/)) return "media";
    if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/)) return "image";
    if (lower.match(/\.(js|css|woff2?|ttf|otf)(\?|$)/)) return "static";
    if (initiator === "fetch" || initiator === "xmlhttprequest") return "api";
    return "other";
  }

  function scheduleRender() {
    if (STATE.needsRender) return;
    STATE.needsRender = true;
    requestAnimationFrame(() => {
      if (STATE.visible && STATE.ui.ready) {
        AstraFetch.renderRows?.();
      }
      STATE.needsRender = false;
    });
  }

  function safeClipboard(text) {
    if (GM.GM_setClipboard) {
      GM.GM_setClipboard(text);
      return;
    }
    navigator.clipboard?.writeText(text).catch(() => {});
  }

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
  /*                              Entry Management                              */
  /* -------------------------------------------------------------------------- */

  function addEntry(url, source = "network", method = "GET", initiator = "") {
    const clean = normalizeUrl(url);
    if (!clean) return null;
    const tag = classify(clean, initiator || source);

    const isNew = !STATE.entries.has(clean);
    if (isNew) {
      const created = {
        url: clean,
        tag,
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
        toast(`Detected ${tag.toUpperCase()}`);
      }

      if (tag === "hls") {
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
  /*                               Discord Webhook                              */
  /* -------------------------------------------------------------------------- */

  async function maybeSendWebhook(entry) {
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
            { name: "Type", value: entry.tag || "unknown", inline: true },
            { name: "Status", value: entry.status || "unknown", inline: true },
            { name: "Locale", value: `${locale} · ${timeZone}`, inline: true }
          ],
          footer: {
            text: new Date().toLocaleString()
          }
        }
      ]
    };
    try {
      await fetch(CONFIG.discordWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      log("warn", "Discord webhook failed", error?.message || error);
    }
    STATE.console.logs.unshift(entry);
    if (STATE.console.logs.length > 100) STATE.console.logs.pop();
    AstraFetch.renderConsole?.();
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

  Object.assign(AstraFetch, {
    log,
    isOurError,
    toast,
    getTitle,
    normalizeUrl,
    classify,
    scheduleRender,
    safeClipboard,
    formatBytes,
    formatDuration,
    formatBitrate,
    addEntry,
    updateStatus,
    updateSample,
    maybeSendWebhook,
    sanitizeUrl
  });
})();
