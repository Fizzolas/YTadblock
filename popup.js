// YouTube Ad Blocker Pro - Popup Script
// Updated with functional statistics tracking

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleText = document.getElementById('toggleText');
  
  // Lifetime stats elements
  const adsBlockedEl = document.getElementById('adsBlocked');
  const sponsoredBlockedEl = document.getElementById('sponsoredBlocked');
  const popupsRemovedEl = document.getElementById('popupsRemoved');
  const timeRunningEl = document.getElementById('timeRunning');
  
  // Session stats elements
  const sessionAdsBlockedEl = document.getElementById('sessionAdsBlocked');
  const sessionSponsoredBlockedEl = document.getElementById('sessionSponsoredBlocked');
  const sessionPopupsRemovedEl = document.getElementById('sessionPopupsRemoved');

  // Get current tab
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Update UI based on status
  function updateUI(isActive) {
    if (isActive) {
      statusDot.classList.add('active');
      statusText.textContent = 'Active';
      toggleText.textContent = 'Disable';
      toggleBtn.classList.remove('btn-secondary');
      toggleBtn.classList.add('btn-primary');
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = 'Inactive';
      toggleText.textContent = 'Enable';
      toggleBtn.classList.remove('btn-primary');
      toggleBtn.classList.add('btn-secondary');
    }
  }

  // Format large numbers with commas
  function formatNumber(num) {
    return num.toLocaleString();
  }

  // Load lifetime statistics from storage
  async function loadLifetimeStats() {
    const data = await chrome.storage.local.get([
      'adsBlocked', 
      'sponsoredBlocked', 
      'popupsRemoved', 
      'installDate'
    ]);
    
    // Update lifetime stats
    const adsBlocked = data.adsBlocked || 0;
    const sponsoredBlocked = data.sponsoredBlocked || 0;
    const popupsRemoved = data.popupsRemoved || 0;
    
    adsBlockedEl.textContent = formatNumber(adsBlocked);
    sponsoredBlockedEl.textContent = formatNumber(sponsoredBlocked);
    popupsRemovedEl.textContent = formatNumber(popupsRemoved);

    // Calculate days running
    if (data.installDate) {
      const daysRunning = Math.floor((Date.now() - data.installDate) / (1000 * 60 * 60 * 24));
      timeRunningEl.textContent = `${daysRunning}d`;
    } else {
      timeRunningEl.textContent = '0d';
    }
  }

  // Load session statistics from content script
  async function loadSessionStats() {
    const tab = await getCurrentTab();
    if (tab && tab.url && tab.url.includes('youtube.com')) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSessionStats' });
        sessionAdsBlockedEl.textContent = formatNumber(response.adsBlocked || 0);
        sessionSponsoredBlockedEl.textContent = formatNumber(response.sponsoredBlocked || 0);
        sessionPopupsRemovedEl.textContent = formatNumber(response.popupsRemoved || 0);
      } catch (error) {
        // Content script not loaded yet or not on YouTube video page
        sessionAdsBlockedEl.textContent = '0';
        sessionSponsoredBlockedEl.textContent = '0';
        sessionPopupsRemovedEl.textContent = '0';
      }
    } else {
      sessionAdsBlockedEl.textContent = '-';
      sessionSponsoredBlockedEl.textContent = '-';
      sessionPopupsRemovedEl.textContent = '-';
    }
  }

  // Get current status
  const tab = await getCurrentTab();
  if (tab && tab.url && tab.url.includes('youtube.com')) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
      updateUI(response.active);
    } catch (error) {
      console.log('Could not get status from content script');
      updateUI(true); // Default to active
    }
  } else {
    statusText.textContent = 'Not on YouTube';
    toggleBtn.disabled = true;
  }

  // Load both lifetime and session stats
  await loadLifetimeStats();
  await loadSessionStats();

  // Toggle button handler
  toggleBtn.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (tab && tab.url && tab.url.includes('youtube.com')) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
        updateUI(response.active);
      } catch (error) {
        console.error('Error toggling ad blocker:', error);
      }
    }
  });

  // Refresh stats every second
  setInterval(async () => {
    await loadLifetimeStats();
    await loadSessionStats();
  }, 1000);
});