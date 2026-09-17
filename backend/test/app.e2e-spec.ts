import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'

import AppModule from '../src/app.module.js'
import PrismaService from '../src/prisma/prisma.service.js'

describe('AppController (e2e)', () => {
  let app: INestApplication

  beforeEach(async () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()

    app = moduleFixture.createNestApplication({ logger: false })
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('/healthcheck (GET)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const response = await request(app.getHttpServer()).get('/healthcheck')
    expect(response.status).toBe(200)
    expect(response.text).toBe('OK')
  })
})
