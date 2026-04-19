import { NextResponse } from "next/server";

import { requireMembership } from "@/lib/auth";
import { formatDays, formatWindowLabel, getDayModeLabel, getModeSpeedupKey } from "@/lib/scheduler";
import { hasPrepWeekEditLockColumn, prepWeekScalarSelect, withPrepWeekEditLock } from "@/lib/prep-week-lock";
import { prisma } from "@/lib/prisma";

function escapeCsvValue(value: string | null | undefined) {
  const normalized = value ?? "";

  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function createCsvFilename(name: string) {
  const safeName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeName || "prep-week"}-schedule.csv`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ prepWeekId: string }> }
) {
  const { prepWeekId } = await params;
  const { membership } = await requireMembership();
  const includeEditLock = await hasPrepWeekEditLockColumn();

  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    },
    select: {
      ...prepWeekScalarSelect(includeEditLock),
      days: {
        include: {
          slots: {
            include: {
              submission: true
            },
            orderBy: { slotIndex: "asc" }
          }
        },
        orderBy: { dayNumber: "asc" }
      }
    }
  });
  const prepWeekWithLock = withPrepWeekEditLock(prepWeek);

  if (!prepWeekWithLock) {
    return new NextResponse("Prep week not found.", { status: 404 });
  }

  const headers = [
    "dayNumber",
    "dayLabel",
    "dayMode",
    "slotIndex",
    "startsAtUtc",
    "endsAtUtc",
    "assignedPlayer",
    "allianceTag",
    "preferredWindowUtc",
    "focusType",
    "focusValueDays",
    "notes",
    "isManualOverride"
  ];

  const rows = prepWeekWithLock.days.flatMap((day) => {
    const speedupKey = getModeSpeedupKey(day.mode);
    const focusType = speedupKey ? getDayModeLabel(day.mode) : "";

    return day.slots.map((slot) => [
      String(day.dayNumber),
      day.label,
      getDayModeLabel(day.mode),
      String(slot.slotIndex),
      slot.startsAtUtc,
      slot.endsAtUtc,
      slot.submission?.playerName || "",
      slot.submission?.allianceTag || "",
      slot.submission ? formatWindowLabel(slot.submission.preferredStartUtc, slot.submission.preferredEndUtc) : "",
      focusType,
      slot.submission && speedupKey ? formatDays(slot.submission[speedupKey]) : "",
      slot.submission?.notes || "",
      slot.isManualOverride ? "true" : "false"
    ]);
  });

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${createCsvFilename(prepWeekWithLock.name)}"`,
      "Cache-Control": "no-store"
    }
  });
}
