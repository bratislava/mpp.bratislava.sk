import { z } from 'zod'

const NodeEnvSchema = z.enum(['development', 'staging', 'production'])

const EnvironmentSchema = z.object({
  NODE_ENV: NodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Renders stack traces single-line until the Loki multiline stage is live.
  // Read directly from process.env in logtape.config.ts (logging is configured
  // before ConfigService exists); validated here for documentation and typing.
  // Delete once the multiline stage is confirmed in production (see TODOS.md).
  LOG_ESCAPE_NEWLINES: z.stringbool().default(false),
  // Logs every SQL statement at debug
  PRISMA_LOG_QUERIES: z.stringbool().default(false),
})

export type EnvConfig = z.infer<typeof EnvironmentSchema>

export const configuration = (): EnvConfig => {
  const result = EnvironmentSchema.safeParse(process.env)

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(`Environment validation failed:\n${formattedErrors}`)
  }

  return result.data
}
