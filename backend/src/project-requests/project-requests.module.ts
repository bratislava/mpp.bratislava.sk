import { Module } from '@nestjs/common'

import ProjectRequestsController from './project-requests.controller.js'
import ProjectRequestsService from './project-requests.service.js'

@Module({
  controllers: [ProjectRequestsController],
  providers: [ProjectRequestsService],
})
export default class ProjectRequestsModule {}
