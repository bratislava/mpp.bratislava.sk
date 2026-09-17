# MPP Backend

NestJS backend for mpp.bratislava.sk.

## Technology Stack

- **TypeScript** with **NestJS** framework (v12, ESM)
- **PostgreSQL** database
- **Prisma** for ORM connection to DB
- **Zod** for validation (via NestJS 12 native standard-schema support)
- **Swagger** for API documentation
- **Vitest** for tests

## Validation Convention

Request validation uses NestJS 12's native standard-schema support — pass a zod
schema directly to route param decorators; the global `StandardSchemaValidationPipe`
(registered in `app.module.ts`) enforces it:

```ts
@Post()
create(@Body({ schema: createThingSchema }) body: z.infer<typeof createThingSchema>) {}

@Get(':id')
findOne(@Param('id', { schema: z.coerce.number().int().positive() }) id: number) {}
```

To document a zod-validated endpoint in Swagger, feed the schema's JSON Schema to
the OpenAPI decorators (zod v4 built-in, no extra deps):

```ts
@ApiBody({ schema: z.toJSONSchema(createThingSchema, { target: 'openapi-3.0' }) as SchemaObject })
```

Note: there is no global response serializer. Responses are not stripped to a
schema shape — endpoints returning Prisma entities must shape their return values
explicitly (e.g. `schema.parse(result)`) to avoid leaking columns.

## Logging

Stock NestJS `ConsoleLogger`, configured once in `main.ts`: JSON records outside
`development`, colored text locally. Log from anywhere with
`new Logger(MyService.name).log('msg', { key: value })` — plain objects after the
message become structured params.

- **Correlation:** `logger/request-logger.ts` picks a request id (`CF-Ray` from
  Cloudflare, else a valid `x-request-id`, else a UUID), echoes it as the
  `x-request-id` response header and stamps `requestId` onto every log line
  written during that request, including Nest's own (`ExceptionsHandler`, …).
- **Request line:** one `HTTP` record per request on finish, `GET /path 200`
  with `durationMs`. `/healthcheck` is skipped.
- **Errors:** unexpected throws are handled by Nest's default filter — logged
  with stack under `ExceptionsHandler`, client gets a generic 500. Throw the
  built-in `HttpException`s for expected 4xx; they are not logged separately
  (the request line carries the status). For a 5xx that needs internal context,
  use `new BadGatewayException('msg', { cause })` — `cause` never reaches the
  client — and add a small `@Catch(HttpException)` filter extending
  `BaseExceptionFilter` that logs `exception.cause` for status >= 500 when the
  first such case appears.
- **Prisma:** warn/error events are always logged; set `PRISMA_LOG_QUERIES=true`
  to log every SQL statement at debug (placeholders only, never bound values).

## Getting Started

### Prerequisites

- Node.js 26.x (see repo-root `.nvmrc`) and npm 12.x (`npm install -g npm@12`)
- PostgreSQL database

Dependency policy lives in [`.npmrc`](./.npmrc): `engine-strict` rejects other Node/npm majors, `save-exact` pins new dependencies to exact versions, and `min-release-age=7` makes npm skip package versions published in the last 7 days.

### Quick Run

1. Copy `.env.example` to `.env`
2. Run `docker compose up postgres` to start the PostgreSQL container
3. Run `npm install` to install dependencies
4. Run `npm run start:dbpush:debug` to start the app

### Local Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create and configure `.env` from `.env.example`

3. Start PostgreSQL (via Docker or local installation)

4. Setup Prisma:

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. Run the app:
   ```bash
   npm run start:dev
   ```

## API Documentation

Swagger documentation is available at `/api` when the application is running.

## Scripts

- `npm run start:dev` - Start in development mode with hot reload
- `npm run start:debug` - Start in debug mode
- `npm run build` - Build for production
- `npm run start:prod` - Start production build
- `npm run lint` - Run ESLint
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests

## Deploy-time env

Runtime config for the deployed app lives in `.env.deploy.<cluster>` (`development`, `staging`,
`production`). The infra repo
([infrastructure-deployment-configuration](https://github.com/bratislava/infrastructure-deployment-configuration))
reads the file **at the commit the deployed image was built from** and merges it into the
`mpp-backend-env` ConfigMap, so config and code always ship together.

- **Non-secret values only** — this repo is public. Secrets go to Passbolt and reach the cluster
  through External Secrets Operator, never through these files.
- **`PORT` and `DATABASE_URL` are Terraform's.** `PORT` is tied to the unit's `internal_app_port`
  (which also drives the container port, service target port and readiness probe), and
  `DATABASE_URL` is composed from the CNPG secret. Setting either here would override Terraform.
- **`NODE_ENV` is `production` in every cluster, including development and staging.** It selects
  the runtime mode, not the environment; `development` is for running on your own machine. The
  file value wins over the per-cluster value the infra unit sets inline.
- One `KEY=VALUE` per line. Comments and blank lines are fine; a value cannot span lines, and a
  malformed line fails the deploy. `src/config/configuration.spec.ts` guards the shape, and the
  `env-files` job in `build.yml` guards that every file is committed and non-empty.

Add a new non-secret runtime variable in all three files plus the schema in
[`src/config/configuration.ts`](./src/config/configuration.ts).
