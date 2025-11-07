// YouTube Ad Blocker Pro - Enhanced Content Script
// Robust ad blocking with sponsored content removal and anti-adblock popup removal

(function() {
  'use strict';

  // State tracking to prevent auto-resume after user pause
  let userPausedVideo = false;
  let lastUserInteractionTime = 0;
  let adBlockerActive = true;
  let skipAttempts = new Map(); // Track skip attempts per ad
  let lastVideoUrl = ''; // Track current video URL to detect real videos
  let lastAdCheckTime = 0;

  // Configuration
  const CONFIG = {
    checkInterval: 500, // Check every 500ms
    skipRetryDelay: 150, // Retry skip after 150ms if failed
    maxSkipAttempts: 8, // Max attempts to skip an ad
    userInteractionTimeout: 2000, // Consider interaction "recent" for 2 seconds
    adVerificationDelay: 200, // Wait before verifying it's actually an ad
    sponsoredCheckInterval: 1000 // Check for sponsored content every second
  };

  // Selectors for various YouTube elements
  const SELECTORS = {
    // Video player
    video: 'video',
    player: '.html5-video-player',
    playerContainer: '#movie_player',
    
    // Ad indicators (in-video ads)
    adContainer: '.video-ads.ytp-ad-module',
    adPlaying: '.ad-showing',
    adInterrupting: '.ad-interrupting',
    adOverlay: '.ytp-ad-player-overlay',
    skipButton: '.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern',
    adText: '.ytp-ad-text',
    adBadge: '.ytp-ad-preview-text',
    adDuration: '.ytp-ad-duration-remaining',
    previewAdText: '.ytp-ad-preview-text',
    
    // Sponsored content (homepage/feed)
    sponsoredRenderer: 'ytd-ad-slot-renderer',
    promotedSparkles: 'ytd-promoted-sparkles-web-renderer',
    displayAd: 'ytd-display-ad-renderer',
    compactAd: 'ytd-compact-promoted-video-renderer',
    promotedVideo: 'ytd-promoted-video-renderer',
    bannerPromo: 'ytd-banner-promo-renderer',
    searchAds: 'ytd-search-pyv-renderer',
    adSlot: 'ytd-ad-slot-renderer, .ytd-ad-slot-renderer',
    
    // Anti-adblock popup
    enforcementDialog: 'tp-yt-paper-dialog:has(#feedback)',
    enforcementOverlay: 'ytd-enforcement-message-view-model',
    popupContainer: 'ytd-popup-container',
    modalOverlay: 'tp-yt-iron-overlay-backdrop',
    
    // Player controls
    playButton: '.ytp-play-button',
    
    // Video info
    videoTitle: '.ytp-title-link',
    channelName: '.ytp-title-channel-name'
  };

  /**
   * Logs messages with timestamp
   */
  function log(message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(`[YT AdBlock ${timestamp}]`, message, data || '');
  }

  /**
   * Gets the current video URL from the page
   */
  function getCurrentVideoUrl() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v') || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Comprehensive ad detection with multiple verification methods
   */
  function isAdPlaying() {
    const video = document.querySelector(SELECTORS.video);
    const player = document.querySelector(SELECTORS.player);
    const playerContainer = document.querySelector(SELECTORS.playerContainer);
    
    if (!video || !player) return false;

    // CRITICAL: Check if we're on an actual video page
    const currentUrl = getCurrentVideoUrl();
    if (!currentUrl) {
      // Not on a video page, can't be playing an ad
      return false;
    }

    // If video URL changed, we're watching a new video (not an ad)
    if (currentUrl !== lastVideoUrl && lastVideoUrl !== '') {
      lastVideoUrl = currentUrl;
      skipAttempts.clear();
      return false;
    }
    lastVideoUrl = currentUrl;

    // Multiple detection methods for reliability
    const detectionChecks = {
      // DOM class indicators
      adShowingClass: player.classList.contains('ad-showing'),
      adInterruptingClass: player.classList.contains('ad-interrupting'),
      
      // Ad container presence
      adContainerExists: document.querySelector(SELECTORS.adContainer) !== null,
      
      // Ad overlay presence
      adOverlayExists: document.querySelector(SELECTORS.adOverlay) !== null,
      
      // Ad text indicators
      adTextExists: document.querySelector(SELECTORS.adText) !== null,
      adBadgeExists: document.querySelector(SELECTORS.adBadge) !== null,
      adDurationExists: document.querySelector(SELECTORS.adDuration) !== null,
      
      // Skip button presence (strong indicator)
      skipButtonExists: document.querySelector(SELECTORS.skipButton) !== null,
      
      // Video source URL analysis
      suspiciousVideoSrc: false
    };

    // Check video src for ad indicators (be very careful here)
    if (video.src && video.src.includes('googlevideo.com')) {
      // Only flag as ad if MULTIPLE ad indicators are present in URL
      const srcAdIndicators = [
        video.src.includes('adformat'),
        video.src.includes('ad_type'),
        video.src.includes('&ad'),
        video.src.includes('adsid')
      ].filter(Boolean).length;
      
      detectionChecks.suspiciousVideoSrc = srcAdIndicators >= 2;
    }

    // Log detection results for debugging
    const positiveChecks = Object.entries(detectionChecks)
      .filter(([key, value]) => value)
      .map(([key]) => key);

    if (positiveChecks.length > 0) {
      log('Ad detection positive checks:', positiveChecks);
    }

    // Require at least 2 positive indicators to confirm it's an ad
    // This prevents false positives on regular videos
    const isAd = positiveChecks.length >= 2;

    // Additional safety check: if player shows "Ad" text anywhere
    if (!isAd && playerContainer) {
      const playerText = playerContainer.textContent.toLowerCase();
      const hasAdLabel = playerText.includes('ad •') || 
                         playerText.includes('advertisement') ||
                         playerText.includes('video will play after ad');
      
      if (hasAdLabel && positiveChecks.length >= 1) {
        log('Ad confirmed by text label');
        return true;
      }
    }

    return isAd;
  }

  /**
   * Verify it's actually an ad before attempting skip
   */
  async function verifyAndSkipAd() {
    // Wait a moment to ensure detection is accurate
    await new Promise(resolve => setTimeout(resolve, CONFIG.adVerificationDelay));
    
    // Re-check if it's still an ad
    if (isAdPlaying()) {
      skipAd();
    } else {
      log('Verification failed - not an ad, skipping skip attempt');
    }
  }

  /**
   * Attempts to skip the current ad
   */
  function skipAd() {
    const video = document.querySelector(SELECTORS.video);
    if (!video) return false;

    // SAFETY CHECK: Verify we're actually on an ad
    if (!isAdPlaying()) {
      log('Skip cancelled - not an ad');
      return false;
    }

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

    // Method 2: Fast-forward to end of ad (only if duration is reasonable for an ad)
    if (video.duration && video.duration > 0 && video.duration < 300 && isFinite(video.duration)) {
      // Ads are typically under 5 minutes (300 seconds)
      // This prevents skipping through actual long-form content
      try {
        const previousTime = video.currentTime;
        video.currentTime = video.duration - 0.1; // Jump to near end
        
        if (video.currentTime !== previousTime) {
          log(`Fast-forwarded ad from ${previousTime.toFixed(1)}s to ${video.currentTime.toFixed(1)}s`);
          skipped = true;
        }
      } catch (e) {
        log('Error fast-forwarding ad:', e);
      }
    }

    // Method 3: Mute and speed up (safest method)
    if (!skipped) {
      try {
        if (!video.muted) {
          video.muted = true;
          log('Muted ad');
        }
        if (video.playbackRate !== 16) {
          video.playbackRate = 16; // Max speed
          log('Accelerated ad to 16x speed');
        }
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
   * Removes in-video ad elements from DOM
   */
  function removeAdElements() {
    if (!isAdPlaying()) {
      return false; // Safety check
    }

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
   * Removes sponsored content from homepage and feed
   */
  function removeSponsoredContent() {
    let removed = 0;

    // List of all sponsored content selectors
    const sponsoredSelectors = [
      SELECTORS.sponsoredRenderer,
      SELECTORS.promotedSparkles,
      SELECTORS.displayAd,
      SELECTORS.compactAd,
      SELECTORS.promotedVideo,
      SELECTORS.bannerPromo,
      SELECTORS.searchAds,
      SELECTORS.adSlot
    ];

    sponsoredSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element && element.parentNode) {
          // Hide instead of remove to prevent layout shift
          element.style.display = 'none';
          element.style.height = '0';
          element.style.margin = '0';
          element.style.padding = '0';
          removed++;
        }
      });
    });

    // Also check for elements with "sponsored" or "ad" in aria-label
    const allVideoRenderers = document.querySelectorAll('[aria-label]');
    allVideoRenderers.forEach(element => {
      const label = element.getAttribute('aria-label')?.toLowerCase() || '';
      if (label.includes('sponsored') || label.includes('·ad·') || label.includes('promotion')) {
        const videoRenderer = element.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer');
        if (videoRenderer && videoRenderer.style.display !== 'none') {
          videoRenderer.style.display = 'none';
          videoRenderer.style.height = '0';
          videoRenderer.style.margin = '0';
          videoRenderer.style.padding = '0';
          removed++;
        }
      }
    });

    if (removed > 0) {
      log(`Removed ${removed} sponsored content items`);
    }

    return removed > 0;
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

    // Remove modal overlays (backdrop)
    const modalOverlays = document.querySelectorAll(SELECTORS.modalOverlay);
    modalOverlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.style.display = 'none';
        removed = true;
        log('Removed modal overlay');
      }
    });

    // Check for popup containers with enforcement messages
    const popupContainers = document.querySelectorAll(SELECTORS.popupContainer);
    popupContainers.forEach(container => {
      const text = container.textContent.toLowerCase();
      if (text.includes('ad blocker') ||
          text.includes('adblocker') ||
          text.includes('adblock') ||
          text.includes('ads are blocked') ||
          text.includes('disable your ad blocker')) {
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
   * Main ad blocking routine for in-video ads
   */
  function blockInVideoAds() {
    if (!adBlockerActive) return;

    const currentTime = Date.now();
    
    // Throttle checks slightly
    if (currentTime - lastAdCheckTime < CONFIG.checkInterval) {
      return;
    }
    lastAdCheckTime = currentTime;

    // Check for and remove anti-adblock popups first
    removeAntiAdblockPopup();

    // Check if ad is playing
    if (isAdPlaying()) {
      log('Ad detected - initiating skip sequence');
      
      // Verify and skip with delay to prevent false positives
      verifyAndSkipAd();
      
      // Remove ad elements
      removeAdElements();
    } else {
      // Clear skip attempts when no ad is playing
      if (skipAttempts.size > 0) {
        skipAttempts.clear();
      }
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
    document.addEventListener('click', (e) => {
      const playButton = e.target.closest(SELECTORS.playButton);
      if (playButton) {
        lastUserInteractionTime = Date.now();
        userPausedVideo = video.paused;
        log('User clicked play button');
      }
    }, true);

    // Track keyboard shortcuts (spacebar, k)
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
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
    log('Initializing YouTube Ad Blocker Pro - Enhanced Edition');

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

    // Start main blocking routine for in-video ads
    setInterval(blockInVideoAds, CONFIG.checkInterval);

    // Start sponsored content removal (homepage/feed)
    setInterval(removeSponsoredContent, CONFIG.sponsoredCheckInterval);
    removeSponsoredContent(); // Run immediately

    // Use MutationObserver for immediate popup and sponsored content detection
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              // Check for enforcement popups
              if (node.matches && 
                  (node.matches(SELECTORS.enforcementDialog) ||
                   node.matches(SELECTORS.enforcementOverlay) ||
                   node.matches(SELECTORS.popupContainer))) {
                removeAntiAdblockPopup();
              }
              
              // Check for sponsored content
              if (node.matches && 
                  (node.matches(SELECTORS.sponsoredRenderer) ||
                   node.matches(SELECTORS.promotedSparkles) ||
                   node.matches(SELECTORS.displayAd) ||
                   node.matches(SELECTORS.adSlot))) {
                removeSponsoredContent();
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

    log('Ad blocker initialized successfully - All features active');
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
