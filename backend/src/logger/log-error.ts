import { getLogger, type Logger } from '@logtape/logtape'

import { AppError } from '../utils/errors.js'
import { escapeMessageTemplate } from './logtape.config.js'

/**
 * THE one place errors become log lines — used by AllExceptionsFilter for
 * uncaught errors and callable on demand wherever an error is caught and
 * handled locally.
 *
 * Known AppErrors log message + details= without a stack (during an upstream
 * outage every request throws from the same call site — the stack adds volume,
 * not information). Full multi-line stacks are reserved for unexpected errors.
 */
export function logError(err: unknown, logger: Logger = getLogger(['app', 'error'])): void {
  const error = err instanceof Error ? err : new Error(String(err))
  const message = escapeMessageTemplate(`${error.name}: ${error.message}`)
  if (err instanceof AppError) {
    logger.error(message, err.details === undefined ? {} : { details: err.details })
  } else {
    logger.error(message, { error })
  }
}
