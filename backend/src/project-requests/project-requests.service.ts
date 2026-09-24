import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { Prisma, type ProjectRequestVersion } from '../generated/prisma/client.js'
import PrismaService from '../prisma/prisma.service.js'

/** The versioned fields of a project request: everything on ProjectRequestVersion except its bookkeeping. */
export type ProjectRequestData = Omit<
  ProjectRequestVersion,
  'id' | 'projectRequestId' | 'version' | 'createdAt' | 'authorOid'
>

const omitRequestId = { projectRequestId: true } as const

// The destructured bookkeeping fields are there to be dropped.
/* eslint-disable @typescript-eslint/no-unused-vars */
const dataOf = ({
  id,
  projectRequestId,
  version,
  createdAt,
  authorOid,
  ...data
}: ProjectRequestVersion): ProjectRequestData => data
/* eslint-enable @typescript-eslint/no-unused-vars */

const toRequest = (head: { id: string; createdAt: Date }, current: ProjectRequestVersion) => ({
  id: head.id,
  createdAt: head.createdAt,
  version: current.version,
  updatedAt: current.createdAt,
  updatedBy: current.authorOid,
  ...dataOf(current),
})

const currentOf = (head: {
  id: string
  currentVersion: ProjectRequestVersion | null
}): ProjectRequestVersion => {
  if (!head.currentVersion) {
    throw new Error(`Project request ${head.id} has no current version`)
  }
  return head.currentVersion
}

/**
 * Project requests are append-only: each change inserts a ProjectRequestVersion (N+1) and moves the head's
 * currentVersionId to it. Adding a comment also appends a version, so a past state N
 * is that version plus the children with sinceVersion <= N.
 */
@Injectable()
export default class ProjectRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(take: number, skip: number) {
    const heads = await this.prisma.projectRequest.findMany({
      include: { currentVersion: true },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    })
    return heads.map((head) => toRequest(head, currentOf(head)))
  }

  async get(id: string) {
    const head = await this.prisma.projectRequest.findUnique({
      where: { id },
      include: {
        currentVersion: true,
        comments: { omit: omitRequestId, orderBy: { sinceVersion: 'asc' } },
      },
    })
    if (!head) {
      throw new NotFoundException()
    }
    return { ...toRequest(head, currentOf(head)), comments: head.comments }
  }

  async history(id: string) {
    const versions = await this.prisma.projectRequestVersion.findMany({
      where: { projectRequestId: id },
      omit: { id: true, projectRequestId: true },
      orderBy: { version: 'desc' },
    })
    if (versions.length === 0) {
      throw new NotFoundException()
    }
    return versions
  }

  async at(id: string, version: number) {
    const children = {
      where: { projectRequestId: id, sinceVersion: { lte: version } },
      omit: omitRequestId,
      orderBy: { sinceVersion: 'asc' },
    } as const
    const [snapshot, comments] = await Promise.all([
      this.prisma.projectRequestVersion.findUnique({
        where: { projectRequestId_version: { projectRequestId: id, version } },
        include: { projectRequest: true },
      }),
      this.prisma.projectRequestComment.findMany(children),
    ])
    if (!snapshot) {
      throw new NotFoundException()
    }
    return { ...toRequest(snapshot.projectRequest, snapshot), comments }
  }

  async create(authorOid: string, data: ProjectRequestData) {
    return await this.write(async (tx) => {
      const head = await tx.projectRequest.create({ data: {} })
      const first = await tx.projectRequestVersion.create({
        data: { ...data, projectRequestId: head.id, version: 1, authorOid },
      })
      await tx.projectRequest.update({ where: { id: head.id }, data: { currentVersionId: first.id } })
      return toRequest(head, first)
    })
  }

  async update(authorOid: string, id: string, expectedVersion: number, change: Partial<ProjectRequestData>) {
    return await this.write(async (tx) => {
      const { head, next } = await this.commit(tx, id, authorOid, change, expectedVersion)
      return toRequest(head, next)
    })
  }

  async addComment(authorOid: string, id: string, text: string) {
    return await this.write(async (tx) => {
      const { next } = await this.commit(tx, id, authorOid)
      return await tx.projectRequestComment.create({
        data: { projectRequestId: id, sinceVersion: next.version, authorOid, text },
        omit: omitRequestId,
      })
    })
  }

  /** Appends version N+1 = current data + change and makes it current. */
  private async commit(
    tx: Prisma.TransactionClient,
    id: string,
    authorOid: string,
    change: Partial<ProjectRequestData> = {},
    expectedVersion?: number,
  ) {
    const head = await tx.projectRequest.findUnique({ where: { id }, include: { currentVersion: true } })
    if (!head) {
      throw new NotFoundException()
    }
    const current = currentOf(head)
    if (expectedVersion !== undefined && expectedVersion !== current.version) {
      throw new ConflictException(`Project request is at version ${current.version}, not ${expectedVersion}`)
    }
    const next = await tx.projectRequestVersion.create({
      data: { ...dataOf(current), ...change, projectRequestId: id, version: current.version + 1, authorOid },
    })
    await tx.projectRequest.update({ where: { id }, data: { currentVersionId: next.id } })
    return { head, next }
  }

  /** Two writers racing for the same next version collide on @@unique([projectRequestId, version]). */
  private async write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Project request was changed concurrently, retry')
      }
      throw error
    }
  }
}
