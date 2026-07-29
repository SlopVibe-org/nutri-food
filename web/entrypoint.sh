#!/bin/sh
set -e

# Seed default config files if the mounted volume is empty/missing files
for f in index.html favicon.svg foods.json; do
    if [ ! -f "/usr/share/nginx/html/$f" ] && [ -f "/defaults/$f" ]; then
        cp "/defaults/$f" "/usr/share/nginx/html/$f"
        echo "[entrypoint] Seeded $f from defaults"
    fi
done

# Start nginx
exec nginx -g 'daemon off;'
