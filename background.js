// YouTube Ad Blocker Pro - Background Script v2.0.0

chrome.runtime.onInstalled.addListener(() => {
  console.log('YT AdBlock Pro v2.0.0 installed.');
});

// Simple message listener to handle stats updates from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  // Function to update a stat in storage
  const updateStat = (key, increment = 1) => {
    chrome.storage.local.get([key], (result) => {
      const count = (result[key] || 0) + increment;
      chrome.storage.local.set({ [key]: count }).catch(err => 
        console.error(`[YT AdBlock Pro] Error updating ${key}:`, err)
      );
    });
  };

  switch (request.action) {
    case 'adBlocked':
      updateStat('adsBlocked');
      break;
    case 'sponsoredBlocked':
      updateStat('sponsoredBlocked');
      break;
    case 'popupRemoved':
      updateStat('popupsRemoved');
      break;
    case 'getStatus':
      // The popup uses this to check if the extension is active
      chrome.storage.local.get(['isActive'], (result) => {
        sendResponse({ active: result.isActive !== false });
      });
      return true; // Indicates an asynchronous response
    case 'toggle':
      // The popup uses this to toggle the extension state
      chrome.storage.local.get(['isActive'], (result) => {
        const newState = result.isActive === false; // Toggle logic
        chrome.storage.local.set({ isActive: newState }, () => {
          sendResponse({ active: newState });
        });
      });
      return true; // Indicates an asynchronous response
    default:
      // Forward all other messages to other listeners (e.g., the popup)
      chrome.runtime.sendMessage(request).catch(() => {});
  }
  return false;
});

// Initialize isActive state on install if not present
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['isActive'], (result) => {
    if (result.isActive === undefined) {
      chrome.storage.local.set({ isActive: true });
    }
  });
});
