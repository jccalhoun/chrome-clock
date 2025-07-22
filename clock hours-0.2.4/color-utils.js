// =================================================================
// COLOR UTILITY MODULE
// =================================================================
// This module provides a set of pure functions for color conversions.

/**
 * Converts RGB color values to a HEX color string.
 * @param {number} r - Red value (0-255).
 * @param {number} g - Green value (0-255).
 * @param {number} b - Blue value (0-255).
 * @returns {string} The HEX color string (e.g., "#ffffff").
 */
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Converts a HEX color string to an RGB object.
 * Handles both shorthand (e.g., "#03F") and full-form (e.g., "#0033FF") hex codes.
 * @param {string} hex - The HEX color string.
 * @returns {{r: number, g: number, b: number}} An object with r, g, and b properties.
 */
function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ?
        {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        } :
        {
            r: 0,
            g: 0,
            b: 0
        }; // Return black if the format is invalid
}

/**
 * Converts HSV (Hue, Saturation, Value) color values to an RGB object.
 * @param {number} h - Hue (0-360).
 * @param {number} s - Saturation (0-1).
 * @param {number} v - Value (0-1).
 * @returns {{r: number, g: number, b: number}} An object with r, g, and b properties.
 */
function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h / 60) % 6;
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
    };
}

/**
 * Validates if a string is a valid HEX color code.
 * @param {string} color - The color string to validate.
 * @returns {boolean} True if the color is a valid HEX code.
 */
function isValidHexColor(color) {
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}