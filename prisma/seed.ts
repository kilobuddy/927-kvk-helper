import { MembershipRole } from "@prisma/client";

import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

async function main() {
  const ownerUsername = process.env.OWNER_USERNAME;
  const ownerPassword = process.env.OWNER_PASSWORD;

  if (!ownerUsername || !ownerPassword) {
    throw new Error("OWNER_USERNAME and OWNER_PASSWORD must be set before running prisma seed.");
  }

  const workspace = await prisma.workspace.upsert({
    where: { slug: "kingdom-927" },
    update: {},
    create: {
      slug: "kingdom-927",
      name: "Kingdom 927"
    }
  });

  const passwordHash = await hashPassword(ownerPassword);

  const owner = await prisma.user.upsert({
    where: { username: ownerUsername },
    update: {
      passwordHash,
      isActive: true
    },
    create: {
      username: ownerUsername,
      displayName: "Primary Owner",
      passwordHash,
      isActive: true
    }
  });

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: owner.id
      }
    },
    update: {
      role: MembershipRole.OWNER
    },
    create: {
      workspaceId: workspace.id,
      userId: owner.id,
      role: MembershipRole.OWNER
    }
  });

  console.log("Seed complete.");
  console.log(`Owner username: ${ownerUsername}`);
  console.log("Owner password was loaded from OWNER_PASSWORD.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
