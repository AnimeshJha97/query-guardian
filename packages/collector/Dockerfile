FROM node:25-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/package.json
COPY packages/collector/package.json packages/collector/package.json
RUN npm install
COPY packages/core packages/core
COPY packages/collector packages/collector
COPY tsconfig.base.json ./
RUN npm run build --workspace=packages/core
RUN npm run build --workspace=packages/collector
RUN npm prune --omit=dev

FROM node:25-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node --from=build /repo/node_modules node_modules
COPY --chown=node:node --from=build /repo/packages/core/dist packages/core/dist
COPY --chown=node:node --from=build /repo/packages/core/package.json packages/core/package.json
COPY --chown=node:node --from=build /repo/packages/collector/dist packages/collector/dist
COPY --chown=node:node --from=build /repo/packages/collector/package.json packages/collector/package.json
USER node
CMD ["node", "packages/collector/dist/index.js"]
