// YouTube Ad Blocker Pro - Content Script
// Robust ad blocking with anti-adblock popup removal

(function() {
  'use strict';

  // State tracking to prevent auto-resume after user pause
  let userPausedVideo = false;
  let lastUserInteractionTime = 0;
  let adBlockerActive = true;
  let skipAttempts = new Map(); // Track skip attempts per ad

  // Configuration
  const CONFIG = {
    checkInterval: 500, // Check every 500ms
    skipRetryDelay: 100, // Retry skip after 100ms if failed
    maxSkipAttempts: 10, // Max attempts to skip an ad
    userInteractionTimeout: 2000 // Consider interaction "recent" for 2 seconds
  };

  // Selectors for various YouTube elements
  const SELECTORS = {
    // Video player
    video: 'video',
    player: '.html5-video-player',
    
    // Ad indicators
    adContainer: '.video-ads.ytp-ad-module',
    adPlaying: '.ad-showing',
    adOverlay: '.ytp-ad-player-overlay',
    skipButton: '.ytp-ad-skip-button, .ytp-skip-ad-button',
    adText: '.ytp-ad-text',
    
    // Anti-adblock popup
    enforcementDialog: 'tp-yt-paper-dialog:has(#feedback)',
    enforcementOverlay: 'ytd-enforcement-message-view-model',
    popupContainer: 'ytd-popup-container',
    
    // Player controls
    playButton: '.ytp-play-button'
  };

  /**
   * Logs messages with timestamp (only in development)
   */
  function log(message, data = null) {
    if (chrome.runtime?.getManifest) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
      console.log(`[YT AdBlock ${timestamp}]`, message, data || '');
    }
  }

  /**
   * Detects if an ad is currently playing
   */
  function isAdPlaying() {
    const video = document.querySelector(SELECTORS.video);
    const player = document.querySelector(SELECTORS.player);
    
    if (!video || !player) return false;

    // Multiple detection methods for reliability
    const checks = [
      // Check for ad-showing class
      player.classList.contains('ad-showing'),
      player.classList.contains('ad-interrupting'),
      
      // Check for ad container
      document.querySelector(SELECTORS.adContainer) !== null,
      
      // Check for ad overlay
      document.querySelector(SELECTORS.adOverlay) !== null,
      
      // Check for ad text indicator
      document.querySelector(SELECTORS.adText) !== null,
      
      // Check video src for ad indicators
      video.src && video.src.includes('googlevideo.com/videoplayback') && 
        (video.src.includes('adformat') || video.src.includes('ad_type'))
    ];

    return checks.some(check => check === true);
  }

  /**
   * Attempts to skip the current ad
   */
  function skipAd() {
    const video = document.querySelector(SELECTORS.video);
    if (!video) return false;

    let skipped = false;
    const adId = video.src || 'unknown';

    // Track skip attempts
    if (!skipAttempts.has(adId)) {
      skipAttempts.set(adId, 0);
    }
    const attempts = skipAttempts.get(adId);

    if (attempts >= CONFIG.maxSkipAttempts) {
      log('Max skip attempts reached for this ad');
      return false;
    }

    // Method 1: Click skip button if available
    const skipButton = document.querySelector(SELECTORS.skipButton);
    if (skipButton && skipButton.offsetParent !== null) {
      try {
        skipButton.click();
        log('Clicked skip button');
        skipped = true;
      } catch (e) {
        log('Error clicking skip button:', e);
      }
    }

    // Method 2: Fast-forward to end of ad
    if (video.duration && video.duration > 0 && isFinite(video.duration)) {
      try {
        video.currentTime = video.duration;
        log('Fast-forwarded ad to end');
        skipped = true;
      } catch (e) {
        log('Error fast-forwarding ad:', e);
      }
    }

    // Method 3: Mute and speed up
    if (!skipped) {
      try {
        video.muted = true;
        video.playbackRate = 16; // Max speed
        log('Muted and accelerated ad');
        skipped = true;
      } catch (e) {
        log('Error accelerating ad:', e);
      }
    }

    skipAttempts.set(adId, attempts + 1);

    // Retry if skip failed
    if (!skipped && attempts < CONFIG.maxSkipAttempts) {
      setTimeout(() => skipAd(), CONFIG.skipRetryDelay);
    }

    return skipped;
  }

  /**
   * Removes ad elements from DOM
   */
  function removeAdElements() {
    let removed = false;

    // Remove ad containers
    const adContainers = document.querySelectorAll(SELECTORS.adContainer);
    adContainers.forEach(element => {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
        removed = true;
        log('Removed ad container');
      }
    });

    // Remove ad overlays
    const adOverlays = document.querySelectorAll(SELECTORS.adOverlay);
    adOverlays.forEach(element => {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
        removed = true;
        log('Removed ad overlay');
      }
    });

    // Remove any lingering skip buttons after ad removal
    const skipButtons = document.querySelectorAll(SELECTORS.skipButton);
    skipButtons.forEach(button => {
      if (button && button.offsetParent !== null) {
        button.style.display = 'none';
        removed = true;
        log('Hidden skip button');
      }
    });

    return removed;
  }

  /**
   * Removes anti-adblock enforcement popups
   */
  function removeAntiAdblockPopup() {
    let removed = false;
    const video = document.querySelector(SELECTORS.video);
    const wasPlaying = video && !video.paused;

    // Remove enforcement dialogs
    const dialogs = document.querySelectorAll(SELECTORS.enforcementDialog);
    dialogs.forEach(dialog => {
      if (dialog && dialog.parentNode) {
        dialog.parentNode.removeChild(dialog);
        removed = true;
        log('Removed enforcement dialog');
      }
    });

    // Remove enforcement overlays
    const overlays = document.querySelectorAll(SELECTORS.enforcementOverlay);
    overlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
        removed = true;
        log('Removed enforcement overlay');
      }
    });

    // Check for popup containers with enforcement messages
    const popupContainers = document.querySelectorAll(SELECTORS.popupContainer);
    popupContainers.forEach(container => {
      if (container.textContent.toLowerCase().includes('ad blocker') ||
          container.textContent.toLowerCase().includes('adblocker') ||
          container.textContent.toLowerCase().includes('adblock')) {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
          removed = true;
          log('Removed anti-adblock popup container');
        }
      }
    });

    // Resume video if it was playing and popup removal caused pause
    if (removed && wasPlaying && video && video.paused) {
      // Only resume if user didn't recently pause
      const timeSinceUserInteraction = Date.now() - lastUserInteractionTime;
      if (timeSinceUserInteraction > CONFIG.userInteractionTimeout && !userPausedVideo) {
        try {
          video.play().then(() => {
            log('Resumed video after popup removal');
          }).catch(e => {
            log('Error resuming video:', e);
          });
        } catch (e) {
          log('Error in play attempt:', e);
        }
      }
    }

    return removed;
  }

  /**
   * Main ad blocking routine
   */
  function blockAds() {
    if (!adBlockerActive) return;

    // Check for and remove anti-adblock popups first
    removeAntiAdblockPopup();

    // Check if ad is playing
    if (isAdPlaying()) {
      log('Ad detected');
      
      // Try to skip the ad
      skipAd();
      
      // Remove ad elements
      removeAdElements();
    } else {
      // Clear skip attempts when no ad is playing
      skipAttempts.clear();
    }
  }

  /**
   * Tracks user interactions with video controls
   */
  function setupUserInteractionTracking() {
    const video = document.querySelector(SELECTORS.video);
    if (!video) return;

    // Track user pause events
    video.addEventListener('pause', () => {
      // Only consider it a user pause if no ad is playing
      if (!isAdPlaying()) {
        userPausedVideo = true;
        lastUserInteractionTime = Date.now();
        log('User paused video');
      }
    });

    // Track user play events
    video.addEventListener('play', () => {
      userPausedVideo = false;
      lastUserInteractionTime = Date.now();
      log('User played video');
    });

    // Track clicks on play button
    const playButton = document.querySelector(SELECTORS.playButton);
    if (playButton) {
      playButton.addEventListener('click', () => {
        lastUserInteractionTime = Date.now();
        userPausedVideo = !userPausedVideo;
        log('User clicked play button');
      });
    }

    // Track keyboard shortcuts (spacebar, k)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === 'k') {
        const activeElement = document.activeElement;
        // Only track if not typing in an input
        if (activeElement.tagName !== 'INPUT' && 
            activeElement.tagName !== 'TEXTAREA' && 
            !activeElement.isContentEditable) {
          lastUserInteractionTime = Date.now();
          log('User keyboard interaction');
        }
      }
    });
  }

  /**
   * Initializes the ad blocker
   */
  function initialize() {
    log('Initializing YouTube Ad Blocker Pro');

    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
      return;
    }

    // Setup user interaction tracking
    const checkForVideo = setInterval(() => {
      const video = document.querySelector(SELECTORS.video);
      if (video) {
        clearInterval(checkForVideo);
        setupUserInteractionTracking();
        log('User interaction tracking initialized');
      }
    }, 500);

    // Start main blocking routine
    setInterval(blockAds, CONFIG.checkInterval);

    // Also use MutationObserver for immediate popup detection
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          // Check if any added nodes are enforcement popups
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              if (node.matches && 
                  (node.matches(SELECTORS.enforcementDialog) ||
                   node.matches(SELECTORS.enforcementOverlay) ||
                   node.matches(SELECTORS.popupContainer))) {
                removeAntiAdblockPopup();
              }
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    log('Ad blocker initialized successfully');
  }

  // Message listener for commands from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStatus') {
      sendResponse({ active: adBlockerActive });
    } else if (request.action === 'toggle') {
      adBlockerActive = !adBlockerActive;
      log('Ad blocker toggled:', adBlockerActive);
      sendResponse({ active: adBlockerActive });
    }
    return true;
  });

  // Start the extension
  initialize();
})();
