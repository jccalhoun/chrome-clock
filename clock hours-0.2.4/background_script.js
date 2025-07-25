// Import the shared settings logic, which allows this extension to communicate with the 'minutes' extension.
importScripts('shared-settings.js');

// =================================================================
// GLOBAL CONSTANTS & CACHE
// =================================================================

/**
 * The names for the alarms used in this extension. Using constants prevents typos.
 * @type {string}
 */
const ALARM_NAME = "update-clock-hour";
const HEALTH_CHECK_ALARM_NAME = "clock-health-check";
const MAX_CACHE_SIZE = 100;

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

function generateCacheKey(text, color, use24HourFormat, showLeadingZero) {
    return `${text}-${color}-${use24HourFormat}-${showLeadingZero}`;
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

let creating; // Promise to prevent race conditions when creating the offscreen document
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

async function updateTitle(date, use24HourFormat) {
    const timeString = date.toLocaleTimeString([], {
        hour12: !use24HourFormat
    });
    await chrome.action.setTitle({
        title: timeString
    });
}

// =================================================================
// CORE LOGIC
// =================================================================

/**
 * The main function to update the clock icon.
 * This function is self-contained and fetches all necessary settings from storage each time it runs.
 */

async function drawIcon(text, color, use24HourFormat, cacheKey) {
    // This function now returns a promise that will be resolved or rejected
    // by the onMessage listener when the offscreen document responds.
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Icon drawing timeout'));
            delete pendingIconCallbacks[cacheKey];
        }, 5000);

        pendingIconCallbacks[cacheKey] = {
            resolve: (imageData) => {
                clearTimeout(timeout);
                resolve(imageData);
            },
            reject: (err) => {
                clearTimeout(timeout);
                reject(err);
            }
        };

        // Send the message to the offscreen document
        chrome.runtime.sendMessage({
            type: 'draw-icon',
            target: 'offscreen',
            data: {
                text,
                color,
                use24HourFormat,
                cacheKey
            }
        });
    });
}

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

        // After (use helper function)
        const cacheKey = generateCacheKey(
                textToDraw,
                colorToUse,
                settings.use24HourFormat,
                settings.showLeadingZero);

        // Check cache first
        if (iconCache.has(cacheKey)) {
            await chrome.action.setIcon({
                imageData: iconCache.get(cacheKey)
            });
            await updateTitle(date, settings.use24HourFormat);
            return;
        }

        // Check if we're already drawing this exact icon
        if (pendingDraws.has(cacheKey)) {
            // Wait for the pending draw to complete
            await pendingDraws.get(cacheKey); // Wait for the existing draw to complete
            return;
        }

        // 3. Start a new draw operation
        const drawPromise = (async() => {
            await setupOffscreenDocument();
            const imageData = await drawIcon(textToDraw, colorToUse, settings.use24HourFormat, cacheKey);

            // The message listener will handle setting the icon, but we still add it to the cache here
            if (imageData) {
                addToCache(cacheKey, imageData);
                await chrome.action.setIcon({
                    imageData
                });
            }
            await updateTitle(date, settings.use24HourFormat);
        })();
        pendingDraws.set(cacheKey, drawPromise);

        try {
            await drawPromise;
        } finally {
            // Always remove the pending draw promise when it's settled
            pendingDraws.delete(cacheKey);
        }

    } catch (error) {
        console.error("Error updating clock:", error);
        await chrome.action.setTitle({
            title: new Date().toLocaleTimeString()
        });
    }
}

// =================================================================
// EVENT LISTENERS & SCHEDULING
// =================================================================

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
        delete pendingIconCallbacks[cacheKey]; // Clean up
    } else if (message.type === 'icon-error') {
        pendingIconCallbacks[cacheKey].reject(new Error(message.error));
        delete pendingIconCallbacks[cacheKey]; // Clean up
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        clearCache();
        updateClock();
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
    }
});

function scheduleNextHourlyUpdate() {
    const now = new Date();
    const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 1, 0);
    chrome.alarms.create(ALARM_NAME, {
        when: nextHour.getTime()
    });
}

function initializeExtension() {
    console.log("Extension initializing...");
    scheduleNextHourlyUpdate();
    updateClock();
}

chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed.");
    initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Browser started.");
    initializeExtension();
});
