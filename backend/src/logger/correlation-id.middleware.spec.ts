import { getLogger, type LogRecord, reset } from '@logtape/logtape'
import type { NextFunction, Request, Response } from 'express'

import { correlationIdMiddleware, pickRequestId } from './correlation-id.middleware'
import { configureTestLogging } from './test-sink'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('pickRequestId', () => {
  it('prefers cf-ray over x-request-id', () => {
    expect(pickRequestId('8f7a2b3c4d5e6f70-VIE', 'abc123')).toBe('8f7a2b3c4d5e6f70-VIE')
  })

  it('uses x-request-id when cf-ray is absent', () => {
    expect(pickRequestId(undefined, 'abc123')).toBe('abc123')
  })

  it('falls through an invalid cf-ray to a valid x-request-id', () => {
    expect(pickRequestId('bad value\n', 'abc123')).toBe('abc123')
  })

  it('generates a UUID when no candidate is present', () => {
    expect(pickRequestId(undefined, undefined)).toMatch(UUID_PATTERN)
  })

  it('rejects invalid charset and oversized values', () => {
    expect(pickRequestId('has space', 'a'.repeat(65))).toMatch(UUID_PATTERN)
  })

  it('rejects non-string (array) header values', () => {
    expect(pickRequestId(['a', 'b'], undefined)).toMatch(UUID_PATTERN)
  })
})

describe('correlationIdMiddleware', () => {
  const records: LogRecord[] = []

  beforeAll(async () => {
    await configureTestLogging(records)
  })

  afterAll(async () => {
    await reset()
  })

  function run(headers: Record<string, string>): {
    setHeader: jest.Mock
    next: NextFunction
  } {
    const setHeader = jest.fn()
    const req = { headers } as unknown as Request
    const res = { setHeader } as unknown as Response
    const next = jest.fn(() => {
      getLogger(['app', 'test']).info('inside request')
    })
    correlationIdMiddleware(req, res, next as NextFunction)
    return { setHeader, next }
  }

  beforeEach(() => {
    records.length = 0
  })

  it('echoes the winning id as the x-request-id response header', () => {
    const { setHeader } = run({ 'cf-ray': '8f7a2b3c4d5e6f70-VIE', 'x-request-id': 'abc' })
    expect(setHeader).toHaveBeenCalledWith('x-request-id', '8f7a2b3c4d5e6f70-VIE')
  })

  it('sets the ALS context so downstream logs carry requestId', () => {
    run({ 'x-request-id': 'abc123' })
    expect(records).toHaveLength(1)
    expect(records[0].properties.requestId).toBe('abc123')
  })

  it('calls next exactly once', () => {
    const { next } = run({})
    expect(next).toHaveBeenCalledTimes(1)
  })
})
