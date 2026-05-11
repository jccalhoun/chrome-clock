// Import the shared settings logic
importScripts('shared-settings.js');

const ALARM_NAME = "update-clock-minute";

// The cache is still worth keeping to avoid redrawing identical frames
const iconCache = new Map();

function generateCacheKey(text, color) {
    return `${text}|${color}`;
}

function drawIcon(text, color) {
    const cacheKey = generateCacheKey(text, color);
    if (iconCache.has(cacheKey)) {
        return iconCache.get(cacheKey);
    }

    const canvas = new OffscreenCanvas(32, 32);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    
    // Minutes do not have the colon appended
    const drawText = text;

    // Binary search for best font size
    let min = 1, max = 38, bestSize = 1;
    while (min <= max) {
        const mid = Math.floor((min + max) / 2);
        context.font = `bold ${mid}px Arial`;
        const width = context.measureText(drawText).width;
        if (width <= 30 && mid <= 30) {
            bestSize = mid;
            min = mid + 1;
        } else {
            max = mid - 1;
        }
    }

    context.clearRect(0, 0, 32, 32);
    context.fillStyle = color;
    context.font = `bold ${bestSize}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(drawText, 16, 16);

    const imageData = context.getImageData(0, 0, 32, 32);
    iconCache.set(cacheKey, imageData);
    return imageData;
}

async function updateClock() {
    try {
        const settings = await chrome.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff",
            use24HourFormat: false // Kept for shared settings compatibility, though minutes don't use it
        });

        const date = new Date();
        let minutes = date.getMinutes();
        
        // Minutes are always padded to two digits (e.g., 05 instead of 5)
        let textToDraw = minutes.toString().padStart(2, '0');

        const colorToUse = settings.useCustomColor ? settings.customColor : "black";
        const imageData = drawIcon(textToDraw, colorToUse);

        await chrome.action.setIcon({ imageData });
        await chrome.action.setTitle({
            title: date.toLocaleTimeString([], { hour12: !settings.use24HourFormat })
        });

    } catch (error) {
        console.error("Error updating clock:", error);
    }
}

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

function scheduleNextMinuteUpdate() {
    const now = new Date();
    // Calculate the exact millisecond of the next minute turnover
    const nextMinute = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
        now.getHours(), now.getMinutes() + 1, 0, 0
    );
    
    // periodInMinutes: 1 makes this a repeating alarm every 60 seconds
    chrome.alarms.create(ALARM_NAME, {
        when: nextMinute.getTime(),
        periodInMinutes: 1
    });
}

function initializeExtension() {
    scheduleNextMinuteUpdate();
    updateClock();
}

chrome.runtime.onInstalled.addListener(initializeExtension);
chrome.runtime.onStartup.addListener(() => {
    iconCache.clear();
    initializeExtension();
});