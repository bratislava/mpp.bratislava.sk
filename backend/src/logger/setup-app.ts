import { expressLogger, type ExpressRequest } from '@logtape/express'
import type { INestApplication } from '@nestjs/common'

import { AllExceptionsFilter } from './all-exceptions.filter.js'
import { correlationIdMiddleware } from './correlation-id.middleware.js'

/**
 * The ONE logging wiring path — called by main.ts in production and by the
 * e2e harness on the Test.createTestingModule app, so tests exercise
 * byte-identical setup. Order matters: the correlation middleware must open
 * the ALS context before the request logger runs inside it.
 */
export function setupApp(app: INestApplication): void {
  app.use(correlationIdMiddleware)
  app.use(
    expressLogger({
      category: ['http'],
      // 'tiny' preset logs the full request URL INCLUDING query string.
      // PII-bearing query strings MUST be avoided — none exist today, but if
      // any are introduced, swap back to a path-only custom format function.
      format: 'tiny',
      // k8s probes hit /healthcheck every few seconds and would dominate
      // stored log volume; errors on that path still surface via the filter.
      skip: (req: ExpressRequest) => req.path === '/healthcheck',
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter())
}
