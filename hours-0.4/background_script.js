// Clock Hours background service worker (Chrome, Manifest V3)
importScripts("platform.js", "shared-settings.js", "clock-layout.js");

const ALARM_NAME = "update-clock-hour";

// A service worker has no DOM, so the icon is drawn on an OffscreenCanvas
const canvas = new OffscreenCanvas(32, 32);
const context = canvas.getContext("2d", { willReadFrequently: true });

// Chrome only wakes the service worker for listeners added synchronously at
// startup, so every listener is registered here at the top level.

// Listen for messages from the companion extension (Clock Minutes)
SharedSettings.init();

// Listen for messages from the popup/options page to trigger an immediate update
browser.runtime.onMessage.addListener((message) => {
    if (message.colorChanged || message.displayChanged || message.fontChanged) {
        updateClock();
    }
});

// Redraw on any settings change: local saves, the companion extension, or
// Chrome sync; and when a page records a switch between light and dark mode
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" || (area === "local" && changes.prefersDark)) updateClock();
});

// Update the clock icon. Fetches settings every time so it never draws stale values.
async function updateClock() {
    try {
        // 1. Get all settings, the theme (none in Chrome) and light/dark mode at the same time
        const [settings, theme, dark] = await Promise.all([
            browser.storage.sync.get({
                useCustomColor: false,
                customColor: "#ffffff",
                clockFont: ClockLayout.BUILTIN,
                clockFontSize: 0,
                use24HourFormat: false,
                showLeadingZero: false
            }),
            ClockLayout.getTheme(),
            ClockLayout.prefersDark()
        ]);

        // 2. Determine the correct color to use
        const colorToUse = ClockLayout.pickColor(settings, theme, dark);

        // 3. Format the text to draw based on settings
        const date = new Date();
        let hours = date.getHours();

        if (!settings.use24HourFormat) {
            hours = hours % 12 || 12; // 0 o'clock becomes 12
        }

        let textToDraw = String(hours);
        if (settings.showLeadingZero) {
            textToDraw = textToDraw.padStart(2, "0");
        }

        // 4. Draw the icon (same font and digit size in both extensions; see clock-layout.js)
        await ClockLayout.setFont(settings.clockFont);
        ClockLayout.setSize(settings.clockFontSize);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = colorToUse;
        ClockLayout.drawHours(context, canvas.width, canvas.height, textToDraw);

        // 5. Update the toolbar icon and tooltip. This only redraws once an
        // hour, so the tooltip shows the date (the Clock Minutes tooltip has
        // the full time).
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        await browser.action.setIcon({ imageData });
        await browser.action.setTitle({
            title: date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
        });

    } catch (error) {
        console.error("Error updating clock:", error);
    }
}

// --- Alarms and Initialization ---

// Wakes at the start of each hour. The alarm repeats so it's never missing
// between firings, and it's re-anchored to the top of the hour every time it
// fires, so it can't drift after the computer sleeps.
function scheduleNextUpdate() {
    const nextHour = new Date();
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    browser.alarms.create(ALARM_NAME, { when: nextHour.getTime(), periodInMinutes: 60 });
}

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        updateClock();
        scheduleNextUpdate();
    }
});

function initializeExtension() {
    console.log("Clock Hours Initializing...");
    updateClock();
    scheduleNextUpdate();
}

browser.runtime.onInstalled.addListener((details) => {
    initializeExtension();
    if (details.reason === "install") {
        SharedSettings.requestSettingsFromCompanion();
    }
});
browser.runtime.onStartup.addListener(initializeExtension);

// Runs every time the service worker starts. Restarts the clock if the alarm
// is gone (e.g. after the extension is disabled and re-enabled); does nothing
// extra on a normal wake.
browser.alarms.get(ALARM_NAME).then((alarm) => {
    if (!alarm) initializeExtension();
});
