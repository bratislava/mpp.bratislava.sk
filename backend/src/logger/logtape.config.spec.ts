import type { LogRecord } from '@logtape/logtape'

import { buildLogFormatter, escapeLogText, formatLogValue } from './logtape.config'

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    category: ['app', 'user'],
    level: 'info',
    message: ['hello world'],
    rawMessage: 'hello world',
    timestamp: 1_781_258_400_123,
    properties: {},
    ...overrides,
  } as LogRecord
}

describe('escapeLogText', () => {
  it('escapes newlines and carriage returns', () => {
    expect(escapeLogText('a\nb\rc')).toBe(String.raw`a\nb\rc`)
  })

  it('strips ANSI escape sequences', () => {
    expect(escapeLogText('\u001B[31mred\u001B[0m')).toBe('red')
  })
})

describe('formatLogValue', () => {
  it('quotes values containing spaces', () => {
    expect(formatLogValue('two words')).toBe('"two words"')
  })

  it('quotes values containing = so key=value stays unambiguous', () => {
    expect(formatLogValue('a=b')).toBe('"a=b"')
  })

  it('quotes and escapes embedded double quotes', () => {
    expect(formatLogValue('a"b')).toBe(String.raw`"a\"b"`)
  })

  it('quotes an empty string so it does not vanish', () => {
    expect(formatLogValue('')).toBe('""')
  })

  it('leaves simple values unquoted', () => {
    expect(formatLogValue('plain')).toBe('plain')
  })

  it('renders objects as JSON', () => {
    expect(formatLogValue({ a: 1 })).toBe('{"a":1}')
  })
})

describe('buildLogFormatter', () => {
  const formatter = buildLogFormatter(false)

  it('starts the line with a plain uncolored timestamp', () => {
    const line = formatter(makeRecord())
    expect(line).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/)
  })

  it('appends properties as a key=value suffix', () => {
    const line = formatter(makeRecord({ properties: { requestId: 'abc123' } }))
    expect(line).toContain('requestId=abc123')
  })

  it('skips undefined property values', () => {
    const line = formatter(makeRecord({ properties: { requestId: undefined } }))
    expect(line).not.toContain('requestId=')
  })

  it('renders properties.error as indented stack continuation lines', () => {
    let error: Error
    try {
      throw new Error('boom')
    } catch (thrown) {
      error = thrown as Error
    }
    const line = formatter(makeRecord({ properties: { error } }))
    const [first, ...stackLines] = line.split('\n')
    expect(first).toContain('hello world')
    expect(stackLines.length).toBeGreaterThan(0)
    expect(stackLines[0]).toMatch(/^\s+at\s/)
  })

  it('neutralizes hostile input in message and property values', () => {
    const hostile = '2026-01-01 00:00:00.000 +00 forged\nINJECTED line \u001B[31m'
    const line = formatter(
      makeRecord({
        message: [hostile],
        rawMessage: hostile,
        properties: { details: 'evil\nvalue' },
      }),
    )
    expect(line.trimEnd().split('\n')).toHaveLength(1)
    expect(line).not.toContain('\u001B[31m')
    expect(line).toContain(String.raw`details=evil\nvalue`)
  })

  it('renders object details as JSON', () => {
    const line = formatter(makeRecord({ properties: { details: { endpoint: '/persons', ms: 30_000 } } }))
    expect(line).toContain('details={"endpoint":"/persons","ms":30000}')
  })

  it('renders stacks single-line when escapeNewlines is on', () => {
    const escaping = buildLogFormatter(true)
    const line = escaping(makeRecord({ properties: { error: new Error('boom') } }))
    expect(line.trimEnd().split('\n')).toHaveLength(1)
    expect(line).toContain('error=')
  })
})
