FROM node:22-slim AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN npm ci --workspace=packages/dashboard --include-workspace-root
COPY packages/dashboard packages/dashboard
COPY tsconfig.base.json ./
RUN npm run build --workspace=packages/dashboard

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --chown=101:101 packages/dashboard/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chown=101:101 --from=builder /repo/packages/dashboard/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
