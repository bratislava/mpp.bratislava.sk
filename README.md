# mpp.bratislava.sk

## Structure

- **[backend](./backend)** — NestJS backend (`mpp-backend`): PostgreSQL, Prisma, Zod validation, structured LogTape logging. Bootstrapped from [bratislava/magproxy](https://github.com/bratislava/magproxy).
- **[frontend](./frontend)** — Next.js (App Router) frontend (`mpp-frontend`) with Tailwind CSS and the shared [@bratislava/eslint-config-next](https://github.com/bratislava/eslint-config) lint setup.

Both services use Node.js 26 and npm. See the README in each directory for setup instructions.

## CI / CD

GitHub Actions live in [`.github/workflows`](./.github/workflows) and cover both services (`backend`, `frontend`).

### Validation and build pipelines

Every PR against `master` runs [`build.yml`](./.github/workflows/build.yml), which runs the dockerized checks (plus a no-push build of the frontend image):

- **backend** — `lint` (TypeScript type-check + ESLint + Prettier), `test` (jest unit) and `e2e` (jest e2e) stages from [`backend/Dockerfile`](./backend/Dockerfile).
- **frontend** — `lint` (ESLint + Prettier) stage from [`frontend/Dockerfile`](./frontend/Dockerfile).

### Deploys

Push to `master` deploys the whole project to **staging**. Deploy a specific environment/service by pushing a tag `<environment>[-<service>]<version>`:

- `dev`, `staging`, `prod` select the cluster; a `-backend` / `-frontend` suffix limits the deploy to one service (otherwise both deploy — including tags with an unknown/mistyped service suffix).
- Examples: `staging1.0.0` (both, staging), `dev-backend1.0.0` (backend only, dev), `prod-frontend1.0.0` (frontend only, prod).

#### How deploys work

Build and deploy share one reusable workflow per service ([`build-backend.yml`](./.github/workflows/build-backend.yml), [`build-frontend.yml`](./.github/workflows/build-frontend.yml)). On a PR these run in build-only mode; in [`deploy.yml`](./.github/workflows/deploy.yml) they run in deploy mode (`cluster` set), which builds the service image (if an image for the current commit does not already exist in Harbor) and tags it `<cluster>-<short-sha>`. Once a service image is built, a matching `deploy-*` job calls the shared `trigger-infra-deploy.yml` workflow, which dispatches a deploy in [infrastructure-deployment-configuration](https://github.com/bratislava/infrastructure-deployment-configuration); that applies the Terragrunt module for the service (under `clusters/<cluster>/applications/mpp.bratislava.sk/<service>`) on the target cluster.

The backend image is environment-agnostic, so a single per-commit build is reused across clusters. The Next.js frontend bakes its environment into the build (`frontend/.env.bratiska-cli-build.<env>`), so it is rebuilt (with a separate Docker cache and an `-<env>` tag suffix) for every cluster.

The build and deploy plumbing (Buildx setup, registry logins, Docker tag/cache metadata, image reuse checks, and the infrastructure deploy trigger) comes from shared actions in [bratislava/github-actions](https://github.com/bratislava/github-actions), pinned at `@v3.0.0`.

### Environment variables and secrets

Runtime configuration is split in two: **non-secret env vars live in this repo**, next to the code they configure, and **secrets live in Passbolt**. The deployment itself is still defined per cluster in [infrastructure-deployment-configuration](https://github.com/bratislava/infrastructure-deployment-configuration), under `clusters/<cluster>/applications/mpp.bratislava.sk/<service>` (clusters: `development`, `staging`, `production`).

**Non-secret env vars** go in `<service>/.env.deploy.<cluster>`, e.g. `backend/.env.deploy.staging`. On deploy the infrastructure repo reads that file from the exact commit being deployed and turns it into the service's config map — `mpp-backend-env` for the backend, `mpp-frontend-env` for the frontend. The format is: one `KEY=VALUE` per line, blank lines and whole-line `#` comments ignored, and one surrounding pair of either `'` or `"` stripped if present (the two ends have to match; a lone quote on one side is kept as part of the value). **A value has to fit on a single line** — there is no line continuation and no escape processing, so a `#` mid-line stays part of the value. Anything multiline (a PEM key, a certificate) must either be rewritten to a single line, or land in Passbolt.

These are runtime values, applied when the deploy runs. They are distinct from `frontend/.env.bratiska-cli-build.<env>`, which is **build-time** config baked into the frontend image (that is why the frontend is rebuilt per cluster) — changing it needs a new image, not just a redeploy.

**Secrets** live in [Passbolt](https://passbolt.bratislava.sk) and are synced into the cluster by External Secrets Operator, so you need Passbolt access to change them. Every secret belongs to exactly one service: Passbolt resources are named `<cluster>/<service>/<ENV_VAR_NAME>` and sync into that service's `<service>-secret` Kubernetes Secret. There are no shared secret groups — a value that two services both need is stored once per service.

**mpp currently has no Passbolt-managed secrets.** The backend's PostgreSQL credentials are generated by the CloudNativePG operator and mounted straight from the cluster secret it creates, and the frontend has no secrets at all. If that changes, adding the value in Passbolt under an existing service is enough — it syncs to the cluster with the next deploy.

A few entries go the other way: credentials Terraform generates (databases, RabbitMQ, Redis) are published *into* Passbolt as `read-only/<cluster>/<service>/<ENV_VAR_NAME>`. Those are a read-only mirror so the team can look the values up — the `read-only/` prefix is what stops External Secrets from syncing them back, and editing them in Passbolt does nothing, as the next apply reverts it.

If you don't have Passbolt access, ask around on the team.

If you aren't sure where a variable belongs, or need help with anything else deployment-config wise, ask the maintainers of the infrastructure repo.
