import "server-only";

import { prisma } from "@/lib/prisma";

let prepWeekEditLockColumnPromise: Promise<boolean> | null = null;

export async function hasPrepWeekEditLockColumn() {
  if (!prepWeekEditLockColumnPromise) {
    prepWeekEditLockColumnPromise = prisma
      .$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'PrepWeek'
            AND column_name = 'isEditLocked'
        ) AS "exists"
      `
      .then((rows) => Boolean(rows[0]?.exists))
      .catch(() => false);
  }

  return prepWeekEditLockColumnPromise;
}

export function prepWeekScalarSelect(includeEditLock: boolean) {
  return {
    id: true,
    workspaceId: true,
    name: true,
    startsOn: true,
    createdById: true,
    createdAt: true,
    updatedAt: true,
    ...(includeEditLock ? { isEditLocked: true } : {})
  };
}

export function withPrepWeekEditLock<T extends object>(value: T | null) {
  if (!value) {
    return null;
  }

  return {
    ...value,
    isEditLocked: "isEditLocked" in value ? Boolean((value as { isEditLocked?: boolean | null }).isEditLocked) : false
  } as T & { isEditLocked: boolean };
}
