# mpp.bratislava.sk

## Structure

- **[backend](./backend)** — NestJS backend (`mpp-backend`): PostgreSQL, Prisma, Zod validation, structured JSON logging with per-request correlation ids. Bootstrapped from [bratislava/magproxy](https://github.com/bratislava/magproxy).
- **[frontend](./frontend)** — Next.js (App Router) frontend (`mpp-frontend`) with Tailwind CSS and the shared [@bratislava/eslint-config-next](https://github.com/bratislava/eslint-config) lint setup.

Both services use Node.js 26 (repo-root `.nvmrc`) and npm 12; `package.json#engines` is enforced via `engine-strict` in each service's `.npmrc`, so `npm install` fails fast on older toolchains. See the README in each directory for setup instructions.

## CI / CD

GitHub Actions live in [`.github/workflows`](./.github/workflows) and cover both services (`backend`, `frontend`).

### Validation and build pipelines

Every PR against `master` runs [`build.yml`](./.github/workflows/build.yml), which runs the dockerized checks (plus a no-push build of the frontend image):

- **env-files** — asserts every `<service>/.env.deploy.<cluster>` is committed and non-empty and that every `frontend/.env.build.<env>` is committed and defines `NEXT_PUBLIC_API_URL`. PR CI only ever builds `build_env: staging`, so without this gate the other env files reach `master` unchecked and only fail later, in a cluster. Both build jobs below wait on it.
- **backend** — `lint` (TypeScript type-check + ESLint + Prettier), `test` (Vitest unit) and `e2e` (Vitest e2e) stages from [`backend/Dockerfile`](./backend/Dockerfile).
- **frontend** — `lint` (ESLint + Prettier) stage from [`frontend/Dockerfile`](./frontend/Dockerfile).

### Deploys

Push to `master` deploys the whole project to **staging**. Deploy a specific environment/service by pushing a tag `<environment>[-<service>]<version>`:

- `dev`, `staging`, `prod` select the cluster; a `-backend` / `-frontend` suffix limits the deploy to one service (otherwise both deploy — including tags with an unknown/mistyped service suffix).
- Examples: `staging1.0.0` (both, staging), `dev-backend1.0.0` (backend only, dev), `prod-frontend1.0.0` (frontend only, prod).

#### How deploys work

Build and deploy share one reusable workflow per service ([`build-backend.yml`](./.github/workflows/build-backend.yml), [`build-frontend.yml`](./.github/workflows/build-frontend.yml)). On a PR these run in build-only mode; in [`deploy.yml`](./.github/workflows/deploy.yml) they run in deploy mode (`cluster` set), which builds the service image (if an image for the current commit does not already exist in Harbor) and tags it `<cluster>-<short-sha>`. Once a service image is built, a matching `deploy-*` job calls the shared `trigger-infra-deploy.yml` workflow, which dispatches a deploy in [infrastructure-deployment-configuration](https://github.com/bratislava/infrastructure-deployment-configuration); that applies the Terragrunt module for the service (under `clusters/<cluster>/applications/mpp/<service>`) on the target cluster.

The backend image is environment-agnostic, so a single per-commit build is reused across clusters. The Next.js frontend bakes its environment into the build (`frontend/.env.build.<env>`), so it is rebuilt (with a separate Docker cache and an `-<env>` tag suffix) for every cluster.

Runtime config ships from this repo too. The infra module reads `backend/.env.deploy.<cluster>` and `frontend/.env.deploy.<cluster>` **at the commit the deployed image was built from** and merges each into the `mpp-<service>-env` ConfigMap, so config and code move together. A tag can point at a commit older than those files, so `deploy.yml`'s `resolve` job re-checks both exist at the deployed commit before anything builds. Per-service contract: [backend](./backend/README.md#deploy-time-env), [frontend](./frontend/README.md#deploy-time-env).

The build and deploy plumbing (Buildx setup, registry logins, Docker tag/cache metadata, image reuse checks, and the infrastructure deploy trigger) comes from shared actions in [bratislava/github-actions](https://github.com/bratislava/github-actions).

> Note: the Terragrunt units live under `clusters/<cluster>/applications/mpp.bratislava.sk/<service>` in `infrastructure-deployment-configuration` ([PR #326](https://github.com/bratislava/infrastructure-deployment-configuration/pull/326)); development and staging are applied, production is not brought up yet. Until that PR merges, `deploy.yml` dispatches against its branch rather than `master`.
