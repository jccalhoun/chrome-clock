// Import the shared settings logic, which allows this extension to communicate with the 'hours' extension.
importScripts('shared-settings.js');

// =================================================================
// GLOBAL CONSTANTS
// =================================================================

/**
 * The name for the alarm used in this extension.
 * @type {string}
 */
const ALARM_NAME = "update-clock-minute";

// =================================================================
// CORE LOGIC
// =================================================================

/**
 * The main function to update the clock icon with the current minute.
 * It fetches settings from storage each time to ensure it's up-to-date.
 */
async function updateClock() {
    try {
        // 1. Load the latest color settings from chrome.storage.sync.
        const settings = await chrome.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff",
        });

        // 2. Prepare data for drawing the icon.
        const date = new Date();
        const minutes = date.getMinutes();
        // Pad with a leading zero for single-digit minutes (e.g., "05").
        const textToDraw = minutes < 10 ? '0' + minutes : minutes.toString();
        const colorToUse = settings.useCustomColor ? settings.customColor : "black";

        // 3. Ensure the offscreen document is running.
        await setupOffscreenDocument();

        // 4. Send a message to the offscreen document to draw the icon.
        chrome.runtime.sendMessage({
            type: 'draw-icon',
            target: 'offscreen',
            data: {
                text: textToDraw,
                color: colorToUse,
            }
        });

        // 5. Update the tooltip with the full current time.
        const timeString = date.toLocaleTimeString();
        await chrome.action.setTitle({ title: timeString });

    } catch (error) {
        console.error("Error updating clock:", error);
    }
}

// =================================================================
// HELPER FUNCTIONS
// =================================================================

/**
 * A promise variable to prevent race conditions when creating the offscreen document.
 */
let creating;

/**
 * Creates the offscreen document for drawing if it doesn't already exist.
 */
async function setupOffscreenDocument() {
    if (await chrome.offscreen.hasDocument()) return;
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['DOM_PARSER'],
            justification: 'To draw the clock icon on a canvas.',
        });
        await creating;
        creating = null;
    }
}

// =================================================================
// EVENT LISTENERS
// =================================================================

/**
 * Handles messages from other parts of the extension, like the offscreen document.
 */
chrome.runtime.onMessage.addListener(async (message) => {
    // When the icon has been drawn, set it as the extension icon.
    if (message.type === 'icon-drawn' && message.imageData) {
        try {
            // Reconstruct the ImageData object from the serialized data.
            const reconstructedImageData = new ImageData(
                new Uint8ClampedArray(message.imageData.data),
                message.imageData.width,
                message.imageData.height
            );
            await chrome.action.setIcon({ imageData: reconstructedImageData });
        } catch (error) {
            console.error("Failed to set icon:", error);
        } finally {
            // Close the offscreen document to save resources.
            if (await chrome.offscreen.hasDocument()) {
                await chrome.offscreen.closeDocument();
            }
        }
    }
});

/**
 * Listens for changes in synchronized storage and updates the clock immediately.
 * This is triggered when the user changes the color in the options.
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        console.log("Storage change detected, updating clock.");
        updateClock();
    }
});

/**
 * Handles the clock update alarm, which fires every minute.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
    }
});

/**
 * Sets up the extension on first install or when the browser starts.
 */
function initializeExtension() {
    console.log("Extension initializing...");
    // Create an alarm to update the clock every minute.
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    // Run an initial update to set the icon right away.
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
console.log("Background script for minutes loaded.");