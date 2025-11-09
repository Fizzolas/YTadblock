// YouTube Ad Blocker Pro - Popup Script v2.0.0

document.addEventListener("DOMContentLoaded", () => {
  const toggleButton = document.getElementById("toggle-button");
  const statusText = document.getElementById("status-text");
  const statsContainer = document.getElementById("stats-container");
  const adsBlockedText = document.getElementById("ads-blocked");
  const sponsoredBlockedText = document.getElementById("sponsored-blocked");
  const popupsRemovedText = document.getElementById("popups-removed");

  // 1. Initial Status and Stats Load
  function loadStatusAndStats() {
    // Get active status from storage
    chrome.storage.local.get(["isActive"], (result) => {
      const isActive = result.isActive !== false;
      updateUI(isActive);
    });

    // Get stats from storage
    chrome.storage.local.get(
      ["adsBlocked", "sponsoredBlocked", "popupsRemoved"],
      (result) => {
        adsBlockedText.textContent = (result.adsBlocked || 0).toLocaleString();
        sponsoredBlockedText.textContent = (
          result.sponsoredBlocked || 0
        ).toLocaleString();
        popupsRemovedText.textContent = (
          result.popupsRemoved || 0
        ).toLocaleString();
      }
    );
  }

  // 2. UI Update Function
  function updateUI(isActive) {
    if (isActive) {
      toggleButton.textContent = "Disable Extension";
      toggleButton.classList.remove("disabled");
      statusText.textContent = "Status: Active";
      statusText.classList.remove("disabled");
      statsContainer.style.opacity = "1";
    } else {
      toggleButton.textContent = "Enable Extension";
      toggleButton.classList.add("disabled");
      statusText.textContent = "Status: Disabled";
      statusText.classList.add("disabled");
      statsContainer.style.opacity = "0.5";
    }
  }

  // 3. Toggle Button Handler
  toggleButton.addEventListener("click", () => {
    // Send message to background script to toggle state
    chrome.runtime.sendMessage({ action: "toggle" }, (response) => {
      if (response && response.active !== undefined) {
        updateUI(response.active);
      }
    });
  });

  // 4. Real-time Stats Listener (from background script)
  chrome.runtime.onMessage.addListener((request) => {
    if (
      request.action === "adBlocked" ||
      request.action === "sponsoredBlocked" ||
      request.action === "popupRemoved"
    ) {
      // Reload stats on any update message
      loadStatusAndStats();
    }
  });

  // Load on startup
  loadStatusAndStats();
});
