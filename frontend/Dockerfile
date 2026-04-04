# ── Build Stage ──────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN yarn install --network-timeout 120000

COPY . .

ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN yarn build

# ── Production Stage ─────────────────────
FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
