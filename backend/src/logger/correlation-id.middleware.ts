import { randomUUID } from 'node:crypto'

import { withContext } from '@logtape/logtape'
import type { NextFunction, Request, Response } from 'express'

// Client-supplied values land verbatim in plain-text log lines, so newline
// injection and bloat must be rejected. CF-Ray's shape (8f7a2b3c4d5e6f70-VIE) passes.
const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/

/** Canonical request-id header name — echoed on responses and referenced by CORS config. */
export const REQUEST_ID_HEADER = 'x-request-id'

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
 * Outside traffic arrives through Cloudflare, which stamps CF-Ray — when
 * present it becomes the request ID, so Grafana lines correlate 1:1 with
 * Cloudflare's own ray-ID logs. Internal/direct callers send x-request-id.
 * The winning value is echoed back as the x-request-id response header and
 * carried by LogTape's implicit context to every log call in the request.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = pickRequestId(req.headers['cf-ray'], req.headers['x-request-id'])
  res.setHeader(REQUEST_ID_HEADER, requestId)
  withContext({ requestId }, () => {
    next()
  })
}
