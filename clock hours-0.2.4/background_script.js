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
        const cacheKey = `${textToDraw}-${colorToUse}-${settings.use24HourFormat}`;

        // Check cache first
        if (iconCache[cacheKey]) {
            await chrome.action.setIcon({
                imageData: iconCache[cacheKey]
            });
            await updateTitle(date, settings.use24HourFormat);
            return;
        }

        // Check if we're already drawing this exact icon
        if (pendingDraws.has(cacheKey)) {
            // Wait for the pending draw to complete
            await pendingDraws.get(cacheKey);
            // After waiting, check cache again
            if (iconCache.has(cacheKey)) {
                await chrome.action.setIcon({
                    imageData: iconCache.get(cacheKey)
                });
                await updateTitle(date, settings.use24HourFormat);
                return;
            }
        }

        // Create a promise to track this draw operation
        const drawPromise = drawIcon(textToDraw, colorToUse, settings.use24HourFormat, cacheKey);
        pendingDraws.set(cacheKey, drawPromise);

        try {
            await drawPromise;
            // Icon will be set by the message listener
            await updateTitle(date, settings.use24HourFormat);
        } finally {
            pendingDraws.delete(cacheKey);
        }

    } catch (error) {
        console.error("Error updating clock:", error);
        // Fallback: set a simple text-based title
        await chrome.action.setTitle({
            title: new Date().toLocaleTimeString()
        });
    }
}

async function drawIcon(text, color, use24HourFormat, cacheKey) {
    await setupOffscreenDocument();

    return new Promise((resolve, reject) => {
        // Set up a timeout for the operation
        const timeout = setTimeout(() => {
            reject(new Error('Icon drawing timeout'));
        }, 5000); // 5 second timeout

        // Store the resolve/reject functions for this cache key
        const cleanup = () => {
            clearTimeout(timeout);
            delete pendingIconCallbacks[cacheKey];
        };

        pendingIconCallbacks[cacheKey] = {
            resolve: () => {
                cleanup();
                resolve();
            },
            reject: (err) => {
                cleanup();
                reject(err);
            }
        };

        // 4. Send a message to the offscreen document to draw the icon with the specified text and color.
        chrome.runtime.sendMessage({
            type: 'draw-icon',
            target: 'offscreen',
            data: {
                text: text,
                color: color,
                use24HourFormat: use24HourFormat,
                cacheKey: cacheKey // Pass cacheKey to the offscreen script
            }
        });
    });
}

        // 5. Update the tooltip (the text that appears when you hover over the extension icon).
async function updateTitle(date, use24HourFormat) {
    const timeString = date.toLocaleTimeString([], {
        hour12: !use24HourFormat
    });
    await chrome.action.setTitle({
        title: timeString
    });
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
// EVENT LISTENERS & SCHEDULING
// =================================================================

// Track pending callbacks for icon drawing
const pendingIconCallbacks = {};
function scheduleNextHourlyUpdate() {
    const now = new Date();
    const nextHour = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            now.getHours() + 1, // Move to the next hour
            0, // Reset minutes
            0, // Reset seconds
            0 // Reset milliseconds
        );

    // Create a precise, non-repeating alarm for the next hour
    chrome.alarms.create(ALARM_NAME, {
        when: nextHour.getTime()
    });
    console.log(`Next hourly update scheduled for: ${nextHour.toLocaleTimeString()}`);
}

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

            const cacheKey = message.cacheKey;

            // Add to cache
            if (cacheKey) {
                addToCache(cacheKey, reconstructedImageData);
                console.log(`Icon cached with key: ${cacheKey}`);
            }

            // Set the icon
            await chrome.action.setIcon({
                imageData: reconstructedImageData
            });

            // Resolve any pending promise for this cache key
            if (cacheKey && pendingIconCallbacks[cacheKey]) {
                pendingIconCallbacks[cacheKey].resolve();
            }

        } catch (error) {
            console.error("Failed to set icon:", error);

            // Reject any pending promise for this cache key
            const cacheKey = message.cacheKey;
            if (cacheKey && pendingIconCallbacks[cacheKey]) {
                pendingIconCallbacks[cacheKey].reject(error);
            }
        } finally {
            // Clean up offscreen document
            try {
                if (await chrome.offscreen.hasDocument()) {
                    await chrome.offscreen.closeDocument();
                }
            } catch (cleanupError) {
                console.warn("Error cleaning up offscreen document:", cleanupError);
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
        const visualChanges = ['useCustomColor', 'customColor', 'showLeadingZero', 'use24HourFormat'];
        const needsCacheClearing = visualChanges.some(key => key in changes);

        if (needsCacheClearing) {
            clearCache();
        }
        updateClock();
    }
});

/**
 * Handles all alarms. The main alarm triggers the clock update every minute.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
        scheduleNextHourlyUpdate(); // Schedule the next hourly update
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
    scheduleNextHourlyUpdate(); // Schedule the first precise hourly alarm
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

// Cleanup on extension shutdown
chrome.runtime.onSuspend.addListener(() => {
    clearCache();
});

console.log("Background script loaded.");
