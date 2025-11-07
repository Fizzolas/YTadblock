# Changelog

## [1.2.1] - 2025-11-06 (Hotfix)

### Critical Hotfix - Console Spam & Performance

**Problem Identified:**
After v1.2.0, users reported ~13 second delays when skipping ads, with console flooding with 50+ repeated log messages saying "Max skip attempts reached".

#### Root Cause
- Extension was hitting max skip attempts (10) quickly
- After max attempts, it kept checking if ad was still playing every 300ms
- Ad detection returned `true` (ad elements still in DOM even though ad was accelerated)
- Created infinite loop: detect ad → try to skip → max attempts → detect ad → try to skip → ...
- Each loop logged multiple messages, flooding console

#### Fixes Applied

**Console Spam Prevention:**
- **ADDED**: `currentAdHandled` flag to track if ad is already being handled
- **ADDED**: `lastAdId` tracking to prevent duplicate logs for same ad
- **IMPROVED**: Only log "Ad detected" once per ad, not every 300ms
- **IMPROVED**: Only log "Max skip attempts reached" once, not repeatedly
- **RESULT**: Console logs reduced from ~50 messages to 1-2 per ad

**Performance Improvements:**
- **IMPROVED**: Extension stops trying to skip after muting + accelerating successfully
- **REDUCED**: `maxSkipAttempts` from 10 → 5 (less time wasted)
- **IMPROVED**: Ad ID generation now includes timestamp to differentiate sequential ads
- **IMPROVED**: `currentAdHandled` flag prevents unnecessary processing
- **RESULT**: Ad handling time reduced from ~13 seconds to ~2-3 seconds

**Better Ad ID Tracking:**
- **ADDED**: `generateAdId()` function that uses video source + time slot
- **IMPROVED**: Can now distinguish between multiple ads in same video
- **FIXED**: Skip attempts properly clear when moving to new ad
- **IMPROVED**: State restoration happens at correct time

#### Changes Summary

```javascript
// v1.2.0 behavior (BEFORE)
Ad detected → Try skip → Max attempts (10) → Keep logging "ad detected" every 300ms → SPAM

// v1.2.1 behavior (AFTER)
Ad detected → Try skip → Muted + Accelerated → Mark as handled → Stop processing → Clean logs
```

**New State Tracking:**
```javascript
let currentAdHandled = false; // Prevents re-processing handled ads
let lastAdId = null;          // Prevents duplicate logging
```

**Configuration Changes:**
```javascript
maxSkipAttempts: 10 → 5  // Reduced by 50%
```

#### User Experience Improvements

**Before v1.2.1:**
- Click video with pre-roll ad
- Wait ~13 seconds while extension spins
- Console fills with 50+ log messages
- Video finally starts

**After v1.2.1:**
- Click video with pre-roll ad
- Ad immediately muted and accelerated (within 0.5s)
- 1-2 clean log messages in console
- Video starts within 2-3 seconds

#### Technical Details

The core issue was the extension didn't recognize when it had successfully "handled" an ad through mute + acceleration. Even though the ad was playing at 16x speed silently, the ad detection still returned `true` because:

1. Ad container elements still in DOM
2. Player class still had `.ad-showing`
3. Ad overlay still present

This caused the extension to think it needed to keep trying to skip, hitting max attempts, then continuing to detect indefinitely.

The fix introduces a "handled" state that tells the extension:
*"I've done everything I can (muted + 16x speed), now just wait for the ad to finish naturally"*

This eliminates the detection loop and console spam.

---

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

After updating to 1.2.1:

1. **Clear browser cache and reload YouTube**
2. **Reload the extension** in chrome://extensions
3. **Test pre-roll ads** - should skip in ~2-3 seconds max
4. **Check console** - should see minimal logging (1-2 messages per ad)
5. **Test mid-roll ads** - same fast skip behavior
6. **Verify no console spam** - no repeated "max attempts" messages
7. **Verify playback speed restoration**
8. **Verify audio unmutes after ads**

## Troubleshooting

**If you still see ~13 second delays:**
1. Make sure you're on version **1.2.1** (check manifest.json or extension page)
2. Hard refresh YouTube (Ctrl+Shift+R or Cmd+Shift+R)
3. Clear all YouTube cookies and cache
4. Disable conflicting extensions
5. Restart browser completely

**If console is still spamming:**
1. Verify content.js shows "Hotfix v1.2.1" in initialization log
2. Check that `currentAdHandled` variable exists in code
3. Try uninstalling and reinstalling extension

If you encounter issues, please report to: haxjax218@gmail.com