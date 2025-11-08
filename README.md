# YouTube Ad Blocker Pro

**Fast, lightweight Chrome extension that blocks YouTube ads and enhances your viewing experience.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.5.0-orange)](https://github.com/Fizzolas/YTadblock)

---

## ✨ Features

### 🎬 Video Ad Blocking

✅ **Automatic Ad Skipping** - Clicks skip buttons when available

✅ **Video Acceleration** - Speeds through non-skippable ads (8x speed)

✅ **Smart Detection** - Identifies ads without interfering with regular videos

✅ **State Preservation** - Restores your playback speed and volume after ads

✅ **All Ad Types** - Handles pre-roll, mid-roll, overlay, and banner ads

### 📋 Sponsored Content Removal

✅ **Homepage Cleanup** - Removes promoted videos from your feed

✅ **Search Results** - Hides sponsored content from search

✅ **Feed Ads** - Clears promoted content from subscriptions page

✅ **Banner Removal** - Blocks promotional banners and pop-ups

### 🚯 User Experience

✅ **Zero Configuration** - Works immediately after installation

✅ **Toggle Control** - Enable/disable with one click

✅ **Statistics Tracking** - See how many ads you've blocked

✅ **Session Stats** - Track blocking per page visit

✅ **Minimal UI** - Clean, unobtrusive popup interface

✅ **Respects User Control** - Never interferes with manual actions

### 🔒 Privacy First

✅ **No Data Collection** - Zero tracking, zero analytics

✅ **Local Processing** - Everything runs in your browser

✅ **No External Servers** - No data leaves your device

✅ **Minimal Permissions** - Only requests what's necessary

✅ **Open Source** - Full transparency, audit the code yourself

---

## 📦 Installation

### Method 1: Chrome Web Store (Recommended)

*Coming soon after review approval*

### Method 2: Manual Installation (Developer Mode)

1. **Download** this repository:
   - Click the green "Code" button above
   - Select "Download ZIP"
   - Extract the ZIP file to a folder

2. **Open Chrome Extensions**:
   - Navigate to `chrome://extensions/`
   - Or click Menu → More Tools → Extensions

3. **Enable Developer Mode**:
   - Toggle the switch in the top-right corner

4. **Load Extension**:
   - Click "Load unpacked"
   - Select the extracted folder
   - Extension will appear in your toolbar

5. **Done!** 
   - Visit YouTube and the extension will activate automatically
   - Click the extension icon to view statistics

---

## 🛠️ How to Use

### Basic Usage

1. **Install the extension** (see above)
2. **Visit YouTube** - Extension activates automatically
3. **Watch videos** - Ads are blocked/skipped automatically
4. **View stats** - Click extension icon to see statistics

### Toggle On/Off

1. Click the extension icon in your toolbar
2. Click the "Disable" or "Enable" button
3. Extension will activate/deactivate immediately

### View Statistics

The popup shows:
- **Video Ads**: Total ads blocked since installation
- **Sponsored**: Sponsored content removed
- **Popups**: Anti-adblock popups removed
- **Days**: Days since installation
- **Session Stats**: Ads blocked on current page

---

## 🔧 How It Works

### Ad Detection

The extension uses multiple detection methods:

1. **DOM Analysis** - Checks for ad-specific elements and classes
2. **Visual Indicators** - Detects skip buttons and ad badges
3. **Player State** - Monitors player classes and attributes
4. **Video Duration** - Short videos with specific patterns

**Safety Features**:
- Requires multiple indicators before confirming ad
- Respects user interactions (won't override manual actions)
- Waits for user activity to settle before processing

### Ad Handling Priority

1. **Skip Button** - Clicks visible skip buttons (fastest)
2. **Fast Forward** - Seeks to end of ad when possible
3. **Acceleration** - Speeds up playback to 8x (last resort)

### Sponsored Content

Removes sponsored elements from:
- Homepage video feed
- Search results
- Subscriptions page
- Sidebar recommendations

Method: Identifies and hides promotional content using element selectors.

---

## 📊 Performance

### Resource Usage

| Metric | Value |
|--------|-------|
| Memory | ~4 MB |
| CPU (avg) | <1% |
| Detection speed | 500-600ms |
| Extension size | ~30 KB |

### Browser Compatibility

- ✅ **Chrome 88+** (Manifest V3 required)
- ✅ **Edge 88+** (Chromium-based)
- ✅ **Brave** (Chromium-based)
- ❌ **Firefox** (Different manifest version)
- ❌ **Safari** (Different extension system)

---

## 🔒 Privacy & Security

### What We DO

✅ Block ads locally in your browser

✅ Store statistics locally (Chrome storage API)

✅ Process everything client-side

✅ Use minimal required permissions

### What We DON'T Do

❌ Collect any personal data

❌ Send data to external servers

❌ Track your browsing history

❌ Sell or share your information

❌ Use analytics or telemetry

### Permissions Explained

```json
{
  "permissions": [
    "storage"  // Store statistics locally in your browser
  ],
  "host_permissions": [
    "*://*.youtube.com/*"  // Access YouTube pages to block ads
  ]
}
```

**That's it.** No tracking, no analytics, no data collection.

---

## 🛠️ Troubleshooting

### Ads Still Showing?

1. **Check extension is enabled**:
   - Go to `chrome://extensions/`
   - Ensure toggle is ON for "YouTube Ad Blocker Pro"

2. **Verify you're on YouTube**:
   - Extension only works on `*.youtube.com` domains

3. **Clear cache and reload**:
   - Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
   - Select "Cached images and files"
   - Click "Clear data"
   - Hard refresh YouTube: `Ctrl+Shift+R` or `Cmd+Shift+R`

4. **Reload extension**:
   - Go to `chrome://extensions/`
   - Click the refresh icon on the extension card
   - Reload YouTube page

5. **Check for conflicts**:
   - Disable other YouTube extensions temporarily
   - Test if ads are blocked
   - Re-enable extensions one by one to identify conflicts

### Extension Not Working at All?

1. **Check Chrome version**: Need Chrome 88 or higher
2. **Try incognito mode**: Enable extension in incognito first
3. **Reinstall extension**: Uninstall and reinstall fresh copy
4. **Check console**: Open DevTools (F12), look for errors

### Statistics Not Updating?

1. **Refresh the popup**: Close and reopen extension popup
2. **Reload the page**: Refresh YouTube page
3. **Check storage**: Go to `chrome://extensions/` → Extension details → Storage

---

## 📝 Technical Details

### File Structure

```
YTadblock/
├── manifest.json       # Extension configuration (Manifest V3)
├── content.js         # Main ad-blocking logic
├── background.js      # Service worker for stats
├── popup.html         # Extension popup UI
├── popup.js           # Popup functionality
├── styles.css         # Popup styling
├── Icons/
│   ├── icon16.png     # 16x16 icon
│   ├── icon48.png     # 48x48 icon
│   └── icon128.png    # 128x128 icon
├── README.md          # This file
└── CHANGELOG.md       # Version history
```

### Manifest V3 Compliance

✅ Service worker background script

✅ Minimal permissions

✅ Content script at `document_start`

✅ No `eval()` or inline scripts

✅ No remote code execution

### Dependencies

**None.** Pure JavaScript, no external libraries.

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add AmazingFeature'`)
6. Push to branch (`git push origin feature/AmazingFeature`)
7. Open a Pull Request

**Before submitting**:
- Test with multiple ad types
- Ensure no console errors
- Verify stats update correctly
- Check that user controls still work

---

## 💬 Support

**Need help?**

- **Email**: haxjax218@gmail.com
- **GitHub Issues**: [Create an issue](https://github.com/Fizzolas/YTadblock/issues)

**When reporting issues, please include**:
1. Extension version (check manifest.json)
2. Chrome version (check `chrome://version`)
3. Operating system
4. Description of issue
5. Steps to reproduce
6. Console errors (if any)

**Response time**: Usually within 24-48 hours

---

## 📜 Changelog

### v1.5.0 (2025-11-08) - Current

**Bug Fixes**:
- Fixed state.userChangedSpeed not resetting on video change
- Removed redundant ad cooldown period
- Fixed version number consistency

**Optimizations**:
- Consolidated intervals into single main loop (30% CPU reduction)
- Optimized element visibility checks (20% faster detection)
- Reduced popup update frequency (40% less overhead)
- Background worker keepalive optimized

**Improvements**:
- Added comprehensive JSDoc comments
- Improved error handling throughout
- Better Chrome Web Store compliance
- Enhanced manifest.json metadata

[See CHANGELOG.md for complete history]

---

## 📜 License

**MIT License**

Copyright (c) 2025 Fizzolas

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## ⚠️ Disclaimer

This extension is provided for personal use only. By using this extension, you acknowledge that:

- You are responsible for your own use of the software
- The developers are not liable for any consequences of use
- YouTube's Terms of Service may prohibit ad blocking
- This extension may stop working if YouTube makes significant changes
- No warranty or guarantee of functionality is provided

**Use at your own discretion.**

---

## 👏 Acknowledgments

**Inspired by**:
- Open-source ad-blocking community
- Chrome extension developer community
- User feedback and suggestions

**Special thanks to**:
- All users who reported issues
- Contributors who suggested improvements
- The broader ad-blocking research community

---

## ⭐ Star This Repository

If this extension helps you enjoy an uninterrupted YouTube experience, please star the repository! It helps others find it.

---

**Built with ❤️ for an ad-free YouTube experience.**

**No corporate sponsorships. No data collection. Just clean code that works.**