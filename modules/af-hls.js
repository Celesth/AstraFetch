(() => {
  "use strict";

  const AstraFetch = globalThis.AstraFetch;
  const { STATE } = AstraFetch;
  const { updateStatus, scheduleRender, toast, log } = AstraFetch;

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
    const pattern = url.match(/(\d{3,4})p/i);
    if (pattern) {
      resolutions.forEach(res => {
        probes.push({
          url: url.replace(/\d{3,4}p/i, `${res}p`),
          resolution: `${res}p`,
          status: "pending"
        });
      });
      return probes;
    }
    const sizePattern = url.match(/(\d{3,4}x\d{3,4})/i);
    if (sizePattern) {
      const sizes = ["3840x2160", "2560x1440", "1920x1080", "1280x720", "854x480", "640x360"];
      sizes.forEach(size => {
        probes.push({
          url: url.replace(/\d{3,4}x\d{3,4}/i, size),
          resolution: size,
          status: "pending"
        });
      });
      return probes;
    }
    return probes;
  }

  Object.assign(AstraFetch, {
    analyzeHls,
    probeVariants
  });
})();
