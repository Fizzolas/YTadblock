// YouTube Ad Blocker Pro - Background Service Worker v1.4.0
// Handles statistics tracking and service worker lifecycle

chrome.runtime.onInstalled.addListener((details) => {
  try {
    if (details.reason === 'install') {
      console.log('[YT AdBlock] Extension installed');
      
      chrome.storage.local.set({
        enabled: true,
        adsBlocked: 0,
        sponsoredBlocked: 0,
        popupsRemoved: 0,
        installDate: Date.now()
      }).catch(err => console.error('[YT AdBlock] Storage error:', err));
      
    } else if (details.reason === 'update') {
      console.log('[YT AdBlock] Updated to', chrome.runtime.getManifest().version);
      
      // Ensure all stat fields exist
      chrome.storage.local.get(['sponsoredBlocked', 'popupsRemoved', 'installDate'], (result) => {
        const updates = {};
        
        if (result.sponsoredBlocked === undefined) updates.sponsoredBlocked = 0;
        if (result.popupsRemoved === undefined) updates.popupsRemoved = 0;
        if (result.installDate === undefined) updates.installDate = Date.now();
        
        if (Object.keys(updates).length > 0) {
          chrome.storage.local.set(updates).catch(err => 
            console.error('[YT AdBlock] Update error:', err)
          );
        }
      });
    }
  } catch (error) {
    console.error('[YT AdBlock] Install error:', error);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (!request?.action) return false;
    
    const updateStat = (key, increment = 1) => {
      chrome.storage.local.get([key], (result) => {
        const count = (result[key] || 0) + increment;
        chrome.storage.local.set({ [key]: count }).catch(err => 
          console.error(`[YT AdBlock] Error updating ${key}:`, err)
        );
      });
    };
    
    switch (request.action) {
      case 'adBlocked':
        updateStat('adsBlocked');
        break;
      case 'sponsoredBlocked':
        updateStat('sponsoredBlocked', request.count || 1);
        break;
      case 'popupRemoved':
        updateStat('popupsRemoved');
        break;
    }
  } catch (error) {
    console.error('[YT AdBlock] Message error:', error);
  }
  
  return true;
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[YT AdBlock] Service worker started');
});

// Keep service worker alive
let keepAliveInterval = setInterval(() => {
  chrome.storage.local.get(['adsBlocked'], () => {});
}, 25000);

if (typeof self !== 'undefined') {
  self.addEventListener('activate', () => {
    console.log('[YT AdBlock] Worker activated');
  });
  
  self.addEventListener('error', (event) => {
    console.error('[YT AdBlock] Worker error:', event.error);
  });
  
  self.addEventListener('unhandledrejection', (event) => {
    console.error('[YT AdBlock] Unhandled rejection:', event.reason);
  });
}