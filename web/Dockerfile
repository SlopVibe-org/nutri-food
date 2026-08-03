FROM nginx:alpine

# Copy frontend files into the image
COPY index.html /usr/share/nginx/html/
COPY defaults/favicon.svg /usr/share/nginx/html/favicon.svg
COPY js/ /usr/share/nginx/html/js/
COPY nutrifood.css /usr/share/nginx/html/

# Copy store favicon icons
COPY favicon-*.png /usr/share/nginx/html/

# Copy defaults for first-install fallback (entrypoint seeds foods.json if missing)
COPY defaults/ /defaults/
COPY foods.json /defaults/foods.json

# Copy nginx config and entrypoint
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Run as non-root user (nginx already has a non-root user in alpine image)
# We use the built-in nginx user (uid 101)
USER 101

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
