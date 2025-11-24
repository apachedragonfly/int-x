document.addEventListener("DOMContentLoaded", () => {
  const clearBtn = document.getElementById("clearFlagsBtn");
  const statusDiv = document.getElementById("status");

  const showStatus = (message, isError = false) => {
    statusDiv.textContent = message;
    statusDiv.className = `status ${isError ? "error" : "success"}`;
    setTimeout(() => {
      statusDiv.className = "status";
      statusDiv.textContent = "";
    }, 3000);
  };

  clearBtn.addEventListener("click", async () => {
    try {
      clearBtn.disabled = true;
      clearBtn.textContent = "Clearing...";

      // Clear all geo entries from chrome.storage.local
      const items = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(items || {}).filter(key => key.startsWith("geo:"));
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }

      // Send message to all x.com/twitter.com tabs to clear flags
      const tabs = await chrome.tabs.query({
        url: ["https://x.com/*", "https://twitter.com/*"]
      });

      const promises = tabs.map(tab => {
        return chrome.tabs.sendMessage(tab.id, {
          type: "X_CLEAR_ALL_FLAGS"
        }).catch(() => {
          // Ignore errors (tab might not have content script loaded)
        });
      });

      await Promise.all(promises);

      showStatus(`Cleared ${keysToRemove.length} flag${keysToRemove.length !== 1 ? "s" : ""} successfully!`);
    } catch (error) {
      console.error("Failed to clear flags:", error);
      showStatus("Failed to clear flags. Please try again.", true);
    } finally {
      clearBtn.disabled = false;
      clearBtn.textContent = "Clear All Flags";
    }
  });
});

