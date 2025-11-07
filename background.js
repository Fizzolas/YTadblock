// YouTube Ad Blocker Pro - Background Service Worker
// Updated with comprehensive statistics tracking

// Install event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('YouTube Ad Blocker Pro installed');
    
    // Set default settings
    chrome.storage.local.set({
      enabled: true,
      adsBlocked: 0,
      sponsoredBlocked: 0,
      popupsRemoved: 0,
      installDate: Date.now()
    });
  } else if (details.reason === 'update') {
    console.log('YouTube Ad Blocker Pro updated to version', chrome.runtime.getManifest().version);
    
    // Initialize new stats if upgrading from old version
    chrome.storage.local.get(['sponsoredBlocked', 'popupsRemoved'], (result) => {
      if (result.sponsoredBlocked === undefined) {
        chrome.storage.local.set({ sponsoredBlocked: 0 });
      }
      if (result.popupsRemoved === undefined) {
        chrome.storage.local.set({ popupsRemoved: 0 });
      }
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'adBlocked') {
    // Increment blocked ads counter
    chrome.storage.local.get(['adsBlocked'], (result) => {
      const count = (result.adsBlocked || 0) + 1;
      chrome.storage.local.set({ adsBlocked: count });
      console.log('Ad blocked. Total:', count);
    });
  } else if (request.action === 'sponsoredBlocked') {
    // Increment sponsored content counter
    chrome.storage.local.get(['sponsoredBlocked'], (result) => {
      const count = (result.sponsoredBlocked || 0) + (request.count || 1);
      chrome.storage.local.set({ sponsoredBlocked: count });
      console.log('Sponsored content blocked. Total:', count);
    });
  } else if (request.action === 'popupRemoved') {
    // Increment popup removal counter
    chrome.storage.local.get(['popupsRemoved'], (result) => {
      const count = (result.popupsRemoved || 0) + 1;
      chrome.storage.local.set({ popupsRemoved: count });
      console.log('Popup removed. Total:', count);
    });
  }
  return true;
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('YouTube Ad Blocker Pro service worker started');
});