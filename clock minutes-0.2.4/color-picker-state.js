// =================================================================
// COLOR PICKER STATE MANAGEMENT MODULE
// =================================================================
// This module handles loading from and saving to chrome.storage.sync.

/**
 * Saves the user's custom color and other preferences to storage.
 * @param {string} colorToSave - The hex color string to save.
 */
async function saveCustomColor(colorToSave) {
    try {
        const data = await chrome.storage.sync.get({ recentColors: [] });
        let recentColors = data.recentColors || [];

        // Add the new color to the beginning of the recent colors list.
        if (colorToSave && !recentColors.includes(colorToSave)) {
            recentColors.unshift(colorToSave);
        }
        // Keep the list of recent colors to a maximum of 5.
        if (recentColors.length > 5) {
            recentColors = recentColors.slice(0, 5);
        }

        const settings = {
            useCustomColor: true,
            customColor: colorToSave,
            recentColors: recentColors,
        };

        await chrome.storage.sync.set(settings);
        // Sync settings with the companion extension.
        SharedSettings.syncSettings(settings);

        return recentColors; // Return the updated list for the UI.
    } catch (error) {
        console.error("Error saving custom color:", error);
    }
}

/**
 * Resets the clock to use the default theme color instead of a custom one.
 */
async function resetToDefault() {
    const settings = { useCustomColor: false };
    await chrome.storage.sync.set(settings);
    // Sync the reset with the companion extension.
    SharedSettings.syncSettings(settings);
}

/**
 * Saves display preferences like time format or leading zero (for the Hours extension).
 * @param {object} settingsToSave - An object containing the settings to save (e.g., { use24HourFormat: true }).
 */
async function saveDisplayPreferences(settingsToSave) {
    await chrome.storage.sync.set(settingsToSave);
    // Sync these display settings with the companion extension.
    SharedSettings.syncSettings(settingsToSave);
}

/**
 * Loads all saved preferences from chrome.storage.sync.
 * @returns {Promise<object>} A promise that resolves with the user's settings.
 */
function loadSavedPreferences() {
    const defaultSettings = {
        useCustomColor: false,
        customColor: "#ffffff",
        recentColors: [],
        use24HourFormat: false,
        showLeadingZero: false,
    };
    return chrome.storage.sync.get(defaultSettings);
}