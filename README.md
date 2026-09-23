# mpp.bratislava.sk

## Structure

- **[backend](./backend)** — NestJS backend (`mpp-backend`): PostgreSQL, Prisma, Zod validation, structured JSON logging with per-request correlation ids. Bootstrapped from [bratislava/magproxy](https://github.com/bratislava/magproxy).
- **[frontend](./frontend)** — Next.js (App Router) frontend (`mpp-frontend`) with Tailwind CSS and the shared [@bratislava/eslint-config-next](https://github.com/bratislava/eslint-config) lint setup.

Both services use Node.js 26 (repo-root `.nvmrc`) and npm 12; `package.json#engines` is enforced via `engine-strict` in each service's `.npmrc`, so `npm install` fails fast on older toolchains. See the README in each directory for setup instructions.

## CI / CD

GitHub Actions live in [`.github/workflows`](./.github/workflows) and cover both services (`backend`, `frontend`).

### Validation and build pipelines

Every PR against `master` runs [`build.yml`](./.github/workflows/build.yml), which runs the dockerized checks (plus a no-push build of the frontend image):

- **env-files** — asserts every `<service>/.env.deploy.<cluster>` is committed and non-empty and that every `frontend/.env.build.<cluster>` is committed and defines `NEXT_PUBLIC_API_URL`. PR CI only ever builds the `development` one, so without this gate the other env files reach `master` unchecked and only fail later, in a cluster. Both build jobs below wait on it.
- **backend** — `lint` (TypeScript type-check + ESLint + Prettier), `test` (Vitest unit) and `e2e` (Vitest e2e) stages from [`backend/Dockerfile`](./backend/Dockerfile).
- **frontend** — `lint` (ESLint + Prettier) stage from [`frontend/Dockerfile`](./frontend/Dockerfile).

### Deploys

Push to `master` deploys the whole project to **staging**. Deploy a specific environment/service by pushing a tag `<environment>[-<service>]<version>`:

- `dev`, `staging`, `prod` select the cluster; a `-backend` / `-frontend` suffix limits the deploy to one service (otherwise both deploy — including tags with an unknown/mistyped service suffix).
- Examples: `staging1.0.0` (both, staging), `dev-backend1.0.0` (backend only, dev), `prod-frontend1.0.0` (frontend only, prod).

### How deploys work

[`deploy.yml`](./.github/workflows/deploy.yml) handles both tags and `master` pushes and
fans out into the per-service build workflows
([`build-backend.yml`](./.github/workflows/build-backend.yml),
[`build-frontend.yml`](./.github/workflows/build-frontend.yml)). The overall pipeline and release rules are described in
[Deployment and releases](https://magistratba.sharepoint.com/:fl:/r/contentstorage/CSP_e7fd7f53-9abe-456a-b0e1-7cc0c63e3f1a/Document%20Library/LoopAppData/Deployment%20%26%20releases.loop?d=we29942dcbfe34648a857e7d3bfb196cf&csf=1&web=1&e=MLf6C9&nav=cz0lMkZjb250ZW50c3RvcmFnZSUyRkNTUF9lN2ZkN2Y1My05YWJlLTQ1NmEtYjBlMS03Y2MwYzYzZTNmMWEmZD1iJTIxVTNfOTU3NmFha1d3NFh6QXhqNF9Hc3RnWmNMRlhXQkR2Z2F4bHUxdEdsNGZsSnk2d2ZCeFRvWi00aXZqZ0o4ayZmPTAxWVJNMktXRzRJS002Rlk1N0pCREtRVjdIMk83M0RGV1AmYz0lMkYmYT1Mb29wQXBwJnA9JTQwZmx1aWR4JTJGbG9vcC1wYWdlLWNvbnRhaW5lciZ4PSU3QiUyMnclMjIlM0ElMjJUMFJUVUh4dFlXZHBjM1J5WVhSaVlTNXphR0Z5WlhCdmFXNTBMbU52Ylh4aUlWVXpYemsxTnpaaFlXdFhkelJZZWtGNGFqUmZSM04wWjFwalRFWllWMEpFZG1kaGVHeDFNWFJIYkRSbWJFcDVObmRtUW5oVWIxb3ROR2wyYW1kS09HdDhNREZaVWsweVMxZERRMUUyTTB4Qk5VODBOMFpHVEVVMFIwNVFTbGRLUlVoYVVRJTNEJTNEJTIyJTJDJTIyaSUyMiUzQSUyMjU1NzQyNmM4LTBmYjMtNDVhYi1iYTg1LWQ0MzZkYzMyODU1MCUyMiU3RA%3D%3D). The frontend's build-time environment
comes from the committed `frontend/.env.build.<cluster>` file, which is why it
is rebuilt per cluster.

The Terragrunt units live in [infrastructure-deployment-configuration](https://github.com/bratislava/infrastructure-deployment-configuration)
under `clusters/<cluster>/applications/mpp.bratislava.sk/<service>`:

- [development](https://github.com/bratislava/infrastructure-deployment-configuration/tree/master/clusters/development/applications/mpp.bratislava.sk)
- [staging](https://github.com/bratislava/infrastructure-deployment-configuration/tree/master/clusters/staging/applications/mpp.bratislava.sk)
- [production](https://github.com/bratislava/infrastructure-deployment-configuration/tree/master/clusters/production/applications/mpp.bratislava.sk) (not brought up yet)

Until [PR #326](https://github.com/bratislava/infrastructure-deployment-configuration/pull/326) merges, those folders only exist on its branch and
`deploy.yml` dispatches against that branch rather than `master`. Shared actions come from
[bratislava/github-actions](https://github.com/bratislava/github-actions), pinned at `@v3.0.0`.

### Environment variables and secrets

See [Environment variables & secrets](https://magistratba.sharepoint.com/:fl:/r/contentstorage/CSP_e7fd7f53-9abe-456a-b0e1-7cc0c63e3f1a/Document%20Library/LoopAppData/Environment%20variables%20%26%20Secrets.loop?d=w77387c85f8b94b50a848ccc19d3c0972&csf=1&web=1&e=C9nE81&nav=cz0lMkZjb250ZW50c3RvcmFnZSUyRkNTUF9lN2ZkN2Y1My05YWJlLTQ1NmEtYjBlMS03Y2MwYzYzZTNmMWEmZD1iJTIxVTNfOTU3NmFha1d3NFh6QXhqNF9Hc3RnWmNMRlhXQkR2Z2F4bHUxdEdsNGZsSnk2d2ZCeFRvWi00aXZqZ0o4ayZmPTAxWVJNMktXRUZQUTRIUE9QWUtCRjJRU0dNWUdPVFlDTFMmYz0lMkYmYT1Mb29wQXBwJnA9JTQwZmx1aWR4JTJGbG9vcC1wYWdlLWNvbnRhaW5lciZ4PSU3QiUyMnclMjIlM0ElMjJUMFJUVUh4dFlXZHBjM1J5WVhSaVlTNXphR0Z5WlhCdmFXNTBMbU52Ylh4aUlWVXpYemsxTnpaaFlXdFhkelJZZWtGNGFqUmZSM04wWjFwalRFWllWMEpFZG1kaGVHeDFNWFJIYkRSbWJFcDVObmRtUW5oVWIxb3ROR2wyYW1kS09HdDhNREZaVWsweVMxZERRMUUyTTB4Qk5VODBOMFpHVEVVMFIwNVFTbGRLUlVoYVVRJTNEJTNEJTIyJTJDJTIyaSUyMiUzQSUyMmEzYTI0MjIxLTBkMmUtNGUyYi1iZWEyLTQ4OTBjZGUwYTdkYiUyMiU3RA%3D%3D) for the file format and how
syncing works. Specific to this repo:

- **Non-secret env vars** go in `<service>/.env.deploy.<cluster>`, e.g.
  `backend/.env.deploy.staging` — they become the `mpp-backend-env` / `mpp-frontend-env`
  config maps. They are distinct from `frontend/.env.build.<cluster>`, the
  **build-time** config baked into the frontend image — changing that needs a new image,
  not just a redeploy.
- **mpp currently has no Passbolt-managed secrets.** The backend's PostgreSQL credentials
  are generated by the CloudNativePG operator and mounted straight from the cluster
  secret it creates, and the frontend has no secrets at all. Adding the first one
  requires creating the `/kubernetes/mpp.bratislava.sk/` folder in Passbolt and the
  ExternalSecret wiring in the infrastructure repo.
