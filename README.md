# AstraFetch

AstraFetch is a universal in-browser video stream detector that passively observes network traffic and generates ready-to-use yt-dlp and aria2 commands with short, filesystem-safe filenames and modern request headers, designed to work on dynamic video players without scraping or automation.

---

## Features

- Universal video detection  
  - HLS (.m3u8)  
  - DASH (.mpd)  
  - Direct media (.mp4, .webm, .mkv)

- Network-level interception  
  - Hooks fetch() and XMLHttpRequest  
  - Works with SPA players and dynamically loaded streams

- Site-independent design  
  - No hardcoded domains  
  - No brittle DOM selectors

- yt-dlp command generation  
- aria2 integration  
- In-page UI  

- Browser support  
  - Firefox
  - Zen Browser
  - Chromium-based browsers

---

## How It Works

AstraFetch listens to network requests made by the active page:

1. Intercepts fetch() and XMLHttpRequest calls
2. Identifies media URLs by extension and response patterns
3. Classifies streams as HLS, DASH, or direct media
4. Displays an in-page popup when a valid stream is detected
5. Generates copy-paste-ready download commands

---

## Installation

### Userscript Manager

Install a userscript manager:
- Violentmonkey (recommended)
- Tampermonkey

### Script Installation

Create a new userscript and paste the AstraFetch script, or install directly from GitHub:

https://raw.githubusercontent.com/Celesth/AstraFetch/main/astrafetch.user.js


---

## Usage

1. Open any website with video playback
2. Start playing a video
3. AstraFetch automatically detects stream URLs
4. A popup appears showing available download commands
5. Copy the desired command and run it locally

---

## Example yt-dlp Command

```sh
yt-dlp
--impersonate Safari-18.4
--add-header "Referer:https://example.com
"
--add-header "Origin:https://example.com
"
--merge-output-format mp4
-o "VideoTitle_%(epoch)s.%(ext)s"
"https://example.com/stream.m3u8"
```


This format avoids proxy-based filename expansion, includes modern headers, and remains compatible with ffmpeg.

---

## Example aria2 Command

```sh
aria2c -x16 -s16 -k1M
--header="Referer: https://example.com
"
"https://example.com/video.mp4"
```

---

## Limitations

- DRM-protected streams (Widevine, PlayReady)
- Encrypted blob URLs without exposed media endpoints
- Server-side protected or token-rotated APIs

AstraFetch is a detector, not a DRM bypass tool.

---

## Legal Notice

AstraFetch does not download content, bypass DRM, modify server behavior, or inject into video players.

It only exposes media URLs already delivered to the browser.

Users are responsible for complying with applicable laws and website terms.

---

## Author

[@Celesth](https://github.com/Celesth/) Under Parhelion
