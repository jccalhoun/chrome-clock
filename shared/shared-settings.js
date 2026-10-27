// Shared settings service to sync settings between the two clock extensions.
// Each extension has its own storage, so settings are copied across by messaging.
// The background service worker calls SharedSettings.init(); the popup and
// options page only use syncSettings().
const SharedSettings = {
  // IDs of the companion extensions. They're fixed by the "key" in each
  // manifest.json, so they stay the same wherever the folders are loaded from.
  // If you change a key, change the ID here and in the other extension's
  // externally_connectable list too.
  HOURS_EXTENSION_ID: "mfjklceejmahbgomlppgndjldghhkhfo",
  MINUTES_EXTENSION_ID: "fmipmlofjigcohoeclgpbbfbjlajdhcj",

  // Settings that are copied to a newly installed companion
  SYNCED_KEYS: ["useCustomColor", "customColor", "recentColors", "use24HourFormat", "showLeadingZero", "clockFont", "clockFontSize"],

  // Returns the ID of the other extension
  getCompanionId: function() {
    return browser.runtime.id === this.HOURS_EXTENSION_ID
      ? this.MINUTES_EXTENSION_ID
      : this.HOURS_EXTENSION_ID;
  },

  // Start listening for messages from the companion extension (background only).
  // Must be called synchronously when the service worker starts, so Chrome
  // can wake it for these messages.
  init: function() {
    const currentExtensionId = browser.runtime.id;
    if (
      currentExtensionId !== this.HOURS_EXTENSION_ID &&
      currentExtensionId !== this.MINUTES_EXTENSION_ID
    ) {
      console.warn("SharedSettings: Current Extension ID does not match any known ID. Sync will fail.");
    }

    browser.runtime.onMessageExternal.addListener(this.handleExternalMessage.bind(this));
  },

  // Handle an incoming message from the companion extension. Chrome doesn't
  // reliably accept a returned promise as the reply, so this answers through
  // sendResponse and returns true to keep the channel open until it does.
  handleExternalMessage: function(message, sender, sendResponse) {
    // Only accept messages from the two clock extensions
    if (sender.id !== this.HOURS_EXTENSION_ID && sender.id !== this.MINUTES_EXTENSION_ID) {
      return false;
    }

    let reply;
    if (message.action === "syncSettings") {
      // The background script's storage.onChanged listener redraws the icon
      reply = browser.storage.sync.set(message.settings).then(() => ({ ok: true }));
    } else if (message.action === "requestSettings") {
      // The companion was just installed and wants our current settings
      reply = browser.storage.sync.get(this.SYNCED_KEYS);
    } else {
      return false;
    }

    reply.then(sendResponse, error => {
      console.error("SharedSettings: could not handle", message.action, error);
      sendResponse({ ok: false });
    });
    return true;
  },

  // Send changed settings to the companion extension
  syncSettings: function(settings) {
    return browser.runtime.sendMessage(this.getCompanionId(), {
      action: "syncSettings",
      settings: settings
    }).catch(error => {
      // Expected when the companion isn't installed
      console.info("SharedSettings: companion not reachable:", error.message);
    });
  },

  // On first install, copy the companion's existing settings (if it's installed)
  requestSettingsFromCompanion: function() {
    return browser.runtime.sendMessage(this.getCompanionId(), { action: "requestSettings" })
      .then(settings => {
        if (settings && Object.keys(settings).length) {
          return browser.storage.sync.set(settings);
        }
      })
      .catch(() => {
        // Companion not installed; keep the defaults
      });
  }
};
