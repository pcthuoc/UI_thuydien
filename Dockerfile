# Stage 1: Build React app
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline

COPY . .
# Build with outDir=dist so output stays inside the Docker context
RUN npx vite build --outDir dist --emptyOutDir

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

# SPA config: serve index.html for all unmatched routes (client-side routing)
COPY --from=builder /app/dist /usr/share/nginx/html
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;\n\
    location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2?|ttf|svg|map|webp)$ {\n\
        expires 30d;\n\
        add_header Cache-Control "public, immutable";\n\
        access_log off;\n\
    }\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
