# YouTube Ad Blocker Pro

A robust Chrome extension that blocks YouTube ads, auto-skips when possible, and removes anti-adblock enforcement popups.

## Features

✅ **Complete Ad Blocking** - Blocks all types of YouTube ads (pre-roll, mid-roll, banner)

✅ **Auto-Skip** - Automatically skips ads when skip button appears or fast-forwards to the end

✅ **Retry Logic** - Multiple skip attempts to ensure ads don't slip through

✅ **Anti-Adblock Removal** - Automatically removes YouTube's anti-adblock popups and resumes playback

✅ **Smart Resume** - Only resumes video after popup removal, not after user pause actions

✅ **Clean UI** - Simple popup showing statistics and toggle control

## Installation

### For Development/Testing:

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. Navigate to YouTube and enjoy ad-free viewing!

### For Chrome Web Store:

*Coming soon after review*

## How It Works

The extension uses multiple detection and blocking methods:

1. **Ad Detection**: Monitors DOM for ad-related classes, elements, and video source URLs
2. **Skip Methods**: 
   - Clicks skip buttons when available
   - Fast-forwards video to end of ad duration
   - Mutes and accelerates playback as fallback
3. **Retry System**: Attempts up to 10 times per ad to ensure successful skip
4. **Popup Blocking**: Uses MutationObserver to immediately detect and remove anti-adblock popups
5. **User Intent Tracking**: Prevents auto-resume when user manually pauses video

## Privacy

- No data collection
- No external requests
- All processing happens locally
- Only requests permission for `storage` and YouTube domains

## Technical Details

- **Manifest Version**: 3 (latest Chrome standard)
- **Permissions**: 
  - `storage` - For tracking statistics
  - `host_permissions` - Only for `*.youtube.com`
- **No unused permissions** - Only what's necessary
- **Content script runs at**: `document_start` for early ad blocking

## File Structure

```
.
├── manifest.json          # Extension configuration
├── content.js            # Main ad blocking logic
├── background.js         # Service worker for extension lifecycle
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality
├── styles.css            # Popup styling
├── icons/
│   ├── icon16.png       # Extension icon (16x16)
│   ├── icon48.png       # Extension icon (48x48)
│   └── icon128.png      # Extension icon (128x128)
└── README.md            # This file
```

## Building Icons

Create three PNG icons in the `icons/` directory:
- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

Recommended: Red play button with a slash through it on transparent background.

## Contributing

Contributions welcome! Please feel free to submit issues or pull requests.

## License

MIT License - Feel free to use and modify as needed.

## Support

If you encounter any issues:
1. Open Chrome DevTools Console while on YouTube
2. Look for messages starting with `[YT AdBlock]`
3. Report any errors as GitHub issues

## Changelog

### v1.0.0
- Initial release
- Complete ad blocking with multiple detection methods
- Auto-skip with retry logic
- Anti-adblock popup removal
- Smart video resume (respects user pause)
- Statistics tracking
- Toggle on/off functionality
