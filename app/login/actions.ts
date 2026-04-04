"use server";

import { redirect } from "next/navigation";

import { createSessionForUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    throw new Error("Username and password are required.");
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { memberships: true }
  });

  if (!user || !user.passwordHash || !user.isActive) {
    throw new Error("Invalid username or password.");
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new Error("Invalid username or password.");
  }

  await createSessionForUser(user.id);
  redirect("/dashboard");
}
