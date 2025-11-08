// YouTube Ad Blocker Pro - Production Release
// Version 1.3.2 - November 2025
// CRITICAL: Never interfere with user actions, precise ad detection only

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    checkInterval: 500,
    skipRetryDelay: 300,
    maxSkipAttempts: 3,
    sponsoredCheckInterval: 2000,
    popupCheckInterval: 1000,
    userInteractionWindow: 3000,
    adCooldownPeriod: 5000,
    debug: false
  };

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  let state = {
    isActive: true,
    currentVideoUrl: null,
    lastAdEndTime: 0,
    
    // User interaction tracking
    userPausedVideo: false,
    userChangedSpeed: false,
    lastUserInteraction: 0,
    userWasWatching: true,
    
    // Video state preservation
    originalPlaybackRate: 1,
    originalMuted: false,
    originalVolume: 1,
    
    // Ad tracking
    processingAd: false,
    skipAttempts: 0,
    currentAdId: null,
    
    // Session statistics
    sessionStats: {
      adsBlocked: 0,
      sponsoredBlocked: 0,
      popupsRemoved: 0
    },
    
    intervals: {
      adCheck: null,
      sponsoredCheck: null,
      popupCheck: null
    },
    
    observers: {
      mutation: null,
      video: null
    }
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[YT AdBlock Pro]', ...args);
    }
  }

  function safeLog(message, error) {
    if (CONFIG.debug && error) {
      console.error('[YT AdBlock Pro Error]', message, error);
    } else if (CONFIG.debug) {
      console.log('[YT AdBlock Pro]', message);
    }
  }

  function getVideo() {
    try {
      return document.querySelector('video.html5-main-video');
    } catch (e) {
      safeLog('Error getting video element', e);
      return null;
    }
  }

  function getCurrentVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v');
    } catch (e) {
      safeLog('Error getting video ID', e);
      return null;
    }
  }

  // ============================================
  // USER INTERACTION DETECTION
  // ============================================
  
  function setupUserInteractionListeners() {
    const video = getVideo();
    if (!video) {
      setTimeout(setupUserInteractionListeners, 1000);
      return;
    }
    
    // Track all click events
    document.addEventListener('click', (e) => {
      try {
        const target = e.target;
        if (target.closest('.ytp-play-button') || 
            target.classList.contains('html5-main-video') ||
            target.closest('.ytp-chrome-controls')) {
          state.lastUserInteraction = Date.now();
          state.userPausedVideo = video.paused;
          log('User clicked controls');
        }
      } catch (err) {
        safeLog('Error in click handler', err);
      }
    }, true);
    
    // Track keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      try {
        if (e.code === 'Space' || e.code === 'KeyK') {
          state.lastUserInteraction = Date.now();
          state.userPausedVideo = !video.paused;
          log('User keyboard: pause/play');
        }
        if ((e.code === 'Comma' || e.code === 'Period') && e.shiftKey) {
          state.userChangedSpeed = true;
          state.lastUserInteraction = Date.now();
          log('User changed speed via keyboard');
        }
        // Number keys (0-9) for seeking
        if (e.code.match(/Digit[0-9]|Numpad[0-9]/)) {
          state.lastUserInteraction = Date.now();
          log('User seeked with number key');
        }
        // Arrow keys
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          state.lastUserInteraction = Date.now();
          log('User seeked with arrow');
        }
      } catch (err) {
        safeLog('Error in keyboard handler', err);
      }
    }, true);
    
    // Monitor settings menu interactions
    const setupMutationObserver = () => {
      const settingsMenu = document.querySelector('.ytp-settings-menu');
      if (settingsMenu && !state.observers.mutation) {
        state.observers.mutation = new MutationObserver(() => {
          state.lastUserInteraction = Date.now();
          state.userChangedSpeed = true;
          log('Settings menu interaction detected');
        });
        state.observers.mutation.observe(settingsMenu, {
          attributes: true,
          childList: true,
          subtree: true
        });
      }
    };
    
    setupMutationObserver();
    setInterval(setupMutationObserver, 5000);
  }

  function userRecentlyInteracted() {
    return (Date.now() - state.lastUserInteraction) < CONFIG.userInteractionWindow;
  }

  // ============================================
  // PRECISE AD DETECTION
  // ============================================
  
  const AD_SELECTORS = {
    containers: [
      '.video-ads.ytp-ad-module',
      'div.ad-showing',
      '.ytp-ad-player-overlay',
      '.ytp-ad-player-overlay-instream-info'
    ],
    
    skipButtons: [
      'button.ytp-ad-skip-button',
      'button.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button-container button',
      'button.ytp-skip-ad-button'
    ],
    
    badges: [
      '.ytp-ad-text',
      '.ytp-ad-preview-text',
      '.ytp-ad-simple-ad-badge',
      'div.ytp-ad-message-container'
    ],
    
    overlays: [
      '.ytp-ad-overlay-container',
      '.ytp-ad-action-interstitial-slot'
    ]
  };

  function isElementVisible(element) {
    if (!element || !element.offsetParent) return false;
    
    try {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      
      return rect.width > 0 && 
             rect.height > 0 && 
             style.display !== 'none' && 
             style.visibility !== 'hidden' &&
             style.opacity !== '0';
    } catch (e) {
      return false;
    }
  }

  function isAdPlaying(video) {
    if (!video) return false;

    // CRITICAL: If user recently interacted, don't interfere
    if (userRecentlyInteracted()) {
      log('User recently interacted - skipping detection');
      return false;
    }

    // CRITICAL: Cooldown period after ad ends
    if (state.lastAdEndTime && (Date.now() - state.lastAdEndTime) < CONFIG.adCooldownPeriod) {
      return false;
    }

    let strongIndicators = 0;
    let adDetails = [];
    
    try {
      // Check 1: Ad container visible (STRONG)
      for (const selector of AD_SELECTORS.containers) {
        const element = document.querySelector(selector);
        if (isElementVisible(element)) {
          strongIndicators++;
          adDetails.push(`container:${selector}`);
        }
      }
      
      // Check 2: Player has ad-showing class (VERY STRONG)
      const playerContainer = document.querySelector('.html5-video-player');
      if (playerContainer?.classList.contains('ad-showing')) {
        strongIndicators += 2;
        adDetails.push('ad-showing-class');
      }
      
      // Check 3: Skip button exists and visible (VERY STRONG)
      for (const selector of AD_SELECTORS.skipButtons) {
        const skipBtn = document.querySelector(selector);
        if (isElementVisible(skipBtn)) {
          strongIndicators += 2;
          adDetails.push(`skip-button:${selector}`);
        }
      }
      
      // Check 4: Ad badge visible with "ad" text (STRONG)
      for (const selector of AD_SELECTORS.badges) {
        const badge = document.querySelector(selector);
        if (isElementVisible(badge)) {
          const text = badge.textContent?.toLowerCase() || '';
          if (text.includes('ad') || text.includes('advertisement')) {
            strongIndicators++;
            adDetails.push(`badge:${text.substring(0, 20)}`);
          }
        }
      }
      
      // Check 5: Ad overlay visible (MODERATE)
      for (const selector of AD_SELECTORS.overlays) {
        const overlay = document.querySelector(selector);
        if (isElementVisible(overlay)) {
          strongIndicators++;
          adDetails.push(`overlay:${selector}`);
        }
      }
      
      // Check 6: Video duration is suspiciously short (ad-like)
      if (video.duration > 0 && video.duration < 120) {
        const videoTime = document.querySelector('.ytp-time-duration');
        if (videoTime && videoTime.textContent) {
          strongIndicators++;
          adDetails.push(`short-duration:${video.duration}s`);
        }
      }

    } catch (e) {
      safeLog('Error during ad detection', e);
      return false;
    }

    // CRITICAL: Require 2+ strong indicators
    const isAd = strongIndicators >= 2;
    
    // SAFETY CHECK: User paused video
    if (isAd && video.paused && state.userPausedVideo && userRecentlyInteracted()) {
      log('False positive: user paused');
      return false;
    }
    
    // SAFETY CHECK: User changed speed
    if (isAd && state.userChangedSpeed && video.playbackRate !== 16 && userRecentlyInteracted()) {
      log('False positive: user speed change');
      return false;
    }
    
    if (isAd) {
      log(`Ad detected! Indicators: ${strongIndicators}, Details: ${adDetails.join(', ')}`);
    }
    
    return isAd;
  }

  // ============================================
  // VIDEO STATE MANAGEMENT
  // ============================================
  
  function saveVideoState(video) {
    if (!video || state.processingAd) return;
    
    try {
      state.originalPlaybackRate = video.playbackRate || 1;
      state.originalMuted = video.muted || false;
      state.originalVolume = video.volume || 1;
      state.userWasWatching = !video.paused;
      log('State saved:', {
        rate: state.originalPlaybackRate,
        muted: state.originalMuted,
        volume: state.originalVolume,
        watching: state.userWasWatching
      });
    } catch (e) {
      safeLog('Error saving video state', e);
    }
  }

  function restoreVideoState(video) {
    if (!video || !state.processingAd) return;
    
    try {
      // Don't restore if user changed settings during ad
      if (!userRecentlyInteracted()) {
        if (video.playbackRate !== state.originalPlaybackRate) {
          video.playbackRate = state.originalPlaybackRate;
          log('Restored rate:', state.originalPlaybackRate);
        }
        
        if (video.muted !== state.originalMuted) {
          video.muted = state.originalMuted;
          log('Restored mute:', state.originalMuted);
        }
        
        if (Math.abs(video.volume - state.originalVolume) > 0.01) {
          video.volume = state.originalVolume;
          log('Restored volume:', state.originalVolume);
        }
      }
      
      state.processingAd = false;
      state.skipAttempts = 0;
      state.currentAdId = null;
      state.lastAdEndTime = Date.now();
      
    } catch (error) {
      safeLog('Error restoring state', error);
    }
  }

  // ============================================
  // AD SKIPPING METHODS
  // ============================================
  
  function tryClickSkipButton() {
    try {
      for (const selector of AD_SELECTORS.skipButtons) {
        const skipButton = document.querySelector(selector);
        
        if (isElementVisible(skipButton)) {
          // Simulate real click
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          
          skipButton.dispatchEvent(clickEvent);
          skipButton.click();
          log('Skip button clicked:', selector);
          return true;
        }
      }
    } catch (e) {
      safeLog('Error clicking skip button', e);
    }
    return false;
  }

  function accelerateAd(video) {
    if (!video || !state.processingAd) return false;
    
    // Don't interfere if user recently changed speed
    if (state.userChangedSpeed && userRecentlyInteracted()) {
      log('Skipping acceleration - user changed speed');
      return false;
    }
    
    try {
      if (!video.muted) {
        video.muted = true;
        log('Ad muted');
      }
      
      // Use 8x for more stable playback
      const targetSpeed = 8;
      if (video.playbackRate !== targetSpeed) {
        video.playbackRate = targetSpeed;
        log(`Ad accelerated to ${targetSpeed}x`);
      }
      
      return true;
      
    } catch (error) {
      safeLog('Error accelerating ad', error);
      return false;
    }
  }

  function tryFastForward(video) {
    if (!video) return false;
    
    try {
      const duration = video.duration;
      const currentTime = video.currentTime;
      
      // Only fast-forward if duration is reasonable for ad
      if (duration && duration > 0 && duration < 120 && currentTime < duration - 0.5) {
        video.currentTime = Math.max(duration - 0.3, currentTime);
        log('Fast-forwarded ad to near end');
        return true;
      }
    } catch (error) {
      safeLog('Error fast-forwarding', error);
    }
    
    return false;
  }

  // ============================================
  // MAIN AD HANDLER
  // ============================================
  
  function handleAdSkip() {
    if (!state.isActive) return;
    
    const video = getVideo();
    if (!video) return;

    const currentVideoId = getCurrentVideoId();
    
    // Reset if video changed
    if (state.currentVideoUrl !== currentVideoId) {
      if (state.processingAd) {
        restoreVideoState(video);
      }
      state.currentVideoUrl = currentVideoId;
      state.processingAd = false;
      state.skipAttempts = 0;
      state.userChangedSpeed = false;
      state.currentAdId = null;
      log('Video changed, reset state');
    }

    // Check if ad is playing
    const adPlaying = isAdPlaying(video);
    
    // If no ad, restore state if we were processing
    if (!adPlaying) {
      if (state.processingAd) {
        log('Ad ended, restoring...');
        restoreVideoState(video);
      }
      return;
    }

    // Ad detected - start processing
    if (!state.processingAd) {
      log('=== NEW AD DETECTED ===' );
      state.processingAd = true;
      state.skipAttempts = 0;
      state.currentAdId = Date.now();
      saveVideoState(video);
      
      state.sessionStats.adsBlocked++;
      
      // Send message safely
      try {
        chrome.runtime.sendMessage({ action: 'adBlocked' }).catch(() => {});
      } catch (e) {
        // Extension context invalidated, ignore
      }
    }

    // CRITICAL: Stop after max attempts
    if (state.skipAttempts >= CONFIG.maxSkipAttempts) {
      log('Max attempts reached - waiting for natural end');
      return;
    }

    state.skipAttempts++;
    log(`Skip attempt ${state.skipAttempts}/${CONFIG.maxSkipAttempts}`);

    // Priority 1: Try skip button (most reliable)
    if (tryClickSkipButton()) {
      setTimeout(() => {
        const video = getVideo();
        if (video && !isAdPlaying(video)) {
          log('Skip successful!');
          restoreVideoState(video);
        }
      }, 500);
      return;
    }
    
    // Priority 2: Try fast-forward
    if (tryFastForward(video)) {
      setTimeout(() => {
        const video = getVideo();
        if (video && !isAdPlaying(video)) {
          log('Fast-forward successful!');
          restoreVideoState(video);
        }
      }, 500);
      return;
    }
    
    // Priority 3: Accelerate (only after other methods failed)
    if (state.skipAttempts >= 2) {
      accelerateAd(video);
    }
  }

  // ============================================
  // SPONSORED CONTENT REMOVAL
  // ============================================
  
  const SPONSORED_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-banner-promo-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-statement-banner-renderer',
    'ytd-brand-video-shelf-renderer',
    'ytd-brand-video-singleton-renderer'
  ];

  function removeSponsoredContent() {
    if (!state.isActive) return;
    
    let removed = 0;
    
    try {
      for (const selector of SPONSORED_SELECTORS) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach(el => {
          if (el && el.parentElement && el.style.display !== 'none') {
            el.style.setProperty('display', 'none', 'important');
            el.remove();
            removed++;
          }
        });
      }
      
      if (removed > 0) {
        state.sessionStats.sponsoredBlocked += removed;
        try {
          chrome.runtime.sendMessage({ 
            action: 'sponsoredBlocked', 
            count: removed 
          }).catch(() => {});
        } catch (e) {
          // Extension context invalidated
        }
        log(`Removed ${removed} sponsored items`);
      }
    } catch (e) {
      safeLog('Error removing sponsored content', e);
    }
  }

  // ============================================
  // ANTI-ADBLOCK POPUP REMOVAL
  // ============================================
  
  const POPUP_SELECTORS = [
    'tp-yt-paper-dialog',
    'ytd-enforcement-message-view-model',
    'yt-mealbar-promo-renderer',
    'ytd-popup-container',
    'tp-yt-paper-dialog.ytd-popup-container'
  ];

  const POPUP_TEXT_INDICATORS = [
    'ad blocker',
    'adblock',
    'turn off',
    'allow ads',
    'disable',
    'adblocker'
  ];

  function removeAntiAdblockPopups() {
    if (!state.isActive) return;
    
    let removed = 0;
    
    try {
      for (const selector of POPUP_SELECTORS) {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach(el => {
          if (!el) return;
          
          const text = (el.textContent || '').toLowerCase();
          
          for (const indicator of POPUP_TEXT_INDICATORS) {
            if (text.includes(indicator)) {
              el.remove();
              removed++;
              log('Removed anti-adblock popup:', indicator);
              break;
            }
          }
        });
      }
      
      // Remove backdrops
      const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop, #scrim');
      backdrops.forEach(backdrop => {
        backdrop.remove();
        removed++;
      });
      
      if (removed > 0) {
        state.sessionStats.popupsRemoved += removed;
        try {
          chrome.runtime.sendMessage({ action: 'popupRemoved' }).catch(() => {});
        } catch (e) {
          // Extension context invalidated
        }
        
        // Restore body scroll
        if (document.body.style.overflow === 'hidden') {
          document.body.style.overflow = '';
        }
        
        log(`Removed ${removed} popup elements`);
      }
    } catch (e) {
      safeLog('Error removing popups', e);
    }
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === 'toggle') {
        state.isActive = !state.isActive;
        log('Extension toggled:', state.isActive ? 'ON' : 'OFF');
        
        if (!state.isActive && state.processingAd) {
          const video = getVideo();
          if (video) {
            video.playbackRate = state.originalPlaybackRate;
            video.muted = state.originalMuted;
            state.processingAd = false;
          }
        }
        
        sendResponse({ active: state.isActive });
      }
      else if (request.action === 'getStatus') {
        sendResponse({ active: state.isActive });
      }
      else if (request.action === 'getSessionStats') {
        sendResponse(state.sessionStats);
      }
    } catch (e) {
      safeLog('Error handling message', e);
      sendResponse({ error: e.message });
    }
    
    return true;
  });

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function init() {
    log('='.repeat(50));
    log('YouTube Ad Blocker Pro v1.3.2 Initializing...');
    log('='.repeat(50));
    
    try {
      // Setup user interaction tracking
      setupUserInteractionListeners();
      
      // Start intervals with error boundaries
      state.intervals.adCheck = setInterval(() => {
        try {
          handleAdSkip();
        } catch (e) {
          safeLog('Error in ad check interval', e);
        }
      }, CONFIG.checkInterval);
      
      state.intervals.sponsoredCheck = setInterval(() => {
        try {
          removeSponsoredContent();
        } catch (e) {
          safeLog('Error in sponsored check interval', e);
        }
      }, CONFIG.sponsoredCheckInterval);
      
      state.intervals.popupCheck = setInterval(() => {
        try {
          removeAntiAdblockPopups();
        } catch (e) {
          safeLog('Error in popup check interval', e);
        }
      }, CONFIG.popupCheckInterval);
      
      // Run immediately
      removeSponsoredContent();
      removeAntiAdblockPopups();
      
      log('Initialization complete - Safe mode active');
      log('='.repeat(50));
    } catch (e) {
      safeLog('Critical error during initialization', e);
    }
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    try {
      Object.values(state.intervals).forEach(interval => {
        if (interval) clearInterval(interval);
      });
      
      if (state.observers.mutation) {
        state.observers.mutation.disconnect();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  // Start when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();