import { AsyncLocalStorage } from 'node:async_hooks'

import { configure, type LogRecord, reset } from '@logtape/logtape'

/**
 * Test helper: resets LogTape (configure() is global per process) and routes
 * all categories used by the app into a collecting array, with the same
 * AsyncLocalStorage implicit-context setup as production.
 */
export async function configureTestLogging(records: LogRecord[]): Promise<void> {
  await reset()
  await configure({
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: {
      collect: (record) => {
        records.push(record)
      },
    },
    loggers: [
      { category: 'http', sinks: ['collect'], lowestLevel: 'debug' },
      { category: 'app', sinks: ['collect'], lowestLevel: 'debug' },
      { category: ['logtape', 'meta'], sinks: [], lowestLevel: 'fatal' },
    ],
  })
}
