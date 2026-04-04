import "server-only";

import { MembershipRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "kvk_prep_session";

export async function createSessionForUser(userId: string) {
  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: { token }
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: true
    }
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function getCurrentMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" }
  });
}

export async function requireMembership() {
  const user = await requireUser();
  const membership = await getCurrentMembership(user.id);

  if (!membership) {
    redirect("/login");
  }

  return { user, membership };
}

export async function ensureCanEdit() {
  const { user, membership } = await requireMembership();

  if (membership.role !== MembershipRole.OWNER && membership.role !== MembershipRole.EDITOR) {
    redirect("/dashboard");
  }

  return { user, membership };
}

export async function ensureOwner() {
  const { user, membership } = await requireMembership();

  if (membership.role !== MembershipRole.OWNER) {
    redirect("/dashboard");
  }

  return user;
}
