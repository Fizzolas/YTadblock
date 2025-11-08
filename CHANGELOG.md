# Changelog

## [1.3.1] - 2025-11-08 (CRITICAL HOTFIX)

### 🚨 Critical Bugs Fixed

**User reported issues:**
1. ❌ Skip buttons being ignored
2. ❌ Regular videos playing at 16x speed (should only be ads!)
3. ❌ Unable to pause regular videos
4. ❌ Extension overriding user actions

### Root Cause

The v1.3.0 ad detection was **too aggressive** and had **false positives**, treating regular YouTube videos as ads. This caused:
- Normal videos to be accelerated to 16x speed
- User pause/play actions to be ignored
- Skip buttons to be clicked even when not on ads
- Playback controls to malfunction

### Fixes Applied

#### 1. **Stricter Ad Detection (2+ Strong Indicators Required)**

**Before (v1.3.0):**
- Required only 1 indicator
- Treated any video with ad-like elements as an ad
- False positive rate: HIGH

**After (v1.3.1):**
```javascript
// Require 2+ STRONG indicators to confirm ad
const isAd = strongIndicators >= 2;

// Strong indicators:
- Ad container visible (+1)
- .ad-showing class on player (+1)
- Skip button visible (+2)
- Ad badge visible (+1)
```

#### 2. **User Interaction Tracking (NEVER Override User)**

**New System:**
- Tracks mouse clicks on play/pause button
- Tracks keyboard shortcuts (Space, K for play/pause)
- Tracks speed changes (Shift+< / Shift+>)
- Tracks settings menu interactions

**Protection Logic:**
```javascript
// If user interacted within last 3 seconds, DON'T interfere
if (userRecentlyInteracted()) {
  return false; // Skip ad detection entirely
}

// If user paused video, respect it
if (video.paused && state.userPausedVideo) {
  return false; // Not an ad
}

// If user changed speed, respect it
if (state.userChangedSpeed && video.playbackRate !== 16) {
  return false; // Not an ad
}
```

#### 3. **Skip Button Priority (Click First, Accelerate Last)**

**New Priority Order:**
```javascript
1. Click skip button (if visible) - PRIORITY
2. Fast-forward to end (safe, no speed change)
3. Accelerate to 10x (only after 2 failed attempts)
```

**Before:** Immediately accelerated to 16x

**After:** Only accelerates after trying skip button and fast-forward first

#### 4. **Slower, Safer Checks**

**Timing Changes:**
```javascript
Before (v1.3.0) → After (v1.3.1):
checkInterval: 250ms → 500ms (slower to reduce false positives)
skipRetryDelay: 80ms → 200ms (more time between attempts)
maxSkipAttempts: 5 → 3 (stop sooner, less interference)
```

#### 5. **5-Second Grace Period After Ads**

**New Safety Feature:**
```javascript
// After ad ends, wait 5 seconds before detecting again
if (state.lastAdEndTime && (Date.now() - state.lastAdEndTime) < 5000) {
  return false; // Don't detect ads yet
}
```

This prevents the extension from mistakenly detecting the regular video as an ad immediately after an ad ends.

#### 6. **Speed Reduction (16x → 10x)**

**Change:**
- v1.3.0: Accelerated ads to 16x speed
- v1.3.1: Accelerated ads to 10x speed (more stable)

**Reason:** 16x was too aggressive and could cause video player instability. 10x is still fast enough (90s ad → 9s) but more reliable.

#### 7. **Immediate Restoration on Disable**

**New Feature:**
```javascript
if (!state.isActive && state.processingAd) {
  // If user disables extension, immediately restore video
  video.playbackRate = state.originalPlaybackRate;
  video.muted = state.originalMuted;
  state.processingAd = false;
}
```

### Testing Performed

**User Actions Tested (All Should Work Normally):**
- ✅ Clicking play/pause button
- ✅ Pressing Space or K to pause
- ✅ Changing playback speed via settings
- ✅ Using keyboard shortcuts (Shift+< / Shift+>)
- ✅ Clicking on video to pause
- ✅ Seeking through video timeline

**Ad Scenarios Tested:**
- ✅ Pre-roll skippable ads (skip button works)
- ✅ Pre-roll non-skippable ads (accelerated after 2 attempts)
- ✅ Mid-roll ads (detected and handled)
- ✅ Multiple ads in sequence (each handled separately)

**Edge Cases Tested:**
- ✅ User pauses during ad (pause respected)
- ✅ User changes speed during ad (change respected)
- ✅ User clicks skip button manually (extension doesn't interfere)
- ✅ Extension disabled mid-ad (video immediately restored)
- ✅ Video ends right after ad (grace period prevents false positive)

### Configuration Changes

```javascript
CONFIG (v1.3.0 → v1.3.1):
{
  checkInterval:          250  → 500   (slower, safer)
  skipRetryDelay:         80   → 200   (more patient)
  maxSkipAttempts:        5    → 3     (less aggressive)
  sponsoredCheckInterval: 1500 → 2000  (slower)
  popupCheckInterval:     800  → 1000  (slower)
  
  // Removed aggressive SSAI features for stability:
  ssaiCheckInterval:      REMOVED
  ssaiForceReloadTime:    REMOVED
}

Ad Acceleration Speed:
  v1.3.0: 16x
  v1.3.1: 10x (more stable)
```

### User Experience Changes

**Before v1.3.1 (BROKEN):**
- Regular videos sometimes played at 16x
- Couldn't pause videos
- Skip buttons ignored
- Frustrating, broken experience

**After v1.3.1 (FIXED):**
- Regular videos always play normally
- Can pause/play anytime
- Skip buttons work as expected
- Extension stays invisible until ads appear

### Known Trade-offs

**Slower ad detection:**
- v1.3.0: Detected ads in ~250ms
- v1.3.1: Detects ads in ~500ms
- **Trade-off accepted:** Reliability > Speed

**Less aggressive SSAI handling:**
- v1.3.0: Aggressive SSAI detection and player reload
- v1.3.1: Simpler approach - accelerate to 10x and wait
- **Trade-off accepted:** Stability > SSAI edge cases

### Migration Notes

**Updating from v1.3.0:**
1. Extension auto-updates to v1.3.1
2. Clear browser cache: `Ctrl+Shift+Delete`
3. Hard refresh YouTube: `Ctrl+Shift+R`
4. Reload extension in `chrome://extensions`
5. Test by playing a regular video (should work normally)
6. Test by playing a video with ads (ads should still be handled)

**If issues persist:**
1. Uninstall extension completely
2. Restart Chrome
3. Reinstall extension
4. Test again

### Apology & Commitment

I sincerely apologize for the v1.3.0 bugs that interfered with normal YouTube watching. This was unacceptable. 

**Going forward:**
- More extensive testing before releases
- Conservative ad detection (better safe than sorry)
- User actions ALWAYS take priority
- Stability over features

---

## [1.3.0] - 2025-11-08 (Major Update - ROLLED BACK)

**Note: v1.3.0 had critical bugs and was replaced by v1.3.1 hotfix.**

### Issues in v1.3.0
- Too aggressive ad detection (false positives)
- Interfered with user actions
- Skip buttons ignored
- Regular videos played at 16x
- Unable to pause videos

**See v1.3.1 above for fixes.**

### What Worked in v1.3.0
- SSAI detection logic (too aggressive but concept sound)
- 2025 selector updates (kept in v1.3.1)
- Sponsored content removal (kept in v1.3.1)
- Anti-adblock popup removal (kept in v1.3.1)

### What Was Removed in v1.3.1
- Aggressive SSAI player reload
- 250ms check intervals (too fast)
- 16x acceleration (too unstable)
- 1-indicator ad detection (too loose)

---

## [1.2.1] - 2025-11-06 (Hotfix)

### Critical Hotfix - Console Spam & Performance

**Problem Identified:**
After v1.2.0, users reported ~13 second delays when skipping ads, with console flooding with 50+ repeated log messages.

#### Root Cause
- Extension hitting max skip attempts quickly
- After max attempts, kept checking if ad was still playing every 300ms
- Created infinite loop with console spam

#### Fixes Applied

**Console Spam Prevention:**
- **ADDED**: `currentAdHandled` flag to track if ad is already being handled
- **ADDED**: `lastAdId` tracking to prevent duplicate logs
- **IMPROVED**: Only log "Ad detected" once per ad
- **RESULT**: Console logs reduced from ~50 to 1-2 per ad

**Performance Improvements:**
- **IMPROVED**: Extension stops trying after muting + accelerating
- **REDUCED**: `maxSkipAttempts` from 10 → 5
- **RESULT**: Ad handling time reduced from ~13s to ~2-3s

---

## [1.2.0] - 2025-11-06

### Critical Bug Fixes - Ad Detection & Skipping

#### Ad Detection Improvements
- **FIXED**: Ad detection threshold reduced from 2+ to 1+ indicator
- **ADDED**: Additional ad detection selectors for 2024-2025 YouTube
- **IMPROVED**: Video source URL analysis more lenient
- **ADDED**: Text-based ad detection

#### Skip Button Detection
- **FIXED**: Outdated skip button selectors
- **ADDED**: Multiple new skip button selectors
- **IMPROVED**: Better visibility checking

#### Video State Restoration
- **ADDED**: Playback speed restoration
- **ADDED**: Mute state restoration
- **IMPROVED**: State restoration timing

#### Performance Improvements
- **IMPROVED**: Verification delay: 200ms → 50ms
- **IMPROVED**: Check interval: 500ms → 300ms
- **IMPROVED**: Skip retry delay: 150ms → 100ms

---

## [1.1.0] - 2025-11-06
- Initial public release
- Basic ad detection and skipping
- Sponsored content removal
- Anti-adblock popup removal

---

## Version Roadmap

### v1.3.2 (Next - Planned)
- Further stability improvements based on user feedback
- Better SSAI detection without false positives
- Enhanced user action tracking
- More thorough testing

### v1.4.0 (Future)
- Machine learning ad detection (if feasible without false positives)
- Custom user preferences
- Advanced statistics dashboard

### v1.5.0 (Future)
- Multi-platform support (Firefox, Edge)
- Cloud sync for statistics
- Community-sourced selectors