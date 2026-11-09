// =================================================================
// CLOCK FONT PICKER (options pages of both add-ons)
// =================================================================
// Lets the user choose the clock font: the built-in Bebas Neue, a common font
// found on this computer, or any other installed font typed by name, and
// optionally a font size other than the recommended one. The choices are saved
// as "clockFont" and "clockFontSize" (0 = recommended) and synced to the
// companion add-on. A preview shows both icons as they will look in the toolbar.

(function() {
    // Common fonts across Windows, macOS and Linux. Only the ones actually
    // installed are listed (browsers don't let extensions list installed fonts).
    const CANDIDATE_FONTS = [
        "Arial", "Arial Black", "Arial Narrow", "Avenir Next", "Avenir Next Condensed",
        "Bahnschrift", "Bahnschrift Condensed", "Bahnschrift SemiCondensed",
        "Calibri", "Cambria", "Candara", "Cantarell", "Consolas", "Corbel", "Courier New",
        "DejaVu Sans", "DejaVu Sans Condensed", "DejaVu Sans Mono", "DIN Alternate", "DIN Condensed",
        "Fira Sans", "Fira Sans Condensed", "Franklin Gothic Medium", "Futura", "Georgia",
        "Gill Sans", "Helvetica", "Helvetica Neue", "Impact", "Liberation Sans",
        "Liberation Sans Narrow", "Lucida Console", "Menlo", "Monaco", "Noto Sans", "Optima",
        "Oswald", "Roboto", "Roboto Condensed", "Segoe UI", "Tahoma", "Trebuchet MS",
        "Ubuntu", "Ubuntu Condensed", "Verdana"
    ];
    const OTHER = "__other__";

    document.addEventListener("DOMContentLoaded", async () => {
        const select = document.getElementById("font-select");
        if (!select) return;
        const customInput = document.getElementById("font-custom");
        const note = document.getElementById("font-note");
        const previewHours = document.getElementById("font-preview-hours");
        const previewMinutes = document.getElementById("font-preview-minutes");
        const previewBox = document.getElementById("font-preview");
        const sizeSlider = document.getElementById("font-size-slider");
        const sizeValue = document.getElementById("font-size-value");
        const sizeReset = document.getElementById("font-size-reset");
        sizeSlider.min = ClockLayout.MIN_SIZE;
        sizeSlider.max = ClockLayout.MAX_SIZE;
        let recommended = 0;   // recommended size for the current font
        let dragging = false;

        // The installed-font check measures against the built-in font, so load it first
        await ClockLayout.loadBuiltinFont();
        const installed = CANDIDATE_FONTS.filter(name => ClockLayout.isFontInstalled(name));

        // --- Build the list --------------------------------------------------
        function addOption(parent, value, label) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            parent.appendChild(option);
        }
        addOption(select, ClockLayout.BUILTIN, ClockLayout.BUILTIN_LABEL);
        if (installed.length) {
            const group = document.createElement("optgroup");
            group.label = "Fonts on this computer";
            installed.forEach(name => addOption(group, name, name));
            select.appendChild(group);
        }
        addOption(select, OTHER, "Other font…");

        // --- Size controls ---------------------------------------------------
        // `chosen` is the saved size (0 = recommended); `shown` is the slider position
        function showSize(chosen, shown) {
            sizeValue.textContent = chosen
                ? `${shown}px (recommended ${recommended}px)`
                : `${shown}px (recommended)`;
            sizeReset.disabled = !chosen;
        }

        // --- Preview ---------------------------------------------------------
        // True if `color` (any CSS color) is light, so it needs a dark background
        function isLightColor(color) {
            const ctx = previewHours.getContext("2d");
            ctx.fillStyle = "#000";
            ctx.fillStyle = color;               // the browser normalizes it to #rrggbb or rgba()
            const value = String(ctx.fillStyle);
            const rgb = value.startsWith("#")
                ? hexToRgb(value)
                : (([r, g, b]) => ({ r: +r, g: +g, b: +b }))(value.match(/[\d.]+/g) || [0, 0, 0]);
            return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 128;
        }

        // previewSize: a size to show while the slider is being dragged
        // (not yet saved); leave it out to use the saved size.
        async function drawPreview(previewSize) {
            const [settings, theme, dark] = await Promise.all([
                browser.storage.sync.get({ useCustomColor: false, customColor: "#ffffff",
                    clockFont: ClockLayout.BUILTIN, clockFontSize: 0 }),
                ClockLayout.getTheme(),
                ClockLayout.prefersDark()
            ]);
            const c = (theme && theme.colors) || {};
            const toolbar = c.toolbar || c.frame;
            const color = ClockLayout.pickColor(settings, theme, dark);
            // Without a theme (always, in Chrome) there's no way to know the toolbar
            // color: a custom Chrome theme can be dark while Chrome is in light mode.
            // So use Chrome's dark toolbar color behind light digits and its light
            // one behind dark digits, so the preview never comes out blank.
            const background = toolbar
                ? (Array.isArray(toolbar) ? `rgb(${toolbar.join(",")})` : toolbar)
                : (isLightColor(color) ? "#3c3c3c" : "#ffffff");
            previewBox.style.backgroundColor = background;

            await ClockLayout.setFont(settings.clockFont);
            recommended = ClockLayout.recommendedSize(previewHours.width, previewHours.height);
            if (previewSize === undefined) {
                ClockLayout.setSize(settings.clockFontSize);
                const shown = ClockLayout.fontSize(previewHours.width, previewHours.height);
                if (!dragging) sizeSlider.value = shown;
                showSize(settings.clockFontSize ? shown : 0, shown);
            } else {
                ClockLayout.setSize(previewSize);
                showSize(previewSize === recommended ? 0 : previewSize, previewSize);
            }

            [[previewHours, "12"], [previewMinutes, "34"]].forEach(([canvas, text]) => {
                const ctx = canvas.getContext("2d");
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = color;
                if (canvas === previewHours) {
                    ClockLayout.drawHours(ctx, canvas.width, canvas.height, text);
                } else {
                    ClockLayout.drawMinutes(ctx, canvas.width, canvas.height, text);
                }
            });
        }

        // --- Show the saved choice -------------------------------------------
        function showChoice(clockFont) {
            const name = clockFont === ClockLayout.BUILTIN ? "" : ClockLayout.cleanFontName(clockFont);
            if (!name) {
                select.value = ClockLayout.BUILTIN;
                customInput.hidden = true;
            } else if (installed.includes(name)) {
                select.value = name;
                customInput.hidden = true;
            } else {
                select.value = OTHER;
                customInput.hidden = false;
                customInput.value = name;
            }
            note.textContent = name && !ClockLayout.isFontInstalled(name)
                ? `"${name}" wasn't found on this computer, so the built-in font is used.`
                : "";
        }

        // --- Save ------------------------------------------------------------
        async function saveFont(clockFont) {
            const settings = { clockFont: clockFont };
            await browser.storage.sync.set(settings);
            browser.runtime.sendMessage({ fontChanged: true }).catch(() => {});
            SharedSettings.syncSettings(settings);
            showChoice(clockFont);
            drawPreview();
        }

        select.addEventListener("change", () => {
            if (select.value === OTHER) {
                customInput.hidden = false;
                customInput.focus();
                note.textContent = "Type the name of a font installed on this computer, then press Enter.";
            } else {
                saveFont(select.value);
            }
        });

        customInput.addEventListener("change", () => {
            const name = ClockLayout.cleanFontName(customInput.value);
            saveFont(name || ClockLayout.BUILTIN);
        });

        // Saves the size; the recommended size is saved as 0 so it keeps
        // following the font if the font changes later.
        async function saveSize(size) {
            const settings = { clockFontSize: size === recommended ? 0 : size };
            await browser.storage.sync.set(settings);
            browser.runtime.sendMessage({ fontChanged: true }).catch(() => {});
            SharedSettings.syncSettings(settings);
            drawPreview();
        }

        // Preview while dragging; save when released (storage.sync limits writes)
        sizeSlider.addEventListener("input", () => {
            dragging = true;
            drawPreview(Number(sizeSlider.value));
        });
        sizeSlider.addEventListener("change", () => {
            dragging = false;
            saveSize(Number(sizeSlider.value));
        });
        sizeReset.addEventListener("click", () => saveSize(recommended));

        // Redraw when the color or font changes (here, in the popup, or from the companion)
        // and when the browser switches between light and dark mode (see platform.js)
        browser.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.prefersDark && !dragging) drawPreview();
            if (area !== "sync") return;
            if (changes.clockFont) showChoice(changes.clockFont.newValue || ClockLayout.BUILTIN);
            if (!dragging) drawPreview();
        });

        const { clockFont } = await browser.storage.sync.get({ clockFont: ClockLayout.BUILTIN });
        showChoice(clockFont);
        drawPreview();
    });
})();
