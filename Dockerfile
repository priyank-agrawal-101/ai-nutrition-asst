FROM node:24.14.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global npm@11.11.0
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.14.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN npm install --global npm@11.11.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/src/server/db/migration-manifest.json ./src/server/db/migration-manifest.json
USER node
CMD ["npm", "run", "start:production"]
