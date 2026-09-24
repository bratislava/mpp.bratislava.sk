import { z } from 'zod'

const NodeEnvSchema = z.enum(['development', 'production'])

const EnvironmentSchema = z.object({
  NODE_ENV: NodeEnvSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Logs every SQL statement at debug
  PRISMA_LOG_QUERIES: z.stringbool().default(false),
  // Entra ID app registration whose access tokens this API accepts. Public identifiers,
  // defaulting to the mpp.bratislava.sk registration shared by every cluster.
  ENTRA_TENANT_ID: z.guid().default('fe69e74e-1e66-4fcb-99c5-58e4a2d2a063'),
  ENTRA_CLIENT_ID: z.guid().default('d6588604-0ef7-46ae-8601-5e5c8ca49493'),
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
