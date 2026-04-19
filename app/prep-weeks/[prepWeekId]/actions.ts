"use server";

import { AssignmentSlot } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAuditLog } from "@/lib/audit";
import { ensureCanEdit, requireMembership } from "@/lib/auth";
import { allianceTagOptions } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { computeDaySchedule, SLOT_COUNT } from "@/lib/scheduler";
import { playerSubmissionSchema } from "@/lib/validation";

function normalizePlayerAndAlliance(rawPlayerName: string, explicitAllianceTag: string) {
  const playerName = rawPlayerName.trim();
  const allianceTag = explicitAllianceTag.trim().toUpperCase();

  if (allianceTagOptions.includes(allianceTag as (typeof allianceTagOptions)[number])) {
    return {
      playerName,
      allianceTag
    };
  }

  const bracketMatch = playerName.match(/^\[([A-Za-z]+)\](.+)$/);

  if (!bracketMatch) {
    return {
      playerName,
      allianceTag: ""
    };
  }

  const detectedTag = bracketMatch[1].toUpperCase();
  const detectedName = bracketMatch[2].trim();

  return {
    playerName: detectedName || playerName,
    allianceTag: allianceTagOptions.includes(detectedTag as (typeof allianceTagOptions)[number]) ? detectedTag : "OTHER"
  };
}

async function ensurePrepWeekAccess(prepWeekId: string) {
  const { user, membership } = await requireMembership();
  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    }
  });

  if (!prepWeek) {
    throw new Error("Prep week not found.");
  }

  return { user, membership, prepWeek };
}

export async function generateScheduleAction(prepWeekId: string, formData: FormData) {
  const { user, membership } = await ensureCanEdit();
  const useSameScheduleAllDays = String(formData.get("useSameScheduleAllDays") || "") === "true";
  const exportScheduleCsv = String(formData.get("exportScheduleCsv") || "") === "true";

  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    },
    include: {
      days: {
        orderBy: { dayNumber: "asc" }
      },
      submissions: true
    }
  });

  if (!prepWeek) {
    throw new Error("Prep week not found.");
  }

  const shouldShareAllDays = useSameScheduleAllDays && prepWeek.submissions.length < SLOT_COUNT;
  const templateDay =
    shouldShareAllDays
      ? prepWeek.days.find((day) => computeDaySchedule(day, prepWeek.submissions).autoApprove === false) || prepWeek.days[0]
      : null;
  const sharedSchedule = templateDay ? computeDaySchedule(templateDay, prepWeek.submissions) : null;
  const usingSharedAllDays = shouldShareAllDays && sharedSchedule?.autoApprove === false;
  const daySchedules = new Map(prepWeek.days.map((day) => [day.id, computeDaySchedule(day, prepWeek.submissions)]));
  const scheduledDayCount = prepWeek.days.filter((day) => (daySchedules.get(day.id) || computeDaySchedule(day, prepWeek.submissions)).autoApprove === false).length;

  const dayIds = prepWeek.days.map((day) => day.id);

  await prisma.$transaction(async (tx) => {
    await tx.assignmentSlot.deleteMany({
      where: {
        prepDayId: {
          in: dayIds
        }
      }
    });

    const rows: Omit<AssignmentSlot, "id" | "updatedAt">[] = [];

    prepWeek.days.forEach((day) => {
      const baseSchedule = daySchedules.get(day.id) || computeDaySchedule(day, prepWeek.submissions);
      const computed = usingSharedAllDays && baseSchedule.autoApprove === false ? sharedSchedule : baseSchedule;

      if (computed.autoApprove) {
        return;
      }

      computed.slots.forEach((slot) => {
        rows.push({
          prepDayId: day.id,
          slotIndex: slot.slotIndex,
          startsAtUtc: slot.startsAtUtc,
          endsAtUtc: slot.endsAtUtc,
          submissionId: slot.submission?.id || null,
          isManualOverride: false,
          updatedById: user.id
        });
      });
    });

    if (rows.length) {
      await tx.assignmentSlot.createMany({
        data: rows
      });
    }

    await createAuditLog(tx, {
      workspaceId: membership.workspaceId,
      actorUserId: user.id,
      action: "GENERATE_SCHEDULE",
      entityType: "PrepWeek",
      entityId: prepWeek.id,
      summary: `Generated schedules for ${prepWeek.name}.`,
      details: {
        scheduledDays: scheduledDayCount,
        submissionCount: prepWeek.submissions.length,
        sharedAcrossDays: usingSharedAllDays
      }
    });
  });

  revalidatePath(`/prep-weeks/${prepWeekId}`);

  if (exportScheduleCsv) {
    redirect(`/prep-weeks/${prepWeekId}/schedule.csv`);
  }
}

export async function updateSlotAssignmentAction(prepWeekId: string, formData: FormData) {
  const { user, membership } = await ensureCanEdit();

  const prepDayId = String(formData.get("prepDayId") || "");
  const slotIndex = Number.parseInt(String(formData.get("slotIndex") || ""), 10);
  const submissionIdRaw = String(formData.get("submissionId") || "");
  const submissionId = submissionIdRaw || null;

  const prepDay = await prisma.prepDay.findFirst({
    where: {
      id: prepDayId,
      prepWeekId,
      prepWeek: {
        workspaceId: membership.workspaceId
      }
    },
    include: {
      prepWeek: {
        include: {
          submissions: true
        }
      },
      slots: true
    }
  });

  if (!prepDay || Number.isNaN(slotIndex)) {
    throw new Error("Invalid slot update.");
  }

  const baseSlot = prepDay.slots.find((slot) => slot.slotIndex === slotIndex);
  const startsAtUtc = baseSlot?.startsAtUtc || `${String(Math.floor((slotIndex * 30) / 60)).padStart(2, "0")}:${slotIndex % 2 === 0 ? "00" : "30"}`;
  const endsAtUtc = baseSlot?.endsAtUtc || `${String(Math.floor(((slotIndex + 1) * 30) / 60)).padStart(2, "0")}:${(slotIndex + 1) % 2 === 0 ? "00" : "30"}`;

  if (submissionId) {
    const submission = prepDay.prepWeek.submissions.find((item) => item.id === submissionId);

    if (!submission) {
      throw new Error("Submission not found.");
    }
  }

  await prisma.$transaction(async (tx) => {
    if (submissionId) {
      await tx.assignmentSlot.updateMany({
        where: {
          prepDayId,
          submissionId
        },
        data: {
          submissionId: null,
          isManualOverride: true,
          updatedById: user.id
        }
      });
    }

    await tx.assignmentSlot.upsert({
      where: {
        prepDayId_slotIndex: {
          prepDayId,
          slotIndex
        }
      },
      update: {
        submissionId,
        isManualOverride: true,
        updatedById: user.id
      },
      create: {
        prepDayId,
        slotIndex,
        startsAtUtc,
        endsAtUtc,
        submissionId,
        isManualOverride: true,
        updatedById: user.id
      }
    });

    await createAuditLog(tx, {
      workspaceId: membership.workspaceId,
      actorUserId: user.id,
      action: "MANUAL_OVERRIDE_SLOT",
      entityType: "PrepDay",
      entityId: prepDayId,
      summary: `Updated slot ${slotIndex} on ${prepDay.label}.`,
      details: {
        prepWeekId,
        prepDayId,
        slotIndex,
        submissionId
      }
    });
  });

  revalidatePath(`/prep-weeks/${prepWeekId}`);
  redirect(`/prep-weeks/${prepWeekId}`);
}

export async function createSubmissionAction(prepWeekId: string, formData: FormData) {
  const { user, membership } = await ensureCanEdit();
  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    }
  });

  if (!prepWeek) {
    throw new Error("Prep week not found.");
  }

  const parsed = playerSubmissionSchema.safeParse({
    playerName: formData.get("playerName"),
    allianceTag: formData.get("allianceTag"),
    generalSpeedups: formData.get("generalSpeedups"),
    researchSpeedups: formData.get("researchSpeedups"),
    constructionSpeedups: formData.get("constructionSpeedups"),
    troopTrainingSpeedups: formData.get("troopTrainingSpeedups"),
    preferredStartUtc: formData.get("preferredStartUtc"),
    preferredEndUtc: formData.get("preferredEndUtc"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid submission.");
  }

  const createdSubmission = await prisma.playerSubmission.create({
    data: {
      prepWeekId,
      playerName: parsed.data.playerName,
      allianceTag: parsed.data.allianceTag || null,
      generalSpeedups: parsed.data.generalSpeedups,
      researchSpeedups: parsed.data.researchSpeedups,
      constructionSpeedups: parsed.data.constructionSpeedups,
      troopTrainingSpeedups: parsed.data.troopTrainingSpeedups,
      preferredStartUtc: parsed.data.preferredStartUtc,
      preferredEndUtc: parsed.data.preferredEndUtc,
      notes: parsed.data.notes || null,
      createdById: user.id
    }
  });

  await createAuditLog(prisma, {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    action: "CREATE_SUBMISSION",
    entityType: "PlayerSubmission",
    entityId: createdSubmission.id,
    summary: `Added player submission for ${parsed.data.playerName}.`,
    details: {
      playerName: parsed.data.playerName,
      allianceTag: parsed.data.allianceTag || null
    }
  });

  revalidatePath(`/prep-weeks/${prepWeekId}`);
}

export async function bulkCreateSubmissionsAction(prepWeekId: string, formData: FormData) {
  const { user, membership } = await ensureCanEdit();

  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    }
  });

  if (!prepWeek) {
    throw new Error("Prep week not found.");
  }

  const rawInput = String(formData.get("bulkInput") || "");
  const lines = rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Paste at least one player line to import.");
  }

  const parsedRows = lines.map((line, index) => {
    const parts = line.split(",").map((part) => part.trim());
    const hasExplicitAllianceTag = parts.length >= 8 && allianceTagOptions.includes(parts[1] as (typeof allianceTagOptions)[number]);
    const [rawPlayerName, rawAllianceTag, generalSpeedups, researchSpeedups, constructionSpeedups, troopTrainingSpeedups, preferredStartUtc, preferredEndUtc, ...noteParts] =
      hasExplicitAllianceTag
        ? parts
        : [parts[0], "", parts[1], parts[2], parts[3], parts[4], parts[5], parts[6], ...parts.slice(7)];
    const normalized = normalizePlayerAndAlliance(rawPlayerName, rawAllianceTag);

    const result = playerSubmissionSchema.safeParse({
      playerName: normalized.playerName,
      allianceTag: normalized.allianceTag,
      generalSpeedups,
      researchSpeedups,
      constructionSpeedups,
      troopTrainingSpeedups,
      preferredStartUtc,
      preferredEndUtc,
      notes: noteParts.join(", ")
    });

    if (!result.success) {
      throw new Error(`Line ${index + 1}: ${result.error.issues[0]?.message || "Invalid row."}`);
    }

    return result.data;
  });

  await prisma.playerSubmission.createMany({
    data: parsedRows.map((row) => ({
      prepWeekId,
      playerName: row.playerName,
      allianceTag: row.allianceTag || null,
      generalSpeedups: row.generalSpeedups,
      researchSpeedups: row.researchSpeedups,
      constructionSpeedups: row.constructionSpeedups,
      troopTrainingSpeedups: row.troopTrainingSpeedups,
      preferredStartUtc: row.preferredStartUtc,
      preferredEndUtc: row.preferredEndUtc,
      notes: row.notes || null,
      createdById: user.id
    }))
  });

  await createAuditLog(prisma, {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    action: "BULK_CREATE_SUBMISSIONS",
    entityType: "PrepWeek",
    entityId: prepWeekId,
    summary: `Imported ${parsedRows.length} player submissions.`,
    details: {
      count: parsedRows.length,
      playerNames: parsedRows.map((row) => row.playerName)
    }
  });

  revalidatePath(`/prep-weeks/${prepWeekId}`);
}

export async function updateSubmissionAction(prepWeekId: string, submissionId: string, formData: FormData) {
  const { user, membership } = await ensureCanEdit();

  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    }
  });

  if (!prepWeek) {
    throw new Error("Prep week not found.");
  }

  const parsed = playerSubmissionSchema.safeParse({
    playerName: formData.get("playerName"),
    allianceTag: formData.get("allianceTag"),
    generalSpeedups: formData.get("generalSpeedups"),
    researchSpeedups: formData.get("researchSpeedups"),
    constructionSpeedups: formData.get("constructionSpeedups"),
    troopTrainingSpeedups: formData.get("troopTrainingSpeedups"),
    preferredStartUtc: formData.get("preferredStartUtc"),
    preferredEndUtc: formData.get("preferredEndUtc"),
    notes: formData.get("notes")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid submission.");
  }

  const existingSubmission = await prisma.playerSubmission.findFirst({
    where: {
      id: submissionId,
      prepWeekId,
      prepWeek: {
        workspaceId: membership.workspaceId
      }
    }
  });

  await prisma.playerSubmission.updateMany({
    where: {
      id: submissionId,
      prepWeekId,
      prepWeek: {
        workspaceId: membership.workspaceId
      }
    },
    data: {
      playerName: parsed.data.playerName,
      allianceTag: parsed.data.allianceTag || null,
      generalSpeedups: parsed.data.generalSpeedups,
      researchSpeedups: parsed.data.researchSpeedups,
      constructionSpeedups: parsed.data.constructionSpeedups,
      troopTrainingSpeedups: parsed.data.troopTrainingSpeedups,
      preferredStartUtc: parsed.data.preferredStartUtc,
      preferredEndUtc: parsed.data.preferredEndUtc,
      notes: parsed.data.notes || null,
      createdById: user.id
    }
  });

  await createAuditLog(prisma, {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    action: "UPDATE_SUBMISSION",
    entityType: "PlayerSubmission",
    entityId: submissionId,
    summary: `Updated player submission for ${parsed.data.playerName}.`,
    details: {
      previousPlayerName: existingSubmission?.playerName || null,
      playerName: parsed.data.playerName
    }
  });

  revalidatePath(`/prep-weeks/${prepWeekId}`);
}

export async function deleteSubmissionAction(prepWeekId: string, submissionId: string) {
  const { user, membership } = await ensureCanEdit();

  const existingSubmission = await prisma.playerSubmission.findFirst({
    where: {
      id: submissionId,
      prepWeekId,
      prepWeek: {
        workspaceId: membership.workspaceId
      }
    }
  });

  await prisma.playerSubmission.deleteMany({
    where: {
      id: submissionId,
      prepWeekId,
      prepWeek: {
        workspaceId: membership.workspaceId
      }
    }
  });

  await createAuditLog(prisma, {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    action: "DELETE_SUBMISSION",
    entityType: "PlayerSubmission",
    entityId: submissionId,
    summary: `Deleted player submission for ${existingSubmission?.playerName || "unknown player"}.`,
    details: {
      playerName: existingSubmission?.playerName || null
    }
  });

  revalidatePath(`/prep-weeks/${prepWeekId}`);
}

export async function updateDayModeAction(prepWeekId: string, formData: FormData) {
  const { user, membership } = await ensureCanEdit();

  const prepDayId = String(formData.get("prepDayId") || "");
  const mode = String(formData.get("mode") || "");

  const validModes = ["AUTO_APPROVE", "CONSTRUCTION", "RESEARCH", "GENERAL", "TROOP_TRAINING"] as const;

  if (!validModes.includes(mode as (typeof validModes)[number])) {
    throw new Error("Invalid day mode.");
  }

  const existingDay = await prisma.prepDay.findFirst({
    where: {
      id: prepDayId,
      prepWeekId,
      prepWeek: {
        workspaceId: membership.workspaceId
      }
    }
  });

  await prisma.prepDay.updateMany({
    where: {
      id: prepDayId,
      prepWeekId,
      prepWeek: {
        workspaceId: membership.workspaceId
      }
    },
    data: {
      mode: mode as (typeof validModes)[number]
    }
  });

  await createAuditLog(prisma, {
    workspaceId: membership.workspaceId,
    actorUserId: user.id,
    action: "UPDATE_DAY_MODE",
    entityType: "PrepDay",
    entityId: prepDayId,
    summary: `Changed ${existingDay?.label || "prep day"} to ${mode}.`,
    details: {
      previousMode: existingDay?.mode || null,
      mode
    }
  });

  revalidatePath(`/prep-weeks/${prepWeekId}`);
  redirect(`/prep-weeks/${prepWeekId}`);
}
