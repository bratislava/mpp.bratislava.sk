import { z } from 'zod'

const NodeEnvSchema = z.enum(['development', 'production'])

const EnvironmentSchema = z.object({
  NODE_ENV: NodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
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
