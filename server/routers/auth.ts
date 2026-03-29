// auth.ts — API key CRUD (create, list, revoke)

import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter } from '../trpc/trpc.js'
import { dashboardProcedure } from '../trpc/guards.js'
import { db } from '../db/index.js'
import { apiKeys, projects } from '../db/schema.js'
import { generateApiKey, hashApiKey } from '../lib/hashKey.js'
import { writeAuditLog } from '../lib/audit.js'

const VALID_SCOPES = ['tasks:write', 'tasks:read', 'diffs:read'] as const

export const authRouter = createTRPCRouter({
  // Create a new API key for a project
  createApiKey: dashboardProcedure.input(
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(80),
      scopes: z.array(z.enum(VALID_SCOPES)).min(1),
      expiresAt: z.string().datetime().optional(),
    }),
  ).mutation(async ({ ctx, input }) => {
    const { teamId, userId } = ctx.auth

    // Verify project belongs to team
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.teamId, teamId)))
      .limit(1)

    if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' })

    const rawKey = generateApiKey()
    const keyHash = hashApiKey(rawKey)

    const [key] = await db.insert(apiKeys).values({
      projectId: input.projectId,
      name: input.name,
      keyHash,
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }).returning({ id: apiKeys.id, name: apiKeys.name, scopes: apiKeys.scopes, createdAt: apiKeys.createdAt })

    await writeAuditLog({
      teamId,
      actorId: userId,
      action: 'apikey.created',
      resourceType: 'apikey',
      resourceId: key!.id,
      metadata: { projectId: input.projectId, scopes: input.scopes },
    })

    // Return the raw key ONCE — never again
    return { ...key, rawKey }
  }),

  // List API keys for a project (no key hashes exposed)
  listApiKeys: dashboardProcedure.input(
    z.object({ projectId: z.string().uuid() }),
  ).query(async ({ ctx, input }) => {
    const { teamId } = ctx.auth

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.teamId, teamId)))
      .limit(1)

    if (!project) throw new TRPCError({ code: 'NOT_FOUND' })

    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        scopes: apiKeys.scopes,
        revoked: apiKeys.revoked,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.projectId, input.projectId))
  }),

  // Revoke an API key
  revokeApiKey: dashboardProcedure.input(
    z.object({ keyId: z.string().uuid() }),
  ).mutation(async ({ ctx, input }) => {
    const { teamId, userId } = ctx.auth

    // Verify key belongs to team via project
    const [row] = await db
      .select({ key: apiKeys, project: projects })
      .from(apiKeys)
      .innerJoin(projects, eq(projects.id, apiKeys.projectId))
      .where(and(eq(apiKeys.id, input.keyId), eq(projects.teamId, teamId)))
      .limit(1)

    if (!row) throw new TRPCError({ code: 'NOT_FOUND' })

    await db.update(apiKeys).set({ revoked: true }).where(eq(apiKeys.id, input.keyId))
    await writeAuditLog({
      teamId,
      actorId: userId,
      action: 'apikey.revoked',
      resourceType: 'apikey',
      resourceId: input.keyId,
    })

    return { success: true }
  }),
})
