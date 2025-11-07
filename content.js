// YouTube Ad Blocker Pro - Enhanced Content Script
// Robust ad blocking with sponsored content removal and anti-adblock popup removal
// SSAI/Unskippable AD aggressive skip fix - November 2025 (v1.2.2-dev)
(function() {
  'use strict';
  // State tracking to prevent auto-resume after user pause
  let userPausedVideo = false;
  let lastUserInteractionTime = 0;
  let adBlockerActive = true;
  let skipAttempts = new Map();
  let lastVideoUrl = '';
  let lastAdCheckTime = 0;
  let videoNormalSpeed = 1;
  let videoWasMuted = false;
  let currentAdHandled = false;
  let lastAdId = null;
  let adsBlockedThisSession = 0;
  let sponsoredBlockedThisSession = 0;
  let popupsRemovedThisSession = 0;
  // --- SSAI Aggressive Skipping additions ---
  let adStartTimestamp = null;
  let aggressiveSkipInterval = null;
  const SSAI_LONG_AD_THRESHOLD = 90; // seconds
  const SSAI_FORCE_RELOAD_THRESHOLD = 30; // seconds stuck
  const AGGRESSIVE_SKIP_INTERVAL = 2000; // ms
  const CONFIG = {
    checkInterval: 300,
    skipRetryDelay: 100,
    maxSkipAttempts: 5,
    userInteractionTimeout: 2000,
    adVerificationDelay: 50,
    sponsoredCheckInterval: 1000
  };
  const SELECTORS = { ... /* unchanged, omitted for brevity */ };

  // ... (unchanged functions)
  // Core modified skipAd:
  function skipAd() {
    const video = document.querySelector(SELECTORS.video);
    if (!video) return false;
    if (!isAdPlaying()) {
      restoreVideoState(video);
      currentAdHandled = false;
      lastAdId = null;
      if (aggressiveSkipInterval) clearInterval(aggressiveSkipInterval);
      aggressiveSkipInterval = null;
      adStartTimestamp = null;
      return false;
    }
    let skipped = false;
    const adId = generateAdId(video);
    let isNewAd = false;
    if (adId !== lastAdId) {
      lastAdId = adId;
      currentAdHandled = false;
      skipAttempts.set(adId, 0);
      isNewAd = true;
      videoNormalSpeed = video.playbackRate;
      videoWasMuted = video.muted;
      // --- SSAI ---
      adStartTimestamp = Date.now();
      if (aggressiveSkipInterval) clearInterval(aggressiveSkipInterval);
      aggressiveSkipInterval = setInterval(() => {
        tryAggressiveFastForwardSSAI(video, adId);
      }, AGGRESSIVE_SKIP_INTERVAL);
    }
    // ... rest same as before ...
    // Aggressive fast-forward (called via interval)
    function tryAggressiveFastForwardSSAI(video, adId) {
      if (!isAdPlaying()) {
        if (aggressiveSkipInterval) clearInterval(aggressiveSkipInterval);
        adStartTimestamp = null; return;
      }
      let stuckSeconds = Math.floor((Date.now() - adStartTimestamp) / 1000);
      if (video.duration > SSAI_LONG_AD_THRESHOLD && stuckSeconds > 2) {
        let origTime = video.currentTime;
        try {
          video.currentTime = video.duration - 0.2;
          if (Math.abs(video.currentTime - origTime) < 1) {
            // Hard SSAI not seekable
            if (stuckSeconds > SSAI_FORCE_RELOAD_THRESHOLD && stuckSeconds % 10 === 0) {
              log('SSAI ad still playing after 30s - attempting player reload.');
              location.reload();
            }
            if (stuckSeconds > 60) {
              log('WARNING: SSAI ad unskippable for over 1 minute');
            }
          } else {
            log(`Aggressive SSAI skip from ${origTime.toFixed(1)}s to ${video.currentTime.toFixed(1)}s`);
          }
        } catch(e) {
          log('Error in SSAI skip', e);
        }
      }
    }
    // ...
    // When ad state ends, cleanup interval
    if (!isAdPlaying() && aggressiveSkipInterval) {
      clearInterval(aggressiveSkipInterval);
      aggressiveSkipInterval = null;
      adStartTimestamp = null;
      log('SSAI skip: cleaned up interval at ad end.');
    }
  }
  // ...rest of code unchanged...
})();
