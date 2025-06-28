// offscreen.js

// Listen for messages from the background script
// Make the listener async to handle the promise from drawIcon
chrome.runtime.onMessage.addListener(async(message) => {
    if (message.target === 'offscreen' && message.type === 'draw-icon') {
        try {
            await drawIcon(message.data.text, message.data.color, message.data.use24HourFormat);

        } catch (error) {
            console.error("Error drawing icon:", error);
            chrome.runtime.sendMessage({
                type: 'icon-error',
                error: error.message
            });
        }
    }
});

async function drawIcon(text, color, use24HourFormat) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;

    const context = canvas.getContext("2d");

    // Clear the canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    const drawText = use24HourFormat ? text + ":" : text + ":";

    // --- Dynamic Font Size Calculation ---
    let bestFontSize = canvas.height;
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (let currentSize = canvas.height; currentSize >= 1; currentSize--) {
        context.font = `bold ${currentSize}px Arial`;
        let metrics = context.measureText(drawText);
        if (metrics.width <= canvas.width - 1 && currentSize <= canvas.height - 1) {
            bestFontSize = currentSize;
            break;
        }
    }

    // --- Draw the text ---
    context.fillStyle = color;
    context.font = `bold ${bestFontSize}px Arial`;
    context.fillText(drawText, canvas.width / 2, canvas.height / 2);

    // Get the image data from the canvas
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Send ImageData directly instead of converting to ImageBitmap
    chrome.runtime.sendMessage({
        type: 'icon-drawn',
        imageData: imageData // Send ImageData directly
    });
}
