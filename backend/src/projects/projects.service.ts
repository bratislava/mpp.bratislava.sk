import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { Prisma, type ProjectVersion } from '../generated/prisma/client.js'
import PrismaService from '../prisma/prisma.service.js'

/** The versioned fields of a project: everything on ProjectVersion except its bookkeeping. */
export type ProjectData = Omit<ProjectVersion, 'id' | 'projectId' | 'version' | 'createdAt' | 'authorOid'>

const omitProjectId = { projectId: true } as const

// The destructured bookkeeping fields are there to be dropped.
/* eslint-disable @typescript-eslint/no-unused-vars */
const dataOf = ({ id, projectId, version, createdAt, authorOid, ...data }: ProjectVersion): ProjectData =>
  data
/* eslint-enable @typescript-eslint/no-unused-vars */

const toProject = (head: { id: string; createdAt: Date }, current: ProjectVersion) => ({
  id: head.id,
  createdAt: head.createdAt,
  version: current.version,
  updatedAt: current.createdAt,
  updatedBy: current.authorOid,
  ...dataOf(current),
})

const currentOf = (head: { id: string; currentVersion: ProjectVersion | null }): ProjectVersion => {
  if (!head.currentVersion) {
    throw new Error(`Project ${head.id} has no current version`)
  }
  return head.currentVersion
}

/**
 * Projects are append-only: each change inserts a ProjectVersion (N+1) and moves the head's
 * currentVersionId to it. Adding a risk or report also appends a version, so a past state N
 * is that version plus the children with sinceVersion <= N.
 */
@Injectable()
export default class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(take: number, skip: number) {
    const heads = await this.prisma.project.findMany({
      include: { currentVersion: true },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    })
    return heads.map((head) => toProject(head, currentOf(head)))
  }

  async get(id: string) {
    const head = await this.prisma.project.findUnique({
      where: { id },
      include: {
        currentVersion: true,
        risks: { omit: omitProjectId, orderBy: { sinceVersion: 'asc' } },
        reports: { omit: omitProjectId, orderBy: { sinceVersion: 'asc' } },
      },
    })
    if (!head) {
      throw new NotFoundException()
    }
    return { ...toProject(head, currentOf(head)), risks: head.risks, reports: head.reports }
  }

  async history(id: string) {
    const versions = await this.prisma.projectVersion.findMany({
      where: { projectId: id },
      omit: { id: true, projectId: true },
      orderBy: { version: 'desc' },
    })
    if (versions.length === 0) {
      throw new NotFoundException()
    }
    return versions
  }

  async at(id: string, version: number) {
    const children = {
      where: { projectId: id, sinceVersion: { lte: version } },
      omit: omitProjectId,
      orderBy: { sinceVersion: 'asc' },
    } as const
    const [snapshot, risks, reports] = await Promise.all([
      this.prisma.projectVersion.findUnique({
        where: { projectId_version: { projectId: id, version } },
        include: { project: true },
      }),
      this.prisma.projectRisk.findMany(children),
      this.prisma.projectReport.findMany(children),
    ])
    if (!snapshot) {
      throw new NotFoundException()
    }
    return { ...toProject(snapshot.project, snapshot), risks, reports }
  }

  async create(authorOid: string, data: ProjectData) {
    return await this.write(async (tx) => {
      const head = await tx.project.create({ data: {} })
      const first = await tx.projectVersion.create({
        data: { ...data, projectId: head.id, version: 1, authorOid },
      })
      await tx.project.update({ where: { id: head.id }, data: { currentVersionId: first.id } })
      return toProject(head, first)
    })
  }

  async update(authorOid: string, id: string, expectedVersion: number, change: Partial<ProjectData>) {
    return await this.write(async (tx) => {
      const { head, next } = await this.commit(tx, id, authorOid, change, expectedVersion)
      return toProject(head, next)
    })
  }

  async addRisk(authorOid: string, id: string, text: string) {
    return await this.write(async (tx) => {
      const { next } = await this.commit(tx, id, authorOid)
      return await tx.projectRisk.create({
        data: { projectId: id, sinceVersion: next.version, authorOid, text },
        omit: omitProjectId,
      })
    })
  }

  async addReport(authorOid: string, id: string, text: string) {
    return await this.write(async (tx) => {
      const { next } = await this.commit(tx, id, authorOid)
      return await tx.projectReport.create({
        data: { projectId: id, sinceVersion: next.version, authorOid, text },
        omit: omitProjectId,
      })
    })
  }

  /** Appends version N+1 = current data + change and makes it current. */
  private async commit(
    tx: Prisma.TransactionClient,
    id: string,
    authorOid: string,
    change: Partial<ProjectData> = {},
    expectedVersion?: number,
  ) {
    const head = await tx.project.findUnique({ where: { id }, include: { currentVersion: true } })
    if (!head) {
      throw new NotFoundException()
    }
    const current = currentOf(head)
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new ConflictException(`Project is at version ${current.version}, not ${expectedVersion}`)
    }
    const next = await tx.projectVersion.create({
      data: { ...dataOf(current), ...change, projectId: id, version: current.version + 1, authorOid },
    })
    await tx.project.update({ where: { id }, data: { currentVersionId: next.id } })
    return { head, next }
  }

  /** Two writers racing for the same next version collide on @@unique([projectId, version]). */
  private async write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Project was changed concurrently, retry')
      }
      throw error
    }
  }
}
