import { Controller, Get } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { CurrentUser, type EntraUser, Roles } from './auth.guard.js'

interface MockResponse {
  endpoint: string
  name?: string
  oid?: string
  roles: string[]
}

const describe = (endpoint: string, user?: EntraUser): MockResponse => ({
  endpoint,
  name: user?.name,
  oid: user?.oid,
  roles: user?.roles ?? [],
})

// ponytail: mock endpoints to exercise Entra auth end-to-end; delete once real endpoints exist.
@Controller('mock')
@ApiTags('mock')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Entra access token' })
export default class MockController {
  @ApiOperation({ summary: 'Any signed-in user of the organisation' })
  @ApiOkResponse()
  @Get('any')
  any(@CurrentUser() user?: EntraUser): MockResponse {
    return describe('any', user)
  }

  @ApiOperation({ summary: 'Role admin or process-partner' })
  @ApiOkResponse()
  @ApiForbiddenResponse({ description: 'User has neither role' })
  @Roles(['admin', 'process-partner'])
  @Get('roles')
  roles(@CurrentUser() user?: EntraUser): MockResponse {
    return describe('roles', user)
  }

  @ApiOperation({ summary: 'Role admin only' })
  @ApiOkResponse()
  @ApiForbiddenResponse({ description: 'User is not admin' })
  @Roles(['admin'])
  @Get('admin')
  admin(@CurrentUser() user?: EntraUser): MockResponse {
    return describe('admin', user)
  }
}
