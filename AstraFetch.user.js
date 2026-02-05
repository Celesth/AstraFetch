// ==UserScript==
// @name         AstraFetch (Stream Analyzer)
// @namespace    https://github.com/Celesth/AstraFetch
// @icon         https://cdn.discordapp.com/attachments/1399627953977167902/1465377210037698827/Screenshot_2026-01-26-21-26-16-532_com.miui.mediaviewer.png
// @version      0.5.0
// @description  Hyprland-style stream analyzer with command helpers
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  "use strict";

  /* ---------------- Config ---------------- */

  const CONFIG = {
    triggerKey: "/",
    toggleMode: true,
    guiPosition: "bottom-right", // top-left | top-right | bottom-left | bottom-right
    width: 520,
    height: 320,
    maxEntries: 200,
    maxSamples: 6,
    slowThreshold: 800,
    pingInterval: 1500,
    toastDuration: 2200
  };

  /* ---------------- State ---------------- */

  const STATE = {
    title: null,
    visible: false,
    entries: new Map(),
    needsRender: false,
    groupState: new Map(),
    encryptedDetected: false
  };

  let hud;
  let pingTimer;
  let mutationObserver;

  /* ---------------- Styles ---------------- */

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
      height: ${CONFIG.height}px;
      background: rgba(12, 12, 14, 0.92);
      border: 1px solid #1e1e22;
      border-radius: 12px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
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
      gap: 8px;
      padding-right: 4px;
    }

    #af-hud .row {
      border: 1px solid #1f1f26;
      border-radius: 10px;
      padding: 8px;
      background: rgba(16, 16, 18, 0.75);
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    #af-hud .row.success { border-color: rgba(34, 197, 94, 0.5); }
    #af-hud .row.slow { border-color: rgba(251, 191, 36, 0.6); }
    #af-hud .row.error { border-color: rgba(248, 113, 113, 0.65); }
    #af-hud .row.blocked { border-color: rgba(148, 163, 184, 0.6); }
    #af-hud .row.streaming { border-color: rgba(56, 189, 248, 0.6); }
    #af-hud .row.encrypted { border-color: rgba(248, 113, 113, 0.8); box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.35); }

    #af-hud .row-head {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: 8px;
      align-items: center;
      font-size: 0.72rem;
      cursor: pointer;
    }

    #af-hud .tag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 6px;
      border-radius: 6px;
      background: rgba(12, 12, 14, 0.6);
      border: 1px solid #1e1e22;
      font-size: 0.6rem;
      text-transform: uppercase;
    }

    #af-hud .tag.hls { color: #38bdf8; }
    #af-hud .tag.blob { color: #a78bfa; }
    #af-hud .tag.media { color: #22c55e; }
    #af-hud .tag.image { color: #60a5fa; }
    #af-hud .tag.api { color: #fbbf24; }
    #af-hud .tag.static { color: #a78bfa; }
    #af-hud .tag.other { color: #71717a; }

    #af-hud .url {
      color: #e5e7eb;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      max-height: 200px;
    }

    #af-hud .group {
      border: 1px solid #1f1f26;
      border-radius: 12px;
      padding: 6px;
      background: rgba(14, 14, 16, 0.65);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #af-hud .group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.7rem;
      color: #cbd5f5;
      cursor: pointer;
    }

    #af-hud .caret {
      transition: transform 0.2s ease;
    }

    #af-hud .caret.open {
      transform: rotate(90deg);
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
  `);

  function positionStyle() {
    const p = CONFIG.guiPosition;
    return `
      ${p.includes("top") ? "top:24px;" : "bottom:24px;"}
      ${p.includes("left") ? "left:24px;" : "right:24px;"}
    `;
  }

  /* ---------------- Utils ---------------- */

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
      if (STATE.visible) renderRows();
      STATE.needsRender = false;
    });
  }

  function addEntry(url, source = "network", method = "GET", initiator = "") {
    const clean = normalizeUrl(url);
    if (!clean) return null;
    const tag = classify(clean, initiator || source);
    if (!STATE.entries.has(clean)) {
      const created = {
        url: clean,
        tag,
        source,
        method,
        status: "idle",
        addedAt: Date.now(),
        count: 0,
        totalDuration: 0,
        lastDuration: 0,
        totalTransfer: 0,
        bitrate: null,
        samples: [],
        open: false,
        warned: false,
        encrypted: false
      };
      STATE.entries.set(clean, created);
      if (STATE.entries.size > CONFIG.maxEntries) {
        const oldest = STATE.entries.keys().next().value;
        STATE.entries.delete(oldest);
      }
      toast(`Detected ${tag.toUpperCase()}`);
      if (tag === "hls" && !created.warned) {
        created.warned = true;
        toast("M3U8 detected. Encrypted streams require external tools.");
      }
      scheduleRender();
    }
    return STATE.entries.get(clean);
  }

  function updateStatus(url, status) {
    const entry = STATE.entries.get(normalizeUrl(url));
    if (!entry) return;
    entry.status = status;
    scheduleRender();
  }

  /* ---------------- Network Hook ---------------- */

  function hookNetwork() {
    const _fetch = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]);
      const method = (args[1]?.method || "GET").toUpperCase();
      const entry = addEntry(url, "fetch", method, "fetch");
      const start = performance.now();
      try {
        const res = await _fetch(...args);
        const duration = performance.now() - start;
        updateStatus(url, `${res.status}`);
        updateSample(entry, duration, 0, res.status);
        return res;
      } catch (error) {
        const duration = performance.now() - start;
        updateStatus(url, "ERR");
        updateSample(entry, duration, 0, "ERR");
        throw error;
      }
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

  /* ---------------- Resource Timing ---------------- */

  function setupPerformanceObserver() {
    if (!("PerformanceObserver" in window)) return;
    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        if (entry.entryType !== "resource") return;
        const url = normalizeUrl(entry.name);
        const tracked = addEntry(url, entry.initiatorType || "resource", "GET", entry.initiatorType);
        if (!tracked) return;
        const transfer = entry.transferSize || 0;
        updateSample(tracked, entry.duration, transfer, tracked.status);
        if (url.includes(".key")) {
          markEncryptedByOrigin(url);
        }
      });
    });
    observer.observe({ entryTypes: ["resource"] });
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
    }
  }

  function updateSample(entry, duration, transfer, status) {
    if (!entry) return;
    entry.count += 1;
    entry.totalDuration += duration;
    entry.totalTransfer += transfer;
    entry.lastDuration = duration;
    entry.status = status || entry.status;
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

  /* ---------------- UI ---------------- */

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
            <span>${CONFIG.triggerKey} to toggle</span>
          </div>
          <div class="subtitle">Hyprland-style stream analyzer (analysis-safe)</div>
        </div>
        <div class="divider"></div>
        <div class="rows" id="af-rows"></div>
      </div>
    `;
    document.body.appendChild(hud);
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
      empty.textContent = "No streams detected yet.";
      container.appendChild(empty);
      return;
    }

    const grouped = groupEntries(entries);

    grouped.forEach(group => {
      const wrapper = document.createElement("div");
      wrapper.className = "group";

      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <span>${group.tag.toUpperCase()} · ${group.entries.length} items</span>
        <span class="caret ${group.open ? "open" : ""}">▶</span>
      `;
      header.addEventListener("click", () => {
        group.open = !group.open;
        STATE.groupState.set(group.tag, group.open);
        renderRows();
      });

      wrapper.appendChild(header);

      if (group.open) {
        group.entries.forEach(entry => {
          const row = document.createElement("div");
          row.className = `row ${statusClass(entry)}`;

          row.innerHTML = `
            <div class="row-head">
              <span class="tag ${entry.tag}">${entry.tag}</span>
              <span class="url" title="${entry.url}">${entry.url}</span>
              <span class="status">${entry.status}</span>
            </div>
            <div class="meta">
              <div>${entry.method} · ${entry.source}</div>
              <div>${formatBytes(entry.totalTransfer)} total</div>
              <div>${formatDuration(entry.lastDuration)} last</div>
              <div>${entry.count} hits · ${formatDuration(entry.totalDuration / (entry.count || 1))} avg</div>
              <div>${formatBitrate(entry.bitrate)}</div>
            </div>
            <div class="actions"></div>
            <div class="samples ${entry.open ? "open" : ""}"></div>
          `;

          row.querySelector(".row-head")?.addEventListener("click", () => {
            entry.open = !entry.open;
            renderRows();
          });

          const actions = row.querySelector(".actions");
          if (actions) {
            actions.appendChild(
              makeButton("Copy URL", () => {
                GM_setClipboard(entry.url);
                toast("URL copied");
              })
            );

            if (entry.tag === "media") {
              actions.appendChild(
                makeButton("Copy yt-dlp", () => {
                  GM_setClipboard(buildYtDlpCommand(entry.url));
                  toast("yt-dlp command copied");
                })
              );
              actions.appendChild(
                makeButton("Copy aria2", () => {
                  GM_setClipboard(buildAriaCommand(entry.url));
                  toast("aria2c command copied");
                })
              );
            }

            if (entry.tag === "hls") {
              const label = entry.encrypted ? "HLS (encrypted)" : "Copy HLS cmd";
              actions.appendChild(
                makeButton(label, () => {
                  if (entry.encrypted) {
                    toast("Encrypted HLS detected. Use external tools with keys.");
                    return;
                  }
                  GM_setClipboard(buildHlsCommand(entry.url));
                  toast("HLS command copied");
                })
              );
            }
          }

          const samples = row.querySelector(".samples");
          if (samples && entry.open) {
            entry.samples.forEach(sample => {
              const line = document.createElement("div");
              line.textContent = `${formatDuration(sample.duration)} · ${formatBytes(sample.transfer)} · ${sample.status}`;
              if (sample.duration > CONFIG.slowThreshold) {
                line.style.color = "#fbbf24";
              }
              if (String(sample.status).startsWith("4") || String(sample.status).startsWith("5") || sample.status === "ERR") {
                line.style.color = "#f87171";
              }
              samples.appendChild(line);
            });
          }

          wrapper.appendChild(row);
        });
      }

      container.appendChild(wrapper);
    });
  }

  function makeButton(label, handler) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
  }

  function groupEntries(entries) {
    const groups = new Map();
    entries.forEach(entry => {
      if (!groups.has(entry.tag)) {
        const isOpen = STATE.groupState.get(entry.tag) ?? false;
        groups.set(entry.tag, { tag: entry.tag, entries: [], open: isOpen });
      }
      groups.get(entry.tag).entries.push(entry);
    });
    return Array.from(groups.values());
  }

  function statusClass(entry) {
    if (entry.encrypted) return "encrypted";
    const status = String(entry.status || "");
    if (status === "ERR" || status.startsWith("4") || status.startsWith("5")) return "error";
    if (entry.lastDuration > CONFIG.slowThreshold) return "slow";
    if (entry.tag === "hls") return "streaming";
    if (status && status !== "idle") return "success";
    return "blocked";
  }

  function showHUD() {
    if (!hud) createHUD();
    hud.style.display = "block";
    STATE.visible = true;
    renderRows();
  }

  function hideHUD() {
    if (!hud) return;
    hud.style.display = "none";
    STATE.visible = false;
  }

  function setupMutationObserver() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver(() => {
      if (hud && !document.body.contains(hud)) {
        document.body.appendChild(hud);
      }
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ---------------- Command helpers ---------------- */

  function headerFlags() {
    const ua = navigator.userAgent.replace(/"/g, "\\\"");
    return [
      `--add-header "User-Agent:${ua}"`,
      `--add-header "Referer:${location.href}"`,
      `--add-header "Origin:${location.origin}"`,
      `--cookies "cookies.txt"`
    ].join(" ");
  }

  function buildYtDlpCommand(url) {
    return [
      "yt-dlp",
      headerFlags(),
      "-f \"bestvideo+bestaudio/best\"",
      "--merge-output-format mp4",
      `-o \"${safeFilename()}_%(epoch)s.%(ext)s\"`,
      `\"${url}\"`
    ].join(" ");
  }

  function buildAriaCommand(url) {
    return [
      "aria2c -x16 -s16 -k1M",
      `--header=\"User-Agent:${navigator.userAgent}\"`,
      `--header=\"Referer:${location.href}\"`,
      `--header=\"Origin:${location.origin}\"`,
      "--load-cookies=cookies.txt",
      `\"${url}\"`
    ].join(" ");
  }

  function buildHlsCommand(url) {
    return [
      "yt-dlp",
      headerFlags(),
      "--downloader ffmpeg",
      "--downloader-args \"ffmpeg_i:-headers 'User-Agent: " + navigator.userAgent + "\\r\\nReferer: " + location.href + "\\r\\nOrigin: " + location.origin + "'\"",
      "-f \"bv*+ba/b\"",
      "--merge-output-format mp4",
      `-o \"${safeFilename()}_%(epoch)s.%(ext)s\"`,
      `\"${url}\"`
    ].join(" ");
  }

  function safeFilename() {
    return (STATE.title || location.hostname || "download")
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 60);
  }

  /* ---------------- Ping meter ---------------- */

  async function updatePing() {
    const el = document.getElementById("af-ping");
    if (!el) return;
    const start = performance.now();
    try {
      await fetch(location.origin, { method: "HEAD", cache: "no-store" });
      const ms = Math.round(performance.now() - start);
      el.textContent = `ping ${ms}ms`;
    } catch {
      el.textContent = "ping blocked";
    }
  }

  function startPing() {
    updatePing();
    pingTimer = setInterval(updatePing, CONFIG.pingInterval);
  }

  /* ---------------- Formatting ---------------- */

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

  /* ---------------- Boot ---------------- */

  STATE.title = getTitle();
  hookNetwork();
  setupPerformanceObserver();
  setupMutationObserver();
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
    if (document.hidden && pingTimer) clearInterval(pingTimer);
    if (!document.hidden && STATE.visible) startPing();
  });

  showHUD();
  startPing();
})();
