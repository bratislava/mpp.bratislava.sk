import { Module, StandardSchemaValidationPipe } from '@nestjs/common'
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
  // Default exceptionFactory prefixes issue paths as "a.b.0: message" (zod emits plain
  // PropertyKey segments; object `{ key }` segments are not unwrapped upstream).
  providers: [{ provide: APP_PIPE, useClass: StandardSchemaValidationPipe }],
  exports: [],
})
export default class AppModule {}
