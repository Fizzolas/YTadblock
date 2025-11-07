// YouTube Ad Blocker Pro - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleText = document.getElementById('toggleText');
  const adsBlockedEl = document.getElementById('adsBlocked');
  const timeRunningEl = document.getElementById('timeRunning');

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

  // Load statistics
  async function loadStats() {
    const data = await chrome.storage.local.get(['adsBlocked', 'installDate']);
    
    // Update ads blocked count
    const adsBlocked = data.adsBlocked || 0;
    adsBlockedEl.textContent = adsBlocked.toLocaleString();

    // Calculate days running
    if (data.installDate) {
      const daysRunning = Math.floor((Date.now() - data.installDate) / (1000 * 60 * 60 * 24));
      timeRunningEl.textContent = `${daysRunning}d`;
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

  // Load stats
  await loadStats();

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
  setInterval(loadStats, 1000);
});
