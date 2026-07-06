import { prismaEventToLog } from './prisma-event-to-log'

describe('prismaEventToLog', () => {
  it('maps query events to debug with duration and target, never bound params', () => {
    const mapped = prismaEventToLog('query', {
      query: 'SELECT * FROM "User" WHERE id = $1',
      params: '["secret-personal-id"]',
      duration: 12,
      target: 'quaint',
    })
    expect(mapped.level).toBe('debug')
    expect(mapped.message).toBe('SELECT * FROM "User" WHERE id = $1')
    expect(mapped.properties).toEqual({ durationMs: 12, target: 'quaint' })
    expect(JSON.stringify(mapped)).not.toContain('secret-personal-id')
  })

  it('maps warn events to warning level', () => {
    expect(prismaEventToLog('warn', { message: 'pool low' }).level).toBe('warning')
  })

  it('maps error events to error level', () => {
    const mapped = prismaEventToLog('error', { message: 'connection lost', target: 'db' })
    expect(mapped.level).toBe('error')
    expect(mapped.message).toBe('connection lost')
  })

  it('falls back to a level-tagged message when an error event has none', () => {
    expect(prismaEventToLog('error', { target: 'db' }).message).toBe('(prisma error)')
    expect(prismaEventToLog('warn', {}).message).toBe('(prisma warn)')
  })
})
