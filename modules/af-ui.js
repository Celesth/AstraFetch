(() => {
  "use strict";

  const AstraFetch = globalThis.AstraFetch;
  const { CONFIG, STATE, GM, refs } = AstraFetch;
  const {
    formatBytes,
    formatDuration,
    formatBitrate,
    safeClipboard,
    toast,
    log,
    scheduleRender,
    updateStatus,
    buildYtDlpCommand,
    buildAriaCommand,
    buildHlsCommand,
    buildFfmpegCommand,
    isDirectFile
  } = AstraFetch;

  const { GM_addStyle } = GM;

  GM_addStyle?.(`
    #af-hud {
      position: fixed;
      ${positionStyle()}
      z-index: 2147483647;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      color: #e5e7eb;
    }

    #af-hud .panel,
    #af-console {
      width: ${CONFIG.width}px;
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

    #af-hud .divider,
    #af-console .divider {
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
      max-height: 220px;
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

    #af-hud button,
    #af-console button {
      border: 1px solid #1e1e22;
      background: #141414;
      color: #e5e7eb;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 0.65rem;
      cursor: pointer;
    }

    #af-hud button:hover,
    #af-console button:hover {
      background: #1f1f1f;
    }

    #af-console {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 420px;
      max-height: 380px;
      display: none;
    }

    #af-console .log-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.68rem;
    }

    #af-console .log-entry.warn { color: #fbbf24; }
    #af-console .log-entry.error { color: #f87171; }

    #af-console .input-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
    }

    #af-console input {
      width: 100%;
      background: #0f0f0f;
      border: 1px solid #1e1e22;
      color: #e5e7eb;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 0.68rem;
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
  `);

  function positionStyle() {
    const p = CONFIG.guiPosition;
    return `
      ${p.includes("top") ? "top:24px;" : "bottom:24px;"}
      ${p.includes("left") ? "left:24px;" : "right:24px;"}
    `;
  }

  /* -------------------------------------------------------------------------- */
  /*                              Media Overlay                                 */
  /* -------------------------------------------------------------------------- */

  function setupMediaObserver() {
    if (refs.mediaObserver) return;
    refs.mediaObserver = new MutationObserver(() => {
      attachMediaListeners();
    });
    refs.mediaObserver.observe(document.documentElement, { childList: true, subtree: true });
    attachMediaListeners();
  }

  function attachMediaListeners() {
    const mediaElements = document.querySelectorAll("video, audio");
    mediaElements.forEach(el => {
      if (STATE.media.elements.has(el)) return;
      STATE.media.elements.add(el);
      const handler = () => handleMediaEvent(el);
      STATE.media.handlers.set(el, handler);
      el.addEventListener("play", handler);
      el.addEventListener("pause", handler);
      el.addEventListener("seeking", handler);
      el.addEventListener("ratechange", handler);
      el.addEventListener("volumechange", handler);
    });
  }

  function handleMediaEvent(element) {
    STATE.media.activeElement = element;
    if (!STATE.media.overlay) createMediaOverlay();
    renderMediaOverlay();
  }

  function createMediaOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "af-media-overlay";
    overlay.innerHTML = `
      <div class="overlay-title">AstraFetch Media</div>
      <div class="overlay-meta" id="af-media-meta"></div>
      <div class="overlay-actions">
        <button id="af-media-copy">Copy Current URL</button>
        <button id="af-media-hide">Hide</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("#af-media-copy")?.addEventListener("click", () => {
      const url = STATE.media.activeElement?.currentSrc;
      if (!url) return;
      safeClipboard(url);
      toast("Copied media URL");
    });
    overlay.querySelector("#af-media-hide")?.addEventListener("click", () => {
      overlay.style.display = "none";
    });
    STATE.media.overlay = overlay;
  }

  function renderMediaOverlay() {
    if (!STATE.media.overlay || !STATE.media.activeElement) return;
    const overlay = STATE.media.overlay;
    const element = STATE.media.activeElement;
    const meta = overlay.querySelector("#af-media-meta");
    if (!meta) return;
    const src = element.currentSrc || element.src || "n/a";
    const duration = isFinite(element.duration) ? `${Math.round(element.duration)}s` : "live";
    meta.innerHTML = `
      <div><strong>Source:</strong> ${src}</div>
      <div><strong>Time:</strong> ${Math.round(element.currentTime)} / ${duration}</div>
      <div><strong>Rate:</strong> ${element.playbackRate}</div>
      <div><strong>Volume:</strong> ${Math.round(element.volume * 100)}%</div>
    `;
    const rect = element.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.top = `${Math.max(24, rect.top + window.scrollY - 12)}px`;
    overlay.style.left = `${Math.max(24, rect.left + window.scrollX)}px`;
  }

  /* -------------------------------------------------------------------------- */
  /*                                  UI & HUD                                 */
  /* -------------------------------------------------------------------------- */

  function createHUD() {
    refs.hud = document.createElement("div");
    refs.hud.id = "af-hud";
    refs.hud.innerHTML = `
      <div class="panel">
        <div>
          <div class="topbar">
            <div class="top-left">
              <span>AstraFetch</span>
              <span class="ping" id="af-ping">ping --</span>
            </div>
            <div>
              <button id="af-console-toggle">Console</button>
            </div>
          </div>
          <div class="subtitle">Analysis-safe network & media HUD</div>
        </div>
        <div class="divider"></div>
        <div class="rows" id="af-rows"></div>
      </div>
    `;
    document.body.appendChild(refs.hud);

    refs.hud.querySelector("#af-console-toggle")?.addEventListener("click", () => {
      STATE.console.open = !STATE.console.open;
      renderConsole();
    });
  }

  function renderRows() {
    const container = document.getElementById("af-rows");
    if (!container) return;

    container.innerHTML = "";

    const entries = Array.from(STATE.entries.values()).sort(
      (a, b) => b.addedAt - a.addedAt
    );

    if (!entries.length) {
      container.innerHTML = `<div class="status">No streams detected yet.</div>`;
      return;
    }

    entries.forEach(entry => {
      const row = document.createElement("div");
      const status = entry.status || "pending";
      row.className = `row ${status === "ok" ? "success" : status === "pending" ? "pending" : status === "encrypted" ? "encrypted" : status === "blocked" ? "blocked" : status === "streaming" ? "streaming" : status === "ERR" || String(status).startsWith("5") ? "error" : status === "slow" ? "slow" : ""}`;

      const isHls = entry.tag === "hls";
      if (isHls && !entry.hls.analyzed && !entry.encrypted) {
        AstraFetch.analyzeHls?.(entry);
      }

      const cmdYtDlp = buildYtDlpCommand(entry.url, isHls);
      const cmdAria = buildAriaCommand(entry.url);
      const cmdHls = buildHlsCommand(entry.url);
      const cmdFfmpeg = buildFfmpegCommand(entry.url);
      const bitrate = entry.bitrate ? formatBitrate(entry.bitrate) : "bitrate n/a";
      const size = entry.totalTransfer ? formatBytes(entry.totalTransfer) : "size n/a";
      const average = entry.count ? formatDuration(entry.totalDuration / entry.count) : "n/a";

      row.innerHTML = `
        <div class="row-head">
          <span class="tag ${entry.tag}">${entry.tag}</span>
          <span class="url">${entry.url}</span>
          <span class="status">${status}</span>
        </div>
        <div class="meta">
          <span>Requests: ${entry.seenCount}</span>
          <span>Avg: ${average}</span>
          <span>Transfer: ${size}</span>
          <span>${bitrate}</span>
        </div>
        <div class="actions">
          <button data-cmd="yt">Copy yt-dlp</button>
          <button data-cmd="aria">Copy aria2</button>
          ${isHls ? '<button data-cmd="hls">Copy HLS</button>' : ''}
          ${isDirectFile(entry.url) ? '<button data-cmd="ff">Copy ffmpeg</button>' : ''}
          <button data-cmd="raw">Copy URL</button>
        </div>
        <div class="samples ${entry.open ? "open" : ""}">
          ${entry.samples
            .map(sample => `<div>${sample.status} · ${formatDuration(sample.duration)} · ${formatBytes(sample.transfer)}</div>`)
            .join("")}
        </div>
      `;

      const rowHead = row.querySelector(".row-head");
      rowHead?.addEventListener("click", () => {
        entry.open = !entry.open;
        scheduleRender();
      });

      const actionButtons = row.querySelectorAll("button[data-cmd]");
      actionButtons.forEach(button => {
        button.addEventListener("click", () => {
          const cmd = button.getAttribute("data-cmd");
          if (cmd === "yt") safeClipboard(cmdYtDlp);
          if (cmd === "aria") safeClipboard(cmdAria);
          if (cmd === "hls") safeClipboard(cmdHls);
          if (cmd === "ff") safeClipboard(cmdFfmpeg);
          if (cmd === "raw") safeClipboard(entry.url);
          toast("Copied command");
        });
      });

      container.appendChild(row);
    });
  }

  function showHUD() {
    STATE.visible = true;
    if (!refs.hud) createHUD();
    refs.hud.style.display = "block";
    renderRows();
    AstraFetch.startPing?.();
  }

  function hideHUD() {
    STATE.visible = false;
    if (refs.hud) refs.hud.style.display = "none";
    if (refs.pingTimer) clearInterval(refs.pingTimer);
  }

  /* -------------------------------------------------------------------------- */
  /*                                 Console Panel                              */
  /* -------------------------------------------------------------------------- */

  function createConsole() {
    refs.consolePanel = document.createElement("div");
    refs.consolePanel.id = "af-console";
    refs.consolePanel.innerHTML = `
      <div class="topbar">
        <div class="top-left">
          <span>AstraFetch Console</span>
        </div>
        <div>
          <button id="af-console-arm">Arm</button>
        </div>
      </div>
      <div class="divider"></div>
      <div class="log-list" id="af-log-list"></div>
      <div class="divider"></div>
      <div class="input-row">
        <input id="af-console-input" placeholder="Type JS code to copy" />
        <button id="af-console-run">Copy</button>
      </div>
    `;
    document.body.appendChild(refs.consolePanel);

    refs.consolePanel.querySelector("#af-console-arm")?.addEventListener("click", () => {
      STATE.console.armed = !STATE.console.armed;
      renderConsole();
    });

    refs.consolePanel.querySelector("#af-console-run")?.addEventListener("click", runConsoleCommand);
    refs.consolePanel.querySelector("#af-console-input")?.addEventListener("keydown", event => {
      if (event.key === "Enter") runConsoleCommand();
    });
  }

  function renderConsole() {
    if (!refs.consolePanel) createConsole();
    refs.consolePanel.style.display = STATE.console.open ? "flex" : "none";
    const armButton = refs.consolePanel.querySelector("#af-console-arm");
    if (armButton) {
      armButton.textContent = STATE.console.armed ? "Armed" : "Arm";
      armButton.style.borderColor = STATE.console.armed ? "rgba(34, 197, 94, 0.6)" : "#1e1e22";
    }
    const list = refs.consolePanel.querySelector("#af-log-list");
    if (!list) return;
    list.innerHTML = "";
    STATE.console.logs.forEach(logEntry => {
      const line = document.createElement("div");
      line.className = `log-entry ${logEntry.level}`;
      line.textContent = `[${logEntry.time}] ${logEntry.message} ${logEntry.data ? JSON.stringify(logEntry.data) : ""}`;
      list.appendChild(line);
    });
  }

  function runConsoleCommand() {
    const input = refs.consolePanel.querySelector("#af-console-input");
    if (!input || !input.value.trim()) return;
    if (!STATE.console.armed) {
      toast("Arm console before running code.");
      return;
    }
    const code = input.value;
    input.value = "";
    safeClipboard(code);
    log("warn", "Injection disabled by policy; code copied to clipboard.");
    STATE.console.armed = false;
    renderConsole();
  }

  Object.assign(AstraFetch, {
    setupMediaObserver,
    createHUD,
    renderRows,
    showHUD,
    hideHUD,
    createConsole,
    renderConsole
  });
})();
