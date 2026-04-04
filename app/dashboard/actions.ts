"use server";

import { DayMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureCanEdit, requireMembership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const defaultDays = [
  { dayNumber: 1, label: "Day 1 - Construction", mode: DayMode.CONSTRUCTION },
  { dayNumber: 2, label: "Day 2 - Tech", mode: DayMode.RESEARCH },
  { dayNumber: 3, label: "Day 3 - Flexible", mode: DayMode.AUTO_APPROVE },
  { dayNumber: 4, label: "Day 4 - Troops", mode: DayMode.TROOP_TRAINING },
  { dayNumber: 5, label: "Day 5 - Last Day", mode: DayMode.AUTO_APPROVE }
];

export async function createPrepWeekAction(formData: FormData) {
  const { user, membership } = await ensureCanEdit();

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

  revalidatePath("/dashboard");
  redirect(`/prep-weeks/${prepWeek.id}`);
}

export async function openLatestPrepWeekAction() {
  const { membership } = await requireMembership();

  const prepWeek = await prisma.prepWeek.findFirst({
    where: { workspaceId: membership.workspaceId },
    orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }]
  });

  if (!prepWeek) {
    redirect("/dashboard");
  }

  redirect(`/prep-weeks/${prepWeek.id}`);
}
