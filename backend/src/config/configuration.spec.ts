import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { shouldLogJson } from '../logger/request-logger.js'
import { configuration } from './configuration.js'

const VALID_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mpp?schema=public'
const MANAGED_KEYS = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'PRISMA_LOG_QUERIES',
  'ENTRA_TENANT_ID',
  'ENTRA_CLIENT_ID',
]

const ORIGINAL_ENV = process.env

/**
 * configuration() reads process.env directly, so nothing is mocked: each case gets its own
 * copy of the environment with the managed keys cleared (vitest exports NODE_ENV=test,
 * and a dev shell may export PORT/DATABASE_URL), a valid DATABASE_URL, then its overrides.
 * An override value of undefined means "leave the variable unset".
 */
function applyEnv(overrides: Record<string, string | undefined>): void {
  const inherited = Object.entries(ORIGINAL_ENV).filter(
    ([key]) => !MANAGED_KEYS.includes(key) && !(key in overrides),
  )
  const merged: Record<string, string | undefined> = { DATABASE_URL: VALID_DATABASE_URL, ...overrides }
  const managed = Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined)
  process.env = Object.fromEntries([...inherited, ...managed])
}

function load(overrides: Record<string, string | undefined> = {}): ReturnType<typeof configuration> {
  applyEnv(overrides)
  return configuration()
}

/** The thrown message for an environment configuration() rejects. */
function failureFor(overrides: Record<string, string | undefined>): string {
  applyEnv(overrides)
  let message: string | undefined
  try {
    configuration()
  } catch (error) {
    message = (error as Error).message
  }
  if (message === undefined) throw new Error('expected configuration() to throw')
  return message
}

function parses(overrides: Record<string, string | undefined>): boolean {
  try {
    load(overrides)
    return true
  } catch {
    return false
  }
}

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('configuration() NODE_ENV', () => {
  // The clusters run NODE_ENV=production (see .env.deploy.*); 'staging' was removed from the
  // enum, so a cluster that still sets it would crash the app on boot instead of booting hot.
  it('accepts exactly development and production', () => {
    const candidates = ['development', 'production', 'staging', 'test', 'dev', 'prod', 'PRODUCTION', '']
    const accepted = candidates.filter((value) => parses({ NODE_ENV: value }))
    expect(accepted).toEqual(['development', 'production'])
  })

  it('defaults to development when NODE_ENV is unset', () => {
    expect(load({ NODE_ENV: undefined }).NODE_ENV).toBe('development')
  })

  it('names NODE_ENV and the allowed options when the value is rejected', () => {
    const message = failureFor({ NODE_ENV: 'staging' })
    expect(message).toContain('Environment validation failed:')
    expect(message).toContain('- NODE_ENV:')
    expect(message).toContain('"development"')
    expect(message).toContain('"production"')
    expect(message).not.toContain('"staging"')
  })

  // main.ts builds its logger with shouldLogJson(); importing the real predicate means this
  // breaks if that gate moves, instead of asserting against a copy of it.
  it('turns JSON logging on for production and off for development', () => {
    load({ NODE_ENV: 'production' })
    expect(shouldLogJson()).toBe(true)
    load({ NODE_ENV: 'development' })
    expect(shouldLogJson()).toBe(false)
  })

  it('turns JSON logging on when NODE_ENV is unset, even though the config defaults to development', () => {
    // Known divergence: the schema default never reaches main.ts's raw process.env read.
    expect(load({ NODE_ENV: undefined }).NODE_ENV).toBe('development')
    expect(shouldLogJson()).toBe(true)
  })
})

describe('configuration() PORT', () => {
  it('defaults to 3000 and coerces a numeric string to a number', () => {
    expect(load({ PORT: undefined }).PORT).toBe(3000)
    expect(load({ PORT: '8080' }).PORT).toBe(8080)
  })

  it.each(['0', '-1', '3.5', 'abc', ''])('rejects PORT=%j', (value) => {
    expect(failureFor({ PORT: value })).toContain('- PORT:')
  })
})

describe('configuration() DATABASE_URL', () => {
  it('accepts the postgres URL shape used by .env.example and the CNPG secret', () => {
    expect(load().DATABASE_URL).toBe(VALID_DATABASE_URL)
  })

  it('has no default: an unset DATABASE_URL fails validation', () => {
    expect(failureFor({ DATABASE_URL: undefined })).toContain('- DATABASE_URL:')
  })

  it.each(['not-a-url', 'postgres.example.com/mpp', ''])('rejects DATABASE_URL=%j', (value) => {
    expect(failureFor({ DATABASE_URL: value })).toContain('- DATABASE_URL:')
  })

  it('only checks for a scheme, so a malformed URL still reaches the pg pool', () => {
    // Known weakness of z.url(): anything WHATWG-parseable passes, protocol unchecked.
    expect(load({ DATABASE_URL: 'localhost:5432/mpp' }).DATABASE_URL).toBe('localhost:5432/mpp')
    expect(load({ DATABASE_URL: 'https://example.com' }).DATABASE_URL).toBe('https://example.com')
  })
})

describe('configuration() PRISMA_LOG_QUERIES', () => {
  it('defaults to false so query logging stays opt-in', () => {
    expect(load({ PRISMA_LOG_QUERIES: undefined }).PRISMA_LOG_QUERIES).toBe(false)
  })

  it.each(['true', 'TRUE', '1', 'yes', 'on'])('reads %j as true', (value) => {
    expect(load({ PRISMA_LOG_QUERIES: value }).PRISMA_LOG_QUERIES).toBe(true)
  })

  it.each(['false', '0', 'no', 'off'])('reads %j as false', (value) => {
    expect(load({ PRISMA_LOG_QUERIES: value }).PRISMA_LOG_QUERIES).toBe(false)
  })

  it.each(['maybe', ''])('rejects PRISMA_LOG_QUERIES=%j', (value) => {
    expect(failureFor({ PRISMA_LOG_QUERIES: value })).toContain('- PRISMA_LOG_QUERIES:')
  })
})

describe('configuration() ENTRA_*', () => {
  it('defaults to the mpp.bratislava.sk app registration', () => {
    const config = load()
    expect(config.ENTRA_TENANT_ID).toBe('fe69e74e-1e66-4fcb-99c5-58e4a2d2a063')
    expect(config.ENTRA_CLIENT_ID).toBe('d6588604-0ef7-46ae-8601-5e5c8ca49493')
  })

  it('rejects a non-GUID tenant id, which would otherwise build a bogus JWKS URL', () => {
    expect(failureFor({ ENTRA_TENANT_ID: 'bratislava.sk' })).toContain('- ENTRA_TENANT_ID:')
  })
})

describe('configuration() validation failure', () => {
  it('reports every issue on its own indented line', () => {
    const message = failureFor({ NODE_ENV: 'staging', PORT: '0', DATABASE_URL: 'nope' })
    const [header, ...lines] = message.split('\n')
    expect(header).toBe('Environment validation failed:')
    expect(lines).toHaveLength(3)
    for (const line of lines) expect(line).toMatch(/^ {2}- [A-Z_]+: .+/)
    expect(lines.map((line) => line.split(':')[0]?.trim())).toEqual([
      '- NODE_ENV',
      '- PORT',
      '- DATABASE_URL',
    ])
  })

  // Scoped to configuration()'s return value on purpose: ConfigModule.forRoot sets no
  // skipProcessEnv, so ConfigService.get() still falls back to raw process.env.
  it('returns only the managed keys, dropping everything else in the environment', () => {
    applyEnv({ AWS_SECRET_ACCESS_KEY: 'super-secret', NODE_ENV: 'production' })
    const keys = Object.keys(configuration())
    expect(keys).toHaveLength(MANAGED_KEYS.length)
    expect(keys).toEqual(expect.arrayContaining(MANAGED_KEYS))
  })
})

// CI runs this suite inside the backend Docker image (build context: backend/), so only
// backend-local files are reachable here. The frontend's .env.deploy.* / .env.build.* files
// are not in this context; the env-files job in build.yml guards those.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url))
const DOTENV_LINE = /^([A-Za-z_]\w*)=(.*)$/

/**
 * Deliberately strict lint of this repo's own dotenv style, NOT a model of the infra parser:
 * it rejects quoting, `export ` and inline `#` comments outright, where
 * terraform-modules/github_env_file strips matching quotes and folds a trailing comment into
 * the value. Staying stricter than the consumer keeps these files unambiguous in both.
 */
function parseEnvFile(relativePath: string): Record<string, string> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- package-relative, test-only
  const contents = readFileSync(`${backendRoot}${relativePath}`, 'utf8')
  const entries: [string, string][] = []
  for (const [index, raw] of contents.split('\n').entries()) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const match = DOTENV_LINE.exec(line)
    if (!match) throw new Error(`${relativePath}:${index + 1} is not a comment or KEY=VALUE: ${line}`)
    entries.push([match[1], match[2]])
  }
  return Object.fromEntries(entries)
}

describe('.env.deploy.* (read at deploy time by the infra repo)', () => {
  const clusters = ['development', 'staging', 'production']

  it.each(clusters)('.env.deploy.%s exists and parses as comments plus KEY=VALUE', (cluster) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- package-relative, test-only
    expect(existsSync(`${backendRoot}.env.deploy.${cluster}`)).toBe(true)
    expect(Object.keys(parseEnvFile(`.env.deploy.${cluster}`))).toContain('NODE_ENV')
  })

  it.each(clusters)('.env.deploy.%s passes the schema it will boot under', (cluster) => {
    // Guards the pairing this branch changes: narrowing the NODE_ENV enum must not orphan a
    // value a cluster's deploy file still sets.
    expect(load(parseEnvFile(`.env.deploy.${cluster}`)).NODE_ENV).toBe('production')
  })

  it.each(clusters)('.env.deploy.%s leaves PORT and DATABASE_URL to Terraform', (cluster) => {
    const keys = Object.keys(parseEnvFile(`.env.deploy.${cluster}`))
    expect(keys).not.toContain('PORT')
    expect(keys).not.toContain('DATABASE_URL')
  })
})
