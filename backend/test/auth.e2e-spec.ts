import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose'
import request from 'supertest'

import AppModule from '../src/app.module.js'
import { API_SCOPE, ENTRA_JWKS } from '../src/auth/auth.guard.js'
import { configuration } from '../src/config/configuration.js'
import PrismaService from '../src/prisma/prisma.service.js'

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

describe('Entra auth (e2e)', () => {
  let app: INestApplication
  let signingKey: Key
  let foreignKey: Key
  let tenantId: string
  let clientId: string
  let jwksDown = false

  const now = (): number => Math.floor(Date.now() / 1000)

  // A delegated v1 access token our frontend got for this API, as Entra issues it by default.
  // Every claim is overridable (undefined drops it).
  const sign = async (claims: JWTPayload = {}, key: Key = signingKey): Promise<string> =>
    await new SignJWT({
      iss: `https://sts.windows.net/${tenantId}/`,
      aud: `api://${clientId}`,
      appid: clientId,
      scp: API_SCOPE,
      name: 'Test User',
      oid: 'oid-1',
      iat: now(),
      exp: now() + 300,
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .sign(key)

  const get = (path: string, token?: string, scheme = 'Bearer'): request.Test => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const req = request(app.getHttpServer()).get(path)
    return token ? req.set('Authorization', `${scheme} ${token}`) : req
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'development'
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
    ;({ ENTRA_TENANT_ID: tenantId, ENTRA_CLIENT_ID: clientId } = configuration())

    const pair = await generateKeyPair('RS256')
    signingKey = pair.privateKey
    foreignKey = (await generateKeyPair('RS256')).privateKey
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' }
    const localJwks = createLocalJWKSet({ keys: [jwk] })
    // Stands in for createRemoteJWKSet; jwksDown simulates login.microsoftonline.com unreachable.
    const jwks: JWTVerifyGetKey = async (header, token) => {
      if (jwksDown) throw new TypeError('fetch failed')
      return await localJwks(header, token)
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ENTRA_JWKS)
      .useValue(jwks)
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

  it.each<{ name: string; token: () => Promise<string> | string | undefined; scheme?: string }>([
    { name: 'no token', token: () => undefined },
    { name: 'not a JWT', token: () => 'not-a-jwt' },
    { name: 'signed by a foreign key', token: async () => await sign({}, foreignKey) },
    {
      name: 'HS256 instead of RS256',
      token: async () =>
        await new SignJWT({ iss: `https://sts.windows.net/${tenantId}/`, aud: `api://${clientId}` })
          .setProtectedHeader({ alg: 'HS256', kid: 'test' })
          .sign(new TextEncoder().encode('x'.repeat(32))),
    },
    { name: 'foreign audience', token: async () => await sign({ aud: 'api://someone-else' }) },
    { name: 'foreign tenant', token: async () => await sign({ iss: 'https://sts.windows.net/other/' }) },
    { name: 'expired', token: async () => await sign({ iat: now() - 600, exp: now() - 60 }) },
    { name: 'no exp at all', token: async () => await sign({ exp: undefined }) },
    // An ID token of the same app: right aud/iss, no scp.
    { name: 'no scp (ID token)', token: async () => await sign({ scp: undefined }) },
    { name: 'other scopes only', token: async () => await sign({ scp: 'User.Read' }) },
    { name: 'scope name as substring', token: async () => await sign({ scp: `${API_SCOPE}_admin` }) },
    { name: 'issued to another client app', token: async () => await sign({ appid: 'other-app' }) },
    { name: 'non-Bearer scheme', token: async () => await sign(), scheme: 'Basic' },
  ])('rejects $name with 401', async ({ token, scheme }) => {
    expect((await get('/mock/any', await token(), scheme)).status).toBe(401)
  })

  it.each<{ name: string; token: () => Promise<string>; scheme?: string }>([
    {
      name: 'a v2 token (aud = client id, azp)',
      token: async () =>
        await sign({
          aud: clientId,
          iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
          appid: undefined,
          azp: clientId,
        }),
    },
    { name: 'our scope among others', token: async () => await sign({ scp: `User.Read ${API_SCOPE}` }) },
    { name: 'a lowercase bearer scheme', token: async () => await sign(), scheme: 'bearer' },
  ])('accepts $name', async ({ token, scheme }) => {
    expect((await get('/mock/any', await token(), scheme)).status).toBe(200)
  })

  it('answers 503, not 401, when the signing keys cannot be fetched', async () => {
    jwksDown = true
    try {
      expect((await get('/mock/any', await sign())).status).toBe(503)
    } finally {
      jwksDown = false
    }
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
    expect((await get('/mock/any', await sign())).body).toMatchObject({ roles: [] })
  })
})
