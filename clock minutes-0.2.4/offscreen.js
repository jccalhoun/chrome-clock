// jccalhoun/chrome-clock/chrome-clock-189b85079d5f21c255f61fa07a0526a3c3341f35/clock minutes-0.2.4/offscreen.js

/**
 * Listens for messages from the background script.
 * When a 'draw-icon' message is received, it triggers the icon drawing process.
 * This listener is async because the work it triggers (drawIcon) is asynchronous.
 */
chrome.runtime.onMessage.addListener(async(message) => {
	// Ensure the message is intended for this offscreen document and is the correct type
    if (message.target === 'offscreen' && message.type === 'draw-icon') {
        // Pass the entire data object to the drawing function
        await drawIcon(message.data);
    }
});

/**
 *  * Asynchronously draws the clock icon on a canvas and sends the image data back to the service worker.
 * @param {object} data - An object containing the text, color, and cacheKey.
 */
async function drawIcon(data) {
    const { text, color, cacheKey } = data; // Destructure the data object

    try {
        // Create an in-memory canvas to draw on.
        const canvas = new OffscreenCanvas(32, 32);
        const context = canvas.getContext("2d", {
            willReadFrequently: true
        });

        // Clear the canvas to ensure no artifacts from previous drawings.

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
            data: Array.from(imageData.data)
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