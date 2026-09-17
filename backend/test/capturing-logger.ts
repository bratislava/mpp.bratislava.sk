import type { LogLevel } from '@nestjs/common'

import { RequestAwareLogger } from '../src/logger/request-logger.js'

export interface CapturedRecord {
  level: LogLevel
  message: unknown
  context?: string
  params?: Record<string, unknown>
}

/**
 * Test double: the production RequestAwareLogger (so requestId stamping is
 * exercised for real) with the final JSON write swapped for an in-memory array.
 */
export class CapturingLogger extends RequestAwareLogger {
  readonly records: CapturedRecord[] = []

  constructor() {
    super({ json: true })
  }

  protected override printAsJson(
    message: unknown,
    options: { context?: string; logLevel: LogLevel; params?: Record<string, unknown> },
  ): void {
    this.records.push({ level: options.logLevel, message, context: options.context, params: options.params })
  }
}
