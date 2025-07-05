// Shared settings service to sync settings between clock extensions
const SharedSettings = {
  // IDs of the companion extensions
  HOURS_EXTENSION_ID: "dpdjenkmikjdbegjkfgimgdjhenldhaf",
  MINUTES_EXTENSION_ID: "iacjbmokhggempophjkmdimipfgbaank",
  
  // Initialize by adding listeners for external messages
  init: function() {
    // Listen for messages from companion extension
    chrome.runtime.onMessageExternal.addListener(this.handleExternalMessage);
    console.log("SharedSettings initialized - listening for external messages");
  },
  
  // Handle incoming message from the companion extension
  handleExternalMessage: function(message, sender) {
    console.log("Received external message from:", sender.id, message);
    
    // Verify the message comes from a trusted extension
    if (
      sender.id === SharedSettings.HOURS_EXTENSION_ID || 
      sender.id === SharedSettings.MINUTES_EXTENSION_ID
    ) {
      // Apply the received settings
      if (message.action === "syncSettings") {
        SharedSettings.applyReceivedSettings(message.settings);
		
		// Broadcast to all windows that settings have been updated
      chrome.runtime.sendMessage({
        action: "settingsUpdated",
        settings: message.settings
      });
      }
    }
  },
  
  // Apply settings received from companion extension
  applyReceivedSettings: function(settings) {
    console.log("Applying received settings:", settings);
    
    // Store settings locally
    chrome.storage.sync.set(settings).then(() => {
      console.log("Settings synchronized successfully");
      
      // Notify the background script that settings have changed
      // Create a message based on which settings changed
      const message = {};
      if (settings.hasOwnProperty('useCustomColor') || 
          settings.hasOwnProperty('customColor')) {
        message.colorChanged = true;
      }
      
      chrome.runtime.sendMessage(message);
    }).catch(error => {
      console.error("Error applying settings:", error);
    });
  },
  
  // Sync settings to the companion extension
  syncSettings: function(settings) {
    console.log("Syncing settings to companion extension:", settings);
    
    try {
		const currentExtensionId = chrome.runtime.id;
		console.log("SYNC: Current extension ID:", currentExtensionId);
    
		const targetExtensionId = currentExtensionId === this.HOURS_EXTENSION_ID ? 
                             this.MINUTES_EXTENSION_ID : this.HOURS_EXTENSION_ID;
		console.log("SYNC: Target extension ID:", targetExtensionId);
    
		// Test if we can access the messaging API
		if (!chrome.runtime.sendMessage) {
		console.error("SYNC: chrome.runtime.sendMessage is not available");
		return;
    }
    
    console.log("SYNC: Sending message to:", targetExtensionId);
    chrome.runtime.sendMessage(targetExtensionId, {
      action: "syncSettings",
      settings: settings
    }).then(response => {
      console.log("SYNC: Message sent successfully, response:", response);
    }).catch(error => {
      console.error("SYNC: Error sending message:", error);
      console.error("SYNC: Error details:", error.message);
    });
  } catch (error) {
    console.error("SYNC: Error in syncSettings:", error);
    console.error("SYNC: Error stack:", error.stack);
  }
  }
};

// Initialize the shared settings service
SharedSettings.init();
