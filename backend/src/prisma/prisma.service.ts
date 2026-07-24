import { getLogger } from '@logtape/logtape'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import type { EnvConfig } from '../config/configuration.js'
import { PrismaClient } from '../generated/prisma/client.js'
import { escapeMessageTemplate } from '../logger/logtape.config.js'
import { prismaEventToLog, type PrismaLogEvent } from './prisma-event-to-log.js'

const prismaLogger = getLogger(['app', 'prisma'])

type PrismaLogLevel = 'query' | 'warn' | 'error'

// warn/error are always logged; query is opt-in (see PRISMA_LOG_QUERIES).
const ALWAYS_LOG_LEVELS = ['warn', 'error'] as const satisfies readonly PrismaLogLevel[]

@Injectable()
export default class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(configService: ConfigService<EnvConfig, true>) {
    const pool = new Pool({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
    })
    const adapter = new PrismaPg(pool)
    const logLevels: PrismaLogLevel[] = configService.get('PRISMA_LOG_QUERIES', {
      infer: true,
    })
      ? ['query', ...ALWAYS_LOG_LEVELS]
      : [...ALWAYS_LOG_LEVELS]
    super({
      adapter,
      log: logLevels.map((level) => ({ emit: 'event' as const, level })),
    })

    // The generated client's $on overloads are tied to the log config type
    // parameter, which a subclass constructor can't express — hence the cast.
    const on = this.$on.bind(this) as (
      event: PrismaLogLevel,
      callback: (event: PrismaLogEvent) => void,
    ) => void
    for (const level of logLevels) {
      on(level, (event) => {
        const mapped = prismaEventToLog(level, event)
        prismaLogger[mapped.level](escapeMessageTemplate(mapped.message), mapped.properties)
      })
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }
}
