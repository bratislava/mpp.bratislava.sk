import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { createRemoteJWKSet, errors, type JWTPayload, jwtVerify, type JWTVerifyGetKey } from 'jose'

import type { EnvConfig } from '../config/configuration.js'

export const API_SCOPE = 'access_as_user'

export type EntraUser = JWTPayload & {
  name?: string
  oid?: string
  // Client app the token was issued to: azp in v2 tokens, appid in v1.
  azp?: string
  appid?: string
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

/** The caller's Entra object id: the stable user id stored as authorOid on audited rows. */
export const CurrentUserOid = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const oid = context.switchToHttp().getRequest<AuthedRequest>().user?.oid
  if (!oid) {
    throw new UnauthorizedException('Token has no oid claim')
  }
  return oid
})

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
  private readonly logger = new Logger(AuthGuard.name)

  private readonly clientId: string

  private readonly issuer: string[]

  private readonly audience: string[]

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENTRA_JWKS) private readonly jwks: JWTVerifyGetKey,
    config: ConfigService<EnvConfig, true>,
  ) {
    const tenantId = config.get('ENTRA_TENANT_ID', { infer: true })
    const clientId = config.get('ENTRA_CLIENT_ID', { infer: true })
    this.clientId = clientId
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
    // RFC 7235: the auth scheme is case-insensitive.
    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '')?.[1]
    if (!token) {
      throw new UnauthorizedException('Missing bearer token')
    }

    let user: EntraUser
    try {
      ;({ payload: user } = await jwtVerify<EntraUser>(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp'],
      }))
    } catch (error) {
      // Signing keys unreachable (network, timeout) is our outage, not a bad token.
      if (!(error instanceof errors.JOSEError) || error instanceof errors.JWKSTimeout) {
        this.logger.error('Cannot fetch Entra signing keys', { error: String(error) })
        throw new ServiceUnavailableException('Cannot verify tokens right now')
      }
      throw new UnauthorizedException(`Invalid token (${error.code})`)
    }
    // ID tokens share our aud/iss but carry no `scp`; only delegated access tokens do.
    if (typeof user.scp !== 'string' || !user.scp.split(' ').includes(API_SCOPE)) {
      throw new UnauthorizedException(`Token lacks the ${API_SCOPE} scope`)
    }
    // Other apps in the tenant can be granted our scope too; only our own frontend may call.
    // ponytail: single client; turn this into an allowlist when a second client app appears.
    if ((user.azp ?? user.appid) !== this.clientId) {
      throw new UnauthorizedException('Token was issued to a different client app')
    }
    request.user = user

    const roles = this.reflector.getAllAndOverride<string[] | undefined>(Roles.KEY, targets)
    const userRoles = Array.isArray(user.roles) ? user.roles : []
    if (roles && !roles.some((role) => userRoles.includes(role))) {
      throw new ForbiddenException(`Requires one of the roles: ${roles.join(', ')}`)
    }
    return true
  }
}
