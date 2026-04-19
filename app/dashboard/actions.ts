"use server";

import { DayMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAuditLog } from "@/lib/audit";
import { ensureOwner, requireMembership } from "@/lib/auth";
import { hasPrepWeekEditLockColumn, prepWeekScalarSelect } from "@/lib/prep-week-lock";
import { prisma } from "@/lib/prisma";

const defaultDays = [
  { dayNumber: 1, label: "Day 1 - Construction", mode: DayMode.CONSTRUCTION },
  { dayNumber: 2, label: "Day 2 - Tech", mode: DayMode.RESEARCH },
  { dayNumber: 3, label: "Day 3 - Flexible", mode: DayMode.AUTO_APPROVE },
  { dayNumber: 4, label: "Day 4 - Troops", mode: DayMode.TROOP_TRAINING },
  { dayNumber: 5, label: "Day 5 - Last Day", mode: DayMode.AUTO_APPROVE }
];

export async function createPrepWeekAction(formData: FormData) {
  const user = await ensureOwner();
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id
    }
  });

  if (!membership) {
    throw new Error("Owner workspace membership not found.");
  }

  const name = String(formData.get("name") || "").trim();
  const startsOnValue = String(formData.get("startsOn") || "").trim();

  if (!name) {
    throw new Error("Prep week name is required.");
  }

  const prepWeek = await prisma.prepWeek.create({
    data: {
      workspaceId: membership.workspaceId,
      name,
      startsOn: startsOnValue ? new Date(startsOnValue) : null,
      createdById: user.id,
      days: {
        create: defaultDays
      }
    }
  });

  await createAuditLog(prisma, {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    action: "CREATE_PREP_WEEK",
    entityType: "PrepWeek",
    entityId: prepWeek.id,
    summary: `Created prep week ${name}.`,
    details: {
      name,
      startsOn: startsOnValue || null
    }
  });

  revalidatePath("/dashboard");
  redirect(`/prep-weeks/${prepWeek.id}`);
}

export async function deletePrepWeekAction(formData: FormData) {
  const user = await ensureOwner();
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id
    }
  });

  if (!membership) {
    throw new Error("Owner workspace membership not found.");
  }

  const prepWeekId = String(formData.get("prepWeekId") || "");
  const includeEditLock = await hasPrepWeekEditLockColumn();

  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    },
    select: prepWeekScalarSelect(includeEditLock)
  });

  if (!prepWeek) {
    throw new Error("Prep week not found.");
  }

  await prisma.prepWeek.delete({
    where: {
      id: prepWeek.id
    }
  });

  await createAuditLog(prisma, {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    action: "DELETE_PREP_WEEK",
    entityType: "PrepWeek",
    entityId: prepWeek.id,
    summary: `Deleted prep week ${prepWeek.name}.`,
    details: {
      name: prepWeek.name,
      startsOn: prepWeek.startsOn?.toISOString() || null
    }
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function openLatestPrepWeekAction() {
  const { membership } = await requireMembership();
  const includeEditLock = await hasPrepWeekEditLockColumn();

  const prepWeek = await prisma.prepWeek.findFirst({
    where: { workspaceId: membership.workspaceId },
    select: prepWeekScalarSelect(includeEditLock),
    orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }]
  });

  if (!prepWeek) {
    redirect("/dashboard");
  }

  redirect(`/prep-weeks/${prepWeek.id}`);
}
