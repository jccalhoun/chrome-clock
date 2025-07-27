// Import the shared settings logic, which allows this extension to communicate with the 'hours' extension.
importScripts('shared-settings.js');

// =================================================================
// GLOBAL CONSTANTS & CACHE
// =================================================================

/**
 * The name for the alarm used in this extension.
 * @type {string}
 */
const ALARM_NAME = "update-clock-minute";

// Enhanced cache management
const MAX_CACHE_SIZE = 120; // Cache up to 2 hours of minute icons
/**
 * A cache to store previously rendered icons.
 * The key is a string combination of the text and color, and the value is the ImageData.
 * @type {Object<string, ImageData>}
 */
const iconCache = new Map();
const pendingDraws = new Map(); // Track pending draws to prevent duplicates

// A map to hold the resolve/reject functions for pending icon draws
const pendingIconCallbacks = {};

// =================================================================
// CACHE UTILITIES
// =================================================================

function generateCacheKey(text, color) {
    return `${text}-${color}`;
}

function addToCache(cacheKey, imageData) {
    // Manage cache size
    if (iconCache.size >= MAX_CACHE_SIZE) {
        const firstKey = iconCache.keys().next().value;
        iconCache.delete(firstKey);
    }
    iconCache.set(cacheKey, imageData);
}

function clearCache() {
    iconCache.clear();
    pendingDraws.clear();
    console.log("Icon cache cleared");
}

// =================================================================
// HELPER FUNCTIONS
// =================================================================

let creating; // Promise to prevent race conditions
async function setupOffscreenDocument() {
    try {
        if (await chrome.offscreen.hasDocument()) {
            return;
        }
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
    } catch (error) {
        console.error("Error setting up offscreen document:", error);
    }
}

async function updateTitle(date) {
    const timeString = date.toLocaleTimeString();
    await chrome.action.setTitle({
        title: timeString
    });
}

// =================================================================
// CORE LOGIC
// =================================================================

async function drawIcon(text, color, cacheKey) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Icon drawing timeout'));
            delete pendingIconCallbacks[cacheKey];
        }, 5000); // 5-second timeout

        pendingIconCallbacks[cacheKey] = {
            resolve: (imageData) => {
                clearTimeout(timeout);
                resolve(imageData);
            },
            reject: (err) => {
                clearTimeout(timeout);
                reject(err);
            },
        };

        // Send message to the offscreen document to perform the drawing
        chrome.runtime.sendMessage({
            type: 'draw-icon',
            target: 'offscreen',
            data: {
                text,
                color,
                cacheKey
            }
        });
    });
}

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
            customColor: "#ffffff"
        });

        // 2. Prepare data for drawing the icon.
        const date = new Date();
        const minutes = date.getMinutes();
        // Pad with a leading zero for single-digit minutes (e.g., "05").
        const textToDraw = String(minutes).padStart(2, '0');
        const colorToUse = settings.useCustomColor ? settings.customColor : "black";
        const cacheKey = generateCacheKey(textToDraw, colorToUse);

        // Check cache first
        if (iconCache.has(cacheKey)) {
            await chrome.action.setIcon({
                imageData: iconCache.get(cacheKey)
            });
            await updateTitle(date);
            return;
        }

        // Check if we're already drawing this exact icon
        if (pendingDraws.has(cacheKey)) {
            await pendingDraws.get(cacheKey); // Wait for the pending draw to complete
            return;
        }

        // 3. Start a new draw operation
        const drawPromise = (async() => {
            await setupOffscreenDocument();
            const imageData = await drawIcon(textToDraw, colorToUse, cacheKey);

            if (imageData) {
                addToCache(cacheKey, imageData);
                await chrome.action.setIcon({
                    imageData
                });
            }
            await updateTitle(date);
        })();

        pendingDraws.set(cacheKey, drawPromise);

        try {
            await drawPromise;
        } finally {
            pendingDraws.delete(cacheKey); // Always clean up
        }

    } catch (error) {
        console.error("Error updating clock:", error);
        await chrome.action.setTitle({
            title: new Date().toLocaleTimeString()
        });
    }
}

// =================================================================
// EVENT LISTENERS & PRECISE SCHEDULING
// =================================================================

/**
 * Calculates the start of the next minute and schedules a precise alarm.
 */
function scheduleNextMinuteUpdate() {
    const now = new Date();
    // Calculate the time for the start of the next minute
    const nextMinute = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours(),
            now.getMinutes() + 1, // Move to the next minute
            0, // Reset seconds
            0 // Reset milliseconds
        );

    // Create a precise, non-repeating alarm
    chrome.alarms.create(ALARM_NAME, {
        when: nextMinute.getTime()
    });
    console.log(`Next minute update scheduled for: ${nextMinute.toLocaleTimeString()}`);
}

/**
 * Handles messages from other parts of the extension, like the offscreen document.
 */
chrome.runtime.onMessage.addListener(async(message) => {
    const cacheKey = message.cacheKey;
    if (!cacheKey || !pendingIconCallbacks[cacheKey]) {
        return;
    }

    if (message.type === 'icon-drawn' && message.imageData) {
        const reconstructedImageData = new ImageData(
                new Uint8ClampedArray(message.imageData.data),
                message.imageData.width,
                message.imageData.height);
        pendingIconCallbacks[cacheKey].resolve(reconstructedImageData);
    } else if (message.type === 'icon-error') {
        pendingIconCallbacks[cacheKey].reject(new Error(message.error));
    }

    // Clean up the callback regardless of outcome
    delete pendingIconCallbacks[cacheKey];
});

/**
 * Listens for changes in synchronized storage and updates the clock immediately.
 * This is triggered when the user changes the color in the options.
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        // Clear the cache to ensure icons are redrawn with the new settings.
        const visualChanges = ['useCustomColor', 'customColor'];
        if (visualChanges.some(key => key in changes)) {
            clearCache();
        }
        updateClock();
    }
});

/**
 * Handles the precise clock update alarm.
 * When it fires, it updates the clock and schedules the next alarm.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
        scheduleNextMinuteUpdate(); // Schedule the next update
    }
});

/**
 * Sets up the extension on first install or when the browser starts.
 */
function initializeExtension() {
    console.log("Extension initializing...");
    
    // Run an initial update to set the icon right away.
    updateClock();
    // Schedule the first precise alarm.
    scheduleNextMinuteUpdate();
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
    console.log("Browser started, initializing minutes extension.");
    initializeExtension();
});
