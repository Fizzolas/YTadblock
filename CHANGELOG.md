# Changelog

## [1.2.0] - 2025-11-06

### Critical Bug Fixes - Ad Detection & Skipping

#### Ad Detection Improvements
- **FIXED**: Ad detection was too conservative - reduced threshold from 2+ indicators to 1+ indicator
  - Previous: Required multiple positive checks before confirming ad
  - Now: Single strong indicator is sufficient (reduces false negatives)
- **ADDED**: Additional ad detection selectors for 2024-2025 YouTube updates
  - `.ytp-ad-simple-ad-badge`
  - `.ytp-ad-player-overlay-instream-info`
  - `.ytp-ad-info-panel-container`
  - `.ytp-ad-message-container`
  - `button.ytp-ad-skip-button-modern`
- **IMPROVED**: Video source URL analysis now more lenient
  - Previous: Required 2+ ad indicators in URL
  - Now: Only 1 indicator needed (catches more ads)
  - Added detection for `ad_pod` and `cmo=` URL parameters
- **ADDED**: Text-based ad detection for "skip ad" and "skip in" messages
- **ADDED**: Video element classList checking for ad markers

#### Skip Button Detection
- **FIXED**: Outdated skip button selectors
- **ADDED**: Multiple new skip button selectors:
  - `.ytp-ad-skip-button-container`
  - `button.ytp-ad-skip-button-modern`
- **IMPROVED**: Better visibility checking before clicking skip button
  - Now checks `getBoundingClientRect()` and `computedStyle.display`
  - Prevents clicking invisible/hidden buttons

#### Video State Restoration
- **ADDED**: Playback speed restoration after ads
  - Tracks original playback speed before muting/accelerating
  - Automatically restores to user's preferred speed
- **ADDED**: Mute state restoration
  - Tracks whether video was originally muted
  - Prevents videos from staying muted after ad ends
- **IMPROVED**: State restoration triggers after successful skip

#### Performance Improvements
- **IMPROVED**: Reduced verification delay from 200ms to 50ms
  - Faster ad skip response time
  - Less time spent watching ads
- **IMPROVED**: Check interval reduced from 500ms to 300ms
  - More frequent ad detection checks
  - Catches ads earlier in their lifecycle
- **IMPROVED**: Skip retry delay reduced from 150ms to 100ms
  - Faster retry attempts when skip fails

#### Mid-Roll Ad Handling
- **IMPROVED**: Better handling of ads that appear during video playback
- **IMPROVED**: Race condition fixes in skip attempt tracking
- **ADDED**: Ad container detection via MutationObserver
  - Instantly detects when ad elements are added to DOM
  - Triggers skip sequence immediately

### Sponsored Content Improvements

#### New Selectors (2024-2025)
- **ADDED**: `ytd-promoted-sparkles-text-search-renderer`
- **ADDED**: `ytd-in-feed-ad-layout-renderer`
- **ADDED**: `ytd-compact-promoted-item-renderer`
- **ADDED**: `ytd-statement-banner-renderer`
- **ADDED**: `ytd-action-companion-ad-renderer`
- **ADDED**: `ytd-grid-video-renderer` to sponsored video detection

#### Detection Logic
- **IMPROVED**: Metadata-based sponsored content detection
  - Checks `ytd-video-meta-block` and `#metadata-line` elements
  - Detects "Sponsored" and "Paid Promotion" text
- **IMPROVED**: Advertisement text detection in aria-labels
  - Now catches "advertisement" in addition to "ad"
- **ADDED**: `overflow: hidden` to hidden sponsored content
  - Ensures content is fully collapsed

### Anti-Adblock Popup Improvements

#### New Selectors (2025)
- **ADDED**: `tp-yt-paper-dialog[aria-labelledby]` for dialogs
- **ADDED**: `yt-mealbar-promo-renderer` for promo overlays
- **ADDED**: `.scrim` for modal backdrops
- **ADDED**: `[class*="adblock"]` and `[class*="ad-block"]` for generic detection

#### Detection Logic
- **IMPROVED**: More thorough text detection in popups
  - Added "turn off" and "allow ads" phrases
- **ADDED**: Adblock-related class name detection
  - Catches elements with "adblock" in any class name
- **ADDED**: Body overflow restoration
  - Fixes scroll lock after popup removal

### Configuration Updates

```javascript
// Previous values → New values
checkInterval: 500 → 300  // 40% faster
skipRetryDelay: 150 → 100  // 33% faster
maxSkipAttempts: 8 → 10  // More persistent
adVerificationDelay: 200 → 50  // 75% faster
```

### Code Quality Improvements
- **ADDED**: Comprehensive inline documentation for all changes
- **IMPROVED**: Error handling in state restoration
- **IMPROVED**: Logging messages for debugging
- **ADDED**: "November 2025" version markers in logs

### Known Limitations

#### Server-Side Ad Insertion (SSAI)
YouTube began testing SSAI in March 2025, which stitches ads directly into video streams server-side. This technique makes ads part of the video file itself before delivery, making them nearly impossible to block without:
- Deep packet inspection
- Machine learning-based ad detection
- Time-based ad prediction

Current workarounds:
1. Speed up ads to 16x (most effective)
2. Mute ads automatically
3. Fast-forward when possible

**Note**: SSAI is still experimental and not widely deployed as of November 2025.

## [1.1.0] - 2025-11-06
- Initial release
- Basic ad detection and skipping
- Sponsored content removal
- Anti-adblock popup removal

---

## Testing Recommendations

After updating to 1.2.0:

1. **Clear browser cache and reload YouTube**
2. **Test pre-roll ads** (ads before video starts)
3. **Test mid-roll ads** (ads during video playback)
4. **Test skip button clicking**
5. **Verify playback speed restoration**
6. **Verify audio unmutes after ads**
7. **Check homepage for sponsored content removal**
8. **Test anti-adblock popup removal**

## Troubleshooting

If ads still slip through:

1. **Check browser console** for `[YT AdBlock]` log messages
2. **Verify extension is active** via popup
3. **Disable conflicting extensions** (other ad blockers)
4. **Clear YouTube cookies**
5. **Restart browser** after update

If you encounter issues, please report to: haxjax218@gmail.com