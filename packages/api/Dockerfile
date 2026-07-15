FROM node:26-slim AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm install
COPY packages/core packages/core
COPY packages/api packages/api
COPY tsconfig.base.json ./
RUN npm run build --workspace=packages/core
RUN npm run build --workspace=packages/api
RUN npm prune --omit=dev

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node --from=build /repo/node_modules node_modules
COPY --chown=node:node --from=build /repo/packages/core/dist packages/core/dist
COPY --chown=node:node --from=build /repo/packages/core/package.json packages/core/package.json
COPY --chown=node:node --from=build /repo/packages/api/dist packages/api/dist
COPY --chown=node:node --from=build /repo/packages/api/package.json packages/api/package.json
COPY --chown=node:node --from=build /repo/packages/api/drizzle packages/api/drizzle
USER node
EXPOSE 4000
CMD ["node", "packages/api/dist/server.js"]
