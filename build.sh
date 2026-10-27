#!/usr/bin/env bash
# Copies the shared files into both extension folders, then packages each
# extension into dist/<name>-<version>.zip.
#
# Edit the files in shared/ only (platform.js, shared-settings.js,
# color-utils.js, styles.css, clock-layout.js, font-picker.js and fonts/);
# the copies in hours-0.4/ and minutes-0.4/ are overwritten by this script.
# Chrome loads the folders themselves (Load unpacked); the zips are for
# keeping a release or uploading to the Chrome Web Store.
#
# Works with any one of: zip, 7z, bsdtar (built into Windows 10+ and macOS),
# or Python. An existing zip in dist/ is only replaced once the new one is built.
set -euo pipefail
cd "$(dirname "$0")"

SHARED_FILES=(platform.js shared-settings.js color-utils.js styles.css clock-layout.js font-picker.js)

# --- Pick a zip tool --------------------------------------------------------
PYTHON=""
for p in python3 python py; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c "import zipfile" >/dev/null 2>&1; then
    PYTHON="$p"; break
  fi
done

BSDTAR=""
if [ -x /c/Windows/System32/tar.exe ]; then
  BSDTAR=/c/Windows/System32/tar.exe            # Windows (Git Bash)
elif command -v bsdtar >/dev/null 2>&1; then
  BSDTAR=bsdtar
elif tar --version 2>/dev/null | grep -q bsdtar; then
  BSDTAR=tar                                    # macOS
fi

if command -v zip >/dev/null 2>&1; then         ZIPPER=zip
elif command -v 7z >/dev/null 2>&1; then        ZIPPER=7z
elif [ -n "$BSDTAR" ]; then                     ZIPPER=bsdtar
elif [ -n "$PYTHON" ]; then                     ZIPPER=python
else
  echo "Error: no zip tool found. Install zip or 7-Zip, or Python 3." >&2
  exit 1
fi

# make_zip <output.zip> <files...>  (run from inside the add-on folder)
make_zip() {
  local out="$1"; shift
  case "$ZIPPER" in
    zip)    zip -q "$out" "$@" ;;
    7z)     7z a -tzip "$out" "$@" >/dev/null ;;
    bsdtar) "$BSDTAR" --format zip -cf "$out" "$@" ;;
    python) "$PYTHON" -c '
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for f in sys.argv[2:]:
        z.write(f)
' "$out" "$@" ;;
  esac
}

# --- Build ------------------------------------------------------------------
mkdir -p dist
for dir in hours-0.4 minutes-0.4; do
  for f in "${SHARED_FILES[@]}"; do
    cp "shared/$f" "$dir/$f"
  done
  rm -rf "$dir/fonts"
  cp -R shared/fonts "$dir/fonts"

  name="${dir%-*}"
  version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$dir/manifest.json" | tr -d '\r')
  out="dist/$name-$version.zip"
  tmp="dist/.$name-$version.tmp.zip"

  # Every file in the extension folder (and its fonts/ subfolder) except zips
  # and hidden files, as paths relative to the folder
  files=()
  for f in "$dir"/* "$dir"/fonts/*; do
    [ -f "$f" ] || continue
    case "$f" in *.zip) continue ;; esac
    files+=("${f#"$dir"/}")
  done

  rm -f "$tmp"
  if ! (cd "$dir" && make_zip "../$tmp" "${files[@]}"); then
    rm -f "$tmp"
    echo "Error: building $out with $ZIPPER failed; existing zip left unchanged." >&2
    exit 1
  fi
  mv -f "$tmp" "$out"
  echo "Built $out ($ZIPPER)"
done
