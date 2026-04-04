"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureOwner } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { createUserSchema, updateUserSchema } from "@/lib/validation";

export async function createUserAction(formData: FormData) {
  const owner = await ensureOwner();

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

  await prisma.user.create({
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

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateUserRoleAction(formData: FormData) {
  await ensureOwner();

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

  await prisma.$transaction([
    prisma.user.update({
      where: { id: parsed.data.userId },
      data: {
        username: parsed.data.username,
        displayName: parsed.data.username,
        isActive: parsed.data.isActive,
        ...(passwordHash ? { passwordHash } : {})
      }
    }),
    prisma.membership.update({
      where: { id: parsed.data.membershipId },
      data: { role: parsed.data.role }
    })
  ]);

  revalidatePath("/admin/users");
  redirect("/admin/users");
}
