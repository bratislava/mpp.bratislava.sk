import { HttpStatus } from '@nestjs/common'

import { AppError, UpstreamServiceError } from './errors.js'

describe('AppError', () => {
  it('stores status and details as public readonly fields', () => {
    const error = new AppError('nope', 418, { reason: 'teapot' })
    expect(error.getStatus()).toBe(418)
    expect(error.details).toEqual({ reason: 'teapot' })
  })

  it('keeps details out of getResponse()', () => {
    const error = new AppError('nope', 400, { secret: 'log-only' })
    expect(JSON.stringify(error.getResponse())).not.toContain('log-only')
  })

  it('reports its subclass name', () => {
    expect(new UpstreamServiceError('down').name).toBe('UpstreamServiceError')
  })
})

describe('UpstreamServiceError', () => {
  it('reports 502', () => {
    expect(new UpstreamServiceError('magistrate timeout').getStatus()).toBe(HttpStatus.BAD_GATEWAY)
  })
})
