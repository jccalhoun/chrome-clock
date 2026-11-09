// =================================================================
// CHROME PLATFORM SHIM (loaded first, by every page and the service worker)
// =================================================================
// The rest of the code is ported from the Firefox add-ons and keeps their
// `browser.*` calls. In Manifest V3, Chrome's `chrome.*` APIs return promises
// too, so `browser` can simply point at `chrome`.
if (typeof globalThis.browser === "undefined") {
    globalThis.browser = chrome;
}

// Chrome has no theme API and its background service worker can't use
// matchMedia, so the worker can't tell on its own whether the toolbar is light
// or dark. Each popup and options page records the answer in storage.local
// ("prefersDark") when it opens and whenever it changes while it is open; the
// service worker reads it to choose the default digit color.
(function() {
    if (typeof matchMedia !== "function") return;   // service worker
    const query = matchMedia("(prefers-color-scheme: dark)");
    async function record() {
        try {
            const { prefersDark } = await browser.storage.local.get("prefersDark");
            if (prefersDark !== query.matches) {
                await browser.storage.local.set({ prefersDark: query.matches });
            }
        } catch (error) {
            console.error("Could not record the color scheme:", error);
        }
    }
    record();
    query.addEventListener("change", record);
})();
