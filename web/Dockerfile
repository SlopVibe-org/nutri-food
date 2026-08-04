# Stage 1: Build (bundle + minify JS)
FROM node:22-alpine AS builder

WORKDIR /src

# Copy frontend source
COPY index.html ./
COPY defaults/ ./defaults/
COPY js/ ./js/
COPY nutrifood.css ./
COPY manifest.json ./
COPY sw.js ./
COPY foods.json ./
COPY favicon-*.png ./
COPY build.sh ./

RUN chmod +x build.sh && ./build.sh

# Stage 2: Runtime (nginx)
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /dist /usr/share/nginx/html

# Copy defaults for first-install fallback (entrypoint seeds foods.json if missing)
COPY defaults/ /defaults/
COPY foods.json /defaults/foods.json

# Copy nginx config and entrypoint
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && \
    mkdir -p /var/cache/nginx /run && chown -R 101:101 /var/cache/nginx /run

# Run as non-root user (nginx already has a non-root user in alpine image)
# We use the built-in nginx user (uid 101)
USER 101

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -q --spider http://localhost:80/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
