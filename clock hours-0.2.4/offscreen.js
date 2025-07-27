// =================================================================
// Optimized Offscreen Document
// =================================================================

// Canvas pool to reuse canvas instances
class CanvasPool {
    constructor(maxSize = 3) {
        this.pool = [];
        this.maxSize = maxSize;
    }

    getCanvas() {
        if (this.pool.length > 0) {
            return this.pool.pop();
        }
        const canvas = new OffscreenCanvas(32, 32);
        const context = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
        return { canvas, context };
    }

    returnCanvas(canvasData) {
        if (this.pool.length < this.maxSize && canvasData) {
            canvasData.context.clearRect(0, 0, canvasData.canvas.width, canvasData.canvas.height);
            this.pool.push(canvasData);
        }
    }
}
const canvasPool = new CanvasPool();

// Font measurement cache
const fontMetricsCache = new Map();

function getCachedFontMetrics(text, fontSize, context) {
    const cacheKey = `${text}-${fontSize}`;
    if (fontMetricsCache.has(cacheKey)) {
        return fontMetricsCache.get(cacheKey);
    }
    context.font = `bold ${fontSize}px Arial`;
    const metrics = context.measureText(text);
    fontMetricsCache.set(cacheKey, metrics);
    return metrics;
}

// Optimized font size calculation
function calculateOptimalFontSize(text, canvas, context) {
    const maxWidth = canvas.width + 2;
    const maxHeight = canvas.height + 2;
    let minSize = 1;
    let maxSize = Math.floor(canvas.height * 1.2);
    let bestSize = minSize;

    while (minSize <= maxSize) {
        const currentSize = Math.floor((minSize + maxSize) / 2);
        const metrics = getCachedFontMetrics(text, currentSize, context);
        if (metrics.width <= maxWidth && currentSize <= maxHeight) {
            bestSize = currentSize;
            minSize = currentSize + 1;
        } else {
            maxSize = currentSize - 1;
        }
    }
    return bestSize;
}

/**
 * Main drawing function.
 * This is now an async function that sends a message back when it's done.
 * It no longer returns a promise that resolves internally.
 */
async function drawIcon(data) {
    const { text, color, cacheKey, use24HourFormat } = data;
    const canvasData = canvasPool.getCanvas();
    const { canvas, context } = canvasData;

    try {
        const drawText = text + ":";
        const bestFontSize = calculateOptimalFontSize(drawText, canvas, context);

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = color;
        context.font = `bold ${bestFontSize}px Arial`;
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(drawText, canvas.width, canvas.height / 2);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const serializableImageData = {
            width: imageData.width,
            height: imageData.height,
            data: Array.from(imageData.data)
        };

        // **FIX:** Send a message back to the background script with the result.
        await chrome.runtime.sendMessage({
            type: 'icon-drawn',
            imageData: serializableImageData,
            cacheKey: cacheKey
        });

    } catch (error) {
        console.error("Error drawing icon in offscreen document:", error);
        // **FIX:** Send an error message back on failure.
        await chrome.runtime.sendMessage({
            type: 'icon-error',
            error: error.message,
            cacheKey: cacheKey
        });
    } finally {
        // Always return the canvas to the pool
        canvasPool.returnCanvas(canvasData);
    }
}

/**
 * Main message listener.
 * This has been simplified to just call the drawing function.
 */
chrome.runtime.onMessage.addListener((message) => {
    if (message.target === 'offscreen' && message.type === 'draw-icon') {
        // The listener is no longer async, and it doesn't await a promise.
        // It just triggers the drawIcon function, which will handle sending the response.
        drawIcon(message.data);
    }
     // Added a listener for the health check to avoid timeouts.
    if (message.type === 'health-check') {
        chrome.runtime.sendMessage({ type: 'health-check-response', cacheKey: message.cacheKey });
    }
});