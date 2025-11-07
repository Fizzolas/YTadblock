// YouTube Ad Blocker Pro - Background Service Worker

// Install event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('YouTube Ad Blocker Pro installed');
    
    // Set default settings
    chrome.storage.local.set({
      enabled: true,
      adsBlocked: 0,
      installDate: Date.now()
    });
  } else if (details.reason === 'update') {
    console.log('YouTube Ad Blocker Pro updated to version', chrome.runtime.getManifest().version);
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'adBlocked') {
    // Increment blocked ads counter
    chrome.storage.local.get(['adsBlocked'], (result) => {
      const count = (result.adsBlocked || 0) + 1;
      chrome.storage.local.set({ adsBlocked: count });
    });
  }
  return true;
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('YouTube Ad Blocker Pro service worker started');
});
