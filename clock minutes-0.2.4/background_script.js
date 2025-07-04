// Global Constants
const ALARM_NAME = "update-clock-minute";

// --- CORE LOGIC ---

/**
 * The main function to update the clock icon.
 * It fetches all necessary settings from storage each time it runs.
 */
async function updateClock() {
    try {
        // 1. Load the latest settings from chrome.storage.sync.
        const settings = await chrome.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff",
        });

        // 2. Prepare data for drawing.
        const date = new Date();
        const minutes = date.getMinutes();
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

        // 5. Update the tooltip.
        const timeString = date.toLocaleTimeString();
        await chrome.action.setTitle({ title: timeString });

    } catch (error) {
        console.error("Error updating clock:", error);
    }
}

// --- HELPER FUNCTIONS ---

/**
 * Creates the offscreen document if it doesn't already exist.
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
 * Handles messages from other parts of the extension.
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
        if (await chrome.offscreen.hasDocument()) {
            await chrome.offscreen.closeDocument();
        }
    }
});

/**
 * Listens for changes in synchronized storage and updates the clock immediately.
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        console.log("Storage change detected, updating clock.");
        updateClock();
    }
});

/**
 * Handles the clock update alarm.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
    }
});

/**
 * Sets up the extension on first install or when the browser starts.
 */
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed. Initializing...");
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    updateClock();
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Browser started. Initializing...");
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    updateClock();
});

console.log("Background script for minutes loaded.");