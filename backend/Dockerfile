FROM node:26-alpine AS base
ENV NODE_ENV=production

FROM base AS app-base
RUN apk update \
 && apk add tini \
 && rm -rf /var/cache/apk/* \
 && mkdir -p /home/node/app \
 && chown -R node:node /home/node/app
USER node
WORKDIR /home/node/app
ENTRYPOINT [ "/sbin/tini", "--" ]

FROM base AS build-base
WORKDIR /build
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --include=dev --frozen-lockfile \
 && npx prisma generate

# ---- CI check stages (dockerized lint / test / e2e) ----
# Each extends build-base (dev deps installed) with the full source tree and a
# freshly generated Prisma client. They are separate targets so CI builds them
# in parallel and a failure points at the exact check that broke.
FROM build-base AS ci-base
ENV NODE_ENV=development
COPY --chown=node:node . ./
RUN npx prisma generate

# Type-check + ESLint + Prettier formatting check, one image. Any of the three
# failing fails the stage.
FROM ci-base AS lint
RUN npm run typecheck \
 && npm run lint:ci \
 && npm run format:check

# Unit tests (vitest, *.spec.ts).
FROM ci-base AS test
RUN npm run test

# End-to-end tests (vitest, *.e2e-spec.ts). The e2e suite mocks PrismaService, so
# DATABASE_URL only needs to be a valid URL; CI passes the Postgres service URL
# via the build arg for forward compatibility.
FROM ci-base AS e2e
ARG CI_E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mpp?schema=public"
ENV DATABASE_URL=$CI_E2E_DATABASE_URL
RUN npm run test:e2e

# Compiled app + production-only node_modules. Not built as a target of its
# own; it only feeds the `prod` COPYs below.
FROM ci-base AS build
RUN npm run build \
 && npm prune --production

FROM app-base AS dev
ENV NODE_ENV=development
# used **only** for development and local directory should be mounted
CMD [ "npm", "run", "start:debug" ]

# production
FROM app-base AS prod
COPY --chown=node:node --from=build /build/package.json /build/package-lock.json ./
COPY --chown=node:node --from=build /build/node_modules ./node_modules
COPY --chown=node:node --from=build /build/dist ./dist
COPY --chown=node:node --from=build /build/prisma ./prisma
# prisma.config.ts is the only place the datasource URL is defined (Prisma 7);
# `prisma migrate deploy` in the CMD fails without it.
COPY --chown=node:node --from=build /build/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node --from=build /build/src/generated ./src/generated
COPY --chown=node:node nest-cli.json ./nest-cli.json
EXPOSE 3000
ARG GIT_COMMIT="undefined"
ENV GIT_COMMIT=$GIT_COMMIT
LABEL org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.source="https://github.com/bratislava/mpp.bratislava.sk" \
      org.opencontainers.image.licenses="EUPL-1.2"
CMD [ "npm", "run", "start:migrate:prod" ]
