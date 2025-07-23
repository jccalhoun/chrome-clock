// jccalhoun/chrome-clock/chrome-clock-189b85079d5f21c255f61fa07a0526a3c3341f35/clock minutes-0.2.4/offscreen.js

/**
 * Listens for messages from the background script.
 */
chrome.runtime.onMessage.addListener(async(message) => {
    if (message.target === 'offscreen' && message.type === 'draw-icon') {
        // Pass the entire data object to the drawing function
        await drawIcon(message.data);
    }
});

/**
 * Draws the clock icon and sends it back with the cache key.
 * This version handles potential errors and communicates them back.
 */
async function drawIcon(data) {
    const { text, color, cacheKey } = data; // Destructure data for clarity

    try {
        const canvas = new OffscreenCanvas(32, 32);
        const context = canvas.getContext("2d", { willReadFrequently: true });

        context.clearRect(0, 0, canvas.width, canvas.height);

        // Dynamic font size calculation
        let bestFontSize = canvas.height;
        context.textAlign = "left";
        context.textBaseline = "middle";

        for (let currentSize = Math.floor(canvas.height * 1.2); currentSize >= 1; currentSize--) {
            context.font = `bold ${currentSize}px Arial`;
            const metrics = context.measureText(text);
            if (metrics.width <= canvas.width + 2 && currentSize <= canvas.height + 2) {
                bestFontSize = currentSize;
                break;
            }
        }

        // Draw the text
        context.fillStyle = color;
        context.font = `bold ${bestFontSize}px Arial`;
        context.fillText(text, 0, canvas.height / 2);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Serialize the image data for messaging
        const serializableImageData = {
            width: imageData.width,
            height: imageData.height,
            data: Array.from(imageData.data) // This line was incomplete
        };

        // Send the successful result back to the background script
        await chrome.runtime.sendMessage({
            type: 'icon-drawn',
            imageData: serializableImageData,
            cacheKey: cacheKey // Always include the cache key
        });

    } catch (error) {
        console.error("Error drawing icon in offscreen document:", error);

        // Send an error message back if drawing fails
        await chrome.runtime.sendMessage({
            type: 'icon-error',
            error: error.message,
            cacheKey: cacheKey
        });
    }
}