export interface PrismaLogEvent {
  message?: string
  target?: string
  query?: string
  params?: string
  duration?: number
}

export interface MappedPrismaLog {
  level: 'debug' | 'warn' | 'error'
  message: string
  properties: Record<string, unknown>
}

/**
 * Maps a Prisma client log event to a Nest Logger call. Data policy: the SQL text
 * contains only placeholders ($1, $2, ...) — bound parameter values
 * (event.params) are deliberately never logged. Holds only as long as we use parametrized queries!
 */
export function prismaEventToLog(level: 'query' | 'warn' | 'error', event: PrismaLogEvent): MappedPrismaLog {
  if (level === 'query') {
    return {
      level: 'debug',
      message: event.query ?? 'query',
      properties: { durationMs: event.duration, target: event.target },
    }
  }
  return {
    level,
    message: event.message || `(prisma ${level})`,
    properties: { target: event.target },
  }
}
