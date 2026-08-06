#!/bin/sh
# Build script: bundle core JS, minify all JS, copy to dist/
set -e

DIST=/dist
SRC=/src

mkdir -p "$DIST/js"

# 1. Concatenate core scripts in load order, then minify with esbuild
cat \
  "$SRC/js/core.js" \
  "$SRC/js/render.js" \
  "$SRC/js/nutrition.js" \
  "$SRC/js/search.js" \
  "$SRC/js/auth.js" \
  "$SRC/js/app.js" \
  > /tmp/core-concat.js

npx esbuild /tmp/core-concat.js \
  --minify \
  --target=es2020 \
  --outfile="$DIST/js/app.bundle.js"

# 2. Minify each lazy-loaded script individually (same filename)
for f in tracking deals suggestions grocery history cnf food-modal share journal profile; do
  if [ -f "$SRC/js/$f.js" ]; then
    npx esbuild "$SRC/js/$f.js" \
      --minify \
      --target=es2020 \
      --outfile="$DIST/js/$f.js"
  fi
done

# 3. Copy static assets
cp "$SRC/index.html" "$DIST/"
cp "$SRC/foods.json" "$DIST/"
cp "$SRC/manifest.json" "$DIST/"
cp "$SRC/sw.js" "$DIST/"
cp "$SRC/nutrifood.css" "$DIST/"
cp "$SRC/defaults/favicon.svg" "$DIST/favicon.svg"
cp "$SRC"/favicon-*.png "$DIST/" 2>/dev/null || true

# 4. Copy defaults directory
cp -r "$SRC/defaults" "$DIST/"

echo "✅ Build complete"
ls -la "$DIST/js/"
