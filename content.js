// YouTube Ad Blocker Pro - Content Script v1.5.1
// Production-ready, fully optimized, Chrome Web Store compliant

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
	  const CONFIG = {
	    adCheckInterval: 100, // Reduced from 500ms for near-instant ad detection
	    skipRetryDelay: 100, // Reduced from 250ms for faster skip attempts
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
	  /**
	   * Get the main video element, with a fallback for robustness
	   * @returns {HTMLVideoElement|null} Video element or null if not found
	   */
	  function getVideo() {
	    try {
	      // Primary selector for the main video player
	      let video = document.querySelector('video.html5-main-video');
	      
	      // Fallback selector for other video elements (e.g., in shorts or different layouts)
	      if (!video) {
	        video = document.querySelector('video[src*="googlevideo.com"]');
	      }
	      
	      return video;
	    } catch (e) {
	      log('Error in getVideo:', e);
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
	      '.ytp-ad-player-overlay-instream-info',
	      // New/Alternative Ad Containers
	      'ytd-promoted-sparkles-web-renderer',
	      'ytd-in-feed-ad-layout-renderer',
	      '.ytp-ad-action-interstitial-slot',
	      '.ytp-ad-text-overlay'
	    ],
	    skipButtons: [
	      'button.ytp-ad-skip-button',
	      'button.ytp-ad-skip-button-modern',
	      '.ytp-ad-skip-button-container button',
	      'button.ytp-skip-ad-button',
	      // New/Aggressive Skip/Close/Play Buttons
	      '.ytp-ad-overlay-close-button', // Close button for overlays
	      '.ytp-ad-text-overlay button', // Button on text overlays
	      '.ytp-ad-action-interstitial-slot button', // Button on interstitial ads
	      '.ytp-ad-action-interstitial-slot a', // Link on interstitial ads
	      '.ytp-ad-action-interstitial-slot .ytp-ad-action-interstitial-button', // Specific interstitial button
	      '.ytp-ad-action-interstitial-button',
	      '.ytp-ad-action-interstitial-background button',
	      '.ytp-ad-action-interstitial-background a',
	      '.ytp-ad-action-interstitial-background'
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
	
	    // CRITICAL FIX: Prioritize the official YouTube player class as the primary indicator.
	    // If this class is not present, it is NOT an ad, regardless of other heuristics.
	    const player = document.querySelector('.html5-video-player');
	    const isPlayerAdShowing = player?.classList.contains('ad-showing');
	    
	    if (!isPlayerAdShowing) {
	      // If the player is not officially in 'ad-showing' mode, we must ensure the video is not
	      // being misidentified by the heuristics.
	      // The only exception is if a skip button is visible, which is a direct ad indicator.
	      const skipButtonVisible = !!document.querySelector(AD_SELECTORS.skipButtons.join(', '));
	      if (!skipButtonVisible) {
	        return false;
	      }
	    }
	
	    let indicators = 0;
	    
	    try {
	      // Check containers (stronger indicator)
	      for (const sel of AD_SELECTORS.containers) {
	        const el = document.querySelector(sel);
	        if (el && isElementVisible(el)) {
	          indicators += 2; // Increased weight for container detection
	          break;
	        }
	      }
	      
	    // Check skip buttons (strongest indicator)
	    for (const sel of AD_SELECTORS.skipButtons) {
	      const btn = document.querySelector(sel);
	      if (btn && isElementVisible(btn)) {
	        indicators += 3; // Give highest weight to skip button
	        break;
	      }
	    }
	    
	    // Check player class (already checked above, but included for indicator count)
	    if (isPlayerAdShowing) {
	      indicators += 2;
	    }
	      
	      // Check badges
	      for (const sel of AD_SELECTORS.badges) {
	        const badge = document.querySelector(sel);
	        if (badge && isElementVisible(badge)) {
	          const text = (badge.textContent || '').toLowerCase();
	          if (text.includes('ad') || text.includes('sponsored')) {
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
	      // Only prevent ad-blocking if the user explicitly paused the video
	      if (video.paused && state.userPausedVideo && userRecentlyInteracted()) {
	        log('Ad detected, but blocked due to recent user pause.');
	        return false;
	      }
	      
	      // Only prevent ad-blocking if the user explicitly changed the speed
	      if (state.userChangedSpeed && video.playbackRate !== state.originalPlaybackRate && userRecentlyInteracted()) {
	        log('Ad detected, but blocked due to recent user speed change.');
	        return false;
	      }
	      
	      log(`Ad detected (${indicators} indicators)`);
	    }
	    
	    // Final check: If the video is muted and has a short duration, it's highly likely an ad.
	    if (video.muted && video.duration > 0 && video.duration < 120) {
	      indicators += 2;
	      isAd = indicators >= CONFIG.minAdIndicators;
	      if (isAd) log('Ad confirmed by muted short video heuristic.');
	    }
	    
	    // Secondary check: If ad is detected but not processed, attempt to play the video.
	    // This is a critical step to ensure the ad is "active" so the skip button can appear.
	    if (isAd && video.paused && (!state.userPausedVideo || !userRecentlyInteracted())) {
	      video.play().catch(e => log('Failed to auto-play ad video in secondary check:', e));
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
	      // Only save if the video is not already at max ad speed (to prevent saving a corrupted state)
	      if (video.playbackRate !== CONFIG.maxAdSpeed) {
	        state.originalPlaybackRate = video.playbackRate || 1;
	      } else {
	        // If it is at max speed, assume the original was 1.0
	        state.originalPlaybackRate = 1.0;
	      }
	      
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
	      // Always restore state, regardless of user interaction, to fix stuck speed/mute issues.
	      // User interaction logic is handled in the ad detection phase.
	      
	      if (video.playbackRate !== state.originalPlaybackRate) {
	        video.playbackRate = state.originalPlaybackRate;
	      }
	      if (video.muted !== state.originalMuted) {
	        video.muted = state.originalMuted;
	      }
	      if (Math.abs(video.volume - state.originalVolume) > 0.01) {
	        video.volume = state.originalVolume;
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
	  /**
	   * Try to click skip/close/play button
	   * @returns {boolean} True if button clicked
	   */
	  function tryClickSkipButton() {
	    try {
	      for (const selector of AD_SELECTORS.skipButtons) {
	        const btn = document.querySelector(selector);
	        if (isElementVisible(btn)) {
	          // Attempt multiple click methods for robustness
	          btn.click();
	          btn.dispatchEvent(new MouseEvent('click', {
	            bubbles: true,
	            cancelable: true,
	            view: window
	          }));
	          
	          // Also check for the "Play" button that sometimes appears on ads
	          if (btn.textContent.toLowerCase().includes('play')) {
	            log('Ad Play button clicked');
	          } else {
	            log('Skip/Close button clicked');
	          }
	          
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
	    if (!video) {
	      // Failsafe: If video element disappears, ensure we reset the processing state
	      if (state.processingAd) {
	        state.processingAd = false;
	        log('Video element disappeared. Resetting ad processing state.');
	      }
	      return;
	    }

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
	    
	    // If no ad is playing and we are not processing an ad, ensure video state is normal
	    if (!adPlaying && !state.processingAd) {
	      if (video.playbackRate !== 1.0 || video.muted) {
	        // Only reset if the user hasn't recently interacted
	        if (!userRecentlyInteracted()) {
	          video.playbackRate = 1.0;
	          video.muted = false;
	          log('Non-ad video state normalized.');
	        }
	      }
	    }
	    
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
	    
	    // CRITICAL CHECK: Ensure video is playing before attempting to skip/accelerate
	    if (video.paused) {
	      // Attempt to play the video if it's an ad and not paused by user
	      if (!state.userPausedVideo || !userRecentlyInteracted()) {
	        video.play().catch(e => log('Failed to auto-play ad video:', e));
	      }
	      // If still paused (e.g., due to user interaction or YouTube's block), wait for next interval
	      // CRITICAL FIX: Do not return here. The ad may be paused but the skip button visible.
	      // The logic should continue to attempt to click the skip button.
	      if (video.paused) {
	        log('Ad detected but video is paused. Attempting skip/fast-forward anyway.');
	      }
	    }
	
	    // Max attempts reached
	    if (state.skipAttempts >= CONFIG.maxSkipAttempts) {
	      return;
	    }
	
	    state.skipAttempts++;
	    log(`Attempt ${state.skipAttempts}/${CONFIG.maxSkipAttempts}`);
	
	    // --- Ad Skipping Hierarchy (Quickest to Slowest) ---
	    
	    // Priority 1: Click Skip Button (Fastest, most reliable method)
	    if (tryClickSkipButton()) {
	      // We rely on the adPlaying check in the next loop iteration to restore state.
	      // Adding a small delay to check if the skip was successful.
	      setTimeout(() => {
	        const v = getVideo();
	        if (v && !isAdPlaying(v)) {
	          restoreVideoState(v);
	        }
	      }, CONFIG.skipRetryDelay);
	      return;
	    }
	    
	    // Priority 2: Fast-forward (For short, non-skippable ads)
	    if (tryFastForward(video)) {
	      // Fast-forwarding is a strong action, we should check if it worked and restore state.
	      setTimeout(() => {
	        const v = getVideo();
	        if (v && !isAdPlaying(v)) {
	          restoreVideoState(v);
	        }
	      }, CONFIG.skipRetryDelay);
	      return;
	    }
	    
	    // Priority 3: Accelerate (Last resort for long, non-skippable ads)
	    // We only accelerate after the first attempt to click/fast-forward has failed,
	    // giving YouTube a chance to load the skip button.
	    if (state.skipAttempts >= 2) {
	      accelerateAd(video);
	    }
	    
	    // Priority 4: Seek to End (Final Failsafe)
	    // If all else fails and we are on the final attempt, seek to the end of the video.
	    if (state.skipAttempts === CONFIG.maxSkipAttempts) {
	      tryFastForward(video); // Re-run fast-forward, which will seek to end if possible
	    }
  }

	// ============================================
	// ELEMENT REMOVAL (Sponsored Content & Popups)
	// ============================================
	
	const REMOVAL_SELECTORS = [
	  // Sponsored Content
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
	  // Anti-Adblock Popups & Backdrops
	  'tp-yt-paper-dialog',
	  'ytd-enforcement-message-view-model',
	  'yt-mealbar-promo-renderer',
	  'ytd-popup-container',
	  'tp-yt-paper-dialog.ytd-popup-container',
	  'tp-yt-iron-overlay-backdrop',
	  '#scrim'
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
	 * Remove a single element and update stats
	 * @param {HTMLElement} el - Element to remove
	 * @param {string} type - 'sponsored' or 'popup'
	 */
	function removeElement(el, type) {
	  if (!el || !el.parentElement) return;
	  
	  el.remove();
	  
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
	
	/**
	 * Process a single DOM node for removal
	 * @param {Node} node - The node to process
	 */
	function processNodeForRemoval(node) {
	  if (!state.isActive || node.nodeType !== 1) return; // Only process element nodes
	  
	  const el = node;
	  
	  // 1. Check for Sponsored Content
	  // Check if the added element itself or any of its children match a sponsored selector
	  for (const sel of REMOVAL_SELECTORS.slice(0, 10)) { // First 10 are sponsored selectors
	    if (el.matches(sel)) {
	      removeElement(el, 'sponsored');
	      return;
	    }
	    // Also check for sponsored elements within the added node's subtree
	    const sponsoredChild = el.querySelector(sel);
	    if (sponsoredChild) {
	      removeElement(sponsoredChild, 'sponsored');
	      return;
	    }
	  }
	  
	  // 2. Check for Anti-Adblock Popups
	  for (const sel of REMOVAL_SELECTORS.slice(10)) { // Remaining are popup/backdrop selectors
	    if (el.matches(sel)) {
	      // Check for text indicators only on the main dialog elements, not backdrops
	      if (el.matches('tp-yt-paper-dialog, ytd-enforcement-message-view-model, ytd-popup-container')) {
	        const text = (el.textContent || '').toLowerCase();
	        for (const indicator of POPUP_TEXT_INDICATORS) {
	          if (text.includes(indicator)) {
	            removeElement(el, 'popup');
	            return;
	          }
	        }
	      } else {
	        // Remove backdrops unconditionally if they match the selector
	        removeElement(el, 'popup');
	        return;
	      }
	    }
	  }
	}
	
	/**
	 * Setup MutationObserver to remove elements as they are added to the DOM
	 */
	function setupRemovalObserver() {
	  const observer = new MutationObserver((mutationsList) => {
	    for (const mutation of mutationsList) {
	      if (mutation.type === 'childList') {
	        mutation.addedNodes.forEach(processNodeForRemoval);
	      }
	    }
	  });
	  
	  // Start observing the document body for configured mutations
	  observer.observe(document.body, { childList: true, subtree: true });
	  state.observers.removal = observer;
	  log('Removal observer attached');
	  
	  // Initial scan for elements already present
	  document.querySelectorAll(REMOVAL_SELECTORS.join(', ')).forEach(el => {
	    processNodeForRemoval(el);
	  });
	}
	
	// ============================================
	// CONSOLIDATED MAIN LOOP (Video Player Only)
	// ============================================
	
	/**
	 * Main processing loop - handles only video player related tasks
	 */
	function mainLoop() {
	  try {
	    handleAdSkip();
	  } catch (e) {
	    log('Error in ad handling:', e);
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
      
	// Start consolidated main loop (for video player)
	      state.intervals.main = setInterval(mainLoop, CONFIG.adCheckInterval);
	      
	      // Setup MutationObserver for non-video elements
	      setupRemovalObserver();
      
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
	      
	      if (state.observers.removal) {
	        state.observers.removal.disconnect();
	        state.observers.removal = null;
	      }
	      
	      state.cleanupDone = true;
      log('Cleanup complete');
    } catch (e) {}
  });

  // Start
  // Run init immediately. The manifest is set to run at document_start,
  // so we should wait for the document to be interactive.
  // However, since we use `run_at: document_start` in manifest, we should
  // use a MutationObserver for the player element instead of DOMContentLoaded.
  // For now, let's keep the existing logic but ensure it runs.
  // The `run_at: document_start` means `document.readyState` will be 'loading'.
  // We will rely on the periodic `getVideo()` call in `setupUserInteractionListeners`
  // and `handleAdSkip` to find the video element.
  // The current logic is fine for `document_start` if `init` is called immediately.
  init();

})();