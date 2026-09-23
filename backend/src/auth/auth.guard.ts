import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { createRemoteJWKSet, type JWTPayload, jwtVerify, type JWTVerifyGetKey } from 'jose'

import type { EnvConfig } from '../config/configuration.js'

export const API_SCOPE = 'access_as_user'

export type EntraUser = JWTPayload & {
  name?: string
  oid?: string
  scp?: string
  roles?: string[]
}

type AuthedRequest = Request & { user?: EntraUser }

/** Skips authentication for a route or controller. */
export const Public = Reflector.createDecorator<true>()

/** Requires at least one of the listed Entra app roles (the `roles` claim). */
export const Roles = Reflector.createDecorator<string[]>()

/** The verified token payload set by AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): EntraUser | undefined =>
    context.switchToHttp().getRequest<AuthedRequest>().user,
)

export const ENTRA_JWKS = 'ENTRA_JWKS'

// jose caches the key set and refetches it on an unknown `kid` (Entra key rollover).
export const entraJwksProvider = {
  provide: ENTRA_JWKS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvConfig, true>): JWTVerifyGetKey =>
    createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${config.get('ENTRA_TENANT_ID', { infer: true })}/discovery/v2.0/keys`,
      ),
    ),
}

/**
 * Global, default-deny: every route needs a valid Entra access token for this API unless
 * marked @Public(). Anyone in the tenant passes; @Roles() narrows it to app-role holders.
 */
@Injectable()
export default class AuthGuard implements CanActivate {
  private readonly issuer: string[]

  private readonly audience: string[]

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENTRA_JWKS) private readonly jwks: JWTVerifyGetKey,
    config: ConfigService<EnvConfig, true>,
  ) {
    const tenantId = config.get('ENTRA_TENANT_ID', { infer: true })
    const clientId = config.get('ENTRA_CLIENT_ID', { infer: true })
    // v1 tokens (the default) vs v2 (manifest accessTokenAcceptedVersion: 2).
    this.issuer = [
      `https://sts.windows.net/${tenantId}/`,
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
    ]
    this.audience = [`api://${clientId}`, clientId]
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()]
    // .KEY lookups: the decorator overload types the result as always present.
    if (this.reflector.getAllAndOverride<true | undefined>(Public.KEY, targets)) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>()
    const [scheme, token] = request.headers.authorization?.split(' ') ?? []
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token')
    }

    let user: EntraUser
    try {
      ;({ payload: user } = await jwtVerify<EntraUser>(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
      }))
    } catch {
      throw new UnauthorizedException('Invalid token')
    }
    // ID tokens share our aud/iss but carry no `scp`; only delegated access tokens do.
    if (!user.scp?.split(' ').includes(API_SCOPE)) {
      throw new UnauthorizedException(`Token lacks the ${API_SCOPE} scope`)
    }
    request.user = user

    const roles = this.reflector.getAllAndOverride<string[] | undefined>(Roles.KEY, targets)
    if (roles && !roles.some((role) => user.roles?.includes(role))) {
      throw new ForbiddenException(`Requires one of the roles: ${roles.join(', ')}`)
    }
    return true
  }
}
