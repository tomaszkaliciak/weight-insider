# 1. Build Stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

# Copy source files
COPY index.html ./
COPY vite.config.js ./
COPY eslint.config.js ./
COPY .prettierrc.json ./
COPY css/ ./css/
COPY js/ ./js/
COPY public/ ./public/
COPY data.json ./

# Build the frontend
RUN npm run build

# 2. Runtime Stage
FROM nginx:alpine

# Custom Nginx configuration with /api/ reverse proxy and data.json live volume support
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built assets to Nginx's public folder
COPY --from=builder /app/dist /usr/share/nginx/html
# Fallback data.json
COPY data.json /usr/share/nginx/html/data.json

# Expose port (internal to docker network)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
