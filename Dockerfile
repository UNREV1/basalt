# Basalt: web app + end-to-end encrypted relay in one small container.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 BASALT_DATA=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY mcp ./mcp
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "server/index.ts"]
