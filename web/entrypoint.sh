#!/bin/sh
set -e

# Files are baked into the image at build time (no volume mount).
# /defaults/ keeps foods.json for reference/manual first-install only.

# Start nginx
exec nginx -g 'daemon off;'
