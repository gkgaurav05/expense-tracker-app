#!/bin/sh
set -eu

api_proxy_target="${NGINX_API_PROXY_TARGET:-}"
api_proxy_block=""

if [ -n "${api_proxy_target}" ]; then
  api_proxy_target="${api_proxy_target%/}"

  case "${api_proxy_target}" in
    */api)
      proxy_pass_target="${api_proxy_target}/"
      ;;
    *)
      proxy_pass_target="${api_proxy_target}/api/"
      ;;
  esac

  api_proxy_block=$(cat <<EOF
    location /api/ {
        proxy_pass ${proxy_pass_target};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
EOF
)
fi

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen 80;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;

${api_proxy_block}

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

exec nginx -g 'daemon off;'
