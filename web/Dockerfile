FROM nginx:alpine

# Copy default static files
COPY defaults/ /defaults/

# Copy nginx config and entrypoint
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Mount point for persistent config
VOLUME /usr/share/nginx/html

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
