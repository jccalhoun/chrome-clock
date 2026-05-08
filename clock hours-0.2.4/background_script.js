// Import the shared settings logic
importScripts('shared-settings.js');

const ALARM_NAME = "update-clock-hour";

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
    const drawText = text + ":";

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
            use24HourFormat: false,
            showLeadingZero: false
        });

        const date = new Date();
        let hours = date.getHours();
        if (!settings.use24HourFormat) {
            hours = hours % 12 || 12;
        }

        let textToDraw = String(hours);
        if (settings.showLeadingZero && hours < 10) {
            textToDraw = '0' + hours;
        }

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

function scheduleNextHourlyUpdate() {
    const now = new Date();
    const nextHour = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(),
        now.getHours() + 1, 0, 1, 0
    );
    // periodInMinutes: 60 makes this a repeating alarm so it never needs
    // to be manually rescheduled after each firing
    chrome.alarms.create(ALARM_NAME, {
        when: nextHour.getTime(),
        periodInMinutes: 60
    });
}

function initializeExtension() {
    scheduleNextHourlyUpdate();
    updateClock();
}

chrome.runtime.onInstalled.addListener(initializeExtension);
chrome.runtime.onStartup.addListener(() => {
    iconCache.clear();
    initializeExtension();
});