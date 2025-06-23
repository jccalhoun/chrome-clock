//based on small clock https://github.com/davidillsley/small-clock
//color update code from https://github.com/mdn/webextensions-examples/tree/master/theme-integrated-sidebar

const ALARM_NAME = "update-clock-minute";
// Default text color
var textColor = "white";
var useCustomColor = false;
var customColor = "#ffffff";
let lastUpdateTimestamp = Date.now();
// Set the text color based on theme
function setTextColor(theme) {
    console.log("Setting text color from theme", theme);
    if (!useCustomColor) {
        if (theme.colors && theme.colors.toolbar_text) {
            textColor = theme.colors.toolbar_text;
        } else {
            textColor = "white";
        }
    } else {
        textColor = customColor;
    }
    console.log("Text color set to:", textColor);
    updateClock();
}

// Set initial theme style

// Watch for theme updates
browser.theme.onUpdated.addListener(({
        theme
    }) => {
    console.log("Theme updated", theme);
    setTextColor(theme);
});

// Listen for messages from the options page or popup
browser.runtime.onMessage.addListener((message) => {
    console.log("Received message:", message);

    if (message.colorChanged) {
        console.log("Settings change detected, updating preferences...");
        browser.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff"
        }).then(storageResult => {
            console.log("Retrieved preferences from storage:", storageResult);
            useCustomColor = storageResult.useCustomColor;
            customColor = storageResult.customColor;
            console.log("Updated preferences:", {
                useCustomColor,
                customColor
            });
            updateClock();
        });
    }
});
// Add this external message listener to background_script.js
browser.runtime.onMessageExternal.addListener((message, sender) => {
    console.log("Received external message in background:", message, sender);

    // Verify the message is from our companion extension
    if (
        sender.id === SharedSettings.HOURS_EXTENSION_ID ||
        sender.id === SharedSettings.MINUTES_EXTENSION_ID) {
        if (message.action === "syncSettings") {
            autoApplyReceivedSettings(message.settings);
        }
    }
});

// Add this function to both extensions' background_script.js
function autoApplyReceivedSettings(settings) {
    console.log("Auto-applying received settings:", settings);

    // Apply color settings if received
    if (settings.hasOwnProperty('useCustomColor') ||
        settings.hasOwnProperty('customColor')) {

        browser.storage.sync.get({
            useCustomColor: false,
            customColor: "#ffffff"
        }).then(storageResult => {
            useCustomColor = storageResult.useCustomColor;
            customColor = storageResult.customColor;
            console.log("Auto-updated color preferences:", {
                useCustomColor,
                customColor
            });
            updateClock();
        });
    }
}

// Update the clock icon
function updateClock() {
    lastUpdateTimestamp = Date.now();
    try {
        console.log("Updating clock with color:", textColor);
        const date = new Date();
        let minutes = date.getMinutes();

        // Format minutes with leading zero if needed
        const minutesText = minutes < 10 ? '0' + minutes : minutes.toString();

        console.log("Current minutes text:", minutesText);

        // Create a canvas for the icon
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;

        const context = canvas.getContext("2d");

        // Clear the canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // --- Start: Dynamic Font Size Calculation ---
        let bestFontSize = canvas.height; // Start searching from max possible height

        context.textAlign = "center"; // Center horizontally
        context.textBaseline = "middle"; // Center vertically

        for (let currentSize = canvas.height; currentSize >= 1; currentSize--) {
            // You can change 'Arial' to your preferred font
            context.font = `bold ${currentSize}px Arial`;
            let metrics = context.measureText(minutesText);
            let textWidth = metrics.width;
            // Check if text width fits within canvas width (with some padding)
            // and if font size (as proxy for height) fits within canvas height (with padding)
            // Reducing padding (e.g., to - 2 or 0) makes text larger but might touch edges
            if (textWidth <= canvas.width - 1 && currentSize <= canvas.height - 1) {
                bestFontSize = currentSize;
                console.log(`Found best font size: ${bestFontSize}px for text "${minutesText}"`);
                break; // Found the largest size that fits
            }
        }
        // --- End: Dynamic Font Size Calculation ---

        // Set final text properties using the calculated size
        context.fillStyle = useCustomColor ? customColor : textColor;
        context.font = `bold ${bestFontSize}px Arial`; // Apply the best size
        console.log("Canvas fillStyle set to:", context.fillStyle);
        console.log("Final minutes font set to:", context.font);

        // Draw the text centered on the canvas
        context.fillText(minutesText, canvas.width / 2, canvas.height / 2);

        // Get the image data
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Update the icon
        browser.action.setIcon({
            imageData
        });
        browser.action.setTitle({
            title: date.toLocaleTimeString()
        });

        // Schedule next update
        scheduleNextMinuteAlarm();
    } catch (error) {
        console.error("Error updating clock:", error);
        // If an error occurs, try again in 10 seconds
        scheduleNextMinuteAlarm(10); // Try again in 10 seconds
    }
}

// New function to schedule the alarm for the next minute
function scheduleNextMinuteAlarm(overrideSeconds) {
    // Get current time
    const now = new Date();

    // Calculate when the next minute starts
    let secondsToNextMinute = overrideSeconds || (60 - now.getSeconds());
    if (secondsToNextMinute === 60)
        secondsToNextMinute = 0; // Handle exact minute boundary

    // Convert to minutes (alarms API uses minutes)
    const minutesUntilNextUpdate = secondsToNextMinute / 60;

    console.log("Scheduling next update in", secondsToNextMinute, "seconds");

    // Clear any existing alarm
    browser.alarms.clear(ALARM_NAME).then(() => {
        // Create a new alarm
        browser.alarms.create(ALARM_NAME, {
            delayInMinutes: minutesUntilNextUpdate
        });
    });
}

// Add alarm listener
browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log("Alarm triggered, updating clock");
        updateClock();
    } else if (alarm.name === "clock-health-check") {
        console.log("Performing clock health check");

        // If no update in the last 3 minutes, force an update
        const now = Date.now();
        if (now - lastUpdateTimestamp > 180000) { // 3 minutes
            console.log("Clock hasn't updated in more than 3 minutes. Forcing update...");
            updateClock();
        }
    } else if (alarm.name === "clock-startup-check") {
        console.log("Startup check alarm triggered, ensuring clock is visible");
        updateClock();
    }
});
// Update initializeExtension to use alarms
async function initializeExtension() {
    const myId = browser.runtime.id;
    console.log(`Minimal initializeExtension with setIcon started for ${myId}`);

    try {
        console.log("Starting extension initialization...");
        // Use Promise.all to wait for both operations to complete
        const [storageResult, themeResult] = await Promise.all([
                    // Get storage settings
                    browser.storage.sync.get({
                        useCustomColor: false,
                        customColor: "#ffffff"
                    }),
                    // Get theme
                    browser.theme.getCurrent().catch(error => {
                        console.error("Error getting theme:", error);
                        return {}; // Return empty object on error
                    })
                ]);

        // Now we have both results, apply them
        useCustomColor = storageResult.useCustomColor;
        customColor = storageResult.customColor;

        console.log("Loaded preferences:", {
            useCustomColor,
            customColor
        });

        // Set text color with explicit fallback
        if (!useCustomColor) {
            if (themeResult.colors && themeResult.colors.toolbar_text) {
                textColor = themeResult.colors.toolbar_text;
                console.log("Using toolbar_text color:", textColor);
            } else {
                // Explicitly set default
                textColor = "white";
                console.log("No toolbar_text color found, using default white");
            }
        } else {
            textColor = customColor;
            console.log("Using custom color:", textColor);
        }

        // Force immediate update
        console.log("Performing initial clock update");
        updateClock();

        // Set up the health check alarm
        browser.alarms.create("clock-health-check", {
            periodInMinutes: 2
        });

        // Also set a redundant startup check after a short delay
        // This serves as a backup in case there are still timing issues
        browser.alarms.create("clock-startup-check", {
            delayInMinutes: 0.2 // 12 seconds after init
        });

        console.log("Extension initialization complete");
    } catch (error) {
        console.error("Error during initialization:", error);
        // Set default color and continue
        textColor = "white";
        console.log("Using fallback white color due to error");
        try {
            updateClock(); // Attempt update even on error
            // Maybe set an error badge here too?
            await browser.action.setBadgeText({
                text: 'INIT ERR'
            });
            await browser.action.setBadgeBackgroundColor({
                color: 'red'
            });
        } catch (updateError) {
            console.error("Fallback updateClock failed:", updateError)
        }
    }
}

console.log("Background script loaded, attempting init for " + browser.runtime.id);

// --- NEW: Add Startup Listener ---
// This runs when the browser starts up *if* the extension was already enabled.
browser.runtime.onStartup.addListener(() => {
    console.log(`browser.runtime.onStartup event fired for ${browser.runtime.id}`);
    // Initialize the extension state when the browser starts
    initializeExtension();
});

// --- Add Installed Listener (Handles First Install/Update) ---
// This runs when the extension is first installed, updated, or Firefox is updated.
browser.runtime.onInstalled.addListener(details => {
    console.log(`browser.runtime.onInstalled event fired for ${browser.runtime.id}. Reason: ${details.reason}`);
    // Initialize the extension state on installation or update
    initializeExtension();
    // You could also check details.reason if needed (e.g., 'install', 'update')
});

// Log that the script itself has loaded and listeners are ready
console.log(`Background script loaded, listeners attached for ${browser.runtime.id}`);
