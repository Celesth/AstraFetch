// ==UserScript==
// @name         AstraFetch (M3U8 + Blob)
// @namespace    https://github.com/Celesth/AstraFetch
// @icon         https://cdn.discordapp.com/attachments/1399627953977167902/1465377210037698827/Screenshot_2026-01-26-21-26-16-532_com.miui.mediaviewer.png
// @version      0.4.0
// @description  M3U8/Blob detector + in-browser downloader HUD
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
    maxConcurrency: 6,
    toastDuration: 2200
  };

  /* ---------------- State ---------------- */

  const STATE = {
    title: null,
    visible: false,
    entries: new Map(),
    needsRender: false
  };

  let hud;

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
    }

    #af-hud .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
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
    }

    #af-hud .row-head {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: 8px;
      align-items: center;
      font-size: 0.72rem;
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

    #af-hud .tag.m3u8 { color: #38bdf8; }
    #af-hud .tag.blob { color: #a78bfa; }
    #af-hud .tag.media { color: #22c55e; }

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

  function classify(url) {
    if (url.startsWith("blob:")) return "blob";
    if (url.includes(".m3u8")) return "m3u8";
    if (url.match(/\.(mp4|webm|mkv|mp3|ogg|wav)(\?|$)/)) return "media";
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

  function addEntry(url, source = "network") {
    const clean = normalizeUrl(url);
    if (!clean) return;
    const tag = classify(clean);
    if (tag === "other") return;

    if (!STATE.entries.has(clean)) {
      STATE.entries.set(clean, {
        url: clean,
        tag,
        source,
        status: "idle",
        addedAt: Date.now()
      });
      if (STATE.entries.size > CONFIG.maxEntries) {
        const oldest = STATE.entries.keys().next().value;
        STATE.entries.delete(oldest);
      }
      toast(`Detected ${tag.toUpperCase()}`);
      scheduleRender();
    }
  }

  /* ---------------- Network Hook ---------------- */

  function hookNetwork() {
    const _fetch = window.fetch;
    window.fetch = async (...args) => {
      addEntry(String(args[0]));
      return _fetch(...args);
    };

    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (_method, url) {
      addEntry(String(url));
      return _open.apply(this, arguments);
    };
  }

  /* ---------------- UI ---------------- */

  function createHUD() {
    hud = document.createElement("div");
    hud.id = "af-hud";
    hud.innerHTML = `
      <div class="panel">
        <div>
          <div class="topbar">
            <span>AstraFetch</span>
            <span>${CONFIG.triggerKey} to toggle</span>
          </div>
          <div class="subtitle">Detected M3U8 + Blob streams</div>
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

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "row";

      row.innerHTML = `
        <div class="row-head">
          <span class="tag ${entry.tag}">${entry.tag}</span>
          <span class="url" title="${entry.url}">${entry.url}</span>
          <span class="status">${entry.status}</span>
        </div>
        <div class="actions"></div>
      `;

      const actions = row.querySelector(".actions");
      if (actions) {
        const copy = makeButton("Copy URL", () => {
          GM_setClipboard(entry.url);
          toast("URL copied");
        });

        actions.appendChild(copy);

        if (entry.tag === "m3u8") {
          actions.appendChild(
            makeButton("Download M3U8", () => downloadM3U8(entry))
          );
        }

        if (entry.tag === "blob" || entry.tag === "media") {
          actions.appendChild(
            makeButton("Download Blob", () => downloadBlob(entry))
          );
        }
      }

      container.appendChild(row);
    }
  }

  function makeButton(label, handler) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", handler);
    return btn;
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

  /* ---------------- Download Logic ---------------- */

  async function downloadBlob(entry) {
    updateStatus(entry.url, "fetching");
    try {
      const res = await fetch(entry.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = blob.type.includes("mp4") ? "mp4" : "bin";
      triggerDownload(blob, `${STATE.title || "download"}.${ext}`);
      updateStatus(entry.url, "done");
    } catch (error) {
      updateStatus(entry.url, "failed");
      toast(`Blob download failed: ${error.message}`);
    }
  }

  async function downloadM3U8(entry) {
    updateStatus(entry.url, "loading playlist");
    try {
      const playlistUrl = entry.url;
      const playlistText = await fetchText(playlistUrl);
      const parsed = parsePlaylist(playlistText, playlistUrl);

      if (parsed.isMaster && parsed.selectedUrl) {
        updateStatus(entry.url, "selecting variant");
        const childEntry = { url: parsed.selectedUrl };
        await downloadM3U8(childEntry);
        updateStatus(entry.url, "done");
        return;
      }

      if (parsed.hasKey) {
        updateStatus(entry.url, "encrypted");
        toast("Playlist uses AES-128 (EXT-X-KEY). Browser-only merge not supported.");
        return;
      }

      if (!parsed.segments.length) {
        updateStatus(entry.url, "no segments");
        toast("No media segments found in playlist.");
        return;
      }

      updateStatus(entry.url, `downloading 0/${parsed.segments.length}`);
      const buffers = await fetchSegments(parsed, (done, total) => {
        updateStatus(entry.url, `downloading ${done}/${total}`);
      });

      const blob = new Blob(buffers, {
        type: parsed.isFmp4 ? "video/mp4" : "video/mp2t"
      });
      const filename = `${STATE.title || "download"}.${parsed.isFmp4 ? "mp4" : "ts"}`;
      triggerDownload(blob, filename);
      updateStatus(entry.url, "done");
    } catch (error) {
      updateStatus(entry.url, "failed");
      toast(`M3U8 download failed: ${error.message}`);
    }
  }

  async function fetchText(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  function parsePlaylist(text, playlistUrl) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const isMaster = lines.some(line => line.startsWith("#EXT-X-STREAM-INF"));
    const hasKey = lines.some(line => line.startsWith("#EXT-X-KEY"));

    if (isMaster) {
      const variants = [];
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
          const match = lines[i].match(/BANDWIDTH=(\d+)/i);
          const bandwidth = match ? Number(match[1]) : 0;
          const uri = lines[i + 1] && !lines[i + 1].startsWith("#") ? lines[i + 1] : null;
          if (uri) {
            variants.push({
              bandwidth,
              url: new URL(uri, playlistUrl).href
            });
          }
        }
      }
      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      return {
        isMaster: true,
        selectedUrl: variants[0]?.url,
        segments: [],
        hasKey: false,
        isFmp4: false,
        initSegment: null
      };
    }

    let initSegment = null;
    let isFmp4 = false;
    const segments = [];

    for (const line of lines) {
      if (line.startsWith("#EXT-X-MAP")) {
        const match = line.match(/URI="([^"]+)"/i);
        if (match) {
          initSegment = new URL(match[1], playlistUrl).href;
          isFmp4 = true;
        }
      }
      if (!line.startsWith("#")) {
        const resolved = new URL(line, playlistUrl).href;
        segments.push(resolved);
        if (line.includes(".m4s") || line.includes(".mp4")) {
          isFmp4 = true;
        }
      }
    }

    return {
      isMaster: false,
      selectedUrl: null,
      segments,
      hasKey,
      isFmp4,
      initSegment
    };
  }

  async function fetchSegments(parsed, onProgress) {
    const urls = [...parsed.segments];
    const buffers = [];

    if (parsed.initSegment) {
      const initRes = await fetch(parsed.initSegment);
      if (!initRes.ok) throw new Error(`Init HTTP ${initRes.status}`);
      buffers.push(await initRes.arrayBuffer());
    }

    let index = 0;
    const results = new Array(urls.length);
    const workers = Array.from({ length: CONFIG.maxConcurrency }, async () => {
      while (index < urls.length) {
        const current = index;
        index += 1;
        const res = await fetch(urls[current]);
        if (!res.ok) throw new Error(`Segment HTTP ${res.status}`);
        results[current] = await res.arrayBuffer();
        onProgress(current + 1, urls.length);
      }
    });

    await Promise.all(workers);
    return buffers.concat(results);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function updateStatus(url, status) {
    const entry = STATE.entries.get(url);
    if (!entry) return;
    entry.status = status;
    scheduleRender();
  }

  /* ---------------- Boot ---------------- */

  STATE.title = getTitle();
  hookNetwork();
  toast("AstraFetch active");

  document.addEventListener("keydown", event => {
    if (event.key !== CONFIG.triggerKey) return;
    CONFIG.toggleMode ? (STATE.visible ? hideHUD() : showHUD()) : showHUD();
  });

  document.addEventListener("keyup", event => {
    if (!CONFIG.toggleMode && event.key === CONFIG.triggerKey) {
      hideHUD();
    }
  });
})();
