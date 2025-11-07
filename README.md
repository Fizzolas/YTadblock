# YouTube Ad Blocker Pro - Enhanced Edition

A robust Chrome extension that blocks YouTube ads, removes sponsored content, auto-skips when possible, and removes anti-adblock enforcement popups.

## ✨ Features

### In-Video Ad Blocking
✅ **Complete Ad Blocking** - Blocks all types of in-video YouTube ads (pre-roll, mid-roll, overlay)

✅ **Smart Auto-Skip** - Automatically skips ads when skip button appears or fast-forwards to the end

✅ **Retry Logic** - Multiple skip attempts with verification to ensure ads don't slip through

✅ **Safety Checks** - **NEVER skips actual video content** - only targets verified advertisements

### Sponsored Content Removal
✅ **Homepage Ads** - Removes all sponsored videos from YouTube homepage

✅ **Feed Ads** - Hides promoted content in subscription feed and recommendations

✅ **Search Ads** - Removes sponsored results from search pages

✅ **Banner Ads** - Hides promotional banners throughout YouTube

### Anti-Adblock Protection
✅ **Popup Removal** - Automatically removes YouTube's anti-adblock enforcement popups

✅ **Smart Resume** - Resumes playback after popup removal (respects user pause)

✅ **Modal Blocking** - Removes overlay backdrops that pause videos

### User Experience
✅ **Clean UI** - Simple popup showing statistics and toggle control

✅ **Zero Interaction** - Works completely automatically in the background

✅ **Performance** - Lightweight with minimal CPU/memory usage

✅ **Privacy First** - No data collection, no external requests

## 🆕 What's New in v1.1.0

### Fixed: Video Skipping Bug
- **Enhanced ad verification** - Multiple checks confirm it's actually an ad before skipping
- **Video URL tracking** - Detects new videos to prevent false positives
- **Duration safety** - Only fast-forwards videos under 5 minutes (ad length)
- **Minimum 2 indicators** - Requires multiple positive signals to confirm ad
- **Verification delay** - 200ms pause to ensure accurate detection

### New: Sponsored Content Blocking
- Removes sponsored videos from homepage
- Hides promoted content in feeds
- Blocks search result ads
- Removes banner promotions
- Uses CSS hiding to prevent layout shift

### Improved: All Features
- Better anti-adblock popup detection with more selectors
- Enhanced user interaction tracking (click capture)
- Improved skip button detection with modern variants
- More robust MutationObserver for instant removal
- Better logging for debugging

## Installation

### For Development/Testing:

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. Add your icon files to the `icons/` folder (16x16, 48x48, 128x128)
6. Navigate to YouTube and enjoy ad-free viewing!

### For Chrome Web Store:

*Coming soon after review*

## How It Works

### Ad Detection System

The extension uses a **multi-layered verification system** to detect ads:

1. **DOM Class Checks** - Looks for `.ad-showing`, `.ad-interrupting`
2. **Element Detection** - Finds ad containers, overlays, skip buttons
3. **Text Analysis** - Searches for "Ad •", "Advertisement", duration displays
4. **URL Analysis** - Examines video source for ad-specific parameters (requires 2+ indicators)
5. **Video URL Tracking** - Monitors current video ID to distinguish ads from content
6. **Minimum Threshold** - **Requires 2+ positive signals** to confirm ad

### Skip Methods (In Priority Order)

1. **Click Skip Button** - Clicks skip button when available (most reliable)
2. **Fast-Forward** - Jumps to end of ad (only if duration < 5 minutes)
3. **Accelerate** - Mutes and speeds up to 16x (safest fallback)

### Sponsored Content Removal

Targets these elements:
- `ytd-ad-slot-renderer` - Main ad slots
- `ytd-promoted-sparkles-web-renderer` - Promoted sparkles
- `ytd-display-ad-renderer` - Display ads
- `ytd-compact-promoted-video-renderer` - Compact promoted videos
- `ytd-promoted-video-renderer` - Full promoted videos
- `ytd-banner-promo-renderer` - Banner promotions
- Elements with "sponsored" or "ad" in aria-label

### Safety Features

**Prevents False Positives:**
- Tracks current video URL to detect when actual content starts
- Requires multiple verification signals (2+ indicators)
- 200ms verification delay before skipping
- Duration check (ads are typically < 5 minutes)
- Never skips if verification fails

**User Intent Tracking:**
- Monitors pause/play events
- Tracks play button clicks
- Listens for keyboard shortcuts (Space, K)
- 2-second timeout for "recent" interactions
- Only auto-resumes after popup removal, never after user pause

## Technical Details

- **Manifest Version**: 3 (latest Chrome standard)
- **Permissions**: 
  - `storage` - For tracking statistics
  - `host_permissions` - Only for `*.youtube.com`
- **No unused permissions** - Only what's necessary for functionality
- **Content script runs at**: `document_start` for early ad blocking
- **Check intervals**:
  - In-video ads: 500ms
  - Sponsored content: 1000ms
  - MutationObserver: Real-time

## File Structure

```
.
├── manifest.json          # Extension configuration (v1.1.0)
├── content.js            # Enhanced ad blocking logic with safety checks
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

## Privacy

- **Zero data collection** - Nothing leaves your browser
- **No external requests** - All processing is local
- **No tracking** - Your viewing habits stay private
- **Minimal permissions** - Only storage and YouTube access
- **Open source** - Inspect the code yourself

## Performance

- Lightweight content script (~15KB)
- Efficient DOM queries with throttling
- MutationObserver for instant detection
- Minimal CPU usage
- No memory leaks

## Troubleshooting

### If ads aren't being skipped:
1. Check console for `[YT AdBlock]` messages
2. Look for "Ad detected" followed by verification logs
3. Ensure at least 2 detection signals are present
4. Report issue with console logs

### If videos are being skipped:
1. Check if multiple false positive indicators exist
2. Verify video URL is being tracked correctly
3. Report issue immediately - this should never happen

### If sponsored content still shows:
1. Refresh the page
2. Check console for "Removed X sponsored content items"
3. Look for new sponsored element types not in our list
4. Report with element details

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Test thoroughly (especially skip logic)
4. Submit pull request with detailed description

## Known Limitations

- Cannot block ads served as actual video files (rare)
- Sponsored content structure may change (we update regularly)
- Some regional ad formats may require additional selectors

## Support

If you encounter any issues:
1. Open Chrome DevTools Console while on YouTube
2. Look for messages starting with `[YT AdBlock]`
3. Check what detection signals are firing
4. Report any errors as GitHub issues with:
   - Console logs
   - Description of the issue
   - Whether it's in-video ad or sponsored content

## Changelog

### v1.1.0 (Current)
- **Fixed**: Video skipping bug - now only targets verified ads
- **Added**: Sponsored content removal (homepage, feed, search)
- **Improved**: Ad detection with multi-signal verification
- **Improved**: Skip logic with safety checks
- **Improved**: Anti-adblock popup removal
- **Improved**: User interaction tracking
- **Enhanced**: Logging and debugging

### v1.0.0
- Initial release
- Complete in-video ad blocking
- Auto-skip with retry logic
- Anti-adblock popup removal
- Smart video resume
- Statistics tracking

## License

MIT License - Feel free to use and modify as needed.

## Acknowledgments

Built for users who value an uninterrupted YouTube experience. No corporate sponsorships, no data harvesting, just clean code that works.
