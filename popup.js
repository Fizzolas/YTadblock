// YouTube Ad Blocker Pro - Popup Script v1.5.1
// Handles popup UI and statistics display

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
	  // DOM elements
	  const statusDot = document.getElementById('statusDot');
	  const statusText = document.getElementById('statusText');
	  const toggleBtn = document.getElementById('toggleBtn');
	  const toggleText = document.getElementById('toggleText');
	  const totalAdsEl = document.getElementById('totalAds');
	  const totalSponsoredEl = document.getElementById('totalSponsored');
	  const totalPopupsEl = document.getElementById('totalPopups');
	  const sessionAdsEl = document.getElementById('sessionAds');
	  const sessionSponsoredEl = document.getElementById('sessionSponsored');
	  const sessionPopupsEl = document.getElementById('sessionPopups');
	  
	  let currentTab = null;
	  let isYouTubePage = false;
	  let updateInterval = null;

  /**
   * Format numbers with locale-specific formatting
   * @param {number|string} n - Number to format
   * @returns {string} Formatted number string
   */
  function fmt(n) {
    if (typeof n === 'number' && !isNaN(n)) {
      return n.toLocaleString();
    }
    return String(n || '0');
  }

  /**
   * Safely update element text content
   * @param {HTMLElement|null} el - Element to update
   * @param {string} value - New text value
   */
  function updateElement(el, value) {
    if (el && el.textContent !== value) {
      el.textContent = value;
    }
  }

  /**
   * Get the currently active tab
   * @returns {Promise<chrome.tabs.Tab|null>} Active tab or null
   */
  async function getActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0] || null;
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
	        'popupsRemoved'
	      ]);
	      
	      updateElement(totalAdsEl, fmt(data.adsBlocked || 0));
	      updateElement(totalSponsoredEl, fmt(data.sponsoredBlocked || 0));
	      updateElement(totalPopupsEl, fmt(data.popupsRemoved || 0));
    } catch (e) {
      console.error('[YT AdBlock Pro] Error loading persistent stats:', e);
    }
  }

  /**
   * Load and display session statistics from content script
   */
	  async function loadSessionStats() {
	    if (!isYouTubePage || !currentTab || !currentTab.id) {
	      [sessionAdsEl, sessionSponsoredEl, sessionPopupsEl].forEach(el => {
	        updateElement(el, '-');
	      });
	      return;
	    }
	
	    try {
	      const response = await chrome.tabs.sendMessage(currentTab.id, { 
	        action: 'getSessionStats' 
	      }).catch(e => {
	        console.warn('[YT AdBlock Pro] Content script not ready or error:', e);
	        return null;
	      });
	      
	      if (response && typeof response === 'object' && !response.error) {
	        updateElement(sessionAdsEl, fmt(response.adsBlocked || 0));
	        updateElement(sessionSponsoredEl, fmt(response.sponsoredBlocked || 0));
	        updateElement(sessionPopupsEl, fmt(response.popupsRemoved || 0));
	      } else {
	        // Content script not ready - show zeros instead of errors
	        [sessionAdsEl, sessionSponsoredEl, sessionPopupsEl].forEach(el => {
	          updateElement(el, '0');
	        });
	      }
	    } catch (e) {
	      console.error('[YT AdBlock Pro] Error loading session stats:', e);
	      // Content script not ready - show zeros instead of errors
	      [sessionAdsEl, sessionSponsoredEl, sessionPopupsEl].forEach(el => {
	        updateElement(el, '0');
	      });
	    }
	  }

  /**
   * Load all statistics (persistent + session)
   */
  async function loadAllStats() {
    try {
      await loadPersistentStats();
      await loadSessionStats();
    } catch (e) {
      console.error('[YT AdBlock Pro] Error loading stats:', e);
    }
  }

  /**
   * Update UI to reflect active/inactive status
   * @param {boolean} active - Whether extension is active
   */
  function setStatus(active) {
    if (!statusDot || !statusText || !toggleText || !toggleBtn) return;
    
    const isActive = Boolean(active);
    
    if (isActive) {
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
    if (!isYouTubePage || !currentTab || !currentTab.id) {
      if (statusText) statusText.textContent = 'Not on YouTube';
      if (toggleBtn) toggleBtn.disabled = true;
      return;
    }

    // Get initial status
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'getStatus' 
      }).catch(e => {
        console.warn('[YT AdBlock Pro] Content script not ready or error:', e);
        return null;
      });
      
      if (response && typeof response === 'object' && !response.error) {
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
        if (!currentTab || !currentTab.id) return;
        
        try {
          const response = await chrome.tabs.sendMessage(currentTab.id, { 
            action: 'toggle' 
          }).catch(e => {
            console.error('[YT AdBlock Pro] Error toggling:', e);
            return null;
          });
          
          if (response && typeof response === 'object' && !response.error) {
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
      
      if (currentTab && currentTab.url && typeof currentTab.url === 'string') {
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
      updateInterval = null;
    }
  });

  // Start
  initialize();
});