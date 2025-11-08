// YouTube Ad Blocker Pro - Popup Script v1.5.0
// Handles popup UI and statistics display

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleText = document.getElementById('toggleText');
  const adsBlockedEl = document.getElementById('adsBlocked');
  const sponsoredBlockedEl = document.getElementById('sponsoredBlocked');
  const popupsRemovedEl = document.getElementById('popupsRemoved');
  const timeRunningEl = document.getElementById('timeRunning');
  const sessionAdsEl = document.getElementById('sessionAdsBlocked');
  const sessionSponEl = document.getElementById('sessionSponsoredBlocked');
  const sessionPopupEl = document.getElementById('sessionPopupsRemoved');
  
  let currentTab = null;
  let isYouTubePage = false;
  let updateInterval = null;

  /**
   * Format numbers with locale-specific formatting
   * @param {number|string} n - Number to format
   * @returns {string} Formatted number string
   */
  function fmt(n) {
    if (typeof n === 'number') {
      return n.toLocaleString();
    }
    return n || '0';
  }

  /**
   * Get the currently active tab
   * @returns {Promise<chrome.tabs.Tab|null>} Active tab or null
   */
  async function getActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    } catch (e) {
      console.error('[YT AdBlock Pro] Error getting tab:', e);
      return null;
    }
  }

  /**
   * Load and display persistent statistics from storage
   */
  async function loadPersistentStats() {
    try {
      const data = await chrome.storage.local.get([
        'adsBlocked', 
        'sponsoredBlocked', 
        'popupsRemoved', 
        'installDate'
      ]);
      
      const stats = [
        data.adsBlocked || 0,
        data.sponsoredBlocked || 0,
        data.popupsRemoved || 0,
        data.installDate ? Math.floor((Date.now() - data.installDate) / 86400000) : 0
      ];
      
      const elements = [adsBlockedEl, sponsoredBlockedEl, popupsRemovedEl, timeRunningEl];
      
      elements.forEach((el, i) => {
        if (el) {
          const formatted = i === 3 ? `${stats[i]}d` : fmt(stats[i]);
          if (el.textContent !== formatted) {
            el.textContent = formatted;
          }
        }
      });
    } catch (e) {
      console.error('[YT AdBlock Pro] Error loading persistent stats:', e);
    }
  }

  /**
   * Load and display session statistics from content script
   */
  async function loadSessionStats() {
    if (!isYouTubePage || !currentTab) {
      [sessionAdsEl, sessionSponEl, sessionPopupEl].forEach(el => {
        if (el && el.textContent !== '-') el.textContent = '-';
      });
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'getSessionStats' 
      });
      
      if (response && !response.error) {
        const sessions = [
          response.adsBlocked || 0,
          response.sponsoredBlocked || 0,
          response.popupsRemoved || 0
        ];
        
        const elements = [sessionAdsEl, sessionSponEl, sessionPopupEl];
        elements.forEach((el, i) => {
          if (el) {
            const formatted = fmt(sessions[i]);
            if (el.textContent !== formatted) {
              el.textContent = formatted;
            }
          }
        });
      } else {
        throw new Error('Invalid response');
      }
    } catch (e) {
      // Content script not ready - show zeros instead of errors
      [sessionAdsEl, sessionSponEl, sessionPopupEl].forEach(el => {
        if (el && el.textContent !== '0') {
          el.textContent = '0';
        }
      });
    }
  }

  /**
   * Load all statistics (persistent + session)
   */
  async function loadAllStats() {
    await loadPersistentStats();
    await loadSessionStats();
  }

  /**
   * Update UI to reflect active/inactive status
   * @param {boolean} active - Whether extension is active
   */
  function setStatus(active) {
    if (!statusDot || !statusText || !toggleText || !toggleBtn) return;
    
    if (active) {
      statusDot.className = 'dot dot-ac';
      statusText.textContent = 'Active';
      toggleText.textContent = 'Disable';
      toggleBtn.className = 'on';
    } else {
      statusDot.className = 'dot';
      statusText.textContent = 'Inactive';
      toggleText.textContent = 'Enable';
      toggleBtn.className = 'off';
    }
  }

  /**
   * Setup toggle button and get initial status
   */
  async function setupToggle() {
    if (!isYouTubePage || !currentTab) {
      if (statusText) statusText.textContent = 'Not on YouTube';
      if (toggleBtn) toggleBtn.disabled = true;
      return;
    }

    // Get initial status
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'getStatus' 
      });
      
      if (response && !response.error) {
        setStatus(response.active);
      } else {
        setStatus(true); // Default to active
      }
    } catch (e) {
      console.error('[YT AdBlock Pro] Error getting status:', e);
      setStatus(true); // Default to active if error
    }

    // Setup toggle button handler
    if (toggleBtn) {
      toggleBtn.onclick = async () => {
        try {
          const response = await chrome.tabs.sendMessage(currentTab.id, { 
            action: 'toggle' 
          });
          
          if (response && !response.error) {
            setStatus(response.active);
          }
        } catch (e) {
          console.error('[YT AdBlock Pro] Error toggling:', e);
        }
      };
    }
  }

  /**
   * Initialize popup UI
   */
  async function initialize() {
    try {
      currentTab = await getActiveTab();
      
      if (currentTab && currentTab.url) {
        isYouTubePage = currentTab.url.includes('youtube.com');
      }

      await setupToggle();
      await loadAllStats();

      // Start update interval (less aggressive than before)
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = setInterval(loadAllStats, 2500);
    } catch (e) {
      console.error('[YT AdBlock Pro] Initialization error:', e);
    }
  }

  /**
   * Cleanup on popup close
   */
  window.addEventListener('unload', () => {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });

  // Start
  initialize();
});