# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app/frontend

# Copy manifests first so npm ci re-runs only when package-lock.json changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline

# Copy source and produce a production build
COPY frontend/ ./
COPY designs/ /app/designs/
RUN npm run build -- --configuration production

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Angular production build output path from angular.json outputPath.
# Default for a project named "chat-herder": dist/chat-herder
# Adjust below if your angular.json uses a different name or output path.
COPY --from=build /app/frontend/dist/chat-herder /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
