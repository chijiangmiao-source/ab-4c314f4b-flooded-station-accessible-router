# syntax=docker/dockerfile:1

# ---- 构建阶段：纯前端静态产物，无任何业务后端 ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- web 目标：nginx 托管静态页面 ----
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

# ---- verify 目标：一次性验收（构建 + Vitest + Playwright）----
# 该镜像已预装 Chromium 及其全部系统依赖，验收全程不访问业务在线服务。
FROM mcr.microsoft.com/playwright:v1.48.2-noble AS verify
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# docker compose run --rm verify 时执行；保留默认命令便于覆盖
CMD ["npm", "run", "verify"]
