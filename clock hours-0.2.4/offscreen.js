// offscreen.js

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(handleMessage);

function handleMessage(message) {
  if (message.target === 'offscreen' && message.type === 'draw-icon') {
    drawIcon(message.data.text, message.data.color, message.data.use24HourFormat);
  }
}

function drawIcon(text, color, use24HourFormat) {
  const canvas = new OffscreenCanvas(32, 32);
  const context = canvas.getContext("2d");

  // Clear the canvas
  context.clearRect(0, 0, canvas.width, canvas.height);

  // --- FIX: Define the text to be drawn FIRST ---
  const drawText = use24HourFormat ? text + ":" : text + ":";

  // --- Dynamic Font Size Calculation ---
  let bestFontSize = canvas.height;
  context.textAlign = "center";
  context.textBaseline = "middle";

  // Now, measure the text that will actually be drawn
  for (let currentSize = canvas.height; currentSize >= 1; currentSize--) {
    context.font = `bold ${currentSize}px Arial`;
    let metrics = context.measureText(drawText); // Use drawText here
    if (metrics.width <= canvas.width - 1 && currentSize <= canvas.height - 1) {
      bestFontSize = currentSize;
      break;
    }
  }

  // --- Draw the text ---
  context.fillStyle = color;
  context.font = `bold ${bestFontSize}px Arial`;
  context.fillText(drawText, canvas.width / 2, canvas.height / 2); // And use it here

  // Get the image data and send it back to the service worker
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  chrome.runtime.sendMessage({ type: 'icon-drawn', imageData: imageData });
}