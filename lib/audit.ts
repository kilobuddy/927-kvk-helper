import { Prisma, PrismaClient } from "@prisma/client";

type AuditClient = PrismaClient | Prisma.TransactionClient;

type AuditEntry = {
  workspaceId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  details?: Prisma.InputJsonValue;
};

export async function createAuditLog(client: AuditClient, entry: AuditEntry) {
  return client.auditLog.create({
    data: {
      workspaceId: entry.workspaceId,
      actorUserId: entry.actorUserId || null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId || null,
      summary: entry.summary,
      details: entry.details
    }
  });
}

export function formatAuditTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
