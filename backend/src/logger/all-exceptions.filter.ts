import { getLogger } from '@logtape/logtape'
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'

import { AppError } from '../utils/errors.js'
import { logError } from './log-error.js'
import { escapeMessageTemplate } from './logtape.config.js'

const logger = getLogger(['app', 'error'])

function buildClientBody(exception: unknown, status: number): object {
  if (status >= 500) {
    // Internal 5xx message text is logged, never sent to clients.
    return {
      statusCode: status,
      message: 'Internal server error',
    }
  }
  // 4xx HttpException: object bodies pass through (preserves standard-schema
  // field-level issues); string bodies — what HttpException(message, status)
  // produces — are normalized, never shipped raw.
  const body = (exception as HttpException).getResponse()
  return typeof body === 'object' ? body : { statusCode: status, message: body }
}

/**
 * The single place uncaught errors become log lines and sanitized responses.
 * 4xx → warn without stack (expected client errors); AppError 5xx → error with
 * details=, no stack; unexpected throws → logError with full stack.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception
    }
    const response = host.switchToHttp().getResponse<Response>()
    const isHttp = exception instanceof HttpException
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    if (isHttp && status < 500) {
      const details = exception instanceof AppError ? exception.details : undefined
      logger.warn(
        escapeMessageTemplate(`${exception.name}: ${exception.message}`),
        details === undefined ? {} : { details },
      )
    } else {
      logError(exception, logger)
    }

    // A throw after the response started (e.g. streamed bodies) would make
    // response.json() raise ERR_HTTP_HEADERS_SENT and mask the real error. The
    // error is already logged above, so just stop here.
    if (response.headersSent) {
      return
    }
    response.status(status).json(buildClientBody(exception, status))
  }
}
