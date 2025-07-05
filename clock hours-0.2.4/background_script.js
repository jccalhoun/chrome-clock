// Import the shared settings logic
importScripts('shared-settings.js');
// Global Constants
const ALARM_NAME = "update-clock-hour";
const HEALTH_CHECK_ALARM_NAME = "clock-health-check";

// --- CORE LOGIC ---

/**
 * The main function to update the clock icon.
 * It is now self-contained and fetches all necessary settings from storage each time it runs.
 */
async function updateClock() {
    try {
        // 1. Load the latest settings directly from chrome.storage.sync.
        const settings = await chrome.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff",
            use24HourFormat: false
        });

        // 2. Prepare data for drawing.
        const date = new Date();
        let hours = date.getHours();
        if (!settings.use24HourFormat) {
            hours = hours % 12 || 12; // Convert to 12-hour format
        }
        const textToDraw = hours.toString();
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
                use24HourFormat: settings.use24HourFormat
            }
        });

        // 5. Update the tooltip.
        const timeString = date.toLocaleTimeString([], { hour12: !settings.use24HourFormat });
        await chrome.action.setTitle({ title: timeString });

    } catch (error) {
        console.error("Error updating clock:", error);
    }
}

// --- HELPER FUNCTIONS ---

/**
 * Creates the offscreen document if it doesn't already exist.
 * Uses a global promise `creating` to prevent race conditions.
 */
let creating;
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

// --- EVENT LISTENERS ---

/**
 * Handles messages from other parts of the extension, primarily the offscreen document.
 */
chrome.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'icon-drawn' && message.imageData) {
        try {
            const reconstructedImageData = new ImageData(
                new Uint8ClampedArray(message.imageData.data),
                message.imageData.width,
                message.imageData.height
            );
            await chrome.action.setIcon({ imageData: reconstructedImageData });
        } catch (error) {
            console.error("Failed to set icon:", error);
        }
        // Always ensure the document is closed after use.
        if (await chrome.offscreen.hasDocument()) {
            await chrome.offscreen.closeDocument();
        }
    }
});

/**
 * Listens for changes in synchronized storage and updates the clock immediately.
 * This is the primary trigger for updates when a user changes a setting.
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
        // A health check could be added here if needed in the future.
        console.log("Health check alarm fired.");
    }
});

/**
 * Sets up the extension on first install or when the browser starts.
 */
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed. Initializing...");
    // Set up the main alarm to run every minute.
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    // Run an initial update.
    updateClock();
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Browser started. Initializing...");
    // Ensure the alarm is set and run an initial update.
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    updateClock();
});

console.log("Background script loaded.");