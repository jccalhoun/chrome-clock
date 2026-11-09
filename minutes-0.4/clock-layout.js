// =================================================================
// CLOCK ICON LAYOUT (shared by Clock Hours and Clock Minutes)
// =================================================================
// Both add-ons draw their digits in the same font and at the same size so the
// two icons read as one clock. The size is the largest at which every
// two-digit hour plus the colon fits the icon's width and the digits fit its
// height; Clock Minutes uses that same size.
//
// The font is a setting ("clockFont"): "builtin" uses the bundled Bebas Neue,
// anything else is the name of a font installed on the computer.
//
// Glyph edges are measured by drawing on a scratch canvas and scanning its
// pixels, so the layout is tight whatever the font's metrics.
//
// Chrome: the same code runs in the options page (a normal page) and in the
// background service worker, which has no `document` or `window`. There it
// draws on an OffscreenCanvas and adds fonts to `self.fonts`.

const ClockLayout = {
    BUILTIN: "builtin",
    BUILTIN_FAMILY: "Clock Bebas Neue",
    BUILTIN_LABEL: "Bebas Neue (built-in)",
    BUILTIN_URL: "fonts/BebasNeue-Clock.woff2",

    MIN_SIZE: 8,    // range for a user-chosen font size, in pixels
    MAX_SIZE: 64,
    MARGIN: 0,      // empty pixels kept at each edge (toolbar buttons have their own padding)
    COLON_GAP: 2,   // pixels between the hour digits and the colon

    _fontKey: null,
    _sizeOverride: 0,   // 0 = use the recommended size
    _family: null,
    _weight: "normal",
    _builtinReady: null,
    _builtinLoaded: false,
    _sizeCache: {},
    _inkCache: {},

    // --- Fonts ----------------------------------------------------------------

    // Keeps only characters that are safe inside a quoted CSS font-family name
    cleanFontName: function(name) {
        return String(name || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 64);
    },

    // Loads the bundled font once (overridable for testing outside a browser)
    loadBuiltinFont: function() {
        if (!this._builtinReady) {
            const face = new FontFace(this.BUILTIN_FAMILY, `url(${this.BUILTIN_URL})`);
            this._builtinReady = face.load()
                .then(loaded => { this.fontSet().add(loaded); this._builtinLoaded = true; })
                .catch(error => { console.error("ClockLayout: could not load built-in font:", error); });
        }
        return this._builtinReady;
    },

    // The FontFaceSet to add fonts to: the page's, or the service worker's
    fontSet: function() {
        return typeof document !== "undefined" ? document.fonts : self.fonts;
    },

    // Selects the font to draw with. Resolves once it is ready to use.
    // A system font that isn't installed is drawn in the built-in font instead.
    setFont: async function(clockFont) {
        await this.loadBuiltinFont();
        const name = clockFont === this.BUILTIN ? "" : this.cleanFontName(clockFont);
        const key = name || this.BUILTIN;
        if (key === this._fontKey) return;

        this._fontKey = key;
        if (name && this.isFontInstalled(name)) {
            this._family = `"${name}", "${this.BUILTIN_FAMILY}"`;
            this._weight = "bold";
        } else {
            this._family = `"${this.BUILTIN_FAMILY}"`;
            this._weight = "normal";   // Bebas Neue is already heavy
        }
        this._sizeCache = {};
        this._inkCache = {};
    },

    font: function(size) {
        return `${this._weight} ${size}px ${this._family || '"' + this.BUILTIN_FAMILY + '"'}`;
    },

    // True if `name` is installed. (Neither Firefox nor Chrome lets extensions
    // list installed fonts.) A font that isn't installed falls back to the next
    // one in the list, so text drawn in `"name", <fallback>` measures the same
    // as the fallback alone; an installed font measures differently from at
    // least one fallback.
    //
    // The main fallback is the built-in font, once loaded. The generic families
    // aren't reliable in Chrome's service worker, which doesn't get the browser's
    // font settings: on Windows they can all resolve to Arial, so Arial would
    // measure the same as every one of them and look "not installed".
    isFontInstalled: function(name) {
        const clean = this.cleanFontName(name);
        if (!clean) return false;
        const ctx = this.createCanvas(10, 10).getContext("2d");
        const differs = (fallback, sample) => {
            ctx.font = `72px ${fallback}`;
            const baseWidth = ctx.measureText(sample).width;
            ctx.font = `72px "${clean}", ${fallback}`;
            return ctx.measureText(sample).width !== baseWidth;
        };
        // The built-in font only has the digits and colon, so measure just those
        if (this._builtinLoaded && differs(`"${this.BUILTIN_FAMILY}"`, "0123456789:")) {
            return true;
        }
        return ["monospace", "serif", "sans-serif"].some(base => differs(base, "0123456789:mmmwwwlli"));
    },

    // --- Measuring ------------------------------------------------------------

    // Overridable for testing outside a browser. The service worker has no
    // document, so it uses an OffscreenCanvas.
    createCanvas: function(w, h) {
        if (typeof document === "undefined") return new OffscreenCanvas(w, h);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
    },

    // Ink extent of `text` drawn at `size` with textAlign "left" and
    // textBaseline "middle", relative to the drawing origin:
    // { left, right, top, bottom } in pixels (right and bottom exclusive)
    ink: function(text, size) {
        const key = size + "|" + text;
        if (this._inkCache[key]) return this._inkCache[key];

        const w = size * 4, h = size * 3, ox = size, oy = Math.round(h / 2);
        const ctx = this.createCanvas(w, h).getContext("2d");
        ctx.font = this.font(size);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#000";
        ctx.fillText(text, ox, oy);

        const data = ctx.getImageData(0, 0, w, h).data;
        let minX = w, maxX = -1, minY = h, maxY = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > 40) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    maxY = y;
                }
            }
        }
        const result = maxX < 0
            ? { left: 0, right: 0, top: 0, bottom: 0 }
            : { left: minX - ox, right: maxX + 1 - ox, top: minY - oy, bottom: maxY + 1 - oy };
        this._inkCache[key] = result;
        return result;
    },

    _fits: function(size, width, height) {
        let widest = 0;
        for (let h = 0; h < 24; h++) {
            const i = this.ink(String(h).padStart(2, "0"), size);
            widest = Math.max(widest, i.right - i.left);
        }
        const colon = this.ink(":", size);
        const digits = this.ink("0123456789", size);
        return widest + this.COLON_GAP + (colon.right - colon.left) <= width - 2 * this.MARGIN &&
               digits.bottom - digits.top <= height - 2 * this.MARGIN;
    },

    // Uses a fixed font size instead of the recommended one; 0 (or anything
    // invalid) goes back to the recommended size.
    setSize: function(size) {
        const n = Math.round(Number(size));
        this._sizeOverride = Number.isFinite(n) && n >= this.MIN_SIZE
            ? Math.min(n, this.MAX_SIZE)
            : 0;
    },

    // The size to draw at: the user's chosen size, or the recommended one
    fontSize: function(width, height) {
        return this._sizeOverride || this.recommendedSize(width, height);
    },

    // Largest font size that fits (binary search; width and height grow with size)
    recommendedSize: function(width, height) {
        const key = width + "x" + height;
        if (this._sizeCache[key]) return this._sizeCache[key];
        let lo = 4, hi = height * 2;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (this._fits(mid, width, height)) lo = mid; else hi = mid - 1;
        }
        this._sizeCache[key] = lo;
        return lo;
    },

    // Y position that vertically centers the digits' ink in the icon
    _baselineY: function(size, height) {
        const d = this.ink("0123456789", size);
        return height / 2 - (d.top + d.bottom) / 2;
    },

    // --- Drawing --------------------------------------------------------------

    // Clock Minutes: digits centered
    drawMinutes: function(context, width, height, text) {
        const size = this.fontSize(width, height);
        const ink = this.ink(text, size);
        context.font = this.font(size);
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillText(text, (width - (ink.right - ink.left)) / 2 - ink.left, this._baselineY(size, height));
    },

    // Clock Hours: colon against the right edge (next to the minutes icon),
    // digits just before it
    drawHours: function(context, width, height, digits) {
        const size = this.fontSize(width, height);
        const y = this._baselineY(size, height);
        context.font = this.font(size);
        context.textAlign = "left";
        context.textBaseline = "middle";

        const colon = this.ink(":", size);
        const colonX = width - this.MARGIN - colon.right;
        context.fillText(":", colonX, y);

        const d = this.ink(digits, size);
        context.fillText(digits, colonX + colon.left - this.COLON_GAP - d.right, y);
    },

    // --- Color ----------------------------------------------------------------

    // Chrome has no theme API; resolves to {} there (and if the call fails)
    getTheme: function() {
        return browser.theme && browser.theme.getCurrent
            ? browser.theme.getCurrent().catch(() => ({}))
            : Promise.resolve({});
    },

    // Dark or light, to match the browser. A page can ask directly; the
    // service worker reads what the pages last recorded (see platform.js).
    prefersDark: async function() {
        if (typeof matchMedia === "function") {
            return matchMedia("(prefers-color-scheme: dark)").matches;
        }
        const { prefersDark } = await browser.storage.local.get({ prefersDark: false });
        return prefersDark;
    },

    // Chrome's own toolbar text colors in light and dark mode
    LIGHT_MODE_TEXT: "#1f1f1f",
    DARK_MODE_TEXT: "#e3e3e3",

    // The digit color: the custom color if one is set, otherwise the theme's
    // toolbar text color (Firefox only), otherwise dark or light to match the
    // browser. `dark` is the result of prefersDark().
    pickColor: function(settings, theme, dark) {
        if (settings.useCustomColor && settings.customColor) {
            return settings.customColor;
        }
        const c = (theme && theme.colors) || {};
        const themed = c.toolbar_text || c.bookmark_text || c.tab_background_text;
        if (themed) {
            // Theme colors can be given as [r, g, b] arrays
            return Array.isArray(themed) ? `rgb(${themed.join(",")})` : themed;
        }
        return dark ? this.DARK_MODE_TEXT : this.LIGHT_MODE_TEXT;
    }
};
