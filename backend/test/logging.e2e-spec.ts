/* eslint-disable @darraghor/nestjs-typed/injectable-should-be-provided, @darraghor/nestjs-typed/controllers-should-supply-api-tags, @darraghor/nestjs-typed/api-method-should-specify-api-response, sonarjs/no-hardcoded-ip -- TestLoggingController is a test-only controller, not part of the API surface; the IP is a fake value asserting it never leaks to clients */
import { getLogger, type LogRecord, reset } from '@logtape/logtape'
import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { z } from 'zod'

import AppModule from '../src/app.module.js'
import { setupApp } from '../src/logger/setup-app.js'
import { configureTestLogging } from '../src/logger/test-sink.js'
import PrismaService from '../src/prisma/prisma.service.js'
import { UpstreamServiceError } from '../src/utils/errors.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const createThingSchema = z.object({ name: z.string() })
type CreateThing = z.infer<typeof createThingSchema>

@Controller('test-logging')
class TestLoggingController {
  @Get('deep')
  deep(): { ok: boolean } {
    getLogger(['app', 'test-service']).info('deep service log')
    return { ok: true }
  }

  @Get('async-deep')
  async asyncDeep(): Promise<{ ok: boolean }> {
    // Model the real proxy path: await an upstream call, then log afterwards.
    await new Promise((resolve) => {
      setTimeout(resolve, 5)
    })
    getLogger(['app', 'test-service']).info('async service log')
    return { ok: true }
  }

  @Get('boom')
  boom(): never {
    throw new Error('boom')
  }

  @Get('upstream')
  upstream(): never {
    throw new UpstreamServiceError('magistrate timeout at 10.2.3.4', {
      upstreamStatus: 504,
    })
  }

  @Post('validate')
  validate(@Body({ schema: createThingSchema }) body: CreateThing): CreateThing {
    return body
  }
}

/** res 'finish' (which emits the http log line) can fire a tick after supertest resolves. */
async function flushLogs(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve)
  })
}

describe('Logging (e2e)', () => {
  let app: INestApplication
  const records: LogRecord[] = []

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
    await configureTestLogging(records)

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestLoggingController],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()

    app = moduleFixture.createNestApplication()
    // The SAME wiring path production uses (logger/setup-app.ts).
    setupApp(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await reset()
  })

  beforeEach(() => {
    records.length = 0
  })

  const server = (): Parameters<typeof request>[0] => app.getHttpServer() as Parameters<typeof request>[0]

  it('echoes x-request-id and tags http + deep service logs with it', async () => {
    await request(server())
      .get('/test-logging/deep')
      .set('x-request-id', 'abc123')
      .expect(200)
      .expect('x-request-id', 'abc123')
    await flushLogs()

    const tagged = records.filter((r) => r.properties.requestId === 'abc123')
    expect(tagged.some((r) => r.category[0] === 'http')).toBe(true)
    expect(tagged.some((r) => r.category.join('·') === 'app·test-service')).toBe(true)
  })

  it('keeps requestId across an awaited handler boundary', async () => {
    await request(server()).get('/test-logging/async-deep').set('x-request-id', 'async-1').expect(200)
    await flushLogs()

    const tagged = records.filter((r) => r.properties.requestId === 'async-1')
    expect(tagged.some((r) => r.category[0] === 'http')).toBe(true)
    expect(tagged.some((r) => r.category.join('·') === 'app·test-service')).toBe(true)
  })

  it('prefers CF-Ray over a competing x-request-id', async () => {
    const response = await request(server())
      .get('/test-logging/deep')
      .set('cf-ray', '8f7a2b3c4d5e6f70-VIE')
      .set('x-request-id', 'loser')
      .expect(200)
    await flushLogs()

    expect(response.headers['x-request-id']).toBe('8f7a2b3c4d5e6f70-VIE')
    expect(records.every((r) => r.properties.requestId === '8f7a2b3c4d5e6f70-VIE')).toBe(true)
  })

  it('generates a UUID when neither header is sent', async () => {
    const response = await request(server()).get('/test-logging/deep').expect(200)
    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN)
  })

  it('returns a sanitized 500 body for unexpected errors (leak guard)', async () => {
    const response = await request(server()).get('/test-logging/boom').expect(500)
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    })
  })

  it('returns a generic 502 body for UpstreamServiceError — internal message never sent', async () => {
    const response = await request(server()).get('/test-logging/upstream').expect(502)
    expect(response.body).toEqual({
      statusCode: 502,
      message: 'Internal server error',
    })
    expect(JSON.stringify(response.body)).not.toContain('10.2.3.4')
    await flushLogs()

    const errorRecord = records.find((r) => r.category.join('·') === 'app·error')
    expect(errorRecord).toBeDefined()
    expect(errorRecord?.level).toBe('error')
    expect(errorRecord?.properties.details).toEqual({ upstreamStatus: 504 })
    expect(errorRecord?.properties.error).toBeUndefined()
  })

  it('passes valid bodies through the schema pipe unchanged', async () => {
    const response = await request(server()).post('/test-logging/validate').send({ name: 'ok' }).expect(201)
    expect(response.body).toEqual({ name: 'ok' })
  })

  it('keeps field-level issues in Zod 400 bodies (regression guard)', async () => {
    const response = await request(server()).post('/test-logging/validate').send({ name: 42 }).expect(400)
    expect(JSON.stringify(response.body)).toContain('name')
    await flushLogs()

    const warnRecord = records.find((r) => r.level === 'warning')
    expect(warnRecord).toBeDefined()
  })

  it('emits exactly two log lines for an errored request', async () => {
    await request(server()).get('/test-logging/boom').set('x-request-id', 'err-corr-1').expect(500)
    await flushLogs()

    const tagged = records.filter((r) => r.properties.requestId === 'err-corr-1')
    expect(tagged).toHaveLength(2)

    const httpLine = tagged.find((r) => r.category[0] === 'http')
    const errorLine = tagged.find((r) => r.category.join('·') === 'app·error')
    expect(httpLine?.message.join('')).toContain('/test-logging/boom')
    expect(errorLine?.message.join('')).toBe('Error: boom')
    expect(errorLine?.properties.error).toBeInstanceOf(Error)
  })

  it('does not log healthcheck requests', async () => {
    await request(server()).get('/healthcheck').expect(200)
    await flushLogs()
    expect(records.filter((r) => r.category[0] === 'http')).toHaveLength(0)
  })
})
