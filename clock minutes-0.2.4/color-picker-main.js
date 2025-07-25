// =================================================================
// COLOR PICKER MAIN SCRIPT
// =================================================================
// This script initializes the color picker, handles UI updates, and manages user events.

document.addEventListener("DOMContentLoaded", () => {
    // State variables
    let selectedColor = "#ffffff";
    let isDragging = false;

    // DOM Element references
    const elements = {
        customColorInput: document.getElementById("custom-color"),
        colorPreview: document.getElementById("color-preview"),
        redSlider: document.getElementById("red-slider"),
        redValue: document.getElementById("red-value"),
        greenSlider: document.getElementById("green-slider"),
        greenValue: document.getElementById("green-value"),
        blueSlider: document.getElementById("blue-slider"),
        blueValue: document.getElementById("blue-value"),
        colorSelector: document.getElementById("color-selector"),
        spectrumContainer: document.querySelector(".color-spectrum-container"),
        saveButton: document.getElementById("save-button"),
        resetButton: document.getElementById("reset-button"),
        status: document.getElementById("status"),
        presetContainer: document.getElementById('preset-buttons'),
        recentContainer: document.getElementById('recent-colors'),
        timeFormatToggle: document.getElementById("time-format-toggle"),
        leadingZeroToggle: document.getElementById("leading-zero-toggle"),
    };

    // --- UI Update Functions ---

    /**
     * Updates all UI components to reflect the currently selected color.
     * @param {string} hex - The new color in HEX format.
     * @param {boolean} [noUpdateSpectrum=false] - If true, prevents updating the spectrum selector's position.
     */
    function updateColorUI(hex, noUpdateSpectrum = false) {
        selectedColor = hex;
        const rgb = hexToRgb(hex);

        elements.customColorInput.value = hex;
        elements.colorPreview.style.backgroundColor = hex;

        elements.redSlider.value = rgb.r;
        elements.redValue.value = rgb.r;
        elements.greenSlider.value = rgb.g;
        elements.greenValue.value = rgb.g;
        elements.blueSlider.value = rgb.b;
        elements.blueValue.value = rgb.b;

        if (!noUpdateSpectrum) {
            updateColorSelectorFromColor(hex);
        }
    }

    /**
     * Calculates the position of the color selector on the spectrum based on a hex color.
     * @param {string} hex - The color to position the selector for.
     */
    function updateColorSelectorFromColor(hex) {
        const rgb = hexToRgb(hex);
        const r = rgb.r / 255,
        g = rgb.g / 255,
        b = rgb.b / 255;
        const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
        const v = max;
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
        const rect = elements.spectrumContainer.getBoundingClientRect();
        const x = (h / 360) * rect.width;
        const y = (1 - v) * rect.height;
        elements.colorSelector.style.left = `${x}px`;
        elements.colorSelector.style.top = `${y}px`;
    }

    /**
     * Renders the preset theme buttons.
     */
    function renderPresetButtons() {
        if (!elements.presetContainer)
            return;

        const presetThemes = [{
                name: 'Default',
                color: '#000000'
            }, {
                name: 'Dark Mode',
                color: '#FFFFFF'
            }, {
                name: 'Ocean Blue',
                color: '#3498db'
            }, {
                name: 'Forest Green',
                color: '#2ecc71'
            }, {
                name: 'Sunset Orange',
                color: '#e67e22'
            },
        ];

        elements.presetContainer.innerHTML = '';
        presetThemes.forEach(theme => {
            const button = document.createElement('button');
            button.textContent = theme.name;
            button.style.backgroundColor = theme.color;
            const rgb = hexToRgb(theme.color);
            const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
            button.style.color = brightness > 128 ? 'black' : 'white';
            button.addEventListener('click', () => {
                updateColorUI(theme.color);
                handleSave();
            });
            elements.presetContainer.appendChild(button);
        });
    }

    /**
     * Renders swatches for recently used colors.
     * @param {string[]} recentColors - An array of recent color hex strings.
     */
    function renderRecentColors(recentColors = []) {
        if (!elements.recentContainer)
            return;
        elements.recentContainer.innerHTML = '';
        if (!Array.isArray(recentColors))
            return; // Don't render if data is invalid
        recentColors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'recent-color-swatch';
            swatch.style.backgroundColor = color;
            swatch.title = `Use ${color}`;
            swatch.addEventListener('click', () => {
                updateColorUI(color);
                handleSave();
            });
            elements.recentContainer.appendChild(swatch);
        });
    }

    /**
     * Shows a temporary status message to the user.
     * @param {string} message - The message to display.
     */
    function showStatusMessage(message) {
        elements.status.textContent = message;
        setTimeout(() => {
            elements.status.textContent = "";
        }, 1500);
    }

    // --- Event Handlers ---

    /**
     * [FIXED]
     * Saves the current color, re-loads settings from storage, and then updates the UI.
     * This ensures the "Recently Used" section is always in sync.
     */
    async function handleSave() {
        await saveCustomColor(selectedColor); // 1. Save the new color
        const settings = await loadSavedPreferences(); // 2. Reload all settings
        renderRecentColors(settings.recentColors); // 3. Re-render the recent colors UI
        showStatusMessage("Custom color applied!");
    }

    async function handleReset() {
        await resetToDefault();
        showStatusMessage("Reset to theme default!");
    }

    function handleRGBChange() {
        const r = parseInt(elements.redSlider.value, 10);
        const g = parseInt(elements.greenSlider.value, 10);
        const b = parseInt(elements.blueSlider.value, 10);
        const hex = rgbToHex(r, g, b);
        updateColorUI(hex, true);
    }

    function handleSpectrumInteraction(event) {
        const rect = elements.spectrumContainer.getBoundingClientRect();
        const x = (event.touches ? event.touches[0].clientX : event.clientX) - rect.left;
        const y = (event.touches ? event.touches[0].clientY : event.clientY) - rect.top;
        const clampedX = Math.max(0, Math.min(x, rect.width));
        const clampedY = Math.max(0, Math.min(y, rect.height));
        const normX = clampedX / rect.width;
        const normY = clampedY / rect.height;
        const hue = normX * 360;
        const value = 1 - normY;
        const saturation = 1;
        const rgb = hsvToRgb(hue, saturation, value);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        elements.colorSelector.style.left = `${clampedX}px`;
        elements.colorSelector.style.top = `${clampedY}px`;
        updateColorUI(hex, true);
    }

    async function handleDisplayChange(event, settingKey) {
        await saveDisplayPreferences({
            [settingKey]: event.target.checked
        });
        showStatusMessage("Display setting updated!");
    }

    // --- Initialization ---

    function setupEventListeners() {
        if (elements.saveButton) {
            elements.saveButton.addEventListener("click", handleSave);
        }
        if (elements.resetButton) {
            elements.resetButton.addEventListener("click", handleReset);
        }
		if (elements.customColorInput) {
        elements.customColorInput.addEventListener("change", () => updateColorUI(elements.customColorInput.value));
		}
        [elements.redSlider, elements.greenSlider, elements.blueSlider].forEach(slider => {
            if (slider) {
				slider.addEventListener("input", handleRGBChange);
			}
        });
        elements.spectrumContainer.addEventListener("mousedown", e => {
            isDragging = true;
            handleSpectrumInteraction(e);
        });
        window.addEventListener("mousemove", e => isDragging && handleSpectrumInteraction(e));
        window.addEventListener("mouseup", () => isDragging = false);
        elements.spectrumContainer.addEventListener("touchstart", e => {
            isDragging = true;
            handleSpectrumInteraction(e);
            e.preventDefault();
        });
        window.addEventListener("touchmove", e => isDragging && handleSpectrumInteraction(e));
        window.addEventListener("touchend", () => isDragging = false);
        if (elements.timeFormatToggle)
            elements.timeFormatToggle.addEventListener("change", e => handleDisplayChange(e, 'use24HourFormat'));
        if (elements.leadingZeroToggle)
            elements.leadingZeroToggle.addEventListener("change", e => handleDisplayChange(e, 'showLeadingZero'));
    }

    async function init() {
        const settings = await loadSavedPreferences();
        updateColorUI(settings.customColor);
        renderRecentColors(settings.recentColors);
        renderPresetButtons();
        if (elements.timeFormatToggle)
            elements.timeFormatToggle.checked = settings.use24HourFormat;
        if (elements.leadingZeroToggle)
            elements.leadingZeroToggle.checked = settings.showLeadingZero;
        setupEventListeners();
    }

    init();
});
