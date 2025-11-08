// YouTube Ad Blocker Pro - Complete 2025 Edition
// Version 1.3.0 - November 2025
// Enhanced SSAI handling, 16x speed primary, modern selectors

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    checkInterval: 250,           // Check for ads every 250ms (faster detection)
    skipRetryDelay: 80,           // Faster retry between skip attempts
    maxSkipAttempts: 5,           // Max times to try skipping
    adVerificationDelay: 30,      // Minimal delay before confirming ad
    sponsoredCheckInterval: 1500, // Check for sponsored content
    popupCheckInterval: 800,      // Check for anti-adblock popups
    ssaiCheckInterval: 2000,      // Check for SSAI ads stuck
    ssaiForceReloadTime: 35000,   // Force reload if ad stuck >35s
    debug: false                  // Set true for console logging
  };

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  let state = {
    isActive: true,
    currentVideoUrl: null,
    currentAdId: null,
    currentAdHandled: false,
    lastAdId: null,
    skipAttempts: 0,
    
    // Video state preservation
    originalPlaybackRate: 1,
    originalMuted: false,
    wasPlayingBeforeAd: false,
    
    // SSAI handling
    ssaiDetected: false,
    ssaiStartTime: null,
    ssaiForceAttempts: 0,
    ssaiReloadAttempted: false,
    
    // Session statistics
    sessionStats: {
      adsBlocked: 0,
      sponsoredBlocked: 0,
      popupsRemoved: 0
    },
    
    // Intervals
    intervals: {
      adCheck: null,
      sponsoredCheck: null,
      popupCheck: null,
      ssaiCheck: null
    }
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[YT AdBlock 2025]', ...args);
    }
  }

  function getVideo() {
    return document.querySelector('video.html5-main-video');
  }

  function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  function generateAdId(video) {
    if (!video) return null;
    const timeSlot = Math.floor(video.currentTime / 10);
    const videoId = getCurrentVideoId() || 'unknown';
    return `${videoId}_${timeSlot}_${Date.now()}`;
  }

  // ============================================
  // AD DETECTION - 2025 UPDATED SELECTORS
  // ============================================
  
  const AD_SELECTORS = {
    // Primary ad indicators (2025)
    containers: [
      '.video-ads.ytp-ad-module',
      '.ytp-ad-player-overlay',
      'div.ad-showing',
      '.ytp-ad-player-overlay-instream-info',
      'ytd-player-legacy-desktop-watch-ads-renderer',
      '#player-ads',
      '.ytp-ad-overlay-container'
    ],
    
    // Skip buttons (2025)
    skipButtons: [
      'button.ytp-ad-skip-button',
      'button.ytp-ad-skip-button-modern',
      'button.ytp-skip-ad-button',
      '.ytp-ad-skip-button-container button',
      'button[class*="skip"]',
      'button.ytp-ad-skip-button-slot'
    ],
    
    // Ad badges and overlays
    badges: [
      '.ytp-ad-simple-ad-badge',
      '.ytp-ad-badge',
      '.ytp-ad-text',
      '.ytp-ad-preview-container',
      '.ytp-ad-duration-remaining',
      '.ytp-ad-info-panel-container',
      '.ytp-ad-message-container'
    ],
    
    // Class indicators
    playerClasses: [
      'ad-showing',
      'ad-interrupting',
      'unstarted-mode'
    ]
  };

  function isAdPlaying(video) {
    if (!video) return false;

    let indicators = 0;
    
    // Check 1: Ad container elements (STRONG indicator)
    for (const selector of AD_SELECTORS.containers) {
      if (document.querySelector(selector)) {
        indicators++;
        log('Ad container found:', selector);
      }
    }
    
    // Check 2: Player classes (STRONG indicator)
    const playerContainer = document.querySelector('.html5-video-player');
    if (playerContainer) {
      for (const className of AD_SELECTORS.playerClasses) {
        if (playerContainer.classList.contains(className)) {
          indicators++;
          log('Ad player class found:', className);
        }
      }
    }
    
    // Check 3: Ad badges/overlays (MEDIUM indicator)
    for (const selector of AD_SELECTORS.badges) {
      if (document.querySelector(selector)) {
        indicators++;
        log('Ad badge found:', selector);
        break; // Only count once for badges
      }
    }
    
    // Check 4: Video source URL analysis (MEDIUM indicator)
    if (video.src) {
      const adUrlIndicators = [
        'doubleclick.net',
        'googlevideo.com/videoplayback',
        'ad_type=',
        '&adurl=',
        'ad_pod',
        'cmo=',
        '&ad='
      ];
      
      for (const indicator of adUrlIndicators) {
        if (video.src.includes(indicator)) {
          indicators++;
          log('Ad URL indicator found:', indicator);
          break; // Only count once for URL
        }
      }
    }
    
    // Check 5: Text content analysis (WEAK indicator)
    const bodyText = document.body.innerText.toLowerCase();
    if (bodyText.includes('skip ad') || 
        bodyText.includes('skip in') ||
        bodyText.includes('advertisement') ||
        bodyText.match(/ad \d+of \d+/)) {
      indicators++;
      log('Ad text content found');
    }
    
    // Check 6: Skip button presence (STRONG indicator)
    for (const selector of AD_SELECTORS.skipButtons) {
      const skipBtn = document.querySelector(selector);
      if (skipBtn && skipBtn.offsetParent !== null) {
        indicators += 2; // Skip button is a very strong indicator
        log('Skip button found:', selector);
        break;
      }
    }

    // Require at least 1 strong indicator to confirm ad
    const isAd = indicators >= 1;
    
    if (isAd) {
      log(`Ad detected with ${indicators} indicators`);
    }
    
    return isAd;
  }

  // ============================================
  // VIDEO STATE MANAGEMENT
  // ============================================
  
  function saveVideoState(video) {
    if (!video) return;
    
    state.originalPlaybackRate = video.playbackRate;
    state.originalMuted = video.muted;
    state.wasPlayingBeforeAd = !video.paused;
    
    log('Video state saved:', {
      rate: state.originalPlaybackRate,
      muted: state.originalMuted,
      playing: state.wasPlayingBeforeAd
    });
  }

  function restoreVideoState(video) {
    if (!video) return;
    
    try {
      // Restore playback rate
      if (video.playbackRate !== state.originalPlaybackRate) {
        video.playbackRate = state.originalPlaybackRate;
        log('Playback rate restored to:', state.originalPlaybackRate);
      }
      
      // Restore mute state
      if (video.muted !== state.originalMuted) {
        video.muted = state.originalMuted;
        log('Mute state restored to:', state.originalMuted);
      }
      
      // Resume playback if it was playing
      if (state.wasPlayingBeforeAd && video.paused) {
        video.play().catch(e => log('Resume play error:', e));
        log('Video playback resumed');
      }
      
    } catch (error) {
      log('Error restoring video state:', error);
    }
  }

  // ============================================
  // AD SKIPPING METHODS (Priority Order)
  // ============================================
  
  // Method 1: Click skip button (most reliable)
  function tryClickSkipButton() {
    for (const selector of AD_SELECTORS.skipButtons) {
      const skipButton = document.querySelector(selector);
      
      if (skipButton) {
        const rect = skipButton.getBoundingClientRect();
        const style = window.getComputedStyle(skipButton);
        
        // Check if button is actually visible and clickable
        if (rect.width > 0 && 
            rect.height > 0 && 
            style.display !== 'none' && 
            style.visibility !== 'hidden' &&
            style.opacity !== '0') {
          
          skipButton.click();
          log('Skip button clicked:', selector);
          return true;
        }
      }
    }
    return false;
  }

  // Method 2: 16x Speed Acceleration (PRIMARY METHOD for 2025)
  // Most effective against SSAI - learned from research
  function accelerateAd(video) {
    if (!video) return false;
    
    try {
      // Mute the ad
      if (!video.muted) {
        video.muted = true;
        log('Ad muted');
      }
      
      // Accelerate to maximum speed (16x)
      if (video.playbackRate !== 16) {
        video.playbackRate = 16;
        log('Ad accelerated to 16x speed');
      }
      
      // Ensure video is playing
      if (video.paused) {
        video.play().catch(e => log('Play error during acceleration:', e));
      }
      
      return true;
      
    } catch (error) {
      log('Error accelerating ad:', error);
      return false;
    }
  }

  // Method 3: Fast-forward (fallback)
  function tryFastForward(video) {
    if (!video) return false;
    
    try {
      const duration = video.duration;
      
      // Safety check: only fast-forward if duration is reasonable for an ad
      if (duration && duration > 0 && duration < 300) { // Max 5 minutes
        const currentTime = video.currentTime;
        const timeRemaining = duration - currentTime;
        
        if (timeRemaining > 0.5) {
          // Jump to near end (leave 0.1s for proper transition)
          video.currentTime = duration - 0.1;
          log(`Fast-forwarded ad from ${currentTime.toFixed(2)}s to ${video.currentTime.toFixed(2)}s`);
          return true;
        }
      }
    } catch (error) {
      log('Error fast-forwarding:', error);
    }
    
    return false;
  }

  // ============================================
  // SSAI DETECTION & HANDLING
  // ============================================
  
  function detectSSAI(video) {
    if (!video) return false;
    
    // SSAI indicators:
    // 1. Ad detected but skip button never appears
    // 2. Video duration changes during ad
    // 3. Fast-forward doesn't work
    // 4. Ad lasts longer than typical (>30s)
    
    if (state.ssaiStartTime && !state.ssaiReloadAttempted) {
      const adDuration = (Date.now() - state.ssaiStartTime) / 1000;
      
      // If ad has been playing for >30s and still showing
      if (adDuration > 30 && isAdPlaying(video)) {
        log('SSAI detected: Ad >30s without skip');
        return true;
      }
      
      // If we've tried skipping multiple times and ad persists
      if (state.skipAttempts >= CONFIG.maxSkipAttempts && adDuration > 15) {
        log('SSAI detected: Skip attempts exhausted');
        return true;
      }
    }
    
    return false;
  }

  function handleSSAI(video) {
    if (!video || state.ssaiReloadAttempted) return;
    
    log('SSAI ad detected - applying aggressive measures');
    state.ssaiDetected = true;
    
    // Method 1: Aggressive 16x acceleration (works for most SSAI)
    accelerateAd(video);
    
    // Method 2: Try seeking forward in intervals
    const trySeek = () => {
      if (!isAdPlaying(video)) {
        log('SSAI ad ended, canceling seek attempts');
        return;
      }
      
      try {
        const currentTime = video.currentTime;
        video.currentTime = currentTime + 5; // Jump 5 seconds
        log(`SSAI: Attempted seek to ${video.currentTime}s`);
        
        state.ssaiForceAttempts++;
        
        if (state.ssaiForceAttempts < 10) {
          setTimeout(trySeek, 2000); // Try again in 2s
        }
      } catch (e) {
        log('SSAI seek error:', e);
      }
    };
    
    setTimeout(trySeek, 2000);
    
    // Method 3: Force reload player as last resort (after 35s)
    setTimeout(() => {
      if (isAdPlaying(video) && !state.ssaiReloadAttempted) {
        log('SSAI: Attempting player reload');
        state.ssaiReloadAttempted = true;
        
        try {
          // Try to reload the video player
          const videoUrl = window.location.href;
          const videoId = getCurrentVideoId();
          
          if (videoId) {
            // Reload current video
            window.location.href = `https://www.youtube.com/watch?v=${videoId}`;
          }
        } catch (e) {
          log('SSAI reload error:', e);
        }
      }
    }, CONFIG.ssaiForceReloadTime);
  }

  // ============================================
  // MAIN AD HANDLER
  // ============================================
  
  function handleAdSkip() {
    const video = getVideo();
    if (!video || !state.isActive) return;

    const currentVideoId = getCurrentVideoId();
    
    // Reset state if video changed
    if (state.currentVideoUrl !== currentVideoId) {
      state.currentVideoUrl = currentVideoId;
      state.currentAdId = null;
      state.currentAdHandled = false;
      state.skipAttempts = 0;
      state.ssaiDetected = false;
      state.ssaiStartTime = null;
      state.ssaiForceAttempts = 0;
      state.ssaiReloadAttempted = false;
      log('Video changed, state reset');
    }

    // Check if ad is playing
    if (!isAdPlaying(video)) {
      // If we were handling an ad, restore state
      if (state.currentAdHandled) {
        restoreVideoState(video);
        state.currentAdHandled = false;
        state.skipAttempts = 0;
        state.ssaiDetected = false;
        state.ssaiStartTime = null;
        log('Ad ended, state restored');
      }
      return;
    }

    // Generate or reuse ad ID
    const currentAdId = generateAdId(video);
    
    // New ad detected
    if (currentAdId !== state.currentAdId) {
      state.currentAdId = currentAdId;
      state.currentAdHandled = false;
      state.skipAttempts = 0;
      state.ssaiStartTime = Date.now();
      state.ssaiForceAttempts = 0;
      state.ssaiReloadAttempted = false;
      
      // Log only if different from last ad (prevent spam)
      if (currentAdId !== state.lastAdId) {
        log('New ad detected:', currentAdId);
        state.lastAdId = currentAdId;
        state.sessionStats.adsBlocked++;
        
        // Notify background script
        chrome.runtime.sendMessage({ action: 'adBlocked' }).catch(() => {});
      }
      
      // Save video state before manipulation
      saveVideoState(video);
    }

    // If already handled this ad, check for SSAI and continue acceleration
    if (state.currentAdHandled) {
      // Check for SSAI
      if (detectSSAI(video)) {
        if (!state.ssaiDetected) {
          handleSSAI(video);
        }
      }
      
      // Keep ad muted and accelerated even if handled
      if (!video.muted) video.muted = true;
      if (video.playbackRate !== 16) video.playbackRate = 16;
      
      return;
    }

    // Try to skip the ad
    if (state.skipAttempts < CONFIG.maxSkipAttempts) {
      state.skipAttempts++;
      
      // Priority 1: Try clicking skip button
      if (tryClickSkipButton()) {
        log(`Skip button clicked (attempt ${state.skipAttempts})`);
        
        // Verify skip worked after short delay
        setTimeout(() => {
          if (!isAdPlaying(video)) {
            log('Skip successful');
            state.currentAdHandled = true;
            restoreVideoState(video);
          }
        }, CONFIG.adVerificationDelay);
        
        return;
      }
      
      // Priority 2: Try fast-forward
      if (tryFastForward(video)) {
        log(`Fast-forward attempted (attempt ${state.skipAttempts})`);
        
        // Verify fast-forward worked
        setTimeout(() => {
          if (!isAdPlaying(video)) {
            log('Fast-forward successful');
            state.currentAdHandled = true;
            restoreVideoState(video);
          }
        }, CONFIG.adVerificationDelay);
        
        return;
      }
      
      // Priority 3: Accelerate (always works, even for SSAI)
      if (accelerateAd(video)) {
        log(`Ad accelerated (attempt ${state.skipAttempts})`);
      }
      
      // Schedule next attempt
      setTimeout(handleAdSkip, CONFIG.skipRetryDelay);
      
    } else {
      // Max attempts reached - mark as handled and keep accelerated
      if (!state.currentAdHandled) {
        log('Max skip attempts reached - keeping ad muted/accelerated');
        state.currentAdHandled = true;
        accelerateAd(video); // Ensure it stays accelerated
        
        // Check for SSAI
        if (detectSSAI(video)) {
          handleSSAI(video);
        }
      }
    }
  }

  // ============================================
  // SPONSORED CONTENT REMOVAL - 2025 SELECTORS
  // ============================================
  
  const SPONSORED_SELECTORS = [
    // Main ad slots (2025 updated)
    'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    
    // Promoted content
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-compact-promoted-item-renderer',
    'ytd-action-companion-ad-renderer',
    
    // Search and feed ads
    'ytd-search-pyv-renderer',
    'ytd-video-renderer[is-ad]',
    'ytd-grid-video-renderer[is-ad]',
    
    // Masthead ads
    'ytd-rich-item-renderer[is-ad]',
    'ytd-primetime-promo-renderer',
    
    // Shopping and brand elements
    '#masthead-ad',
    'ytd-player-legacy-desktop-watch-ads-renderer'
  ];

  function removeSponsoredContent() {
    if (!state.isActive) return;
    
    let removed = 0;
    
    for (const selector of SPONSORED_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(el => {
        if (el && el.parentElement) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.height = '0';
          el.style.overflow = 'hidden';
          removed++;
        }
      });
    }
    
    // Check for aria-label sponsored indicators
    const elementsWithAriaLabel = document.querySelectorAll('[aria-label*="Sponsored"], [aria-label*="Ad"]');
    elementsWithAriaLabel.forEach(el => {
      // Find parent video/content container
      const container = el.closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer');
      if (container) {
        container.style.display = 'none';
        container.style.visibility = 'hidden';
        removed++;
      }
    });
    
    // Check metadata for sponsored indicators
    const metadataElements = document.querySelectorAll('#metadata-line, ytd-video-meta-block');
    metadataElements.forEach(el => {
      const text = el.textContent.toLowerCase();
      if (text.includes('sponsored') || text.includes('paid promotion')) {
        const container = el.closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer');
        if (container) {
          container.style.display = 'none';
          container.style.visibility = 'hidden';
          removed++;
        }
      }
    });
    
    if (removed > 0) {
      log(`Removed ${removed} sponsored content items`);
      state.sessionStats.sponsoredBlocked += removed;
      chrome.runtime.sendMessage({ 
        action: 'sponsoredBlocked', 
        count: removed 
      }).catch(() => {});
    }
  }

  // ============================================
  // ANTI-ADBLOCK POPUP REMOVAL - 2025
  // ============================================
  
  const POPUP_SELECTORS = [
    // Anti-adblock dialogs (2025)
    'tp-yt-paper-dialog',
    'tp-yt-paper-dialog[aria-labelledby]',
    'ytd-enforcement-message-view-model',
    'yt-mealbar-promo-renderer',
    
    // Modal overlays
    '.ytd-popup-container',
    'ytd-popup-container',
    'yt-player-error-message-renderer',
    
    // Backdrops and scrims
    'tp-yt-iron-overlay-backdrop',
    'tp-yt-paper-dialog-scrollable',
    '.scrim',
    
    // Generic ad-block detection
    '[class*="adblock"]',
    '[class*="ad-block"]',
    '[id*="adblock"]'
  ];

  const POPUP_TEXT_INDICATORS = [
    'ad blocker',
    'adblock',
    'turn off',
    'allow ads',
    'disable',
    'ad blocking',
    'preventing you',
    'video will play'
  ];

  function removeAntiAdblockPopups() {
    if (!state.isActive) return;
    
    let removed = 0;
    
    // Remove popup containers
    for (const selector of POPUP_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(el => {
        const text = el.textContent.toLowerCase();
        let shouldRemove = false;
        
        // Check if contains anti-adblock text
        for (const indicator of POPUP_TEXT_INDICATORS) {
          if (text.includes(indicator)) {
            shouldRemove = true;
            break;
          }
        }
        
        // Also remove if selector itself indicates adblock
        if (selector.includes('adblock') || selector.includes('enforcement')) {
          shouldRemove = true;
        }
        
        if (shouldRemove && el.parentElement) {
          el.remove();
          removed++;
          log('Removed anti-adblock popup:', selector);
        }
      });
    }
    
    // Remove backdrop/scrim elements that block interaction
    const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop, .scrim');
    backdrops.forEach(backdrop => {
      backdrop.remove();
      removed++;
    });
    
    // Restore body scroll if locked
    if (document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
    }
    
    if (removed > 0) {
      log(`Removed ${removed} anti-adblock popups`);
      state.sessionStats.popupsRemoved += removed;
      chrome.runtime.sendMessage({ action: 'popupRemoved' }).catch(() => {});
      
      // Resume video playback if paused by popup
      const video = getVideo();
      if (video && video.paused && state.wasPlayingBeforeAd) {
        video.play().catch(e => log('Resume after popup error:', e));
      }
    }
  }

  // ============================================
  // BLACK SCREEN MITIGATION
  // ============================================
  
  let blackScreenAttempts = 0;
  
  function forciblyRestoreVideo(video) {
    if (!video) return;
    
    try {
      // Kick player - try play and slight seek
      video.play();
      video.currentTime += 0.1;
      log('Forced video player nudge after ad skip');
    } catch (e) {
      log('Video nudge error:', e);
    }
  }

  function blackScreenMitigation(video) {
    if (!video) return;
    
    if ((video.paused || video.readyState < 2) && blackScreenAttempts < 3) {
      forciblyRestoreVideo(video);
      blackScreenAttempts++;
      
      setTimeout(() => {
        if (video.paused || video.readyState < 2) {
          blackScreenMitigation(video);
        }
      }, 1200);
    }
  }

  function handleAdSkipCompleted(video) {
    blackScreenAttempts = 0;
    setTimeout(() => blackScreenMitigation(video), 600);
  }

  // ============================================
  // MUTATION OBSERVER FOR INSTANT DETECTION
  // ============================================
  
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (!state.isActive) return;
      
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for ad containers
            for (const selector of AD_SELECTORS.containers) {
              if (node.matches && node.matches(selector)) {
                log('Ad container added via mutation:', selector);
                handleAdSkip();
                return;
              }
            }
            
            // Check for sponsored content
            for (const selector of SPONSORED_SELECTORS) {
              if (node.matches && node.matches(selector)) {
                node.style.display = 'none';
                node.style.visibility = 'hidden';
                log('Sponsored content hidden via mutation');
              }
            }
            
            // Check for anti-adblock popups
            for (const selector of POPUP_SELECTORS) {
              if (node.matches && node.matches(selector)) {
                const text = node.textContent.toLowerCase();
                for (const indicator of POPUP_TEXT_INDICATORS) {
                  if (text.includes(indicator)) {
                    node.remove();
                    log('Anti-adblock popup removed via mutation');
                    return;
                  }
                }
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    log('MutationObserver initialized');
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle') {
      state.isActive = !state.isActive;
      log('Extension toggled:', state.isActive ? 'ON' : 'OFF');
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
    log('YouTube Ad Blocker Pro 2025 initializing...');
    log('Version: 1.3.0 - November 2025');
    log('Enhanced SSAI handling enabled');
    
    // Start main ad checking interval
    state.intervals.adCheck = setInterval(handleAdSkip, CONFIG.checkInterval);
    
    // Start sponsored content removal
    state.intervals.sponsoredCheck = setInterval(removeSponsoredContent, CONFIG.sponsoredCheckInterval);
    removeSponsoredContent(); // Run immediately
    
    // Start anti-adblock popup removal
    state.intervals.popupCheck = setInterval(removeAntiAdblockPopups, CONFIG.popupCheckInterval);
    removeAntiAdblockPopups(); // Run immediately
    
    // Setup mutation observer for instant detection
    if (document.body) {
      setupMutationObserver();
    } else {
      document.addEventListener('DOMContentLoaded', setupMutationObserver);
    }
    
    log('Initialization complete - All systems active');
  }

  // Start when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();