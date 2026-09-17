import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { z } from 'zod'

import AppModule from './app.module.js'

// The provider registered in app.module.ts. Since 12.0.x the upstream default
// exceptionFactory prefixes issue paths itself, so we rely on the stock class
// with no options — this guards that field names keep reaching 400 bodies.
const providers = Reflect.getMetadata('providers', AppModule) as {
  provide: unknown
  useClass?: new () => StandardSchemaValidationPipe
}[]
const appPipeProvider = providers.find((provider) => provider.provide === APP_PIPE)
if (!appPipeProvider?.useClass) throw new Error('APP_PIPE useClass provider not found in AppModule')
const PipeClass = appPipeProvider.useClass
const pipe = new PipeClass()

async function messagesFor(value: unknown, schema: z.ZodType): Promise<string[]> {
  const failure: unknown = await pipe
    .transform(value, { type: 'body', schema })
    .catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(BadRequestException)
  return ((failure as BadRequestException).getResponse() as { message: string[] }).message
}

describe('AppModule APP_PIPE (default StandardSchemaValidationPipe)', () => {
  it('registers the stock pipe class without a custom exceptionFactory', () => {
    expect(PipeClass).toBe(StandardSchemaValidationPipe)
    expect(pipe).toBeInstanceOf(StandardSchemaValidationPipe)
  })

  it('passes valid bodies through unchanged', async () => {
    const schema = z.object({ name: z.string() })
    await expect(pipe.transform({ name: 'ok' }, { type: 'body', schema })).resolves.toEqual({ name: 'ok' })
  })

  it('prefixes flat field names in 400 messages', async () => {
    const messages = await messagesFor({ name: 42 }, z.object({ name: z.string() }))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/^name: /)
  })

  it('joins nested and array issue paths with dots', async () => {
    const schema = z.object({
      user: z.object({ name: z.string() }),
      items: z.array(z.object({ id: z.string() })),
    })
    const messages = await messagesFor({ user: { name: 42 }, items: [{ id: 1 }] }, schema)
    expect(messages).toEqual([
      expect.stringMatching(/^user\.name: /),
      expect.stringMatching(/^items\.0\.id: /),
    ])
  })

  it('falls back to the bare message when an issue has no path', async () => {
    const schema = z.string().refine(() => false, { message: 'top-level failure' })
    const messages = await messagesFor('anything', schema)
    expect(messages).toEqual(['top-level failure'])
  })
})
