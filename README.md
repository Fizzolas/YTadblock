# YT AdBlock Pro

**The ultimate, privacy-focused Chrome extension to block all YouTube video ads, automatically skip non-skippable ads, and remove sponsored content.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.5.1-orange)](https://github.com/Fizzolas/YTadblock)

---

## ✨ Core Features

### 🎬 Comprehensive Ad Blocking
- **Automatic Skipping:** Instantly clicks the "Skip Ad" button when available.
- **Ad Acceleration:** Speeds through non-skippable ads at **8x playback rate** to minimize waiting time.
- **State Preservation:** Automatically mutes and accelerates ads, then **restores your original volume and playback speed** immediately after the ad ends.
- **Smart Detection:** Uses multiple indicators to reliably detect pre-roll, mid-roll, and overlay ads without interfering with regular video playback.

### 🗑️ Content Removal & Optimization
- **Sponsored Content Removal:** Hides promoted videos and sponsored posts from your homepage, search results, and video feeds.
- **Anti-Adblock Popup Defense:** Automatically removes anti-adblock warning popups and restores video playback.
- **High Performance:** Utilizes a **MutationObserver-based architecture** for non-video element removal, ensuring minimal CPU usage and instant cleanup.

### 🎛️ User Control & Privacy
- **Toggle Control:** Easily enable or disable the extension with a single click from the popup.
- **Local Statistics:** Tracks and displays the total number of ads, sponsored content, and popups blocked, all stored **locally** in your browser.
- **Privacy First:** **Zero data collection, zero tracking, and no external server communication.**

---

## 📦 Installation

### Method 1: Chrome Web Store (Recommended)

*Coming soon after review approval*

### Method 2: Manual Installation (Developer Mode)

1.  **Download** the latest release or clone this repository.
2.  **Open Chrome Extensions**: Navigate to `chrome://extensions/`.
3.  **Enable Developer Mode**: Toggle the switch in the top-right corner.
4.  **Load Extension**: Click "Load unpacked" and select the extension folder (`YTadblock`).
5.  **Done!** The extension will appear in your toolbar.

---

## 🛠️ How It Works

The extension operates with a two-pronged, highly efficient approach:

### 1. Video Player Ad Handling (Interval-Based)
The core logic for video ads runs on a fast, lightweight interval check (500ms). This check is solely focused on the video player element to:
- Detect ad indicators (player classes, skip buttons, ad badges).
- Save the user's current video state (volume, speed).
- Execute the ad handling priority: **Skip Button > Fast Forward > Acceleration**.
- Restore the user's video state once the ad is gone.

### 2. Page Content Cleanup (Event-Based)
For sponsored content and anti-adblock popups, the extension uses a **MutationObserver**. This is a highly efficient, native browser API that watches the page for new elements being added.
- When YouTube attempts to inject a sponsored post or an anti-adblock warning, the observer instantly detects it.
- The element is removed immediately, preventing it from ever being rendered or consuming resources.
- This approach is significantly more performant than constantly scanning the entire page.

---

## 📊 Performance & Compliance

| Metric | Value | Note |
| :--- | :--- | :--- |
| **Architecture** | Manifest V3 | Fully compliant with modern Chrome standards. |
| **Resource Usage** | Extremely Low | Optimized code and MutationObserver architecture minimize CPU and memory footprint. |
| **Permissions** | Minimal | Only `storage` and `host_permissions` for `*.youtube.com`. |
| **Privacy** | Zero Tracking | No analytics, no external calls, all processing is local. |

### Permissions Explained

```json
{
  "permissions": [
    "storage"  // Required to store your local statistics (ads blocked, etc.)
  ],
  "host_permissions": [
    "*://*.youtube.com/*"  // Required to access YouTube pages to block ads
  ]
}
```
**No other permissions are requested.**

---

## 📜 Changelog Summary

| Version | Date | Key Changes |
| :--- | :--- | :--- |
| **v1.5.1** | 2025-11-09 | **Major Refactor:** Implemented MutationObserver for sponsored/popup removal (massive performance gain). Fixed critical ad-skip state restoration bug. Popup UI simplified. Manifest V3 finalized. |
| **v1.5.0** | 2025-11-08 | Production-ready release. Consolidated main loop (30% CPU reduction). Improved error handling and code quality. |
| **v1.3.2** | 2025-11-08 | Improved ad detection and memory cleanup. Added settings menu observer. |

[See CHANGELOG.md for complete history]

---

## 🤝 Contributing & Support

Contributions, bug reports, and feature suggestions are welcome! Please open an issue or a pull request on the GitHub repository.

**When reporting an issue, please include:**
1. Extension version (v1.5.1)
2. Chrome version
3. Operating system
4. Steps to reproduce the issue
5. Any relevant console errors (F12)

---

## 📜 License

This project is licensed under the **MIT License**.

---

**Built with ❤️ for an ad-free YouTube experience.**
**No corporate sponsorships. No data collection. Just clean code that works.**
