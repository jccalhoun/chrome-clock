// Import the shared settings logic
importScripts('shared-settings.js');

// =================================================================
// GLOBAL CONSTANTS & CACHE
// =================================================================

const ALARM_NAME = "update-clock-hour";
const MAX_CACHE_SIZE = 50;

// Using the OptimizedIconCache from Claude's version
class OptimizedIconCache {
    constructor(maxSize = MAX_CACHE_SIZE) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.accessOrder = new Map();
    }
    generateCacheKey(text, color, use24HourFormat, showLeadingZero) {
        return [text, color, use24HourFormat, showLeadingZero].join('|');
    }
    get(key) {
        if (this.cache.has(key)) {
            this.accessOrder.set(key, Date.now());
            return this.cache.get(key);
        }
        return null;
    }
    set(key, value) {
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            let oldestKey = this.accessOrder.keys().next().value;
            this.cache.delete(oldestKey);
            this.accessOrder.delete(oldestKey);
        }
        this.cache.set(key, value);
        this.accessOrder.set(key, Date.now());
    }
    has(key) { return this.cache.has(key); }
    clear() { this.cache.clear(); this.accessOrder.clear(); }
    get size() { return this.cache.size; }
}

const iconCache = new OptimizedIconCache();
const pendingDraws = new Map();
const pendingIconCallbacks = {};

// =================================================================
// HELPER & DRAWING FUNCTIONS
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

async function updateTitle(date, use24HourFormat) {
    const timeString = date.toLocaleTimeString([], { hour12: !use24HourFormat });
    await chrome.action.setTitle({ title: timeString });
}

/**
 * **FIX:** Simplified drawIcon function.
 * This removes the complex retry logic and uses a straightforward promise and timeout,
 * similar to your original working version.
 */
async function drawIcon(text, color, use24HourFormat, cacheKey) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            delete pendingIconCallbacks[cacheKey];
            reject(new Error('Icon drawing timed out after 5 seconds'));
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

        chrome.runtime.sendMessage({
            type: 'draw-icon',
            target: 'offscreen',
            data: { text, color, use24HourFormat, cacheKey }
        }).catch(err => {
            // This catch is important if the offscreen document is closed or invalid
            pendingIconCallbacks[cacheKey]?.reject(new Error(`Failed to send message to offscreen: ${err.message}`));
            delete pendingIconCallbacks[cacheKey];
        });
    });
}

/**
 * Main clock update logic. Now with a fallback for drawing errors.
 */
async function updateClock() {
    try {
        const settings = await chrome.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff",
            use24HourFormat: false,
            showLeadingZero: false
        });

        const date = new Date();
        let hours = date.getHours();
        if (!settings.use24HourFormat) {
            hours = hours % 12 || 12;
        }
        let textToDraw = hours.toString();
        if (settings.showLeadingZero && hours < 10) {
            textToDraw = '0' + hours;
        }

        const colorToUse = settings.useCustomColor ? settings.customColor : "black";
        const cacheKey = iconCache.generateCacheKey(textToDraw, colorToUse, settings.use24HourFormat, settings.showLeadingZero);

        const cachedIcon = iconCache.get(cacheKey);
        if (cachedIcon) {
            await chrome.action.setIcon({ imageData: cachedIcon });
            await updateTitle(date, settings.use24HourFormat);
            return;
        }

        if (pendingDraws.has(cacheKey)) {
            await pendingDraws.get(cacheKey);
            return;
        }

        const drawPromise = (async () => {
            try {
                await setupOffscreenDocument();
                const imageData = await drawIcon(textToDraw, colorToUse, settings.use24HourFormat, cacheKey);
                if (imageData) {
                    iconCache.set(cacheKey, imageData);
                    await chrome.action.setIcon({ imageData });
                }
                await updateTitle(date, settings.use24HourFormat);
            } catch (drawError) {
                console.error("Draw operation failed:", drawError.message);
                // **Fallback:** On failure, use the black icon to indicate an error.
                await chrome.action.setIcon({ path: "icon16.png" });
                await updateTitle(new Date(), settings.use24HourFormat);
            }
        })();

        pendingDraws.set(cacheKey, drawPromise);

        try {
            await drawPromise;
        } finally {
            pendingDraws.delete(cacheKey);
        }

    } catch (error) {
        console.error("Error updating clock:", error);
    }
}

// =================================================================
// EVENT LISTENERS
// =================================================================

chrome.runtime.onMessage.addListener(async (message) => {
    const cacheKey = message.cacheKey;
    if (!cacheKey || !pendingIconCallbacks[cacheKey]) {
        return;
    }
    if (message.type === 'icon-drawn' && message.imageData) {
        const reconstructedImageData = new ImageData(
            new Uint8ClampedArray(message.imageData.data),
            message.imageData.width,
            message.imageData.height
        );
        pendingIconCallbacks[cacheKey].resolve(reconstructedImageData);
    } else if (message.type === 'icon-error') {
        pendingIconCallbacks[cacheKey].reject(new Error(message.error));
    }
    delete pendingIconCallbacks[cacheKey];
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        iconCache.clear();
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
    chrome.alarms.create(ALARM_NAME, { when: nextHour.getTime() });
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
    // Clear the cache on startup to ensure freshness
    iconCache.clear();
});