# ── Build Stage ──────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 120000

COPY . .

ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN yarn build

# ── Production Stage ─────────────────────
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY docker-entrypoint.sh /usr/local/bin/spendrax-frontend-entrypoint
RUN chmod +x /usr/local/bin/spendrax-frontend-entrypoint

EXPOSE 80

CMD ["spendrax-frontend-entrypoint"]
