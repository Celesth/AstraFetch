(() => {
  "use strict";

  const AstraFetch = globalThis.AstraFetch;
  const { CONFIG, STATE } = AstraFetch;

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

  function isDirectFile(url) {
    return /\.(mp4|webm|mkv|mp3|ogg|wav)(\?|$)/i.test(url || "");
  }

  Object.assign(AstraFetch, {
    buildYtDlpCommand,
    buildAriaCommand,
    buildHlsCommand,
    buildFfmpegCommand,
    safeFilename,
    isDirectFile
  });
})();
