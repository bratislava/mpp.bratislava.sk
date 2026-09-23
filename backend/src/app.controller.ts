import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { Public } from './auth/auth.guard.js'

@Controller()
@ApiTags('default')
export default class AppController {
  @ApiOperation({
    summary: 'Healthcheck',
    description: 'Check if the application is running',
  })
  @ApiOkResponse()
  @Public()
  @Get('healthcheck')
  health(): string {
    return 'OK'
  }
}
