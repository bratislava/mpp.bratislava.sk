import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import AppModule from './app.module.js'
import type { EnvConfig } from './config/configuration.js'
import {
  REQUEST_ID_HEADER,
  RequestAwareLogger,
  requestLogger,
  shouldLogJson,
} from './logger/request-logger.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // JSON outside development: one record per event, stacks stay inside it.
    logger: new RequestAwareLogger({ json: shouldLogJson() }),
  })
  app.use(requestLogger)
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
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Entra ID access token (copy it from the frontend token page)',
    })
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api', app, document)

  await app.listen(port)
  new Logger('Bootstrap').log(`mpp-backend is running on port: ${port}`)
}

void bootstrap()
