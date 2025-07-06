/**
 * Listens for messages from the background script.
 * When a 'draw-icon' message is received, it triggers the icon drawing process.
 * This listener is async because the work it triggers (drawIcon) is asynchronous.
 */
chrome.runtime.onMessage.addListener(async(message) => {
    // Ensure the message is intended for this offscreen document and is the correct type
    if (message.target === 'offscreen' && message.type === 'draw-icon') {
        // Await the completion of the drawIcon function.
        // This ensures that even if messages arrive in quick succession, they are processed properly.
        await drawIcon(message.data.text, message.data.color, message.data.use24HourFormat);
    }
});

/**
 * Asynchronously draws the clock icon on a canvas and sends the image data back to the service worker.
 * @param {string} text - The hour text to draw.
 * @param {string} color - The color of the text.
 * @param {boolean} use24HourFormat - Determines if a colon is added.
 */
async function drawIcon(text, color, use24HourFormat) {
    try {
        // Create an in-memory canvas to draw on.
        const canvas = new OffscreenCanvas(32, 32);
        const context = canvas.getContext("2d", {
            willReadFrequently: true
        });

        // Clear the canvas to ensure no artifacts from previous drawings.
        context.clearRect(0, 0, canvas.width, canvas.height);

        const drawText = use24HourFormat ? text + ":" : text + ":";

        // --- Dynamic Font Size Calculation ---
        let bestFontSize = canvas.height;
        context.textAlign = "right";
        context.textBaseline = "middle";

        for (let currentSize = Math.floor(canvas.height * 1.2); currentSize >= 1; currentSize--) {
            context.font = `bold ${currentSize}px Arial`;
            const metrics = context.measureText(drawText);
            // Ensure the text fits within the canvas with a small margin.
            if (metrics.width <= canvas.width + 2 && currentSize <= canvas.height + 2) {
                bestFontSize = currentSize;
                break;
            }
        }

        // --- Draw the text ---
        context.fillStyle = color;
        context.font = `bold ${bestFontSize}px Arial`;
        context.fillText(drawText, canvas.width, canvas.height / 2);

        // Get the pixel data from the canvas.
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // --- The Fix: Serialize the ImageData to a plain object before sending ---
        // This prevents the object from being corrupted during messaging.
        const serializableImageData = {
            width: imageData.width,
            height: imageData.height,
            data: Array.from(imageData.data) // Convert the Uint8ClampedArray to a standard array.
        };

        // Send the prepared data in a new message back to the service worker.
        await chrome.runtime.sendMessage({
            type: 'icon-drawn',
            imageData: serializableImageData
        });

    } catch (error) {
        // If any part of the drawing or sending fails, log the error.
        console.error("Error drawing icon in offscreen document:", error);
    }
}