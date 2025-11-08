// YouTube Ad Blocker Pro - Production v1.5.0
// Optimized for performance, stability, and Chrome Web Store compliance

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    adCheckInterval: 500,
    skipRetryDelay: 250,
    maxSkipAttempts: 3,
    sponsoredCheckInterval: 2000,
    popupCheckInterval: 1000,
    userInteractionWindow: 3000,
    adCooldownPeriod: 3000,
    debug: false
  };

  // Load debug setting
  chrome.storage.local.get(['debugMode'], (result) => {
    CONFIG.debug = !!result.debugMode;
    if (CONFIG.debug) {
      console.log('%c[YT AdBlock] Debug mode enabled', 'color: #27e057; font-weight: bold');
    }
  });

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const state = {
    isActive: true,
    currentVideoId: null,
    lastAdEndTime: 0,
    userPausedVideo: false,
    userChangedSpeed: false,
    lastUserInteraction: 0,
    originalPlaybackRate: 1,
    originalMuted: false,
    originalVolume: 1,
    processingAd: false,
    skipAttempts: 0,
    sessionStats: { adsBlocked: 0, sponsoredBlocked: 0, popupsRemoved: 0 },
    intervals: { adCheck: null, sponsoredCheck: null, popupCheck: null },
    cleanupDone: false
  };

  // ============================================
  // UTILITIES
  // ============================================
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('%c[YT AdBlock]', 'color: #27e057; font-weight: bold', ...args);
    }
  }

  function getVideo() {
    try {
      return document.querySelector('video.html5-main-video');
    } catch (e) {
      return null;
    }
  }

  function getCurrentVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v');
    } catch (e) {
      return null;
    }
  }

  function isElementVisible(el) {
    if (!el || !el.offsetParent) return false;
    
    try {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      return rect.width > 0 && 
             rect.height > 0 && 
             style.display !== 'none' && 
             style.visibility !== 'hidden' &&
             style.opacity !== '0';
    } catch (e) {
      return false;
    }
  }

  function userRecentlyInteracted() {
    return (Date.now() - state.lastUserInteraction) < CONFIG.userInteractionWindow;
  }

  function sendMessage(action, data = {}) {
    try {
      chrome.runtime.sendMessage({ action, ...data }).catch(() => {});
    } catch (e) {
      // Extension context invalidated - ignore
    }
  }

  // ============================================
  // USER INTERACTION TRACKING
  // ============================================
  
  function setupUserInteractionListeners() {
    const video = getVideo();
    if (!video) {
      setTimeout(setupUserInteractionListeners, 1000);
      return;
    }
    
    // Track clicks on video controls
    document.addEventListener('click', (e) => {
      try {
        const target = e.target;
        if (target.closest('.ytp-play-button, .ytp-chrome-controls') || 
            target.classList.contains('html5-main-video')) {
          state.lastUserInteraction = Date.now();
          state.userPausedVideo = video.paused;
          log('User clicked controls');
        }
      } catch (err) {}
    }, true);
    
    // Track keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      try {
        const interactionKeys = ['Space', 'KeyK', 'ArrowLeft', 'ArrowRight', 'Comma', 'Period'];
        const isNumberKey = /^(Digit|Numpad)[0-9]$/.test(e.code);
        
        if (interactionKeys.includes(e.code) || isNumberKey) {
          state.lastUserInteraction = Date.now();
          
          if (e.code === 'Space' || e.code === 'KeyK') {
            state.userPausedVideo = video.paused;
          }
          
          if ((e.code === 'Comma' || e.code === 'Period') && e.shiftKey) {
            state.userChangedSpeed = true;
          }
          
          log('User keyboard:', e.code);
        }
      } catch (err) {}
    }, true);
    
    // Monitor settings menu
    const observeSettings = () => {
      try {
        const settingsMenu = document.querySelector('.ytp-settings-menu');
        if (settingsMenu) {
          const observer = new MutationObserver(() => {
            state.lastUserInteraction = Date.now();
            state.userChangedSpeed = true;
          });
          observer.observe(settingsMenu, { attributes: true, childList: true, subtree: true });
        }
      } catch (e) {}
    };
    
    observeSettings();
    setInterval(observeSettings, 5000);
  }

  // ============================================
  // AD DETECTION
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

  function isAdPlaying(video) {
    if (!video || userRecentlyInteracted()) return false;
    
    // Cooldown period after ad ends
    if (state.lastAdEndTime && (Date.now() - state.lastAdEndTime) < CONFIG.adCooldownPeriod) {
      return false;
    }

    let indicators = 0;
    
    try {
      // Check containers
      for (const sel of AD_SELECTORS.containers) {
        if (isElementVisible(document.querySelector(sel))) indicators++;
      }
      
      // Check player class
      const player = document.querySelector('.html5-video-player');
      if (player?.classList.contains('ad-showing')) indicators += 2;
      
      // Check skip buttons (strong indicator)
      for (const sel of AD_SELECTORS.skipButtons) {
        if (isElementVisible(document.querySelector(sel))) {
          indicators += 2;
          break;
        }
      }
      
      // Check badges
      for (const sel of AD_SELECTORS.badges) {
        const badge = document.querySelector(sel);
        if (isElementVisible(badge)) {
          const text = (badge.textContent || '').toLowerCase();
          if (text.includes('ad')) indicators++;
        }
      }
      
      // Check overlays
      for (const sel of AD_SELECTORS.overlays) {
        if (isElementVisible(document.querySelector(sel))) indicators++;
      }
      
      // Check short duration
      if (video.duration > 0 && video.duration < 120) {
        const timeEl = document.querySelector('.ytp-time-duration');
        if (timeEl?.textContent) indicators++;
      }
    } catch (e) {
      return false;
    }

    const isAd = indicators >= 2;
    
    // Safety checks - don't interfere with user actions
    if (isAd) {
      if (video.paused && state.userPausedVideo && userRecentlyInteracted()) {
        return false;
      }
      
      if (state.userChangedSpeed && video.playbackRate !== 8 && userRecentlyInteracted()) {
        return false;
      }
      
      log(`Ad detected (${indicators} indicators)`);
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
      log('State saved:', { rate: state.originalPlaybackRate, muted: state.originalMuted });
    } catch (e) {}
  }

  function restoreVideoState(video) {
    if (!video || !state.processingAd) return;
    
    try {
      if (!userRecentlyInteracted()) {
        if (video.playbackRate !== state.originalPlaybackRate) {
          video.playbackRate = state.originalPlaybackRate;
        }
        if (video.muted !== state.originalMuted) {
          video.muted = state.originalMuted;
        }
        if (Math.abs(video.volume - state.originalVolume) > 0.01) {
          video.volume = state.originalVolume;
        }
      }
      
      state.processingAd = false;
      state.skipAttempts = 0;
      state.lastAdEndTime = Date.now();
      
      log('State restored');
    } catch (e) {}
  }

  // ============================================
  // AD SKIPPING
  // ============================================
  
  function tryClickSkipButton() {
    try {
      for (const selector of AD_SELECTORS.skipButtons) {
        const btn = document.querySelector(selector);
        if (isElementVisible(btn)) {
          btn.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }));
          btn.click();
          log('Skip button clicked');
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function accelerateAd(video) {
    if (!video || !state.processingAd) return false;
    if (state.userChangedSpeed && userRecentlyInteracted()) return false;
    
    try {
      if (!video.muted) {
        video.muted = true;
        log('Muted');
      }
      
      if (video.playbackRate !== 8) {
        video.playbackRate = 8;
        log('8x speed');
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  function tryFastForward(video) {
    if (!video) return false;
    
    try {
      const duration = video.duration;
      const currentTime = video.currentTime;
      
      if (duration && duration > 0 && duration < 120 && currentTime < duration - 0.5) {
        video.currentTime = Math.max(duration - 0.3, currentTime);
        log('Fast-forwarded');
        return true;
      }
    } catch (e) {}
    
    return false;
  }

  // ============================================
  // MAIN AD HANDLER
  // ============================================
  
  function handleAdSkip() {
    if (!state.isActive) return;
    
    const video = getVideo();
    if (!video) return;

    const videoId = getCurrentVideoId();
    
    // Reset on video change
    if (state.currentVideoId !== videoId) {
      if (state.processingAd) {
        restoreVideoState(video);
      }
      state.currentVideoId = videoId;
      state.processingAd = false;
      state.skipAttempts = 0;
      state.userChangedSpeed = false;
      log('Video changed');
    }

    const adPlaying = isAdPlaying(video);
    
    // Ad ended, restore
    if (!adPlaying) {
      if (state.processingAd) {
        log('Ad ended');
        restoreVideoState(video);
      }
      return;
    }

    // New ad detected
    if (!state.processingAd) {
      log('New ad detected');
      state.processingAd = true;
      state.skipAttempts = 0;
      saveVideoState(video);
      state.sessionStats.adsBlocked++;
      sendMessage('adBlocked');
    }

    // Max attempts reached
    if (state.skipAttempts >= CONFIG.maxSkipAttempts) {
      return;
    }

    state.skipAttempts++;
    log(`Attempt ${state.skipAttempts}/${CONFIG.maxSkipAttempts}`);

    // Priority 1: Skip button
    if (tryClickSkipButton()) {
      setTimeout(() => {
        const v = getVideo();
        if (v && !isAdPlaying(v)) {
          restoreVideoState(v);
        }
      }, 500);
      return;
    }
    
    // Priority 2: Fast-forward
    if (tryFastForward(video)) {
      setTimeout(() => {
        const v = getVideo();
        if (v && !isAdPlaying(v)) {
          restoreVideoState(v);
        }
      }, 500);
      return;
    }
    
    // Priority 3: Accelerate
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
      for (const sel of SPONSORED_SELECTORS) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (el && el.parentElement && el.style.display !== 'none') {
            el.style.setProperty('display', 'none', 'important');
            el.remove();
            removed++;
          }
        }
      }
      
      if (removed > 0) {
        state.sessionStats.sponsoredBlocked += removed;
        sendMessage('sponsoredBlocked', { count: removed });
        log(`Removed ${removed} sponsored items`);
      }
    } catch (e) {}
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
      for (const sel of POPUP_SELECTORS) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (!el) continue;
          
          const text = (el.textContent || '').toLowerCase();
          
          for (const indicator of POPUP_TEXT_INDICATORS) {
            if (text.includes(indicator)) {
              el.remove();
              removed++;
              log('Removed anti-adblock popup');
              break;
            }
          }
        }
      }
      
      // Remove backdrops
      const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop, #scrim');
      for (const el of backdrops) {
        el.remove();
        removed++;
      }
      
      if (removed > 0) {
        state.sessionStats.popupsRemoved += removed;
        sendMessage('popupRemoved');
        
        if (document.body.style.overflow === 'hidden') {
          document.body.style.overflow = '';
        }
      }
    } catch (e) {}
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      switch (request.action) {
        case 'toggle':
          state.isActive = !state.isActive;
          if (!state.isActive && state.processingAd) {
            const video = getVideo();
            if (video) {
              video.playbackRate = state.originalPlaybackRate;
              video.muted = state.originalMuted;
              state.processingAd = false;
            }
          }
          sendResponse({ active: state.isActive });
          break;
          
        case 'getStatus':
          sendResponse({ active: state.isActive });
          break;
          
        case 'getSessionStats':
          sendResponse(state.sessionStats);
          break;
          
        case 'enableDebug':
          CONFIG.debug = true;
          chrome.storage.local.set({ debugMode: true });
          sendResponse({ debug: true });
          break;
          
        case 'disableDebug':
          CONFIG.debug = false;
          chrome.storage.local.set({ debugMode: false });
          sendResponse({ debug: false });
          break;
          
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
    
    return true;
  });

  // ============================================
  // INITIALIZATION
  // ============================================
  
  function init() {
    log('='.repeat(50));
    log('YouTube Ad Blocker Pro v1.5.0');
    log('='.repeat(50));
    
    try {
      setupUserInteractionListeners();
      
      state.intervals.adCheck = setInterval(() => {
        try { handleAdSkip(); } catch (e) {}
      }, CONFIG.adCheckInterval);
      
      state.intervals.sponsoredCheck = setInterval(() => {
        try { removeSponsoredContent(); } catch (e) {}
      }, CONFIG.sponsoredCheckInterval);
      
      state.intervals.popupCheck = setInterval(() => {
        try { removeAntiAdblockPopups(); } catch (e) {}
      }, CONFIG.popupCheckInterval);
      
      removeSponsoredContent();
      removeAntiAdblockPopups();
      
      log('Initialized');
    } catch (e) {
      log('Init error:', e);
    }
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (state.cleanupDone) return;
    
    try {
      Object.values(state.intervals).forEach(interval => {
        if (interval) clearInterval(interval);
      });
      state.cleanupDone = true;
    } catch (e) {}
  });

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();