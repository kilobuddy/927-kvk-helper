"use server";

import { redirect } from "next/navigation";

import { createSessionForUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    redirect("/login?error=missing");
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { memberships: true }
  });

  if (!user || !user.passwordHash || !user.isActive) {
    redirect("/login?error=invalid");
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    redirect("/login?error=invalid");
  }

  await createSessionForUser(user.id);
  redirect("/dashboard");
}
