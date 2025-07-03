// color-picker-logic.js - Shared logic for color picker functionality
// Used by both popup.js and options.js

// State variables for the color picker
let selectedColor = "#ffffff";
let rgbValues = {
    r: 255,
    g: 255,
    b: 255
};
let isDragging = false;

// Color conversion utilities
// Convert RGB to HEX
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Convert HEX to RGB
function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => {
        return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : {
        r: 0,
        g: 0,
        b: 0
    };
}

// Update all UI elements to reflect the current color
function updateColorUI(hex, noUpdateSpectrum = false) {
    selectedColor = hex;
    const rgb = hexToRgb(hex);
    rgbValues = rgb;

    // Update the custom color input and preview
    document.getElementById("custom-color").value = hex;
    document.getElementById("color-preview").style.backgroundColor = hex;

    // Update RGB sliders
    document.getElementById("red-slider").value = rgb.r;
    document.getElementById("red-value").value = rgb.r;
    document.getElementById("green-slider").value = rgb.g;
    document.getElementById("green-value").value = rgb.g;
    document.getElementById("blue-slider").value = rgb.b;
    document.getElementById("blue-value").value = rgb.b;

    // Update the color selector position on the spectrum if needed
    if (!noUpdateSpectrum) {
        updateColorSelectorFromRGB(rgb);
    }
}

// Update spectrum position based on RGB values
function updateColorSelectorFromRGB(rgb) {
    // Calculate HSV from RGB to determine position
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    // Calculate hue
    let h = 0;
    if (max !== min) {
        if (max === r) {
            h = (g - b) / (max - min);
        } else if (max === g) {
            h = 2 + (b - r) / (max - min);
        } else {
            h = 4 + (r - g) / (max - min);
        }
        h *= 60;
        if (h < 0)
            h += 360;
    }

    // Calculate saturation
    const s = max === 0 ? 0 : (max - min) / max;

    // Calculate value
    const v = max;

    // Convert HSV to position
    const spectrum = document.querySelector(".color-spectrum-container");
    const width = spectrum.clientWidth;
    const height = spectrum.clientHeight;

    // X position based on hue
    const x = (h / 360) * width;

    // Y position based on saturation and value
    // Top is fully saturated, bright. Bottom-right is white, bottom-left is black
    const y = (1 - v) * height; // Value maps directly to y

    // Update selector position
    const selector = document.getElementById("color-selector");
    selector.style.left = `${x}px`;
    selector.style.top = `${y}px`;
}

// Get color from spectrum position
function getColorFromPosition(x, y) {
    const spectrum = document.querySelector(".color-spectrum-container");
    const width = spectrum.clientWidth;
    const height = spectrum.clientHeight;

    // Normalize coordinates
    const normX = Math.max(0, Math.min(1, x / width));
    const normY = Math.max(0, Math.min(1, y / height));

    // Calculate hue from x position
    const hue = normX * 360;

    // Calculate value and saturation based on y position
    // Top is fully saturated, bright. Bottom is gradient from black to white
    const value = 1 - normY;
    const saturation = 1;

    // Convert HSV to RGB
    return hsvToRgb(hue, saturation, value);
}

// Convert HSV to RGB
function hsvToRgb(h, s, v) {
    let r, g, b;

    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i) {
    case 0:
        r = v;
        g = t;
        b = p;
        break;
    case 1:
        r = q;
        g = v;
        b = p;
        break;
    case 2:
        r = p;
        g = v;
        b = t;
        break;
    case 3:
        r = p;
        g = q;
        b = v;
        break;
    case 4:
        r = t;
        g = p;
        b = v;
        break;
    case 5:
        r = v;
        g = p;
        b = q;
        break;
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// Function to load saved preferences
function loadSavedPreferences(callback) {
    const defaultSettings = {
        useCustomColor: false,
        customColor: "#ffffff"
    };
    
    // If we're in the Hours extension, also check for time format
    if (document.getElementById("time-format-toggle")) {
        defaultSettings.use24HourFormat = false;
    }
    
    chrome.storage.sync.get(defaultSettings).then(result => {
        selectedColor = result.customColor;
        updateColorUI(selectedColor);

        // Load time format preference if we're in the Hours extension
        const timeFormatToggle = document.getElementById("time-format-toggle");
        if (timeFormatToggle) {
            timeFormatToggle.checked = result.use24HourFormat;
        }
        
        // Optional callback for extension-specific initialization
        if (callback && typeof callback === 'function') {
            callback(result);
        }
    });
}

// Function to save custom color
function saveCustomColor() {
    const settings = {
        useCustomColor: true,
        customColor: selectedColor
    };

    chrome.storage.sync.set(settings).then(() => {
        
        // Show saved message
        const status = document.getElementById("status");
        status.textContent = "Custom color applied!";
        setTimeout(() => {
            status.textContent = "";
        }, 1500);
    });
}

// Function to reset to default color
function resetToDefault() {
    const settings = {
        useCustomColor: false,
        customColor: selectedColor // Still store the last custom color
    };

    chrome.storage.sync.set(settings).then(() => {
        
        // Show reset message
        const status = document.getElementById("status");
        status.textContent = "Reset to theme default!";
        setTimeout(() => {
            status.textContent = "";
        }, 1500);
    });
}

// Function to save time format preference (only used in hours extension)
function saveTimeFormat(use24HourFormat) {
    const settings = {
        use24HourFormat: use24HourFormat
    };

    chrome.storage.sync.set(settings).then(() => {
        
        // Show saved message
        const status = document.getElementById("status");
        status.textContent = "Time format updated!";
        setTimeout(() => {
            status.textContent = "";
        }, 1500);
    });
}

// Function to validate hex color
function isValidHexColor(color) {
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

// Function to handle custom color input changes
function handleCustomColorChange() {
    let colorInput = document.getElementById("custom-color");
    let color = colorInput.value;

    // Add # if missing
    if (color.charAt(0) !== '#') {
        color = '#' + color;
        colorInput.value = color;
    }

    // Validate the color format
    if (isValidHexColor(color)) {
        updateColorUI(color);
    }
}

// Function to handle RGB slider changes
function handleRGBChange() {
    const r = parseInt(document.getElementById("red-slider").value);
    const g = parseInt(document.getElementById("green-slider").value);
    const b = parseInt(document.getElementById("blue-slider").value);

    rgbValues = {
        r,
        g,
        b
    };
    const hex = rgbToHex(r, g, b);

    // Update UI with new color (don't update spectrum position when changing sliders)
    updateColorUI(hex, true);
}

// Function to handle RGB number input changes
function handleRGBInputChange(event) {
    const input = event.target;
    const value = parseInt(input.value);

    // Keep values in valid range
    if (isNaN(value) || value < 0) {
        input.value = 0;
    } else if (value > 255) {
        input.value = 255;
    }

    // Update the corresponding slider
    const sliderId = input.id.replace("-value", "-slider");
    document.getElementById(sliderId).value = input.value;

    // Update the color
    handleRGBChange();
}

// Function to handle time format toggle changes
function handleTimeFormatChange(event) {
    const use24HourFormat = event.target.checked;
    saveTimeFormat(use24HourFormat);
}

// Handle spectrum click/drag
function handleSpectrumInteraction(event) {
    const spectrum = document.querySelector(".color-spectrum-container");
    const rect = spectrum.getBoundingClientRect();

    // Get mouse/touch position relative to the spectrum container
    let x, y;
    if (event.type.startsWith('touch')) {
        x = event.touches[0].clientX - rect.left;
        y = event.touches[0].clientY - rect.top;
    } else {
        x = event.clientX - rect.left;
        y = event.clientY - rect.top;
    }

    // Get the color at this position
    const rgb = getColorFromPosition(x, y);
    rgbValues = rgb;
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

    // Update the color selector position
    const selector = document.getElementById("color-selector");
    selector.style.left = `${x}px`;
    selector.style.top = `${y}px`;

    // Update UI
    updateColorUI(hex, true);
}

// Setup color picker event listeners
function setupColorPickerEvents() {
    // Set up event listeners for buttons
    document.getElementById("save-button").addEventListener("click", saveCustomColor);
    document.getElementById("reset-button").addEventListener("click", resetToDefault);

    // Time format toggle event (only in hours extension)
    const timeFormatToggle = document.getElementById("time-format-toggle");
    if (timeFormatToggle) {
        timeFormatToggle.addEventListener("change", handleTimeFormatChange);
    }

    // Custom color input events
    const customColorInput = document.getElementById("custom-color");
    customColorInput.addEventListener("blur", handleCustomColorChange);
    customColorInput.addEventListener("keyup", event => {
        if (event.key === "Enter") {
            handleCustomColorChange();
        }
    });

    // RGB slider events
    document.getElementById("red-slider").addEventListener("input", handleRGBChange);
    document.getElementById("green-slider").addEventListener("input", handleRGBChange);
    document.getElementById("blue-slider").addEventListener("input", handleRGBChange);

    // RGB number input events
    document.getElementById("red-value").addEventListener("change", handleRGBInputChange);
    document.getElementById("green-value").addEventListener("change", handleRGBInputChange);
    document.getElementById("blue-value").addEventListener("change", handleRGBInputChange);

    // Spectrum events
    const spectrum = document.querySelector(".color-spectrum-container");

    // Mouse events
    spectrum.addEventListener("mousedown", event => {
        isDragging = true;
        handleSpectrumInteraction(event);
    });

    window.addEventListener("mousemove", event => {
        if (isDragging) {
            handleSpectrumInteraction(event);
        }
    });

    window.addEventListener("mouseup", () => {
        isDragging = false;
    });

    // Touch events for mobile
    spectrum.addEventListener("touchstart", event => {
        isDragging = true;
        handleSpectrumInteraction(event);
        event.preventDefault(); // Prevent scrolling when touching the spectrum
    });

    window.addEventListener("touchmove", event => {
        if (isDragging) {
            handleSpectrumInteraction(event);
        }
    });

    window.addEventListener("touchend", () => {
        isDragging = false;
    });
}

// Setup message listener for settings updates from companion extension
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "settingsUpdated") {
            console.log("Received settings update notification:", message.settings);

            // Update color settings if they've changed
            if (message.settings.hasOwnProperty('customColor') ||
                message.settings.hasOwnProperty('useCustomColor')) {

                // Load from storage to ensure we have the complete settings
                chrome.storage.sync.get({
                    useCustomColor: false,
                    customColor: "#ffffff"
                }).then(result => {
                    // Update the UI
                    selectedColor = result.customColor;
                    updateColorUI(selectedColor);
                });
            }

            // Update time format settings if they've changed (for the hours extension only)
            if (message.settings.hasOwnProperty('use24HourFormat')) {
                // Only apply this for the hours extension that has the time format toggle
                const timeFormatToggle = document.getElementById("time-format-toggle");
                if (timeFormatToggle) {
                    chrome.storage.sync.get({
                        use24HourFormat: false
                    }).then(result => {
                        timeFormatToggle.checked = result.use24HourFormat;
                    });
                }
            }
        }
    });
}

// Initialize the color picker
function initColorPicker(callback) {
    // Set up event listeners
    setupColorPickerEvents();
    
    // Set up message listener
    setupMessageListener();
    
    // Load saved preferences
    loadSavedPreferences(callback);
    
    // Set up test sync button if present
    const testSyncButton = document.getElementById("test-sync");
    if (testSyncButton) {
        testSyncButton.addEventListener("click", () => {
            console.log("Testing sync message");

            const testSettings = {
                useCustomColor: true,
                customColor: "#FF5733",
                testTimestamp: Date.now()
            };

            
        });
    }
}

// Export the needed functions and variables
const ColorPicker = {
    initColorPicker,
    selectedColor,
    rgbValues
};
document.addEventListener("DOMContentLoaded", () => {
    // Initialize color picker
    initColorPicker();
});