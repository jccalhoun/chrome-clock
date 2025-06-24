// Global variables
const ALARM_NAME = "update-clock-hour";
var useCustomColor = false;
var customColor = "#ffffff";
var use24HourFormat = false;
let lastUpdateTimestamp = Date.now();
let creating; // To prevent race conditions for the offscreen document

// --- 1. HELPER FUNCTIONS ---

async function setupOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CANVAS'],
      justification: 'To draw the clock icon.',
    });
    await creating;
    creating = null;
  }
}

// --- 2. CORE LOGIC ---

async function updateClock() {
    try {
        lastUpdateTimestamp = Date.now();
        const date = new Date();
        let hours = date.getHours();
        let displayHour = hours % 12 || 12;
        if (use24HourFormat) {
            displayHour = hours;
        }

        const textToDraw = displayHour.toString();
        const colorToUse = useCustomColor ? customColor : "black";

        await setupOffscreenDocument();

        chrome.runtime.sendMessage({
            type: 'draw-icon',
            target: 'offscreen',
            data: {
                text: textToDraw,
                color: colorToUse,
                use24HourFormat: use24HourFormat
            }
        });

        const timeString = date.toLocaleTimeString([], { hour12: !use24HourFormat });
        await browser.action.setTitle({ title: timeString });
        scheduleNextMinuteAlarm();
    } catch (error) {
        console.error("Error updating clock:", error);
        scheduleNextMinuteAlarm(10);
    }
}

function scheduleNextMinuteAlarm(overrideSeconds) {
    const now = new Date();
    let secondsToNextMinute = overrideSeconds || (60 - now.getSeconds());
    const minutesUntilNextUpdate = secondsToNextMinute / 60;
    browser.alarms.create(ALARM_NAME, { delayInMinutes: minutesUntilNextUpdate });
}

async function initializeExtension() {
    try {
        const storageResult = await browser.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff",
            use24HourFormat: false
        });
        useCustomColor = storageResult.useCustomColor;
        customColor = storageResult.customColor;
        use24HourFormat = storageResult.use24HourFormat;
        console.log("Loaded preferences:", storageResult);
        updateClock();
    } catch (error) {
        console.error("Error during initialization:", error);
    }
}

// --- 3. EVENT LISTENERS ---

browser.runtime.onMessage.addListener(async (message) => {
    if (message.type === 'icon-drawn') {
        await browser.action.setIcon({ imageData: message.imageData });
        await chrome.offscreen.close();
        return;
    }
    if (message.colorChanged || message.formatChanged) {
        initializeExtension();
    }
});

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
    } else if (alarm.name === "clock-health-check") {
        const now = Date.now();
        if (now - lastUpdateTimestamp > 180000) {
            updateClock();
        }
    } else if (alarm.name === "clock-startup-check") {
        updateClock();
    }
});

browser.runtime.onStartup.addListener(() => {
    console.log(`onStartup event fired.`);
    initializeExtension();
    browser.alarms.create("clock-health-check", { periodInMinutes: 2 });
});

browser.runtime.onInstalled.addListener(details => {
    console.log(`onInstalled event fired. Reason: ${details.reason}`);
    initializeExtension();
    browser.alarms.create("clock-health-check", { periodInMinutes: 2 });
});

console.log("Background script loaded and listeners attached.");