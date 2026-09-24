import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from '@nestjs/swagger'
import { z } from 'zod'

import { CurrentUserOid, Roles } from '../auth/auth.guard.js'
import ProjectsService from './projects.service.js'

const idSchema = z.uuid()
const pageSchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
})
const titleSchema = z.string().trim().min(1).max(500)
const createSchema = z.object({ title: titleSchema })
const updateSchema = z.object({
  // The version the client edited; a stale one is rejected with 409.
  expectedVersion: z.int().positive(),
  title: titleSchema.optional(),
})
const textSchema = z.object({ text: z.string().trim().min(1).max(10_000) })

const openApi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject

@Controller('projects')
@ApiTags('projects')
@ApiUnauthorizedResponse({ description: 'Missing or invalid Entra access token' })
export default class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @ApiOperation({ summary: 'Current state of projects, newest first' })
  @ApiOkResponse()
  @Get()
  async list(@Query({ schema: pageSchema }) page: z.infer<typeof pageSchema>) {
    return await this.projects.list(page.take, page.skip)
  }

  @ApiOperation({ summary: 'Current state of a project with its risks and reports' })
  @ApiNotFoundResponse()
  @ApiOkResponse()
  @Get(':id')
  async get(@Param('id', { schema: idSchema }) id: string) {
    return await this.projects.get(id)
  }

  @ApiOperation({ summary: 'Create a project (version 1)' })
  @ApiBody({ schema: openApi(createSchema) })
  @ApiCreatedResponse()
  @Post()
  async create(
    @CurrentUserOid() oid: string,
    @Body({ schema: createSchema }) body: z.infer<typeof createSchema>,
  ) {
    return await this.projects.create(oid, body)
  }

  @ApiOperation({ summary: 'Change project fields (appends a version)' })
  @ApiBody({ schema: openApi(updateSchema) })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'expectedVersion is not the current version' })
  @ApiOkResponse()
  @Patch(':id')
  async update(
    @CurrentUserOid() oid: string,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: updateSchema }) { expectedVersion, ...change }: z.infer<typeof updateSchema>,
  ) {
    return await this.projects.update(oid, id, expectedVersion, change)
  }

  @ApiOperation({ summary: 'Add a risk (appends a version)' })
  @ApiBody({ schema: openApi(textSchema) })
  @ApiNotFoundResponse()
  @ApiCreatedResponse()
  @Post(':id/risks')
  async addRisk(
    @CurrentUserOid() oid: string,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: textSchema }) body: z.infer<typeof textSchema>,
  ) {
    return await this.projects.addRisk(oid, id, body.text)
  }

  @ApiOperation({ summary: 'Add a report (appends a version)' })
  @ApiBody({ schema: openApi(textSchema) })
  @ApiNotFoundResponse()
  @ApiCreatedResponse()
  @Post(':id/reports')
  async addReport(
    @CurrentUserOid() oid: string,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: textSchema }) body: z.infer<typeof textSchema>,
  ) {
    return await this.projects.addReport(oid, id, body.text)
  }

  @ApiOperation({ summary: 'All versions of a project, newest first (admin)' })
  @ApiForbiddenResponse({ description: 'User is not admin' })
  @ApiNotFoundResponse()
  @ApiOkResponse()
  @Roles(['admin'])
  @Get(':id/versions')
  async history(@Param('id', { schema: idSchema }) id: string) {
    return await this.projects.history(id)
  }

  @ApiOperation({
    summary: 'A project as it was at a version, with the risks and reports it had then (admin)',
  })
  @ApiForbiddenResponse({ description: 'User is not admin' })
  @ApiNotFoundResponse()
  @ApiOkResponse()
  @Roles(['admin'])
  @Get(':id/versions/:version')
  async at(
    @Param('id', { schema: idSchema }) id: string,
    @Param('version', { schema: z.coerce.number().int().positive() }) version: number,
  ) {
    return await this.projects.at(id, version)
  }
}
