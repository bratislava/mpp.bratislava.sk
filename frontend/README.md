# MPP Frontend

Next.js (App Router) frontend for mpp.bratislava.sk.

## Technology Stack

- **TypeScript** with **Next.js** (App Router, standalone output)
- **Tailwind CSS**
- **ESLint** ([@bratislava/eslint-config-next](https://github.com/bratislava/eslint-config)) + **Prettier**

## Getting Started

Requires Node.js 26.x (see repo-root `.nvmrc`) and npm 12.x (`npm install -g npm@12`). Dependency policy lives in [`.npmrc`](./.npmrc): `engine-strict` rejects other Node/npm majors, `save-exact` pins new dependencies to exact versions, and `min-release-age=7` makes npm skip package versions published in the last 7 days.

1. Copy `.env.example` to `.env.local` and adjust as needed
2. Install dependencies: `npm install`
3. Run the dev server: `npm run dev`

## Scripts

- `npm run dev` - Start the dev server
- `npm run build` - Production build
- `npm run start` - Start the production build
- `npm run lint` / `npm run lint:fix` - ESLint
- `npm run format` / `npm run format:check` - Prettier
- `npm run typecheck` - TypeScript type check

## Build & Deploy

The [`Dockerfile`](./Dockerfile) provides the `lint` CI stage and the `prod` runtime image (Next.js standalone). Deploys are driven by the GitHub workflows in [`../.github/workflows`](../.github/workflows); the environment is baked into the build from `.env.build.<env>` (copied to `.env.production.local` by the pipeline).

## Deploy-time env

Two different env files, for two different moments:

- **`.env.build.<dev|staging|prod>`** — build time. Next.js bakes these into the bundle, so the
  pipeline copies the right one to `.env.production.local` before `npm run build`, and images are
  per-environment. `NEXT_PUBLIC_API_URL` lives here.
- **`.env.deploy.<development|staging|production>`** — deploy time. The infra repo
  ([infrastructure-deployment-configuration](https://github.com/bratislava/infrastructure-deployment-configuration))
  reads the file at the commit the image was built from and merges it into the
  `mpp-frontend-env` ConfigMap. Currently no keys, but the files must exist: the infra unit reads
  them on every apply.

**Non-secret values only** — this repo is public. `PORT` is Terraform's (it is tied to the unit's
`internal_app_port`). The `env-files` job in `build.yml` guards that all six files are committed
and non-empty.
