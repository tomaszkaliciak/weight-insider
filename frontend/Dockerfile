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

# Copy the built assets to Nginx's public folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port (internal to docker network)
EXPOSE 80

# The data.json should be mounted to /usr/share/nginx/html/data.json so the backend can update it
CMD ["nginx", "-g", "daemon off;"]
