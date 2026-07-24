import { type LogRecord, reset } from '@logtape/logtape'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'

import AppModule from '../src/app.module.js'
import { setupApp } from '../src/logger/setup-app.js'
import { configureTestLogging } from '../src/logger/test-sink.js'
import PrismaService from '../src/prisma/prisma.service.js'

describe('AppController (e2e)', () => {
  let app: INestApplication
  const records: LogRecord[] = []

  beforeEach(async () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
    // Self-contained LogTape lifecycle (configure() is process-global) so this
    // suite does not depend on state another file happens to leave behind.
    await configureTestLogging(records)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()

    app = moduleFixture.createNestApplication()
    // Exercise the same wiring production uses (logger/setup-app.ts).
    setupApp(app)
    await app.init()
  })

  afterEach(async () => {
    await app.close()
    await reset()
  })

  it('/healthcheck (GET)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const response = await request(app.getHttpServer()).get('/healthcheck')
    expect(response.status).toBe(200)
    expect(response.text).toBe('OK')
  })
})
