import { getLogger } from '@logtape/logtape'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'
import { REQUEST_ID_HEADER } from 'src/logger/correlation-id.middleware'
import { configureLogging } from 'src/logger/logtape.config'
import { setupApp } from 'src/logger/setup-app'

import AppModule from './app.module'
import type { EnvConfig } from './config/configuration'

async function bootstrap(): Promise<void> {
  await configureLogging()
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  setupApp(app)
  const configService = app.get(ConfigService<EnvConfig, true>)
  const port = configService.get('PORT', { infer: true })

  const corsOptions = {
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    preflightContinue: false,
    credentials: true,
    allowedHeaders: `Content-Type, Accept, Authorization, ${REQUEST_ID_HEADER}`,
    exposedHeaders: REQUEST_ID_HEADER,
  }

  app.enableShutdownHooks()
  app.enableCors(corsOptions)

  // Swagger setup with nestjs-zod cleanup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('mpp-backend API')
    .setDescription('mpp.bratislava.sk backend API')
    .setVersion('1.0')
    .setContact('Bratislava Innovations', 'https://inovacie.bratislava.sk', 'inovacie@bratislava.sk')
    .addServer(`http://localhost:${port}/`)
    .addServer('https://mpp-backend.dev.bratislava.sk/')
    .addServer('https://mpp-backend.staging.bratislava.sk/')
    .addServer('https://mpp-backend.bratislava.sk/')
    .addBearerAuth({
      type: 'http',
      description: 'Authentication token',
    })
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api', app, cleanupOpenApiDoc(document))

  await app.listen(port)
  getLogger(['app']).info(`mpp-backend is running on port: ${port}`)
}

void bootstrap()
