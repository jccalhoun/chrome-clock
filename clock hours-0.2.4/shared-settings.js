// Shared settings service to sync settings between clock extensions
const SharedSettings = {
  // TODO: Make sure you have replaced these with your actual Chrome Extension IDs
  HOURS_EXTENSION_ID: "egfobjkmaaifckcbenljfndfchlpjepd",
  MINUTES_EXTENSION_ID: "cadnmcobelogaofkidefkblnogpllhda",

  // This will be called from the background script
  initBackgroundListener: function() {
    chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
      console.log("Received external message from:", sender.id, message);
      if (
        sender.id === this.HOURS_EXTENSION_ID ||
        sender.id === this.MINUTES_EXTENSION_ID
      ) {
        if (message.action === "syncSettings") {
          this.applyReceivedSettings(message.settings);
          // Acknowledge the message was received
          sendResponse({ status: "Settings received" });
        }
      }
      // Return true to indicate you wish to send a response asynchronously
      return true;
    });
    console.log("SharedSettings external message listener initialized in background.");
  },

  applyReceivedSettings: function(settings) {
    console.log("Applying received settings:", settings);
    chrome.storage.sync.set(settings).catch(error => {
      console.error("Error applying settings:", error);
    });
  },

  // Sync settings to the companion extension
  syncSettings: function(settings) {
    console.log("Syncing settings to companion extension:", settings);
    try {
      const currentExtensionId = chrome.runtime.id;
      const targetExtensionId = currentExtensionId === this.HOURS_EXTENSION_ID ?
                             this.MINUTES_EXTENSION_ID : this.HOURS_EXTENSION_ID;

      console.log("SYNC: Sending message to:", targetExtensionId);
      chrome.runtime.sendMessage(targetExtensionId, {
        action: "syncSettings",
        settings: settings
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("SYNC: Error sending message:", chrome.runtime.lastError.message);
        } else {
          console.log("SYNC: Message sent successfully, response:", response);
        }
      });
    } catch (error) {
      console.error("SYNC: Error in syncSettings:", error);
    }
  }
};

// --- Initialization ---
// This checks if the script is running in the service worker (background)
// The `self.importScripts` check is a reliable way to know.
if (typeof self.importScripts === 'function') {
    SharedSettings.initBackgroundListener();
}