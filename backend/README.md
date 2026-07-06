# MPP Backend

NestJS backend for mpp.bratislava.sk.

## Technology Stack

- **TypeScript** with **NestJS** framework
- **PostgreSQL** database
- **Prisma** for ORM connection to DB
- **Zod** for validation (via nestjs-zod)
- **Swagger** for API documentation

## Getting Started

### Prerequisites

- Node.js 26.x (use Volta for automatic version management)
- PostgreSQL database

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
