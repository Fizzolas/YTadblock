// YouTube Ad Blocker Pro - Background Service Worker v1.5.1
// Handles statistics tracking and service worker lifecycle

/**
 * Handle extension installation and updates
 */
chrome.runtime.onInstalled.addListener((details) => {
  try {
    if (details.reason === 'install') {
      console.log('[YT AdBlock Pro] Extension installed');
      
      chrome.storage.local.set({
        enabled: true,
        adsBlocked: 0,
        sponsoredBlocked: 0,
        popupsRemoved: 0,
        installDate: Date.now()
      }).catch(err => console.error('[YT AdBlock Pro] Storage error:', err));
      
    } else if (details.reason === 'update') {
      const version = chrome.runtime.getManifest().version;
      console.log(`[YT AdBlock Pro] Updated to v${version}`);
      
      // Ensure all stat fields exist
      chrome.storage.local.get(['sponsoredBlocked', 'popupsRemoved', 'installDate'], (result) => {
        const updates = {};
        
        if (result.sponsoredBlocked === undefined) updates.sponsoredBlocked = 0;
        if (result.popupsRemoved === undefined) updates.popupsRemoved = 0;
        if (result.installDate === undefined) updates.installDate = Date.now();
        
        if (Object.keys(updates).length > 0) {
          chrome.storage.local.set(updates).catch(err => 
            console.error('[YT AdBlock Pro] Update error:', err)
          );
        }
      });
    }
  } catch (error) {
    console.error('[YT AdBlock Pro] Install error:', error);
  }
});

/**
 * Update a statistic counter in storage
 * @param {string} key - Storage key to update
 * @param {number} increment - Amount to increment by
 */
function updateStat(key, increment = 1) {
  if (!key || typeof key !== 'string') {
    console.error('[YT AdBlock Pro] Invalid stat key:', key);
    return;
  }

  if (typeof increment !== 'number' || increment < 0) {
    console.error('[YT AdBlock Pro] Invalid increment:', increment);
    return;
  }

  chrome.storage.local.get([key], (result) => {
    if (chrome.runtime.lastError) {
      console.error('[YT AdBlock Pro] Error reading storage:', chrome.runtime.lastError);
      return;
    }

    const count = (result[key] || 0) + increment;
    chrome.storage.local.set({ [key]: count }).catch(err => 
      console.error(`[YT AdBlock Pro] Error updating ${key}:`, err)
    );
  });
}

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!request || typeof request !== 'object' || !request.action) {
      console.warn('[YT AdBlock Pro] Invalid message format:', request);
      return false;
    }
    
    switch (request.action) {
      case 'adBlocked':
        updateStat('adsBlocked');
        break;
      case 'sponsoredBlocked':
        const count = request.count && typeof request.count === 'number' ? request.count : 1;
        updateStat('sponsoredBlocked', count);
        break;
      case 'popupRemoved':
        updateStat('popupsRemoved');
        break;
      default:
        console.warn(`[YT AdBlock Pro] Unknown action: ${request.action}`);
    }
  } catch (error) {
    console.error('[YT AdBlock Pro] Message error:', error);
  }
  
  return true;
});

/**
 * Handle service worker startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('[YT AdBlock Pro] Service worker started');
});

/**
 * Keep service worker alive with optimal interval (30s minimum recommended)
 * This prevents the service worker from being terminated during active use
 */
let keepAliveInterval = setInterval(() => {
  try {
    chrome.storage.local.get(['adsBlocked'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('[YT AdBlock Pro] Keep-alive error:', chrome.runtime.lastError);
      }
      // Simple storage access keeps worker alive
    });
  } catch (e) {
    console.error('[YT AdBlock Pro] Keep-alive exception:', e);
  }
}, 30000);

/**
 * Service worker error handling
 */
if (typeof self !== 'undefined') {
  self.addEventListener('activate', () => {
    console.log('[YT AdBlock Pro] Service worker activated');
  });
  
  self.addEventListener('error', (event) => {
    console.error('[YT AdBlock Pro] Worker error:', event.error);
  });
  
  self.addEventListener('unhandledrejection', (event) => {
    console.error('[YT AdBlock Pro] Unhandled rejection:', event.reason);
  });
}