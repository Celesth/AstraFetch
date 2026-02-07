// ==UserScript==
// @name         AstraFetch (Stream Analyzer)
// @namespace    https://github.com/Celesth/AstraFetch
// @icon         https://files.catbox.moe/cd88m5.png
// @version      0.7.1
// @description  AstraFetch modular loader for the stream analyzer HUD.
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(() => {
  "use strict";

  globalThis.AstraFetchGM = {
    GM_addStyle,
    GM_setClipboard,
    GM_xmlhttpRequest
  };

  const MODULES = [
    "https://raw.githubusercontent.com/Celesth/AstraFetch/refs/heads/main/modules/af-base.js",
    "https://raw.githubusercontent.com/Celesth/AstraFetch/refs/heads/main/modules/af-commands.js",
    "https://raw.githubusercontent.com/Celesth/AstraFetch/refs/heads/main/modules/af-hls.js",
    "https://raw.githubusercontent.com/Celesth/AstraFetch/refs/heads/main/modules/af-ui.js",
    "https://raw.githubusercontent.com/Celesth/AstraFetch/refs/heads/main/modules/af-ping.js",
    "https://raw.githubusercontent.com/Celesth/AstraFetch/refs/heads/main/modules/af-fetching.js",
    "https://raw.githubusercontent.com/Celesth/AstraFetch/refs/heads/main/modules/af-main.js"
  ];

  const fetchText = url =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: response => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText);
          } else {
            reject(new Error(`Failed to load ${url}: ${response.status}`));
          }
        },
        onerror: () => reject(new Error(`Failed to load ${url}`))
      });
    });

  const loadModule = async url => {
    const code = await fetchText(url);
    const wrapped = `${code}\n//# sourceURL=${url}`;
    new Function(wrapped)();
  };

  const start = async () => {
    for (const url of MODULES) {
      await loadModule(url);
    }
  };

  start().catch(error => {
    console.error("[AstraFetch] Module load failed", error);
  });
})();
