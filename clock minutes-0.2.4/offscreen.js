/**
 * Listens for messages from the background script.
 * When a 'draw-icon' message is received, it triggers the icon drawing process.
 * This listener is async because the work it triggers (drawIcon) is asynchronous.
 */
chrome.runtime.onMessage.addListener(async(message) => {
    if (message.target === 'offscreen' && message.type === 'draw-icon') {
        await drawIcon(message.data.text, message.data.color);
    }
});

async function drawIcon(text, color) {
    try {
        const canvas = new OffscreenCanvas(32, 32);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.clearRect(0, 0, canvas.width, canvas.height);

        const drawText = text; // No need for a colon here for minutes

        let bestFontSize = canvas.height;
        context.textAlign = "center";
        context.textBaseline = "middle";

        for (let currentSize = canvas.height; currentSize >= 1; currentSize--) {
            context.font = `bold ${currentSize}px Arial`;
            const metrics = context.measureText(drawText);
            if (metrics.width <= canvas.width - 1 && currentSize <= canvas.height - 1) {
                bestFontSize = currentSize;
                break;
            }
        }

        context.fillStyle = color;
        context.font = `bold ${bestFontSize}px Arial`;
        context.fillText(drawText, canvas.width / 2, canvas.height / 2);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const serializableImageData = {
            width: imageData.width,
            height: imageData.height,
            data: Array.from(imageData.data)
        };

        await chrome.runtime.sendMessage({
            type: 'icon-drawn',
            imageData: serializableImageData
        });

    } catch (error) {
        console.error("Error drawing icon in offscreen document:", error);
    }
}