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

Build and deploy share one reusable workflow per service ([`build-backend.yml`](./.github/workflows/build-backend.yml), [`build-frontend.yml`](./.github/workflows/build-frontend.yml)). On a PR these run in build-only mode; in [`deploy.yml`](./.github/workflows/deploy.yml) they run in deploy mode (`cluster` set), which builds the service image (if an image for the current commit does not already exist in Harbor) and tags it `<cluster>-<short-sha>`. Once a service image is built, a matching `deploy-*` job calls the shared `trigger-infra-deploy.yml` workflow, which dispatches a deploy in [infrastructure-deployment-configuration](https://github.com/bratislava/infrastructure-deployment-configuration); that applies the Terragrunt module for the service (under `clusters/<cluster>/applications/mpp/<service>`) on the target cluster.

The backend image is environment-agnostic, so a single per-commit build is reused across clusters. The Next.js frontend bakes its environment into the build (`frontend/.env.bratiska-cli-build.<env>`), so it is rebuilt (with a separate Docker cache and an `-<env>` tag suffix) for every cluster.

The build and deploy plumbing (Buildx setup, registry logins, Docker tag/cache metadata, image reuse checks, and the infrastructure deploy trigger) comes from shared actions in [bratislava/github-actions](https://github.com/bratislava/github-actions).

> Note: deploys will fail until the Terragrunt modules exist under `clusters/<cluster>/applications/mpp/<service>` in `infrastructure-deployment-configuration`, and the `INFRA_DEPLOY_PAT` secret + `development`/`staging`/`production` environments are configured.
