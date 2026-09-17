/* eslint-disable @darraghor/nestjs-typed/injectable-should-be-provided, @darraghor/nestjs-typed/controllers-should-supply-api-tags, @darraghor/nestjs-typed/api-method-should-specify-api-response -- TestLoggingController is a test-only controller, not part of the API surface */
import { Body, Controller, Get, INestApplication, Logger, Post } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { z } from 'zod'

import AppModule from '../src/app.module.js'
import { requestLogger } from '../src/logger/request-logger.js'
import PrismaService from '../src/prisma/prisma.service.js'
import { type CapturedRecord, CapturingLogger } from './capturing-logger.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const createThingSchema = z.object({ name: z.string() })
type CreateThing = z.infer<typeof createThingSchema>

@Controller('test-logging')
class TestLoggingController {
  private readonly logger = new Logger('TestService')

  @Get('deep')
  deep(): { ok: boolean } {
    this.logger.log('deep service log')
    return { ok: true }
  }

  @Get('async-deep')
  async asyncDeep(): Promise<{ ok: boolean }> {
    // Model the real proxy path: await an upstream call, then log afterwards.
    await new Promise((resolve) => {
      setTimeout(resolve, 5)
    })
    this.logger.log('async service log')
    return { ok: true }
  }

  @Get('boom')
  boom(): never {
    throw new Error('boom')
  }

  @Post('validate')
  validate(@Body({ schema: createThingSchema }) body: CreateThing): CreateThing {
    return body
  }
}

/** res 'finish' (which emits the HTTP line) can fire a tick after supertest resolves. */
async function flushLogs(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve)
  })
}

describe('Logging (e2e)', () => {
  let app: INestApplication
  const logger = new CapturingLogger()
  const records = logger.records

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestLoggingController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()

    app = moduleFixture.createNestApplication({ logger })
    // The SAME wiring production uses (main.ts).
    app.use(requestLogger)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    records.length = 0
  })

  const server = (): Parameters<typeof request>[0] => app.getHttpServer() as Parameters<typeof request>[0]
  const withRequestId = (id: string): CapturedRecord[] => records.filter((r) => r.params?.requestId === id)

  it('echoes x-request-id and tags the HTTP line and deep service logs with it', async () => {
    await request(server())
      .get('/test-logging/deep')
      .set('x-request-id', 'abc123')
      .expect(200)
      .expect('x-request-id', 'abc123')
    await flushLogs()

    const tagged = withRequestId('abc123')
    expect(tagged.some((r) => r.context === 'HTTP' && r.message === 'GET /test-logging/deep 200')).toBe(true)
    expect(tagged.some((r) => r.context === 'TestService' && r.message === 'deep service log')).toBe(true)
  })

  it('keeps requestId across an awaited handler boundary', async () => {
    await request(server()).get('/test-logging/async-deep').set('x-request-id', 'async-1').expect(200)
    await flushLogs()

    const tagged = withRequestId('async-1')
    expect(tagged.some((r) => r.context === 'HTTP')).toBe(true)
    expect(tagged.some((r) => r.message === 'async service log')).toBe(true)
  })

  it('prefers CF-Ray over a competing x-request-id', async () => {
    const response = await request(server())
      .get('/test-logging/deep')
      .set('cf-ray', '8f7a2b3c4d5e6f70-VIE')
      .set('x-request-id', 'loser')
      .expect(200)
    await flushLogs()

    expect(response.headers['x-request-id']).toBe('8f7a2b3c4d5e6f70-VIE')
    expect(records.length).toBeGreaterThan(0)
    expect(records.every((r) => r.params?.requestId === '8f7a2b3c4d5e6f70-VIE')).toBe(true)
  })

  it('generates a UUID when neither header is sent', async () => {
    const response = await request(server()).get('/test-logging/deep').expect(200)
    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN)
  })

  it('answers unexpected errors with a sanitized 500 and logs the stack under the same requestId', async () => {
    const response = await request(server())
      .get('/test-logging/boom')
      .set('x-request-id', 'err-1')
      .expect(500)
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' })
    await flushLogs()

    const tagged = withRequestId('err-1')
    const errorLine = tagged.find((r) => r.level === 'error')
    expect(errorLine?.context).toBe('ExceptionsHandler')
    expect(errorLine?.message).toBeInstanceOf(Error)
    expect((errorLine?.message as Error).stack).toContain('boom')
    expect(tagged.some((r) => r.context === 'HTTP' && r.message === 'GET /test-logging/boom 500')).toBe(true)
  })

  it('passes valid bodies through the schema pipe unchanged', async () => {
    const response = await request(server()).post('/test-logging/validate').send({ name: 'ok' }).expect(201)
    expect(response.body).toEqual({ name: 'ok' })
  })

  it('keeps field-level issues in Zod 400 bodies (regression guard)', async () => {
    const response = await request(server()).post('/test-logging/validate').send({ name: 42 }).expect(400)
    expect(JSON.stringify(response.body)).toContain('name')
  })

  it('does not log healthcheck requests', async () => {
    await request(server()).get('/healthcheck').expect(200)
    await flushLogs()
    expect(records.filter((r) => r.context === 'HTTP')).toHaveLength(0)
  })
})
