# AstraFetch

AstraFetch is a 'OBSERVER' for network traffic, It is capable of capturing almost all the things when a page loads, It also comes with pre-made commands to download specific media types, All while being light-weight and powerfull.

### Note
- the version before 0.3.0 were all made by myself.
- i was forced to use ai bcuz i lwk forgot how to code
- used ai for extra fetching and ui

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

- Command Generator
  - yt-dlp command generation
  - aria2 integration

- Browser support
  - Firefox
  - Zen Browser
  - Chromium-based browsers

---

## How It Works

AstraFetch observers network requests made by the active page:

1. Intercepts fetch() and XMLHttpRequest calls
2. Identifies media URLs by extension and response patterns
3. Classifies streams as HLS, DASH, or direct media
4. Displays an in-page popup when a valid stream is detected
5. Command for that media is prepared.

---

## Installation

### Userscript Manager

Install a userscript manager:

- Violentmonkey (recommended)
- Tampermonkey

### Script Installation

Create a new userscript and paste the AstraFetch script, or install directly from GitHub:

```yaml
https://raw.githubusercontent.com/Celesth/AstraFetch/main/AstraFetch.user.js
```

---

## Usage

1. Open any website
2. The HUD will load in
3. AstraFetch Observes Available Request And Hook it.
4. Loaded Assets, Will be shown with a tag corresponding to its type.
5. Commands will be generated for all links (will make it only for media stuff)
6. Run The Command Locally,it'll download it whatever u've wishing for~

---

## Example yt-dlp Command

### yt-dlp structure

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

This structure avoids proxy-based filename expansion, includes modern headers, and remains compatible with ffmpeg.
If needed allow the usage of cookies for extra impersonation

---

## Aria2c Structure Formatting

```sh
aria2c -x16 -s16 -k1M
--header="Referer: https://example.com"
"https://example.com/video.mp4"
```

We recommend using yt-dlp/ffmpeg for downloading protected streams,
Aria2c is limited to only downloading raw video(media)

---

## Limitations

- DRM-protected streams (Widevine, PlayReady)
- Encrypted blob URLs without exposed media endpoints
  (have made bypass for ts, idk if it still works)
- Server-side protected or token-rotated APIs

AstraFetch is a observer, not a DRM bypass tool.

---

## Legal Notice

AstraFetch does not download content, bypass DRM, modify server behavior, or inject into video players.

It only exposes media URLs already delivered to the browser.

Users are responsible for complying with applicable laws and website terms.

---
## Author

- [@Celesth](https://github.com/Celesth/) Under Parhelion
