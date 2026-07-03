# MPP Frontend

Next.js (App Router) frontend for mpp.bratislava.sk.

## Technology Stack

- **TypeScript** with **Next.js** (App Router, standalone output)
- **Tailwind CSS**
- **ESLint** ([@bratislava/eslint-config-next](https://github.com/bratislava/eslint-config)) + **Prettier**

## Getting Started

Requires Node.js 26.x and npm.

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

The [`Dockerfile`](./Dockerfile) provides the `lint` CI stage and the `prod` runtime image (Next.js standalone). Deploys are driven by the GitHub workflows in [`../.github/workflows`](../.github/workflows); the environment is baked into the build from `.env.bratiska-cli-build.<env>` (copied to `.env.production.local` by the pipeline).
