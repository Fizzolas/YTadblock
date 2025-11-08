// YouTube Ad Blocker Pro - Bug Fix Release
// Version 1.3.1 - November 2025
// CRITICAL: Never interfere with user actions, precise ad detection only

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    checkInterval: 500,           // Slower checks to reduce false positives
    skipRetryDelay: 200,          // Give more time between attempts
    maxSkipAttempts: 3,           // Fewer attempts, then stop
    sponsoredCheckInterval: 2000,
    popupCheckInterval: 1000,
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
    
    // Video state preservation
    originalPlaybackRate: 1,
    originalMuted: false,
    
    // Ad tracking
    processingAd: false,
    skipAttempts: 0,
    
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
    }
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[YT AdBlock Fix]', ...args);
    }
  }

  function getVideo() {
    return document.querySelector('video.html5-main-video');
  }

  function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // ============================================
  // USER INTERACTION DETECTION
  // ============================================
  
  function setupUserInteractionListeners() {
    const video = getVideo();
    if (!video) return;
    
    // Track pause button clicks
    document.addEventListener('click', (e) => {
      const target = e.target;
      // Check if clicking play/pause button or video itself
      if (target.closest('.ytp-play-button') || 
          target.classList.contains('html5-main-video')) {
        state.lastUserInteraction = Date.now();
        state.userPausedVideo = video.paused;
        log('User interaction detected: pause/play');
      }
    }, true);
    
    // Track keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Space, K = play/pause
      if (e.code === 'Space' || e.code === 'KeyK') {
        state.lastUserInteraction = Date.now();
        state.userPausedVideo = !video.paused; // Will be opposite after keypress
        log('User interaction detected: keyboard');
      }
      // Shift+< or Shift+> = speed change
      if ((e.code === 'Comma' || e.code === 'Period') && e.shiftKey) {
        state.userChangedSpeed = true;
        state.lastUserInteraction = Date.now();
        log('User changed playback speed');
      }
    }, true);
    
    // Track direct video property changes by user
    let userChangingSpeed = false;
    const speedButtons = document.querySelectorAll('.ytp-settings-button, .ytp-menuitem');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        userChangingSpeed = true;
        setTimeout(() => { userChangingSpeed = false; }, 500);
      });
    });
  }

  // Check if user recently interacted (within 3 seconds)
  function userRecentlyInteracted() {
    return (Date.now() - state.lastUserInteraction) < 3000;
  }

  // ============================================
  // PRECISE AD DETECTION
  // ============================================
  
  const AD_SELECTORS = {
    // VERY specific ad indicators only
    containers: [
      '.video-ads.ytp-ad-module',
      'div.ad-showing',
      '.ytp-ad-player-overlay',
    ],
    
    skipButtons: [
      'button.ytp-ad-skip-button',
      'button.ytp-ad-skip-button-modern',
      '.ytp-ad-skip-button-container button'
    ],
    
    badges: [
      '.ytp-ad-text',
      '.ytp-ad-preview-text'
    ]
  };

  function isAdPlaying(video) {
    if (!video) return false;

    // CRITICAL: If user recently interacted, don't interfere
    if (userRecentlyInteracted()) {
      log('User recently interacted - skipping ad detection');
      return false;
    }

    // CRITICAL: If we just finished an ad, wait 5 seconds before detecting again
    if (state.lastAdEndTime && (Date.now() - state.lastAdEndTime) < 5000) {
      return false;
    }

    let strongIndicators = 0;
    
    // Check 1: Ad container (STRONG)
    for (const selector of AD_SELECTORS.containers) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) { // Must be visible
        strongIndicators++;
        log('Strong indicator: container', selector);
      }
    }
    
    // Check 2: Player has ad-showing class (STRONG)
    const playerContainer = document.querySelector('.html5-video-player');
    if (playerContainer && playerContainer.classList.contains('ad-showing')) {
      strongIndicators++;
      log('Strong indicator: ad-showing class');
    }
    
    // Check 3: Skip button exists (VERY STRONG)
    for (const selector of AD_SELECTORS.skipButtons) {
      const skipBtn = document.querySelector(selector);
      if (skipBtn && skipBtn.offsetParent !== null) {
        strongIndicators += 2; // Very strong indicator
        log('Very strong indicator: skip button visible');
      }
    }
    
    // Check 4: Ad badge visible (STRONG)
    for (const selector of AD_SELECTORS.badges) {
      const badge = document.querySelector(selector);
      if (badge && badge.offsetParent !== null && badge.textContent.toLowerCase().includes('ad')) {
        strongIndicators++;
        log('Strong indicator: ad badge');
      }
    }

    // CRITICAL: Require 2+ strong indicators to confirm ad
    const isAd = strongIndicators >= 2;
    
    // SAFETY CHECK: If video is paused and user recently paused it, NOT an ad
    if (isAd && video.paused && state.userPausedVideo && userRecentlyInteracted()) {
      log('False positive: user paused video');
      return false;
    }
    
    // SAFETY CHECK: If playback rate is user-set, NOT an ad
    if (isAd && state.userChangedSpeed && video.playbackRate !== 16) {
      log('False positive: user changed speed');
      return false;
    }
    
    if (isAd) {
      log(`Ad detected with ${strongIndicators} strong indicators`);
    }
    
    return isAd;
  }

  // ============================================
  // VIDEO STATE MANAGEMENT
  // ============================================
  
  function saveVideoState(video) {
    if (!video) return;
    
    // Only save if not already manipulated
    if (!state.processingAd) {
      state.originalPlaybackRate = video.playbackRate;
      state.originalMuted = video.muted;
      log('Saved state:', { rate: state.originalPlaybackRate, muted: state.originalMuted });
    }
  }

  function restoreVideoState(video) {
    if (!video || !state.processingAd) return;
    
    try {
      // CRITICAL: Don't restore if user changed settings during ad
      if (!userRecentlyInteracted()) {
        if (video.playbackRate !== state.originalPlaybackRate) {
          video.playbackRate = state.originalPlaybackRate;
          log('Restored playback rate to:', state.originalPlaybackRate);
        }
        
        if (video.muted !== state.originalMuted) {
          video.muted = state.originalMuted;
          log('Restored mute state to:', state.originalMuted);
        }
      }
      
      state.processingAd = false;
      state.skipAttempts = 0;
      state.lastAdEndTime = Date.now();
      
    } catch (error) {
      log('Error restoring state:', error);
    }
  }

  // ============================================
  // AD SKIPPING METHODS
  // ============================================
  
  // Method 1: Click skip button (PRIORITY)
  function tryClickSkipButton() {
    for (const selector of AD_SELECTORS.skipButtons) {
      const skipButton = document.querySelector(selector);
      
      if (skipButton && skipButton.offsetParent !== null) {
        const rect = skipButton.getBoundingClientRect();
        const style = window.getComputedStyle(skipButton);
        
        if (rect.width > 0 && rect.height > 0 && 
            style.display !== 'none' && 
            style.visibility !== 'hidden') {
          
          skipButton.click();
          log('Skip button clicked:', selector);
          return true;
        }
      }
    }
    return false;
  }

  // Method 2: Mute and accelerate (CAREFUL)
  function accelerateAd(video) {
    if (!video || state.processingAd === false) return false;
    
    // CRITICAL: Don't interfere if user recently changed speed
    if (state.userChangedSpeed && userRecentlyInteracted()) {
      log('Skipping acceleration - user changed speed');
      return false;
    }
    
    try {
      if (!video.muted) {
        video.muted = true;
        log('Ad muted');
      }
      
      // Use 10x instead of 16x for more stable playback
      if (video.playbackRate !== 10) {
        video.playbackRate = 10;
        log('Ad accelerated to 10x');
      }
      
      return true;
      
    } catch (error) {
      log('Error accelerating:', error);
      return false;
    }
  }

  // Method 3: Fast-forward (SAFE)
  function tryFastForward(video) {
    if (!video) return false;
    
    try {
      const duration = video.duration;
      const currentTime = video.currentTime;
      
      // SAFETY: Only fast-forward if duration is reasonable for ad
      if (duration && duration > 0 && duration < 120 && currentTime < duration - 1) {
        video.currentTime = duration - 0.5;
        log('Fast-forwarded ad');
        return true;
      }
    } catch (error) {
      log('Error fast-forwarding:', error);
    }
    
    return false;
  }

  // ============================================
  // MAIN AD HANDLER
  // ============================================
  
  function handleAdSkip() {
    const video = getVideo();
    if (!video || !state.isActive) return;

    const currentVideoId = getCurrentVideoId();
    
    // Reset if video changed
    if (state.currentVideoUrl !== currentVideoId) {
      state.currentVideoUrl = currentVideoId;
      state.processingAd = false;
      state.skipAttempts = 0;
      state.userChangedSpeed = false;
      log('Video changed, state reset');
    }

    // Check if ad is playing
    const adPlaying = isAdPlaying(video);
    
    // If no ad, restore state if we were processing
    if (!adPlaying) {
      if (state.processingAd) {
        log('Ad ended, restoring state');
        restoreVideoState(video);
      }
      return;
    }

    // Ad detected - start processing
    if (!state.processingAd) {
      log('New ad detected');
      state.processingAd = true;
      state.skipAttempts = 0;
      saveVideoState(video);
      
      state.sessionStats.adsBlocked++;
      chrome.runtime.sendMessage({ action: 'adBlocked' }).catch(() => {});
    }

    // CRITICAL: Stop after max attempts
    if (state.skipAttempts >= CONFIG.maxSkipAttempts) {
      log('Max attempts reached - waiting for ad to end naturally');
      return;
    }

    state.skipAttempts++;

    // Priority 1: Try skip button (most reliable, least intrusive)
    if (tryClickSkipButton()) {
      log('Skip button attempt', state.skipAttempts);
      setTimeout(() => {
        if (!isAdPlaying(video)) {
          log('Skip successful');
          restoreVideoState(video);
        }
      }, 500);
      return;
    }
    
    // Priority 2: Try fast-forward (safe, doesn't change speed permanently)
    if (tryFastForward(video)) {
      log('Fast-forward attempt', state.skipAttempts);
      setTimeout(() => {
        if (!isAdPlaying(video)) {
          log('Fast-forward successful');
          restoreVideoState(video);
        }
      }, 500);
      return;
    }
    
    // Priority 3: Accelerate (only if other methods failed)
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
    'ytd-banner-promo-renderer'
  ];

  function removeSponsoredContent() {
    if (!state.isActive) return;
    
    let removed = 0;
    
    for (const selector of SPONSORED_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(el => {
        if (el && el.parentElement && el.style.display !== 'none') {
          el.style.display = 'none';
          removed++;
        }
      });
    }
    
    if (removed > 0) {
      state.sessionStats.sponsoredBlocked += removed;
      chrome.runtime.sendMessage({ 
        action: 'sponsoredBlocked', 
        count: removed 
      }).catch(() => {});
    }
  }

  // ============================================
  // ANTI-ADBLOCK POPUP REMOVAL
  // ============================================
  
  const POPUP_SELECTORS = [
    'tp-yt-paper-dialog',
    'ytd-enforcement-message-view-model',
    'yt-mealbar-promo-renderer'
  ];

  const POPUP_TEXT_INDICATORS = [
    'ad blocker',
    'adblock',
    'turn off',
    'allow ads'
  ];

  function removeAntiAdblockPopups() {
    if (!state.isActive) return;
    
    let removed = 0;
    
    for (const selector of POPUP_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(el => {
        const text = el.textContent.toLowerCase();
        
        for (const indicator of POPUP_TEXT_INDICATORS) {
          if (text.includes(indicator)) {
            el.remove();
            removed++;
            log('Removed anti-adblock popup');
            break;
          }
        }
      });
    }
    
    // Remove backdrops
    const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
    backdrops.forEach(backdrop => {
      backdrop.remove();
      removed++;
    });
    
    if (removed > 0) {
      state.sessionStats.popupsRemoved += removed;
      chrome.runtime.sendMessage({ action: 'popupRemoved' }).catch(() => {});
      
      // Restore body scroll
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
      }
    }
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      state.isActive = !state.isActive;
      log('Extension toggled:', state.isActive ? 'ON' : 'OFF');
      
      // If turning off, restore any manipulated video immediately
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
    
    return true;
  });

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function init() {
    log('YouTube Ad Blocker Pro - Bug Fix initializing...');
    log('Version: 1.3.1 - Critical fixes applied');
    
    // Setup user interaction tracking
    setupUserInteractionListeners();
    
    // Start intervals
    state.intervals.adCheck = setInterval(handleAdSkip, CONFIG.checkInterval);
    state.intervals.sponsoredCheck = setInterval(removeSponsoredContent, CONFIG.sponsoredCheckInterval);
    state.intervals.popupCheck = setInterval(removeAntiAdblockPopups, CONFIG.popupCheckInterval);
    
    // Run immediately
    removeSponsoredContent();
    removeAntiAdblockPopups();
    
    log('Initialization complete - Safe mode active');
  }

  // Start when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();