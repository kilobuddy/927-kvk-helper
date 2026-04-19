import { NextResponse } from "next/server";

import { requireMembership } from "@/lib/auth";
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

  const prepWeek = await prisma.prepWeek.findFirst({
    where: {
      id: prepWeekId,
      workspaceId: membership.workspaceId
    },
    include: {
      submissions: {
        include: {
          createdBy: true
        },
        orderBy: [{ playerName: "asc" }]
      }
    }
  });

  if (!prepWeek) {
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

  const rows = prepWeek.submissions.map((submission) => [
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
      "Content-Disposition": `attachment; filename="${createCsvFilename(prepWeek.name)}"`,
      "Cache-Control": "no-store"
    }
  });
}
