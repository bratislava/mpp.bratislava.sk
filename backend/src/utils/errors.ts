import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * Base class for app errors that carry log-only context. `details` is logged
 * as a structured property but NEVER sent to the client.
 *
 * Data policy: `details` carries operator-curated fields only (status codes,
 * error codes, timings, entity types) — never raw upstream response bodies.
 *
 * Standard 4xx cases don't need subclasses — use Nest built-ins
 * (NotFoundException, BadRequestException, ...) unless log context is needed.
 */
export class AppError extends HttpException {
  constructor(
    message: string,
    status: number,
    public readonly details?: unknown,
  ) {
    super(message, status)
  }
}

/** An upstream system this app depends on erred or timed out. */
export class UpstreamServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, HttpStatus.BAD_GATEWAY, details)
  }
}
