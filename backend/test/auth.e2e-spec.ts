import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose'
import request from 'supertest'

import AppModule from '../src/app.module.js'
import { ENTRA_JWKS } from '../src/auth/auth.guard.js'
import { configuration } from '../src/config/configuration.js'
import PrismaService from '../src/prisma/prisma.service.js'

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

describe('Entra auth (e2e)', () => {
  let app: INestApplication
  let signingKey: Key
  let foreignKey: Key
  let tenantId: string
  let clientId: string

  // A delegated v1 access token for this API, as Entra issues it by default.
  const sign = async (claims: JWTPayload = {}, key: Key = signingKey): Promise<string> =>
    await new SignJWT({
      iss: `https://sts.windows.net/${tenantId}/`,
      aud: `api://${clientId}`,
      scp: 'access_as_user',
      name: 'Test User',
      oid: 'oid-1',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key)

  const get = (path: string, token?: string): request.Test => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const req = request(app.getHttpServer()).get(path)
    return token ? req.set('Authorization', `Bearer ${token}`) : req
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
    ;({ ENTRA_TENANT_ID: tenantId, ENTRA_CLIENT_ID: clientId } = configuration())

    const pair = await generateKeyPair('RS256')
    signingKey = pair.privateKey
    foreignKey = (await generateKeyPair('RS256')).privateKey
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ENTRA_JWKS)
      .useValue(createLocalJWKSet({ keys: [jwk] }))
      .compile()

    app = moduleFixture.createNestApplication({ logger: false })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('keeps /healthcheck public', async () => {
    expect((await get('/healthcheck')).status).toBe(200)
  })

  it('rejects a missing, forged, foreign-audience or scope-less token with 401', async () => {
    expect((await get('/mock/any')).status).toBe(401)
    expect((await get('/mock/any', 'not-a-jwt')).status).toBe(401)
    expect((await get('/mock/any', await sign({}, foreignKey))).status).toBe(401)
    expect((await get('/mock/any', await sign({ aud: 'api://someone-else' }))).status).toBe(401)
    expect((await get('/mock/any', await sign({ iss: 'https://sts.windows.net/other/' }))).status).toBe(401)
    // An ID token of the same app: right aud/iss, no scp.
    expect((await get('/mock/any', await sign({ scp: undefined }))).status).toBe(401)
  })

  it('accepts a v2 access token (aud = client id)', async () => {
    const token = await sign({ aud: clientId, iss: `https://login.microsoftonline.com/${tenantId}/v2.0` })
    expect((await get('/mock/any', token)).status).toBe(200)
  })

  it.each([
    { roles: undefined, any: 200, either: 403, admin: 403 },
    { roles: ['process-partner'], any: 200, either: 200, admin: 403 },
    { roles: ['admin'], any: 200, either: 200, admin: 200 },
    { roles: ['admin', 'process-partner'], any: 200, either: 200, admin: 200 },
  ])('gates by app role: $roles', async ({ roles, any, either, admin }) => {
    const token = await sign({ roles })
    expect((await get('/mock/any', token)).status).toBe(any)
    expect((await get('/mock/roles', token)).status).toBe(either)
    expect((await get('/mock/admin', token)).status).toBe(admin)
  })

  it('returns the caller from the verified token', async () => {
    const response = await get('/mock/admin', await sign({ roles: ['admin'] }))
    expect(response.body).toEqual({ endpoint: 'admin', name: 'Test User', oid: 'oid-1', roles: ['admin'] })
  })
})
