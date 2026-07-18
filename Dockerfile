FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S contentprotect && adduser -S contentprotect -G contentprotect
COPY --from=build --chown=contentprotect:contentprotect /app/dist ./dist
COPY --from=build --chown=contentprotect:contentprotect /app/server.mjs ./server.mjs
COPY --from=build --chown=contentprotect:contentprotect /app/package.json ./package.json
COPY --from=build --chown=contentprotect:contentprotect /app/node_modules ./node_modules
RUN mkdir -p /app/.traceguard-data && chown -R contentprotect:contentprotect /app/.traceguard-data
USER contentprotect
EXPOSE 8787
CMD ["node", "server.mjs"]
