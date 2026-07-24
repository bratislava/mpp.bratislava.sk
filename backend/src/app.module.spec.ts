import { BadRequestException, type StandardSchemaValidationPipe } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { z } from 'zod'

import AppModule from './app.module.js'

// The REAL pipe instance registered in app.module.ts — not a copy.
const providers = Reflect.getMetadata('providers', AppModule) as {
  provide: unknown
  useValue: StandardSchemaValidationPipe
}[]
const appPipeProvider = providers.find((provider) => provider.provide === APP_PIPE)
if (!appPipeProvider) throw new Error('APP_PIPE provider not found in AppModule')
const pipe = appPipeProvider.useValue

interface FakeIssue {
  message: string
  path?: (PropertyKey | { key: PropertyKey })[]
}

/** Minimal standard-schema stub — lets us hand-craft issue shapes zod never emits. */
function fakeSchema(issues: FakeIssue[]): z.ZodType {
  return { '~standard': { version: 1, vendor: 'test', validate: () => ({ issues }) } } as unknown as z.ZodType
}

async function messagesFor(value: unknown, schema: z.ZodType): Promise<string[]> {
  const failure: unknown = await pipe
    .transform(value, { type: 'body', schema })
    .catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(BadRequestException)
  return ((failure as BadRequestException).getResponse() as { message: string[] }).message
}

describe('AppModule APP_PIPE exceptionFactory', () => {
  it('joins nested issue paths with dots and passes valid bodies through', async () => {
    const schema = z.object({ user: z.object({ name: z.string() }) })
    const messages = await messagesFor({ user: { name: 42 } }, schema)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/^user\.name: /)

    await expect(pipe.transform({ user: { name: 'ok' } }, { type: 'body', schema })).resolves.toEqual({
      user: { name: 'ok' },
    })
  })

  it('unwraps object path segments via their key', async () => {
    const messages = await messagesFor(
      {},
      fakeSchema([{ message: 'bad thing', path: [{ key: 'items' }, 0, { key: 'id' }] }]),
    )
    expect(messages).toEqual(['items.0.id: bad thing'])
  })

  it('falls back to the bare message when an issue has no path', async () => {
    const messages = await messagesFor(
      {},
      fakeSchema([{ message: 'top-level failure' }, { message: 'empty path', path: [] }]),
    )
    expect(messages).toEqual(['top-level failure', 'empty path'])
  })
})
