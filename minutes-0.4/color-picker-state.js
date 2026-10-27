// =================================================================
// COLOR PICKER STATE MANAGEMENT MODULE
// =================================================================
// This module handles loading from and saving to browser.storage.sync.

/**
 * Saves the user's custom color and other preferences to storage.
 * @param {string} colorToSave - The hex color string to save.
 */
async function saveCustomColor(colorToSave) {
    try {
        // Normalize to lowercase #rrggbb so "#FFF", "#FFFFFF" and "#ffffff" are one color
        const color = normalizeHex(colorToSave);

        // Put this color first in the recent list, removing duplicates; keep 5.
        const data = await browser.storage.sync.get({ recentColors: [] });
        const recentColors = [...new Set([color, ...(data.recentColors || []).map(normalizeHex)])]
            .slice(0, 5);

        const settings = {
            useCustomColor: true,
            customColor: color,
            recentColors: recentColors,
        };

        await browser.storage.sync.set(settings);
        
        // Notify the local background script so it redraws right away
        browser.runtime.sendMessage({ colorChanged: true }).catch(() => {});
        
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
    await browser.storage.sync.set(settings);

    // --- FIX: Notify the local background script that the color has changed ---
    browser.runtime.sendMessage({ colorChanged: true }).catch(() => {});

    // Sync the reset with the companion extension.
    SharedSettings.syncSettings(settings);
}

/**
 * Loads all saved preferences from browser.storage.sync.
 * @returns {Promise<object>} A promise that resolves with the user's settings.
 */
function loadSavedPreferences() {
    const defaultSettings = {
        useCustomColor: false,
        customColor: "#ffffff",
        recentColors: []
    };
    return browser.storage.sync.get(defaultSettings);
}