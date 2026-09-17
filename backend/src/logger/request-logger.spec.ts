import { Logger } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

import { CapturingLogger } from '../../test/capturing-logger.js'
import { pickRequestId, REQUEST_ID_HEADER, requestLogger } from './request-logger.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('pickRequestId', () => {
  it('returns the first valid candidate', () => {
    expect(pickRequestId('8f7a2b3c4d5e6f70-VIE', 'loser')).toBe('8f7a2b3c4d5e6f70-VIE')
    expect(pickRequestId(undefined, 'abc_123')).toBe('abc_123')
  })

  it('rejects log-forging or oversized values and falls back to a UUID', () => {
    expect(pickRequestId('evil\ninjected')).toMatch(UUID_PATTERN)
    expect(pickRequestId('a'.repeat(65))).toMatch(UUID_PATTERN)
    expect(pickRequestId('', ['array'], 42)).toMatch(UUID_PATTERN)
  })
})

/** Drives the middleware with fake req/res; returns captured records and the echoed header. */
function runRequest(
  headers: Record<string, string>,
  path: string,
  statusCode: number,
  inHandler: () => void,
): { logger: CapturingLogger; echoedId?: string } {
  const logger = new CapturingLogger()
  Logger.overrideLogger(logger)

  let echoedId: string | undefined
  let onFinish: (() => void) | undefined
  const req = { headers, method: 'GET', path } as unknown as Request
  const res = {
    statusCode,
    setHeader: (name: string, value: string) => {
      if (name === REQUEST_ID_HEADER) {
        echoedId = value
      }
    },
    on: (_event: string, cb: () => void) => {
      onFinish = cb
    },
  } as unknown as Response
  const next: NextFunction = () => {
    inHandler()
    onFinish?.()
  }

  requestLogger(req, res, next)
  Logger.overrideLogger(false)
  return { logger, echoedId }
}

describe('requestLogger + RequestAwareLogger', () => {
  it('stamps requestId on handler logs and emits one HTTP line with the status', () => {
    const { logger } = runRequest({ 'x-request-id': 'abc123' }, '/things', 201, () => {
      new Logger('Handler').log('inside', { userId: 7 })
    })
    expect(logger.records).toHaveLength(2)
    const [handler, http] = logger.records
    expect(handler).toMatchObject({
      context: 'Handler',
      message: 'inside',
      params: { requestId: 'abc123', userId: 7 },
    })
    expect(http).toMatchObject({
      context: 'HTTP',
      message: 'GET /things 201',
      params: { requestId: 'abc123' },
    })
    expect(typeof http.params?.durationMs).toBe('number')
  })

  it('prefers CF-Ray, echoes it as x-request-id and skips the healthcheck line', () => {
    const { logger, echoedId } = runRequest(
      { 'cf-ray': '8f7a2b3c4d5e6f70-VIE', 'x-request-id': 'loser' },
      '/healthcheck',
      200,
      () => {
        new Logger('Handler').log('probe')
      },
    )
    expect(echoedId).toBe('8f7a2b3c4d5e6f70-VIE')
    expect(logger.records).toHaveLength(1)
    expect(logger.records[0]).toMatchObject({
      message: 'probe',
      params: { requestId: '8f7a2b3c4d5e6f70-VIE' },
    })
  })

  it('logs outside a request without a requestId', () => {
    const logger = new CapturingLogger()
    logger.log('boot')
    expect(logger.records[0]).toMatchObject({ message: 'boot' })
    expect(logger.records[0]?.params).toBeUndefined()
  })
})
