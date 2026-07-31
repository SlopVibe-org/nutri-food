FROM nginx:alpine

# Copy default static files
COPY defaults/ /defaults/

# Copy nginx config and entrypoint
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Run as non-root user (nginx already has a non-root user in alpine image)
# We use the built-in nginx user (uid 101)
USER 101

# Mount point for persistent config
VOLUME /usr/share/nginx/html

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
