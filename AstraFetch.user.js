// ==UserScript==
// @name         AstraFetch (Universal)
// @namespace    https://github.com/Celesth/AstraFetch
// @icon         https://cdn.discordapp.com/attachments/1399627953977167902/1465377210037698827/Screenshot_2026-01-26-21-26-16-532_com.miui.mediaviewer.png
// @version      0.3.0
// @description  Universal video stream detector with yt-dlp & aria2 command generator
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
"use strict";

/* ───────────── STATE ───────────── */

const STATE = {
  debug: localStorage.getItem("astrafetch:debug") === "true",
  title: null,
  page: location.href
};

const MEDIA = new Map();
let lastUrl = location.href;

/* ───────────── STYLE ───────────── */

GM_addStyle(`
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
  transition: .2s;
}
#af-toast.show { opacity: 1; transform: translateY(0); }

#af-debug {
  position: fixed;
  top: 6px;
  left: 6px;
  font-family: monospace;
  font-size: 11px;
  color: #fff;
  white-space: pre;
  z-index: 100001;
}

#af-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.65);
  backdrop-filter: blur(6px);
  z-index: 99998;
}

#af-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%,-50%);
  background: #0f0f0f;
  color: #fff;
  width: 480px;
  border-radius: 18px;
  padding: 16px;
  z-index: 99999;
  max-height: 80vh;
  overflow-y: auto;
}

.af-box {
  border: 1px solid #2a2a2a;
  border-radius: 14px;
  padding: 10px;
  margin-top: 10px;
  background: #141414;
}

.af-box code {
  font-size: 11px;
  opacity: .75;
  word-break: break-all;
}

.af-btn {
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: none;
  background: #222;
  color: #fff;
  cursor: pointer;
  margin-right: 6px;
}
`);

/* ───────────── UTIL ───────────── */

function toast(text, t = 2200) {
  let el = document.getElementById("af-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "af-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), t);
}

function getTitle() {
  return (
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title ||
    location.hostname
  ).replace(/[\\/:*?"<>|]/g, "").trim();
}

function debug() {
  if (!STATE.debug) return;
  let d = document.getElementById("af-debug");
  if (!d) {
    d = document.createElement("div");
    d.id = "af-debug";
    document.body.appendChild(d);
  }
  d.textContent =
`AstraFetch Debug
──────────────
Page: ${STATE.page}
Title: ${STATE.title}
Streams: ${MEDIA.size}`;
}

/* ───────────── MEDIA ───────────── */

function register(url, type) {
  if (MEDIA.has(url)) return;
  MEDIA.set(url, { url, type });
  toast(`Detected ${type}`);
  buildUI();
  debug();
}

function sniff(url) {
  if (!url) return;
  if (url.includes(".m3u8")) register(url, "HLS (.m3u8)");
  else if (url.includes(".mpd")) register(url, "DASH (.mpd)");
  else if (url.match(/\.(mp4|webm|mkv)(\?|$)/))
    register(url, "Direct media");
}

function hookNetwork() {
  const _fetch = window.fetch;
  window.fetch = async (...a) => {
    sniff(String(a[0]));
    return _fetch(...a);
  };

  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (_, url) {
    sniff(String(url));
    return _open.apply(this, arguments);
  };
}

/* ───────────── UI ───────────── */

function buildUI() {
  if (!MEDIA.size || document.getElementById("af-modal")) return;

  const overlay = document.createElement("div");
  overlay.id = "af-overlay";

  const modal = document.createElement("div");
  modal.id = "af-modal";

  modal.innerHTML = `<b>${STATE.title}</b>`;

  MEDIA.forEach(m => {
    const box = document.createElement("div");
    box.className = "af-box";
    box.innerHTML = `
<b>${m.type}</b>
<code>${m.url}</code>
<button class="af-btn yt">Copy yt-dlp</button>
${m.type === "Direct media" ? `<button class="af-btn ar">Copy aria2</button>` : ""}
`;

    box.querySelector(".yt").onclick = () => {
      const cmd =
`yt-dlp \
--impersonate Safari-18.4 \
--add-header "Referer:${location.origin}" \
--add-header "Origin:${location.origin}" \
--merge-output-format mp4 \
-o "${STATE.title.slice(0,60)}_%(epoch)s.%(ext)s" \
"${m.url}"`;

      GM_setClipboard(cmd);
      toast("yt-dlp command copied");
    };

    box.querySelector(".ar")?.addEventListener("click", () => {
      const cmd =
`aria2c -x16 -s16 -k1M \
--header="Referer: ${location.origin}" \
"${m.url}"`;
      GM_setClipboard(cmd);
      toast("aria2 command copied");
    });

    modal.appendChild(box);
  });

  overlay.onclick = () => {
    overlay.remove();
    modal.remove();
  };

  document.body.append(overlay, modal);
}

/* ───────────── SPA WATCH ───────────── */

setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    MEDIA.clear();
    STATE.page = location.href;
    STATE.title = getTitle();
    setTimeout(() => toast("Listening for streams…"), 300);
  }
}, 500);

/* ───────────── BOOT ───────────── */

STATE.title = getTitle();
hookNetwork();
toast("AstraFetch active");
debug();

})();
