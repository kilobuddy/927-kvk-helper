import { NextResponse } from "next/server";

import { requireMembership } from "@/lib/auth";
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

  return `${safeName || "prep-week"}-submissions.csv`;
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
      submissions: {
        include: {
          createdBy: true
        },
        orderBy: [{ playerName: "asc" }]
      }
    }
  });
  const prepWeekWithLock = withPrepWeekEditLock(prepWeek);

  if (!prepWeekWithLock) {
    return new NextResponse("Prep week not found.", { status: 404 });
  }

  const headers = [
    "playerName",
    "allianceTag",
    "generalSpeedups",
    "researchSpeedups",
    "constructionSpeedups",
    "troopTrainingSpeedups",
    "preferredStartUtc",
    "preferredEndUtc",
    "notes",
    "savedBy"
  ];

  const rows = prepWeekWithLock.submissions.map((submission) => [
    submission.playerName,
    submission.allianceTag || "",
    String(submission.generalSpeedups),
    String(submission.researchSpeedups),
    String(submission.constructionSpeedups),
    String(submission.troopTrainingSpeedups),
    submission.preferredStartUtc,
    submission.preferredEndUtc,
    submission.notes || "",
    submission.createdBy.displayName || submission.createdBy.username
  ]);

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
