// YouTube Ad Blocker Pro - Background Service Worker
// Version 1.3.2 - Enhanced with error handling and persistence

// Install event
chrome.runtime.onInstalled.addListener((details) => {
  try {
    if (details.reason === 'install') {
      console.log('[YT AdBlock Pro] Extension installed');
      
      // Set default settings with error handling
      chrome.storage.local.set({
        enabled: true,
        adsBlocked: 0,
        sponsoredBlocked: 0,
        popupsRemoved: 0,
        installDate: Date.now()
      }).catch((error) => {
        console.error('[YT AdBlock Pro] Error setting initial storage:', error);
      });
      
    } else if (details.reason === 'update') {
      const version = chrome.runtime.getManifest().version;
      console.log('[YT AdBlock Pro] Updated to version', version);
      
      // Initialize new stats if upgrading from old version
      chrome.storage.local.get(['sponsoredBlocked', 'popupsRemoved', 'installDate'], (result) => {
        const updates = {};
        
        if (result.sponsoredBlocked === undefined) {
          updates.sponsoredBlocked = 0;
        }
        if (result.popupsRemoved === undefined) {
          updates.popupsRemoved = 0;
        }
        if (result.installDate === undefined) {
          updates.installDate = Date.now();
        }
        
        if (Object.keys(updates).length > 0) {
          chrome.storage.local.set(updates).catch((error) => {
            console.error('[YT AdBlock Pro] Error updating storage:', error);
          });
        }
      });
    }
  } catch (error) {
    console.error('[YT AdBlock Pro] Error in onInstalled handler:', error);
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!request || !request.action) {
      return false;
    }
    
    const handleStorageUpdate = (key, increment = 1) => {
      chrome.storage.local.get([key], (result) => {
        try {
          const count = (result[key] || 0) + increment;
          chrome.storage.local.set({ [key]: count }).catch((error) => {
            console.error(`[YT AdBlock Pro] Error updating ${key}:`, error);
          });
          console.log(`[YT AdBlock Pro] ${key}: ${count}`);
        } catch (error) {
          console.error(`[YT AdBlock Pro] Error processing ${key}:`, error);
        }
      });
    };
    
    switch (request.action) {
      case 'adBlocked':
        handleStorageUpdate('adsBlocked');
        break;
        
      case 'sponsoredBlocked':
        handleStorageUpdate('sponsoredBlocked', request.count || 1);
        break;
        
      case 'popupRemoved':
        handleStorageUpdate('popupsRemoved');
        break;
        
      default:
        console.warn('[YT AdBlock Pro] Unknown action:', request.action);
    }
    
  } catch (error) {
    console.error('[YT AdBlock Pro] Error in message listener:', error);
  }
  
  return true;
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('[YT AdBlock Pro] Service worker started');
  
  // Verify storage integrity on startup
  chrome.storage.local.get(['adsBlocked', 'sponsoredBlocked', 'popupsRemoved', 'installDate'], (result) => {
    console.log('[YT AdBlock Pro] Current stats:', {
      adsBlocked: result.adsBlocked || 0,
      sponsoredBlocked: result.sponsoredBlocked || 0,
      popupsRemoved: result.popupsRemoved || 0,
      daysInstalled: result.installDate ? Math.floor((Date.now() - result.installDate) / 86400000) : 0
    });
  });
});

// Handle extension suspension
if (typeof self !== 'undefined') {
  self.addEventListener('activate', (event) => {
    console.log('[YT AdBlock Pro] Service worker activated');
  });
  
  self.addEventListener('install', (event) => {
    console.log('[YT AdBlock Pro] Service worker installed');
    // Claim clients immediately
    event.waitUntil(self.skipWaiting());
  });
}

// Periodic keepalive (Chrome service workers can sleep)
let keepAliveInterval;

function startKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  keepAliveInterval = setInterval(() => {
    chrome.storage.local.get(['adsBlocked'], () => {
      // Simple storage access to keep worker alive
    });
  }, 20000); // Every 20 seconds
}

startKeepAlive();

// Error handler for unhandled errors
if (typeof self !== 'undefined') {
  self.addEventListener('error', (event) => {
    console.error('[YT AdBlock Pro] Uncaught error:', event.error);
  });
  
  self.addEventListener('unhandledrejection', (event) => {
    console.error('[YT AdBlock Pro] Unhandled promise rejection:', event.reason);
  });
}