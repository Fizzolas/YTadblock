// YouTube Ad Blocker Pro - Content Script v1.5.1
// Production-ready, fully optimized, Chrome Web Store compliant

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
    minAdIndicators: 2,
    maxAdSpeed: 8,
    debug: false
  };

  // Load debug setting from storage
  chrome.storage.local.get(['debugMode'], (result) => {
    CONFIG.debug = !!result.debugMode;
    if (CONFIG.debug) {
      console.log('%c[YT AdBlock Pro]', 'color: #27e057; font-weight: bold', 'Debug mode enabled');
    }
  });

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const state = {
    isActive: true,
    currentVideoId: null,
    userPausedVideo: false,
    userChangedSpeed: false,
    lastUserInteraction: 0,
    originalPlaybackRate: 1,
    originalMuted: false,
    originalVolume: 1,
    processingAd: false,
    skipAttempts: 0,
    sessionStats: { adsBlocked: 0, sponsoredBlocked: 0, popupsRemoved: 0 },
    intervals: { main: null },
    observers: { settings: null },
    cleanupDone: false,
    initialized: false
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  /**
   * Safe logging that respects debug mode
   * @param {...any} args - Arguments to log
   */
  function log(...args) {
    if (CONFIG.debug) {
      console.log('%c[YT AdBlock Pro]', 'color: #27e057; font-weight: bold', ...args);
    }
  }

  /**
   * Get the main video element
   * @returns {HTMLVideoElement|null} Video element or null if not found
   */
  function getVideo() {
    try {
      return document.querySelector('video.html5-main-video');
    } catch (e) {
      return null;
    }
  }

  /**
   * Get current video ID from URL
   * @returns {string|null} Video ID or null
   */
  function getCurrentVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v');
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if element is visible in viewport
   * @param {HTMLElement} el - Element to check
   * @returns {boolean} True if visible
   */
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

  /**
   * Check if user recently interacted with video
   * @returns {boolean} True if recent interaction
   */
  function userRecentlyInteracted() {
    return (Date.now() - state.lastUserInteraction) < CONFIG.userInteractionWindow;
  }

  /**
   * Send message to background script
   * @param {string} action - Action type
   * @param {Object} data - Additional data
   */
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
  
  /**
   * Setup event listeners for user interactions
   */
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
    
    // Monitor settings menu only when it exists
    const checkSettingsMenu = () => {
      try {
        const settingsMenu = document.querySelector('.ytp-settings-menu');
        if (settingsMenu && !state.observers.settings) {
          state.observers.settings = new MutationObserver(() => {
            state.lastUserInteraction = Date.now();
            state.userChangedSpeed = true;
          });
          state.observers.settings.observe(settingsMenu, { 
            attributes: true, 
            childList: true, 
            subtree: true 
          });
          log('Settings menu observer attached');
        }
      } catch (e) {}
    };
    
    // Check for settings menu periodically
    setInterval(checkSettingsMenu, 5000);
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

  /**
   * Detect if an ad is currently playing
   * @param {HTMLVideoElement} video - Video element to check
   * @returns {boolean} True if ad detected
   */
  function isAdPlaying(video) {
    if (!video || userRecentlyInteracted()) return false;

    let indicators = 0;
    
    try {
      // Check containers
      for (const sel of AD_SELECTORS.containers) {
        const el = document.querySelector(sel);
        if (el && isElementVisible(el)) {
          indicators++;
          break;
        }
      }
      
      // Check player class
      const player = document.querySelector('.html5-video-player');
      if (player?.classList.contains('ad-showing')) {
        indicators += 2;
      }
      
      // Check skip buttons (strong indicator)
      for (const sel of AD_SELECTORS.skipButtons) {
        const btn = document.querySelector(sel);
        if (btn && isElementVisible(btn)) {
          indicators += 2;
          break;
        }
      }
      
      // Check badges
      for (const sel of AD_SELECTORS.badges) {
        const badge = document.querySelector(sel);
        if (badge && isElementVisible(badge)) {
          const text = (badge.textContent || '').toLowerCase();
          if (text.includes('ad')) {
            indicators++;
            break;
          }
        }
      }
      
      // Check overlays
      for (const sel of AD_SELECTORS.overlays) {
        const el = document.querySelector(sel);
        if (el && isElementVisible(el)) {
          indicators++;
          break;
        }
      }
      
      // Check short duration
      if (video.duration > 0 && video.duration < 120) {
        const timeEl = document.querySelector('.ytp-time-duration');
        if (timeEl?.textContent) indicators++;
      }
    } catch (e) {
      return false;
    }

    const isAd = indicators >= CONFIG.minAdIndicators;
    
    // Safety checks - don't interfere with user actions
    if (isAd) {
      if (video.paused && state.userPausedVideo && userRecentlyInteracted()) {
        return false;
      }
      
      if (state.userChangedSpeed && video.playbackRate !== CONFIG.maxAdSpeed && userRecentlyInteracted()) {
        return false;
      }
      
      log(`Ad detected (${indicators} indicators)`);
    }
    
    return isAd;
  }

  // ============================================
  // VIDEO STATE MANAGEMENT
  // ============================================
  
  /**
   * Save current video state before modification
   * @param {HTMLVideoElement} video - Video element
   */
  function saveVideoState(video) {
    if (!video || state.processingAd) return;
    
    try {
      state.originalPlaybackRate = video.playbackRate || 1;
      state.originalMuted = video.muted || false;
      state.originalVolume = video.volume || 1;
      log('State saved:', { 
        rate: state.originalPlaybackRate, 
        muted: state.originalMuted 
      });
    } catch (e) {}
  }

  /**
   * Restore video state after ad
   * @param {HTMLVideoElement} video - Video element
   */
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
      
      log('State restored');
    } catch (e) {}
  }

  // ============================================
  // AD SKIPPING
  // ============================================
  
  /**
   * Try to click skip button
   * @returns {boolean} True if button clicked
   */
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

  /**
   * Accelerate ad playback
   * @param {HTMLVideoElement} video - Video element
   * @returns {boolean} True if accelerated
   */
  function accelerateAd(video) {
    if (!video || !state.processingAd) return false;
    if (state.userChangedSpeed && userRecentlyInteracted()) return false;
    
    try {
      if (!video.muted) {
        video.muted = true;
        log('Muted');
      }
      
      if (video.playbackRate !== CONFIG.maxAdSpeed) {
        video.playbackRate = CONFIG.maxAdSpeed;
        log(`${CONFIG.maxAdSpeed}x speed`);
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Try to fast-forward through ad
   * @param {HTMLVideoElement} video - Video element
   * @returns {boolean} True if fast-forwarded
   */
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
  
  /**
   * Handle ad detection and skipping
   */
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

  /**
   * Remove sponsored content from page
   */
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

  /**
   * Remove anti-adblock popups
   */
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
  // CONSOLIDATED MAIN LOOP
  // ============================================
  
  /**
   * Main processing loop - handles all periodic tasks
   */
  function mainLoop() {
    try {
      handleAdSkip();
    } catch (e) {
      log('Error in ad handling:', e);
    }
    
    // Run sponsored and popup checks less frequently
    const now = Date.now();
    
    if (!mainLoop.lastSponsored || now - mainLoop.lastSponsored >= CONFIG.sponsoredCheckInterval) {
      try {
        removeSponsoredContent();
      } catch (e) {
        log('Error in sponsored removal:', e);
      }
      mainLoop.lastSponsored = now;
    }
    
    if (!mainLoop.lastPopup || now - mainLoop.lastPopup >= CONFIG.popupCheckInterval) {
      try {
        removeAntiAdblockPopups();
      } catch (e) {
        log('Error in popup removal:', e);
      }
      mainLoop.lastPopup = now;
    }
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (!request?.action) {
        sendResponse({ error: 'No action specified' });
        return true;
      }

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
  
  /**
   * Initialize the extension
   */
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    log('='.repeat(50));
    log('YouTube Ad Blocker Pro v1.5.1');
    log('='.repeat(50));
    
    try {
      setupUserInteractionListeners();
      
      // Start consolidated main loop
      state.intervals.main = setInterval(mainLoop, CONFIG.adCheckInterval);
      
      // Initial cleanup
      removeSponsoredContent();
      removeAntiAdblockPopups();
      
      log('Initialized successfully');
    } catch (e) {
      log('Init error:', e);
    }
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (state.cleanupDone) return;
    
    try {
      if (state.intervals.main) {
        clearInterval(state.intervals.main);
        state.intervals.main = null;
      }
      
      if (state.observers.settings) {
        state.observers.settings.disconnect();
        state.observers.settings = null;
      }
      
      state.cleanupDone = true;
      log('Cleanup complete');
    } catch (e) {}
  });

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();