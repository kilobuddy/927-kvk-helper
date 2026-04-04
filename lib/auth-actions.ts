"use server";

import { redirect } from "next/navigation";

import { clearSession } from "@/lib/auth";

export async function signOutAction() {
  await clearSession();
  redirect("/login");
}
