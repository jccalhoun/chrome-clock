// Import the shared settings logic, which allows this extension to communicate with the 'minutes' extension.
importScripts('shared-settings.js');

// =================================================================
// GLOBAL CONSTANTS
// =================================================================

/**
 * The names for the alarms used in this extension. Using constants prevents typos.
 * @type {string}
 */
const ALARM_NAME = "update-clock-hour";
const HEALTH_CHECK_ALARM_NAME = "clock-health-check";

// =================================================================
// CORE LOGIC
// =================================================================

/**
 * The main function to update the clock icon.
 * This function is self-contained and fetches all necessary settings from storage each time it runs.
 */
async function updateClock() {
    try {
        // 1. Load the latest settings directly from chrome.storage.sync.
        // This ensures that the clock always uses the most up-to-date user preferences.
        const settings = await chrome.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff",
            use24HourFormat: false,
            showLeadingZero: false // Load the leading zero setting with a default value.
        });

        // 2. Prepare data for drawing the icon.
        const date = new Date();
        let hours = date.getHours();

        // Convert to 12-hour format if needed.
        if (!settings.use24HourFormat) {
            hours = hours % 12 || 12;
        }

        // Apply a leading zero if the option is enabled and the hour is a single digit.
        let textToDraw = hours.toString();
        if (settings.showLeadingZero && hours < 10) {
            textToDraw = '0' + hours;
        }

        const colorToUse = settings.useCustomColor ? settings.customColor : "black";

        // 3. Ensure the offscreen document, which is used for drawing, is active.
        await setupOffscreenDocument();

        // 4. Send a message to the offscreen document to draw the icon with the specified text and color.
        chrome.runtime.sendMessage({
            type: 'draw-icon',
            target: 'offscreen',
            data: {
                text: textToDraw,
                color: colorToUse,
                use24HourFormat: settings.use24HourFormat
            }
        });

        // 5. Update the tooltip (the text that appears when you hover over the extension icon).
        const timeString = date.toLocaleTimeString([], {
            hour12: !settings.use24HourFormat
        });
        await chrome.action.setTitle({
            title: timeString
        });

    } catch (error) {
        console.error("Error updating clock:", error);
    }
}

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * A promise variable to prevent race conditions when creating the offscreen document.
 * If multiple requests to create the document happen at the same time, this ensures it's only created once.
 */
let creating;

/**
 * Creates the offscreen document if it doesn't already exist.
 * This document hosts a canvas that is used to draw the clock icon.
 */
async function setupOffscreenDocument() {
    // If the document already exists, we don't need to do anything.
    if (await chrome.offscreen.hasDocument())
        return;

    // If the document is already in the process of being created, wait for it to finish.
    if (creating) {
        await creating;
    } else {
        // Otherwise, create the document.
        creating = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['DOM_PARSER'],
            justification: 'To draw the clock icon on a canvas.',
        });
        await creating;
        // Reset the promise once it's resolved.
        creating = null;
    }
}

// =================================================================
// EVENT LISTENERS
// =================================================================

/**
 * Handles messages from other parts of the extension, primarily the offscreen document.
 */
chrome.runtime.onMessage.addListener(async(message) => {
    // When the offscreen document confirms that the icon has been drawn,
    // this listener receives the image data.
    if (message.type === 'icon-drawn' && message.imageData) {
        try {
            // The image data is received as a plain object, so it needs to be reconstructed into an ImageData object.
            const reconstructedImageData = new ImageData(
                    new Uint8ClampedArray(message.imageData.data),
                    message.imageData.width,
                    message.imageData.height);
            // Set the extension icon with the newly drawn image.
            await chrome.action.setIcon({
                imageData: reconstructedImageData
            });
        } catch (error) {
            console.error("Failed to set icon:", error);
        } finally {
            // To conserve resources, always ensure the offscreen document is closed after use.
            if (await chrome.offscreen.hasDocument()) {
                await chrome.offscreen.closeDocument();
            }
        }
    }
});

/**
 * Listens for changes in synchronized storage.
 * This is the primary trigger for updates when a user changes a setting in the options or popup page.
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        console.log("Storage change detected, updating clock.");
        updateClock();
    }
});

/**
 * Handles all alarms. The main alarm triggers the clock update every minute.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
    } else if (alarm.name === HEALTH_CHECK_ALARM_NAME) {
        // A health check could be added here in the future to ensure the clock is running correctly.
        console.log("Health check alarm fired.");
    }
});

/**
 * Sets up the extension on first install or when the browser starts.
 * This ensures the clock starts running as soon as the extension is enabled.
 */
function initializeExtension() {
    console.log("Extension initializing...");
    // Set up the main alarm to run every minute, which keeps the clock ticking.
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: 1
    });
    // Run an initial update to set the icon immediately.
    updateClock();
}

/**
 * Fired when the extension is first installed.
 */
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed.");
    initializeExtension();
});

/**
 * Fired when the browser is started.
 */
chrome.runtime.onStartup.addListener(() => {
    console.log("Browser started.");
    initializeExtension();
});

// Log that the background script has been loaded.
console.log("Background script loaded.");
