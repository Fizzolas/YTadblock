// YouTube Ad Blocker Pro - Content Script v2.0.0 (Aggressive Rewrite)

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION & STATE
  // ============================================
  const CONFIG = {
    adCheckInterval: 50, // Extremely fast check for video ads
    maxAdSpeed: 16,      // Aggressive playback speed
    debug: false
  };

  const state = {
    isActive: true,
    processingAd: false,
    originalPlaybackRate: 1.0,
    originalMuted: false,
    originalVolume: 1.0,
    lastAdTime: 0,
    sessionStats: { adsBlocked: 0, sponsoredBlocked: 0, popupsRemoved: 0 },
    initialized: false
  };

  // ============================================
  // SELECTORS (Consolidated and Comprehensive)
  // ============================================
  const AD_SELECTORS = {
    // Video Ad Indicators (for skipping logic)
    videoContainers: [
      '.video-ads.ytp-ad-module',
      'div.ad-showing',
      '.ytp-ad-player-overlay',
      '.ytp-ad-player-overlay-instream-info'
    ],
    // Skip/Close/Play Buttons (for clicking logic)
    skipButtons: [
      'button.ytp-ad-skip-button',
      'button.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button-container button',
      'button.ytp-skip-ad-button',
      '.ytp-ad-overlay-close-button',
      '.ytp-ad-text-overlay button',
      '.ytp-ad-action-interstitial-slot button',
      '.ytp-ad-action-interstitial-button',
      '.ytp-ad-action-interstitial-background button'
    ],
    // All Non-Video Ad Elements (for removal observer)
    removalElements: [
      // Sponsored Content & Banners
      'ytd-ad-slot-renderer',
      'ytd-display-ad-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-video-renderer',
      'ytd-compact-promoted-video-renderer',
      'ytd-banner-promo-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-statement-banner-renderer',
      'ytd-brand-video-shelf-renderer',
      'ytd-brand-video-singleton-renderer',
      'ytd-companion-slot-renderer',
      'ytd-carousel-ad-renderer',
      'ytd-ad-message-renderer',
      // Anti-Adblock Popups & Backdrops
      'tp-yt-paper-dialog',
      'ytd-enforcement-message-view-model',
      'yt-mealbar-promo-renderer',
      'ytd-popup-container',
      'tp-yt-paper-dialog.ytd-popup-container',
      'tp-yt-iron-overlay-backdrop',
      '#scrim'
    ]
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('%c[YT AdBlock Pro]', 'color: #27e057; font-weight: bold', ...args);
    }
  }

  function getVideo() {
    try {
      let video = document.querySelector('video.html5-main-video');
      if (!video) {
        video = document.querySelector('video[src*="googlevideo.com"]');
      }
      return video;
    } catch (e) {
      return null;
    }
  }

  function isElementVisible(el) {
    if (!el || !el.offsetParent) return false;
    try {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (e) {
      return false;
    }
  }

  function sendMessage(action, data = {}) {
    try {
      chrome.runtime.sendMessage({ action, ...data }).catch(() => {});
    } catch (e) {}
  }

  // ============================================
  // VIDEO AD LOGIC
  // ============================================

  function saveVideoState(video) {
    if (!video || state.processingAd) return;
    state.originalPlaybackRate = video.playbackRate || 1.0;
    state.originalMuted = video.muted || false;
    state.originalVolume = video.volume || 1.0;
    log('State saved:', { rate: state.originalPlaybackRate, muted: state.originalMuted });
  }

  function restoreVideoState(video) {
    if (!video || !state.processingAd) return;
    
    // Always restore speed and mute status
    video.playbackRate = state.originalPlaybackRate;
    video.muted = state.originalMuted;
    video.volume = state.originalVolume;
    
    state.processingAd = false;
    state.lastAdTime = Date.now();
    log('State restored');
  }

  function tryClickSkipButton() {
    try {
      for (const selector of AD_SELECTORS.skipButtons) {
        const btn = document.querySelector(selector);
        if (isElementVisible(btn)) {
          // Aggressive click methods
          btn.click();
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          log('Skip/Close/Play button clicked:', selector);
          return true;
        }
      }
    } catch (e) {
      log('Error clicking skip button:', e);
    }
    return false;
  }

  function tryFastForward(video) {
    if (video.duration > 0 && video.currentTime < video.duration) {
      // Seek to the end of the ad (within 0.3s)
      video.currentTime = video.duration - 0.3;
      log('Fast-forwarded ad to end.');
      return true;
    }
    return false;
  }

  function accelerateAd(video) {
    if (video.playbackRate !== CONFIG.maxAdSpeed) {
      video.playbackRate = CONFIG.maxAdSpeed;
      video.muted = true;
      log(`Accelerated ad to ${CONFIG.maxAdSpeed}x and muted.`);
    }
  }

  function handleVideoAd() {
    const video = getVideo();
    if (!video || !state.isActive) return;

    const player = document.querySelector('.html5-video-player');
    const isAdShowing = player?.classList.contains('ad-showing');
    
    // CRITICAL GUARD: Only proceed if YouTube explicitly marks the player as showing an ad.
    if (!isAdShowing) {
      // If we were processing an ad, restore state now.
      if (state.processingAd) {
        restoreVideoState(video);
      }
      // Ensure non-ad video is at normal speed/volume if it was previously accelerated
      if (video.playbackRate !== 1.0 || video.muted) {
        video.playbackRate = 1.0;
        video.muted = state.originalMuted; // Restore original mute state
      }
      return;
    }

    // New ad detected
    if (!state.processingAd) {
      saveVideoState(video);
      state.processingAd = true;
      state.sessionStats.adsBlocked++;
      sendMessage('adBlocked');
      log('New ad detected. Starting aggressive removal.');
    }

    // --- Aggressive Ad Removal Hierarchy ---

    // 1. Click Skip Button (Highest Priority)
    if (tryClickSkipButton()) {
      // If clicked, the ad should be gone. Restore state immediately.
      restoreVideoState(video);
      return;
    }

    // 2. Fast-forward (Immediate Failsafe for non-skippable)
    if (tryFastForward(video)) {
      // If fast-forwarded, the ad should be gone. Restore state immediately.
      restoreVideoState(video);
      return;
    }

    // 3. Accelerate (Minimize watch time)
    accelerateAd(video);
  }

  // ============================================
  // NON-VIDEO AD REMOVAL (Sponsored, Banners, Popups)
  // ============================================

  function removeElement(el, type) {
    if (!el || !el.parentElement) return;
    
    // Aggressive removal: remove the element and its parent if it's a container
    const parent = el.parentElement;
    el.remove();
    
    if (type === 'sponsored' || type === 'popup') {
      // For sponsored/popup containers, remove the parent to clean up layout
      if (parent && parent.children.length === 0) {
        parent.remove();
      }
      
      if (type === 'sponsored') {
        state.sessionStats.sponsoredBlocked++;
        sendMessage('sponsoredBlocked');
        log('Removed sponsored item');
      } else if (type === 'popup') {
        state.sessionStats.popupsRemoved++;
        sendMessage('popupRemoved');
        log('Removed anti-adblock popup/backdrop');
        // Restore scroll if a popup was removed
        if (document.body.style.overflow === 'hidden') {
          document.body.style.overflow = '';
        }
      }
    }
  }

  function processNodeForRemoval(node) {
    if (!state.isActive || node.nodeType !== 1) return;
    
    const el = node;
    const selectors = AD_SELECTORS.removalElements;
    
    for (const sel of selectors) {
      // Check if the element itself matches
      if (el.matches(sel)) {
        const type = sel.includes('ad-slot') || sel.includes('promoted') || sel.includes('banner') ? 'sponsored' : 'popup';
        removeElement(el, type);
        return;
      }
      
      // Check for matching elements within the added node's subtree
      const child = el.querySelector(sel);
      if (child) {
        const type = sel.includes('ad-slot') || sel.includes('promoted') || sel.includes('banner') ? 'sponsored' : 'popup';
        removeElement(child, type);
        return;
      }
    }
  }

  function setupRemovalObserver() {
    const observer = new MutationObserver((mutationsList) => {
      if (!state.isActive) return;
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(processNodeForRemoval);
        }
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial scan for elements already present
    document.querySelectorAll(AD_SELECTORS.removalElements.join(', ')).forEach(el => {
      processNodeForRemoval(el);
    });
    log('Removal observer attached and initial scan complete.');
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    log('='.repeat(50));
    log('YouTube Ad Blocker Pro v2.0.0 (Aggressive Rewrite)');
    log('='.repeat(50));
    
    // Start video ad handler loop
    setInterval(handleVideoAd, CONFIG.adCheckInterval);
    
    // Setup MutationObserver for non-video elements
    setupRemovalObserver();
    
    log('Initialized successfully');
  }

  // Start
  init();

})();
