FROM node:26-alpine AS base

FROM base AS build-base
# npm 12 only where npm ci runs; runtime stages keep the stock npm.
RUN npm install -g npm@12.0.2
WORKDIR /build
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

FROM build-base AS build
COPY . ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- CI check stages (dockerized lint / format) ----
# Source tree with dev dependencies installed, but without the Next.js build,
# so the lint and format checks run as fast standalone targets.
FROM build-base AS ci-base
ENV NEXT_TELEMETRY_DISABLED=1
COPY . ./

# ESLint + Prettier formatting check. Either failing fails the stage.
FROM ci-base AS lint
RUN npm run lint \
 && npm run format:check

FROM base AS app-base
RUN apk add --no-cache tini \
 && mkdir -p /home/node/app \
 && chown node:node /home/node/app
USER node
WORKDIR /home/node/app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
EXPOSE 3000
ARG GIT_COMMIT="undefined"
ENV GIT_COMMIT=$GIT_COMMIT
LABEL org.opencontainers.image.revision="${GIT_COMMIT}" \
    org.opencontainers.image.source="https://github.com/bratislava/mpp.bratislava.sk" \
    org.opencontainers.image.licenses="EUPL-1.2"
ENTRYPOINT [ "/sbin/tini", "--" ]

FROM app-base AS dev
ENV NODE_ENV=development
# dev-only: allow installs inside the container to pass the strict npm engine check
USER root
RUN npm install -g npm@12.0.2
USER node
COPY --chown=node:node --from=build-base /build/node_modules ./node_modules
CMD [ "npm", "run", "dev" ]

FROM app-base AS prod
COPY --chown=node:node .env.*.local ./
COPY --chown=node:node --from=build /build/.next/standalone ./
COPY --chown=node:node --from=build /build/.next/static ./.next/static
COPY --chown=node:node --from=build /build/public ./public
CMD [ "node", "server.js" ]
