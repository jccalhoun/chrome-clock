# Clock Extensions for Chrome

Two small companion Chrome extensions that put a clock in your toolbar. **Clock Hours** shows the current hour and **Clock Minutes** shows the current minute. Pin their buttons side by side and together they read like a digital clock (`3:` `07`).

This is the Chrome port of the Firefox add-ons in [jccalhoun/2024-clockaddon](https://github.com/jccalhoun/2024-clockaddon) (version 0.4.1, the `fix/review-fixes` branch). The features and options match; the differences are listed under [Differences from the Firefox version](#differences-from-the-firefox-version).

## The extensions

| Folder | Extension | Shows | Version |
|---|---|---|---|
| `hours-0.4/` | Clock Hours | The hour, followed by a colon (e.g. `3:`) | 0.4.1 |
| `minutes-0.4/` | Clock Minutes | The minutes, always two digits (e.g. `07`) | 0.4.1 |

Each folder is a complete unpacked extension. They work independently, but they are designed to be installed together.

## Features

- **Live toolbar clock.** Clock Minutes redraws at the start of every minute and Clock Hours at the start of every hour, using the `alarms` API, so they stay accurate without polling.
- **Matches light or dark mode.** By default the digits are dark on a light toolbar and light on a dark one (see [Default color](#default-color)).
- **Choice of font.** The digits use the bundled Bebas Neue by default, a tall condensed font that fills the small icon well. You can switch to any font installed on your computer from the options page, with a live preview of both icons.
- **Adjustable size.** Each font is drawn at its recommended size, the largest that fits. A slider on the options page sets a different size, and **Use recommended size** goes back.
- **Custom color.** Pick any color with a hue/brightness spectrum, RGB sliders, or a hex code (`#RRGGBB`).
- **Preset colors.** One-click presets: Default (black), Dark Mode (white), Ocean Blue, Forest Green and Sunset Orange. *(Presets appear on the full options page.)*
- **Recently used colors.** The last five custom colors are kept as swatches.
- **12- or 24-hour time** (Clock Hours only).
- **Optional leading zero** on the hour, e.g. `03:` instead of `3:` (Clock Hours only).
- **Shared settings.** Changing the color, font or size in one extension applies it to the other right away, so the two halves of the clock always match. A newly installed extension also picks up the other's existing settings.
- **Tooltips.** Hovering over Clock Minutes shows the current time; hovering over Clock Hours shows the date.

## Installation

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `hours-0.4` folder.
4. Click **Load unpacked** again and select the `minutes-0.4` folder.
5. Click the puzzle-piece **Extensions** button in the toolbar and pin both, then drag them so Clock Hours is immediately to the left of Clock Minutes.

The extension IDs are fixed by the `key` in each manifest (see [How settings sync works](#how-settings-sync-works)), so it doesn't matter where the folders are on your computer. After pulling changes, click the reload button on each extension's card in `chrome://extensions`.

**Upgrading from the 0.2.x versions:** remove the old Clock Hours and Clock Minutes from `chrome://extensions` first. The new versions have different IDs, so they start with default settings.

## Usage

- **Click either icon** to open a popup with the color controls (and, on Clock Hours, the display toggles). Choose a color and click **Use Custom Color**, or click **Reset to Default** to go back to the light/dark default.
- **Full options page:** open it from the link in either popup, or right-click the icon and choose **Options**. It has the same controls plus the preset color buttons and the font picker.
- **12h / 24h and leading zero** are set from Clock Hours.
- **Font:** on either options page, under **Clock Font**, choose **Bebas Neue (built-in)**, one of the common fonts found on your computer, or **Other font…** to type the name of any installed font. Chrome doesn't let extensions list installed fonts, so the list only covers well-known fonts that it detects. A font that isn't found is drawn in Bebas Neue instead, and the options page says so. System fonts are drawn bold.
- **Size:** the slider under the font menu previews as you drag and saves when you let go. Above the recommended size, two-digit hours (10–12) can be cut off at the left edge; the preview shows `12:34` so you can check. **Use recommended size** (or dragging back to the recommended size) makes the size follow the font again if you change fonts later.

### Default color

Chrome has no theme API, and the extensions' background service workers can't check whether Chrome is in light or dark mode. Instead, each popup and options page records the current mode when it opens (and if it changes while it's open), and the icons redraw to match. So if you switch Chrome or your system between light and dark mode, **open either popup once** and both icons update. Custom Chrome themes with their own toolbar colors aren't detected; if the default digits are hard to read on your theme, pick a custom color.

## How settings sync works

Chrome gives each extension its own separate storage, so the two extensions can't read each other's settings directly. Instead, whenever you save a setting in one, it sends a `syncSettings` message to the other via `runtime.sendMessage`. The receiver:

1. accepts the message only if it comes from one of the two known extension IDs (Chrome also enforces this through `externally_connectable` in each manifest), and
2. writes the settings to its own `storage.sync`.

Each background service worker listens for `storage.onChanged` and redraws its icon whenever its settings change, whether the change came from its own popup, from the companion extension, or from Chrome sync.

When an extension is first installed, it sends a `requestSettings` message to the companion (if installed) and copies its current settings, so a newly added half of the clock matches the existing one.

An unpacked extension's ID normally depends on the folder it's loaded from. The `key` field in each `manifest.json` pins it instead:

| Extension | Extension ID |
|---|---|
| Clock Hours | `mfjklceejmahbgomlppgndjldghhkhfo` |
| Clock Minutes | `fmipmlofjigcohoeclgpbbfbjlajdhcj` |

The IDs appear in three places: `shared/shared-settings.js`, and each manifest's `externally_connectable` list (which names the *other* extension). **If you change a `key`, update the ID in all three places and run `./build.sh`**, or syncing will silently stop. Each extension logs a console warning if its own ID doesn't match either known ID.

Because settings are stored with `storage.sync`, they also follow you to other computers if you use Chrome sync.

## Project structure

```
shared/                    Source of truth for files used by both extensions
├── platform.js            Points `browser` at `chrome`; pages record light/dark mode for the service worker
├── shared-settings.js     Sends/receives settings to and from the companion extension
├── color-utils.js         Hex/RGB/HSV conversion, validation and normalization
├── clock-layout.js        Font choice and loading, font size, digit placement and color
├── font-picker.js         Clock Font section of the options pages: font, size slider, preview
├── fonts/
│   ├── BebasNeue-Clock.woff2  Bebas Neue trimmed to the digits and colon (3.5 KB)
│   └── OFL-BebasNeue.txt      Its license
└── styles.css             Styles for the popup and options page
hours-0.4/, minutes-0.4/   One folder per extension, same layout:
├── manifest.json          Extension manifest (Manifest V3, Chrome)
├── background_script.js   Service worker: draws the number on the icon and schedules updates
├── popup.html             Toolbar popup
├── options.html           Full options page (adds preset colors and the font picker)
├── color-picker-main.js   Color picker UI and event handling
├── color-picker-state.js  Load/save settings, recent colors, reset
├── icon16.png, icon32.png Placeholder toolbar icons (replaced at runtime by the drawn clock)
├── icon48.png, icon96.png Extension icons shown in chrome://extensions
└── (copies of the shared/ files and fonts/)
build.sh                   Copies shared/ into both folders and builds dist/*.zip
```

Edit the shared files in `shared/` only. The copies inside each extension folder are kept so you can load an extension straight from a fresh clone, but `build.sh` overwrites them.

### Rendering details

`background_script.js` runs as a Manifest V3 service worker, which has no DOM, so it draws the text on a 32×32 `OffscreenCanvas` in the chosen font and sets it with `action.setIcon({ imageData })`. The bundled font is loaded into the worker with `FontFace` and `self.fonts`. The layout lives in `shared/clock-layout.js`, so both extensions draw their digits in the same font and at the same size: the largest size at which any two-digit hour plus the colon fits the width and the digits fit the height. Clock Hours puts the colon at its right edge, next to the minutes, with the hour just before it. Clock Minutes centers its two digits. Glyph edges are measured by scanning the drawn pixels, so spacing and vertical centering stay right whatever the font.

Each extension keeps a repeating alarm (every minute for Clock Minutes, every hour for Clock Hours) and re-anchors it to the start of the next minute or hour every time it fires, so it doesn't drift after the computer sleeps. Each time the service worker starts it also checks that the alarm exists, so the clock restarts after the extension is disabled and re-enabled.

## Differences from the Firefox version

- **Background:** a service worker with an `OffscreenCanvas` instead of a background page with a `<canvas>`.
- **`browser.*` calls:** kept as they are; `shared/platform.js` points `browser` at Chrome's promise-based `chrome` namespace, so no polyfill is needed.
- **Default color:** follows Chrome's light/dark mode as recorded by the pages (see [Default color](#default-color)), since Chrome has no theme API. The Firefox version uses the theme's toolbar text color.
- **Clock Hours redraws once an hour,** not every minute, so its service worker wakes 24 times a day instead of 1,440. Its tooltip shows the date instead of the time.
- **Messaging between the extensions** replies through `sendResponse`, which Chrome handles reliably for external messages.
- **IDs:** fixed with a manifest `key` instead of `browser_specific_settings.gecko.id`.

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Save your color, font and display settings |
| `alarms` | Wake up at the start of each minute or hour to redraw the icon |

Nothing is sent anywhere except the settings message between the two extensions.

## Building packages

From the repository root:

```bash
./build.sh
```

This copies the files in `shared/` into both extension folders and writes `dist/hours-<version>.zip` and `dist/minutes-<version>.zip`, using the version in each `manifest.json`. Run it after editing anything in `shared/`, then reload both extensions.

Chrome loads the folders directly, so the zips are only for keeping a release or uploading to the Chrome Web Store. The Web Store assigns its own IDs and doesn't accept the `key` field, so before uploading, remove `key` from both manifests and put the store's IDs in `shared/shared-settings.js` and the `externally_connectable` lists.

## License

The bundled Bebas Neue font is © 2010 Dharma Type and is licensed under the SIL Open Font License 1.1, included as `shared/fonts/OFL-BebasNeue.txt`.
