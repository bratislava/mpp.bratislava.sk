import { Module, StandardSchemaValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_PIPE } from '@nestjs/core'

import AppController from './app.controller.js'
import AuthGuard, { entraJwksProvider } from './auth/auth.guard.js'
import MockController from './auth/mock.controller.js'
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
  controllers: [AppController, MockController],
  // Validates any route param decorated with { schema: <zod/valibot/...> }.
  // Default exceptionFactory prefixes issue paths as "a.b.0: message" (zod emits plain
  // PropertyKey segments; object `{ key }` segments are not unwrapped upstream).
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    entraJwksProvider,
    // Default-deny: every route needs an Entra token unless marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [],
})
export default class AppModule {}
