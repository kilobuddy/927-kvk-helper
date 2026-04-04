"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAuditLog } from "@/lib/audit";
import { ensureOwner } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createUserSchema, updateUserSchema } from "@/lib/validation";

export async function createUserAction(formData: FormData) {
  const owner = await ensureOwner();
  const ownerMembership = await prisma.membership.findFirst({
    where: {
      userId: owner.id
    }
  });

  if (!ownerMembership) {
    throw new Error("Owner workspace membership not found.");
  }

  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    workspaceId: formData.get("workspaceId"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid input.");
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const createdUser = await prisma.user.create({
    data: {
      username: parsed.data.username,
      displayName: parsed.data.username,
      passwordHash,
      isActive: true,
      createdById: owner.id,
      memberships: {
        create: {
          workspaceId: parsed.data.workspaceId,
          role: parsed.data.role
        }
      }
    }
  });

  await createAuditLog(prisma, {
    workspaceId: parsed.data.workspaceId,
    actorUserId: owner.id,
    action: "CREATE_USER",
    entityType: "User",
    entityId: createdUser.id,
    summary: `Created user ${parsed.data.username} with ${parsed.data.role} access.`,
    details: {
      username: parsed.data.username,
      role: parsed.data.role
    }
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateUserRoleAction(formData: FormData) {
  const owner = await ensureOwner();
  const ownerMembership = await prisma.membership.findFirst({
    where: {
      userId: owner.id
    }
  });

  if (!ownerMembership) {
    throw new Error("Owner workspace membership not found.");
  }

  const parsed = updateUserSchema.safeParse({
    userId: formData.get("userId"),
    membershipId: formData.get("membershipId"),
    username: formData.get("username"),
    password: formData.get("password"),
    role: formData.get("role"),
    isActive: formData.get("isActive") === "true"
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid update.");
  }

  const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : null;

  const existingMembership = await prisma.membership.findUnique({
    where: { id: parsed.data.membershipId },
    include: {
      user: true
    }
  });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: parsed.data.userId },
      data: {
        username: parsed.data.username,
        displayName: parsed.data.username,
        isActive: parsed.data.isActive,
        ...(passwordHash ? { passwordHash } : {})
      }
    });

    await tx.membership.update({
      where: { id: parsed.data.membershipId },
      data: { role: parsed.data.role }
    });

    await createAuditLog(tx, {
      workspaceId: existingMembership?.workspaceId || ownerMembership.workspaceId,
      actorUserId: owner.id,
      action: "UPDATE_USER",
      entityType: "User",
      entityId: parsed.data.userId,
      summary: `Updated user ${parsed.data.username}.`,
      details: {
        previousUsername: existingMembership?.user.username || null,
        username: parsed.data.username,
        previousRole: existingMembership?.role || null,
        role: parsed.data.role,
        previousIsActive: existingMembership?.user.isActive ?? null,
        isActive: parsed.data.isActive,
        passwordChanged: Boolean(passwordHash)
      }
    });
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}
