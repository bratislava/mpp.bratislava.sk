import { BadRequestException, Module, StandardSchemaValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_PIPE } from '@nestjs/core'

import AppController from './app.controller.js'
import { configuration } from './config/configuration.js'
import PrismaModule from './prisma/prisma.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    PrismaModule,
  ],
  controllers: [AppController],
  // Validates any route param decorated with { schema: <zod/valibot/...> }.
  // Custom exceptionFactory: the alpha.5 default drops issue paths (fixed
  // upstream in nestjs/nest#17107) — keep field names in 400 bodies.
  providers: [
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: (issues) =>
          new BadRequestException(
            issues.map((issue) => {
              const path = (issue.path ?? [])
                .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
                .join('.')
              return path ? `${path}: ${issue.message}` : issue.message
            }),
          ),
      }),
    },
  ],
  exports: [],
})
export default class AppModule {}
