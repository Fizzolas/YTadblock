// YouTube Ad Blocker Pro - Enhanced Content Script
// Robust ad blocking with sponsored content removal and anti-adblock popup removal
// Updated November 2025 - Hotfix v1.2.1

(function() {
  'use strict';

  // State tracking to prevent auto-resume after user pause
  let userPausedVideo = false;
  let lastUserInteractionTime = 0;
  let adBlockerActive = true;
  let skipAttempts = new Map(); // Track skip attempts per ad
  let lastVideoUrl = ''; // Track current video URL to detect real videos
  let lastAdCheckTime = 0;
  let videoNormalSpeed = 1; // Track normal playback speed
  let videoWasMuted = false; // Track original mute state
  let currentAdHandled = false; // Track if current ad is already being handled
  let lastAdId = null; // Track last ad ID to prevent spam
  let adsBlockedThisSession = 0; // Track ads blocked in current session
  let sponsoredBlockedThisSession = 0; // Track sponsored content blocked
  let popupsRemovedThisSession = 0; // Track popups removed

  // Configuration
  const CONFIG = {
    checkInterval: 300, // Check every 300ms (faster response)
    skipRetryDelay: 100, // Retry skip after 100ms if failed
    maxSkipAttempts: 5, // REDUCED from 10 to 5 (less spinning)
    userInteractionTimeout: 2000, // Consider interaction "recent" for 2 seconds
    adVerificationDelay: 50, // Reduced wait time for verification
    sponsoredCheckInterval: 1000 // Check for sponsored content every second
  };

  // Selectors for various YouTube elements (Updated November 2025)
  const SELECTORS = {
    // Video player
    video: 'video',
    player: '.html5-video-player',
    playerContainer: '#movie_player',
    
    // Ad indicators (in-video ads) - Updated selectors for 2024-2025
    adContainer: '.video-ads.ytp-ad-module, .ytp-ad-module',
    adPlaying: '.ad-showing',
    adInterrupting: '.ad-interrupting',
    adOverlay: '.ytp-ad-player-overlay, .ytp-ad-player-overlay-instream-info',
    skipButton: '.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container, button.ytp-ad-skip-button-modern',
    adText: '.ytp-ad-text, .ytp-ad-simple-ad-badge',
    adBadge: '.ytp-ad-preview-text, .ytp-ad-simple-ad-badge',
    adDuration: '.ytp-ad-duration-remaining, .ytp-ad-text',
    previewAdText: '.ytp-ad-preview-text',
    adInfoPanel: '.ytp-ad-info-panel-container',
    adMessage: '.ytp-ad-message-container',
    
    // Sponsored content (homepage/feed)
    sponsoredRenderer: 'ytd-ad-slot-renderer',
    promotedSparkles: 'ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer',
    displayAd: 'ytd-display-ad-renderer, ytd-in-feed-ad-layout-renderer',
    compactAd: 'ytd-compact-promoted-video-renderer, ytd-compact-promoted-item-renderer',
    promotedVideo: 'ytd-promoted-video-renderer',
    bannerPromo: 'ytd-banner-promo-renderer, ytd-statement-banner-renderer',
    searchAds: 'ytd-search-pyv-renderer, ytd-promoted-sparkles-web-renderer',
    adSlot: 'ytd-ad-slot-renderer, .ytd-ad-slot-renderer',
    actionCompanionAd: 'ytd-action-companion-ad-renderer',
    
    // Anti-adblock popup (Updated for 2025)
    enforcementDialog: 'tp-yt-paper-dialog:has(#feedback), tp-yt-paper-dialog[aria-labelledby]',
    enforcementOverlay: 'ytd-enforcement-message-view-model, yt-mealbar-promo-renderer',
    popupContainer: 'ytd-popup-container, yt-mealbar-promo-renderer',
    modalOverlay: 'tp-yt-iron-overlay-backdrop, .scrim',
    adBlockMessage: '[class*="adblock"], [class*="ad-block"]',
    
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
   * Report ad blocked to background script
   */
  function reportAdBlocked() {
    adsBlockedThisSession++;
    chrome.runtime.sendMessage({ action: 'adBlocked' }).catch(() => {
      // Silently fail if background script unavailable
    });
  }

  /**
   * Report sponsored content blocked
   */
  function reportSponsoredBlocked(count) {
    sponsoredBlockedThisSession += count;
    chrome.runtime.sendMessage({ 
      action: 'sponsoredBlocked', 
      count: count 
    }).catch(() => {});
  }

  /**
   * Report popup removed
   */
  function reportPopupRemoved() {
    popupsRemovedThisSession++;
    chrome.runtime.sendMessage({ action: 'popupRemoved' }).catch(() => {});
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
   * Generate a unique ad ID based on video source and timestamp
   */
  function generateAdId(video) {
    if (!video || !video.src) return 'unknown';
    // Use video src + current time to create unique ID
    // This helps differentiate between multiple ads in sequence
    const srcHash = video.src.substring(0, 50); // First 50 chars
    const timeSlot = Math.floor(video.currentTime / 10); // Group by 10 second blocks
    return `${srcHash}_${timeSlot}`;
  }

  /**
   * Comprehensive ad detection with multiple verification methods
   * IMPROVED: Lowered threshold to reduce false negatives
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
      currentAdHandled = false;
      lastAdId = null;
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
      
      // Ad text indicators (more thorough)
      adTextExists: document.querySelector(SELECTORS.adText) !== null,
      adBadgeExists: document.querySelector(SELECTORS.adBadge) !== null,
      adDurationExists: document.querySelector(SELECTORS.adDuration) !== null,
      adInfoPanelExists: document.querySelector(SELECTORS.adInfoPanel) !== null,
      adMessageExists: document.querySelector(SELECTORS.adMessage) !== null,
      
      // Skip button presence (strong indicator)
      skipButtonExists: document.querySelector(SELECTORS.skipButton) !== null,
      
      // Video source URL analysis (IMPROVED)
      suspiciousVideoSrc: false
    };

    // IMPROVED: More lenient video src check for ad indicators
    if (video.src && video.src.includes('googlevideo.com')) {
      // Check for ANY ad-related URL parameters
      const srcAdIndicators = [
        video.src.includes('adformat'),
        video.src.includes('ad_type'),
        video.src.includes('&ad'),
        video.src.includes('adsid'),
        video.src.includes('ad_pod'),
        video.src.includes('cmo=')
      ].filter(Boolean).length;
      
      // FIXED: Only need 1 indicator now (was 2+)
      detectionChecks.suspiciousVideoSrc = srcAdIndicators >= 1;
    }

    // Log detection results for debugging (only if not already handled)
    const positiveChecks = Object.entries(detectionChecks)
      .filter(([key, value]) => value)
      .map(([key]) => key);

    // IMPROVED: Only log if we haven't already handled this ad
    const currentAdId = generateAdId(video);
    if (positiveChecks.length > 0 && currentAdId !== lastAdId) {
      log('Ad detection positive checks:', positiveChecks);
    }

    // IMPROVED: Require only 1 positive indicator (was 2+)
    // This catches more ads and reduces false negatives
    let isAd = positiveChecks.length >= 1;

    // Additional safety check: if player shows "Ad" text anywhere
    if (!isAd && playerContainer) {
      const playerText = playerContainer.textContent.toLowerCase();
      const hasAdLabel = playerText.includes('ad •') || 
                         playerText.includes('advertisement') ||
                         playerText.includes('video will play after ad') ||
                         playerText.includes('skip ad') ||
                         playerText.includes('skip in');
      
      if (hasAdLabel) {
        if (currentAdId !== lastAdId) {
          log('Ad confirmed by text label');
        }
        return true;
      }
    }

    // IMPROVED: Check video element classList for ad markers
    if (!isAd && video.classList.length > 0) {
      const videoClasses = Array.from(video.classList).join(' ').toLowerCase();
      if (videoClasses.includes('ad') || videoClasses.includes('advertisement')) {
        if (currentAdId !== lastAdId) {
          log('Ad detected via video element class');
        }
        return true;
      }
    }

    return isAd;
  }

  /**
   * Verify it's actually an ad before attempting skip
   * IMPROVED: Reduced delay for faster response
   */
  async function verifyAndSkipAd() {
    // IMPROVED: Reduced wait from 200ms to 50ms
    await new Promise(resolve => setTimeout(resolve, CONFIG.adVerificationDelay));
    
    // Re-check if it's still an ad
    if (isAdPlaying()) {
      skipAd();
    }
  }

  /**
   * IMPROVED: Restore video state after ad is skipped
   */
  function restoreVideoState(video) {
    try {
      // Restore playback speed if it was changed
      if (video.playbackRate === 16 && videoNormalSpeed !== 16) {
        video.playbackRate = videoNormalSpeed;
        log(`Restored playback speed to ${videoNormalSpeed}x`);
      }
      
      // Restore mute state if it was changed
      if (video.muted && !videoWasMuted) {
        video.muted = false;
        log('Restored audio (unmuted)');
      }
    } catch (e) {
      log('Error restoring video state:', e);
    }
  }

  /**
   * Attempts to skip the current ad
   * IMPROVED: Better ad ID tracking, spam prevention, and stat reporting
   */
  function skipAd() {
    const video = document.querySelector(SELECTORS.video);
    if (!video) return false;

    // SAFETY CHECK: Verify we're actually on an ad
    if (!isAdPlaying()) {
      restoreVideoState(video);
      currentAdHandled = false;
      lastAdId = null;
      return false;
    }

    let skipped = false;
    const adId = generateAdId(video);
    let isNewAd = false;

    // IMPROVED: Check if this is a new ad
    if (adId !== lastAdId) {
      // New ad detected, reset tracking
      lastAdId = adId;
      currentAdHandled = false;
      skipAttempts.set(adId, 0);
      isNewAd = true;
      // Store normal playback state
      videoNormalSpeed = video.playbackRate;
      videoWasMuted = video.muted;
    }

    // IMPROVED: If already handled (muted + accelerated), don't keep trying
    if (currentAdHandled) {
      return false; // Silently return, ad is being handled
    }

    const attempts = skipAttempts.get(adId) || 0;

    if (attempts >= CONFIG.maxSkipAttempts) {
      // Mark as handled to stop spam
      if (!currentAdHandled) {
        log(`Max skip attempts reached - ad is muted and accelerated, waiting for it to finish`);
        currentAdHandled = true;
        // Report ad blocked when we give up and let it play at 16x
        if (isNewAd) {
          reportAdBlocked();
        }
      }
      return false;
    }

    // Method 1: Click skip button if available (IMPROVED selector)
    const skipButton = document.querySelector(SELECTORS.skipButton);
    if (skipButton) {
      // Check if button is visible and clickable
      const rect = skipButton.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && 
                       window.getComputedStyle(skipButton).display !== 'none';
      
      if (isVisible) {
        try {
          skipButton.click();
          log('Clicked skip button');
          skipped = true;
          restoreVideoState(video);
          skipAttempts.delete(adId);
          currentAdHandled = false;
          lastAdId = null;
          // Report successful skip
          if (isNewAd) {
            reportAdBlocked();
          }
          return true;
        } catch (e) {
          log('Error clicking skip button:', e);
        }
      }
    }

    // Method 2: Fast-forward to end of ad (IMPROVED with better duration check)
    if (video.duration && video.duration > 0 && video.duration < 600 && isFinite(video.duration)) {
      // Ads are typically under 10 minutes (600 seconds)
      try {
        const previousTime = video.currentTime;
        
        // Jump to very end (0.05s before end)
        video.currentTime = video.duration - 0.05;
        
        if (Math.abs(video.currentTime - previousTime) > 1) {
          log(`Fast-forwarded ad from ${previousTime.toFixed(1)}s to ${video.currentTime.toFixed(1)}s`);
          skipped = true;
          
          // Mark as handled immediately after successful fast-forward
          currentAdHandled = true;
          
          // Report ad blocked
          if (isNewAd) {
            reportAdBlocked();
          }
          
          // Wait a moment then check if ad finished
          setTimeout(() => {
            if (!isAdPlaying()) {
              restoreVideoState(video);
              skipAttempts.delete(adId);
              currentAdHandled = false;
              lastAdId = null;
            }
          }, 500);
          
          skipAttempts.set(adId, attempts + 1);
          return true;
        }
      } catch (e) {
        log('Error fast-forwarding ad:', e);
      }
    }

    // Method 3: Mute and speed up (most reliable method)
    if (!skipped || attempts > 1) {
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
        
        // Mark as handled after muting and accelerating
        if (attempts >= 2) {
          currentAdHandled = true;
          // Report ad blocked when we've successfully muted + accelerated
          if (isNewAd) {
            reportAdBlocked();
          }
        }
        
        // Check if ad finished after a short time
        setTimeout(() => {
          if (!isAdPlaying()) {
            restoreVideoState(video);
            skipAttempts.delete(adId);
            currentAdHandled = false;
            lastAdId = null;
          }
        }, 1000);
      } catch (e) {
        log('Error accelerating ad:', e);
      }
    }

    skipAttempts.set(adId, attempts + 1);

    // Retry if skip failed and not yet handled
    if (!skipped && attempts < CONFIG.maxSkipAttempts && !currentAdHandled) {
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

    // IMPROVED: Remove ad info panels
    const adInfoPanels = document.querySelectorAll(SELECTORS.adInfoPanel);
    adInfoPanels.forEach(element => {
      if (element && element.parentNode) {
        element.style.display = 'none';
        removed = true;
        log('Hidden ad info panel');
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
   * IMPROVED: Added more selectors, better detection, and stat reporting
   */
  function removeSponsoredContent() {
    let removed = 0;

    // List of all sponsored content selectors (UPDATED for 2025)
    const sponsoredSelectors = [
      SELECTORS.sponsoredRenderer,
      SELECTORS.promotedSparkles,
      SELECTORS.displayAd,
      SELECTORS.compactAd,
      SELECTORS.promotedVideo,
      SELECTORS.bannerPromo,
      SELECTORS.searchAds,
      SELECTORS.adSlot,
      SELECTORS.actionCompanionAd
    ];

    sponsoredSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element && element.parentNode && element.style.display !== 'none') {
          // Hide instead of remove to prevent layout shift
          element.style.display = 'none';
          element.style.height = '0';
          element.style.margin = '0';
          element.style.padding = '0';
          element.style.overflow = 'hidden';
          removed++;
        }
      });
    });

    // Also check for elements with "sponsored" or "ad" in aria-label
    const allVideoRenderers = document.querySelectorAll('[aria-label]');
    allVideoRenderers.forEach(element => {
      const label = element.getAttribute('aria-label')?.toLowerCase() || '';
      if (label.includes('sponsored') || 
          label.includes('·ad·') || 
          label.includes('promotion') ||
          label.includes('advertisement')) {
        const videoRenderer = element.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer');
        if (videoRenderer && videoRenderer.style.display !== 'none') {
          videoRenderer.style.display = 'none';
          videoRenderer.style.height = '0';
          videoRenderer.style.margin = '0';
          videoRenderer.style.padding = '0';
          videoRenderer.style.overflow = 'hidden';
          removed++;
        }
      }
    });

    // IMPROVED: Check for "Sponsored" text in video metadata
    const metadataLines = document.querySelectorAll('ytd-video-meta-block, #metadata-line');
    metadataLines.forEach(meta => {
      const text = meta.textContent.toLowerCase();
      if (text.includes('sponsored') || text.includes('paid promotion')) {
        const videoRenderer = meta.closest('ytd-rich-item-renderer, ytd-video-renderer');
        if (videoRenderer && videoRenderer.style.display !== 'none') {
          videoRenderer.style.display = 'none';
          removed++;
          log('Removed sponsored video by metadata');
        }
      }
    });

    if (removed > 0) {
      log(`Removed ${removed} sponsored content items`);
      // Report sponsored content blocked
      reportSponsoredBlocked(removed);
    }

    return removed > 0;
  }

  /**
   * Removes anti-adblock enforcement popups
   * IMPROVED: More thorough popup detection, removal, and stat reporting
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
          text.includes('disable your ad blocker') ||
          text.includes('turn off') ||
          text.includes('allow ads')) {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
          removed = true;
          log('Removed anti-adblock popup container');
        }
      }
    });

    // IMPROVED: Check for any elements with adblock-related classes
    const adBlockMessages = document.querySelectorAll(SELECTORS.adBlockMessage);
    adBlockMessages.forEach(msg => {
      const text = msg.textContent.toLowerCase();
      if (text.includes('ad blocker') || text.includes('turn off') || text.includes('disable')) {
        const parent = msg.closest('ytd-popup-container, tp-yt-paper-dialog, yt-mealbar-promo-renderer');
        if (parent && parent.parentNode) {
          parent.parentNode.removeChild(parent);
          removed = true;
          log('Removed adblock message element');
        }
      }
    });

    // IMPROVED: Force hide body overflow restrictions
    if (removed && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = 'auto';
      log('Restored body scroll');
    }

    // Report popup removed
    if (removed) {
      reportPopupRemoved();
    }

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
   * IMPROVED: Spam prevention when ad is being handled
   */
  function blockInVideoAds() {
    if (!adBlockerActive) return;

    const currentTime = Date.now();
    
    // Throttle checks
    if (currentTime - lastAdCheckTime < CONFIG.checkInterval) {
      return;
    }
    lastAdCheckTime = currentTime;

    // Check for and remove anti-adblock popups first
    removeAntiAdblockPopup();

    // Check if ad is playing
    const adPlaying = isAdPlaying();
    
    if (adPlaying) {
      // Only log and initiate if not already handled
      if (!currentAdHandled) {
        log('Ad detected - initiating skip sequence');
      }
      
      // Verify and skip (will handle spam internally)
      verifyAndSkipAd();
      
      // Remove ad elements
      removeAdElements();
    } else {
      // Clear skip attempts and state when no ad is playing
      if (skipAttempts.size > 0 || currentAdHandled) {
        // Ensure video state is restored
        const video = document.querySelector(SELECTORS.video);
        if (video) {
          restoreVideoState(video);
        }
        skipAttempts.clear();
        currentAdHandled = false;
        lastAdId = null;
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
        const video = document.querySelector(SELECTORS.video);
        userPausedVideo = video ? video.paused : false;
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
    log('Initializing YouTube Ad Blocker Pro - Hotfix v1.2.1 (November 2025)');

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

    // Start main blocking routine for in-video ads (IMPROVED: faster interval)
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
                   node.matches(SELECTORS.popupContainer) ||
                   node.matches(SELECTORS.adBlockMessage))) {
                removeAntiAdblockPopup();
              }
              
              // Check for sponsored content
              if (node.matches && 
                  (node.matches(SELECTORS.sponsoredRenderer) ||
                   node.matches(SELECTORS.promotedSparkles) ||
                   node.matches(SELECTORS.displayAd) ||
                   node.matches(SELECTORS.adSlot) ||
                   node.matches(SELECTORS.actionCompanionAd))) {
                removeSponsoredContent();
              }
              
              // IMPROVED: Check for ad containers being added
              if (node.matches &&
                  (node.matches(SELECTORS.adContainer) ||
                   node.matches(SELECTORS.adOverlay))) {
                log('Ad element detected via mutation observer');
                setTimeout(blockInVideoAds, 50);
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

    log('Ad blocker initialized successfully - Hotfix v1.2.1 active');
  }

  // Message listener for commands from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStatus') {
      sendResponse({ active: adBlockerActive });
    } else if (request.action === 'toggle') {
      adBlockerActive = !adBlockerActive;
      log('Ad blocker toggled:', adBlockerActive);
      sendResponse({ active: adBlockerActive });
    } else if (request.action === 'getSessionStats') {
      sendResponse({
        adsBlocked: adsBlockedThisSession,
        sponsoredBlocked: sponsoredBlockedThisSession,
        popupsRemoved: popupsRemovedThisSession
      });
    }
    return true;
  });

  // Start the extension
  initialize();
})();