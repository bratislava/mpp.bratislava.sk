import { getLogger, type LogRecord, reset } from '@logtape/logtape'

import { AppError, UpstreamServiceError } from '../utils/errors.js'
import { logError } from './log-error.js'
import { configureTestLogging } from './test-sink.js'

describe('logError', () => {
  const records: LogRecord[] = []

  beforeAll(async () => {
    await configureTestLogging(records)
  })

  afterAll(async () => {
    await reset()
  })

  beforeEach(() => {
    records.length = 0
  })

  it('logs unexpected errors with the error property (stack) at error level', () => {
    const boom = new Error('boom')
    logError(boom)
    expect(records).toHaveLength(1)
    expect(records[0].level).toBe('error')
    expect(records[0].message.join('')).toBe('Error: boom')
    expect(records[0].properties.error).toBe(boom)
  })

  it('logs AppError with details and WITHOUT a stack', () => {
    logError(new UpstreamServiceError('magistrate timeout', { upstreamStatus: 504 }))
    expect(records).toHaveLength(1)
    expect(records[0].message.join('')).toBe('UpstreamServiceError: magistrate timeout')
    expect(records[0].properties.details).toEqual({ upstreamStatus: 504 })
    expect(records[0].properties.error).toBeUndefined()
  })

  it('omits the details property when AppError has none', () => {
    logError(new AppError('nope', 502))
    expect(records[0].properties).not.toHaveProperty('details')
  })

  it('renders braces in error messages literally (no template interpolation)', () => {
    logError(new Error('route {id} not handled'))
    expect(records[0].message.join('')).toBe('Error: route {id} not handled')
  })

  it('normalizes non-Error throws', () => {
    logError('plain string failure')
    expect(records[0].message.join('')).toBe('Error: plain string failure')
    expect(records[0].properties.error).toBeInstanceOf(Error)
  })

  it('uses the default ["app","error"] category', () => {
    logError(new Error('boom'))
    expect(records[0].category).toEqual(['app', 'error'])
  })

  it('respects an explicit logger', () => {
    logError(new Error('boom'), getLogger(['app', 'custom']))
    expect(records[0].category).toEqual(['app', 'custom'])
  })
})
