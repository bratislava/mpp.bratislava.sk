import { ConflictException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'

import type { EnvConfig } from '../src/config/configuration.js'
import PrismaService from '../src/prisma/prisma.service.js'
import ProjectRequestsService from '../src/project-requests/project-requests.service.js'
import ProjectsService from '../src/projects/projects.service.js'

// Needs a migrated database (the append-only triggers live in the migration); see README.
describe.skipIf(process.env.E2E_DB !== 'true')('versioning (real database)', () => {
  let prisma: PrismaService
  let projects: ProjectsService
  let requests: ProjectRequestsService

  beforeAll(() => {
    // PrismaService reads only DATABASE_URL and PRISMA_LOG_QUERIES.
    const config = {
      get: (key: keyof EnvConfig) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : false),
    } as unknown as ConfigService<EnvConfig, true>
    prisma = new PrismaService(config)
    projects = new ProjectsService(prisma)
    requests = new ProjectRequestsService(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('keeps every past state of a project with the children it had then', async () => {
    const { id, version } = await projects.create('oid-a', { title: 'Old title' })
    expect(version).toBe(1)
    expect((await projects.update('oid-b', id, 1, { title: 'New title' })).version).toBe(2)
    const risk = await projects.addRisk('oid-a', id, 'Budget overrun')
    expect(risk.sinceVersion).toBe(3)
    const report = await projects.addReport('oid-b', id, 'Q3 report')
    expect(report.sinceVersion).toBe(4)
    await expect(projects.update('oid-b', id, 2, { title: 'Stale edit' })).rejects.toBeInstanceOf(
      ConflictException,
    )

    expect(await projects.at(id, 1)).toMatchObject({
      version: 1,
      title: 'Old title',
      updatedBy: 'oid-a',
      risks: [],
      reports: [],
    })
    expect(await projects.at(id, 2)).toMatchObject({ title: 'New title', updatedBy: 'oid-b', risks: [] })
    expect(await projects.at(id, 3)).toMatchObject({ risks: [{ id: risk.id }], reports: [] })
    expect(await projects.get(id)).toMatchObject({
      version: 4,
      title: 'New title',
      risks: [{ id: risk.id }],
      reports: [{ id: report.id }],
    })
    expect((await projects.list(100, 0)).find((p) => p.id === id)).toMatchObject({
      version: 4,
      title: 'New title',
    })
    expect((await projects.history(id)).map((v) => [v.version, v.title])).toEqual([
      [4, 'New title'],
      [3, 'New title'],
      [2, 'New title'],
      [1, 'Old title'],
    ])
  })

  it('keeps every past state of a project request with its comments', async () => {
    const { id } = await requests.create('oid-a', { title: 'Request' })
    const comment = await requests.addComment('oid-b', id, 'Looks good')
    expect(await requests.at(id, 1)).toMatchObject({ title: 'Request', comments: [] })
    expect(await requests.at(id, 2)).toMatchObject({ comments: [{ id: comment.id, text: 'Looks good' }] })
  })

  it('never loses a concurrent write silently', async () => {
    const { id } = await projects.create('oid-a', { title: 'Busy' })
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, async (_, i) => await projects.addRisk('oid-a', id, `risk ${i}`)),
    )
    const landed = results.filter((r) => r.status === 'fulfilled')
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ConflictException)
    }
    const current = await projects.get(id)
    expect(landed.length).toBeGreaterThan(0)
    expect(current.version).toBe(1 + landed.length)
    expect(current.risks).toHaveLength(landed.length)
  })

  it('rejects UPDATE and DELETE on history rows', async () => {
    const { id } = await projects.create('oid-a', { title: 'Immutable' })
    await projects.addRisk('oid-a', id, 'Risk')
    await expect(
      prisma.$executeRaw`UPDATE "ProjectVersion" SET title = 'forged' WHERE "projectId" = ${id}::uuid`,
    ).rejects.toThrow(/append-only/)
    await expect(
      prisma.$executeRaw`DELETE FROM "ProjectRisk" WHERE "projectId" = ${id}::uuid`,
    ).rejects.toThrow(/append-only/)
  })
})
