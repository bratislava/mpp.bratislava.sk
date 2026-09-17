import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import { ConsoleLogger, Logger, type LogLevel } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/** Canonical request-id header name — echoed on responses and referenced by CORS config. */
export const REQUEST_ID_HEADER = 'x-request-id'

// Client-supplied values land verbatim in log lines, so newline injection and
// bloat must be rejected. CF-Ray's shape (8f7a2b3c4d5e6f70-VIE) passes.
const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/

const requestContext = new AsyncLocalStorage<{ requestId: string }>()

// Nest's Logger facade delegates to whatever instance main.ts passed as
// `logger` (the RequestAwareLogger below in prod, a capturing logger in e2e).
// Never instantiate RequestAwareLogger here — that would be a second logger.
const httpLogger = new Logger('HTTP')

/** First valid candidate wins; an invalid value falls through to the next source. */
export function pickRequestId(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && REQUEST_ID_PATTERN.test(candidate)) {
      return candidate
    }
  }
  return randomUUID()
}

/**
 * Stock ConsoleLogger that stamps the current request's id onto every line —
 * app loggers and Nest's own (ExceptionsHandler, NestFactory, ...) alike.
 * printMessages is the single funnel all levels pass through, text and JSON.
 */
export class RequestAwareLogger extends ConsoleLogger {
  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
    params?: Record<string, unknown>,
  ): void {
    const store = requestContext.getStore()
    super.printMessages(
      messages,
      context,
      logLevel,
      writeStreamType,
      errorStack,
      store ? { ...store, ...params } : params,
    )
  }
}

/**
 * Outside traffic arrives through Cloudflare, which stamps CF-Ray — when
 * present it becomes the request id so log lines correlate 1:1 with
 * Cloudflare's ray-id logs. Internal callers send x-request-id. The winning
 * value is echoed back as x-request-id and carried to every log call in the
 * request. On finish, one line per request: `METHOD /path status`.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = pickRequestId(req.headers['cf-ray'], req.headers['x-request-id'])
  res.setHeader(REQUEST_ID_HEADER, requestId)
  const start = Date.now()
  res.on('finish', () => {
    // k8s probes hit /healthcheck every few seconds and would dominate log volume.
    if (req.path === '/healthcheck') {
      return
    }
    httpLogger.log(`${req.method} ${req.path} ${res.statusCode}`, { durationMs: Date.now() - start })
  })
  requestContext.run({ requestId }, next)
}
