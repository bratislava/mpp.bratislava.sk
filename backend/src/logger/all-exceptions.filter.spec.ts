import { type LogRecord, reset } from '@logtape/logtape'
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'

import { AllExceptionsFilter } from './all-exceptions.filter'
import { configureTestLogging } from './test-sink'

function mockHost(response: Partial<Response>): ArgumentsHost {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => response as Response }),
  } as unknown as ArgumentsHost
}

describe('AllExceptionsFilter', () => {
  const records: LogRecord[] = []
  const filter = new AllExceptionsFilter()

  beforeAll(async () => {
    await configureTestLogging(records)
  })

  afterAll(async () => {
    await reset()
  })

  beforeEach(() => {
    records.length = 0
  })

  it('writes a sanitized 500 body when the response has not started', () => {
    const json = jest.fn()
    const status = jest.fn(() => ({ json }) as unknown as Response)
    filter.catch(new Error('boom'), mockHost({ headersSent: false, status }))
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' })
  })

  it('does not write when the response has already started', () => {
    const json = jest.fn()
    const status = jest.fn(() => ({ json }) as unknown as Response)
    filter.catch(new HttpException('late', HttpStatus.BAD_REQUEST), mockHost({ headersSent: true, status }))
    expect(status).not.toHaveBeenCalled()
    expect(json).not.toHaveBeenCalled()
  })
})
