import { MembershipRole } from "@prisma/client";

import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

async function main() {
  const ownerUsername = process.env.OWNER_USERNAME;
  const ownerPassword = process.env.OWNER_PASSWORD;

  if (!ownerUsername || !ownerPassword) {
    throw new Error("OWNER_USERNAME and OWNER_PASSWORD must be set before running user:set-owner.");
  }

  const passwordHash = await hashPassword(ownerPassword);

  const workspace = await prisma.workspace.upsert({
    where: { slug: "kingdom-927" },
    update: {},
    create: {
      slug: "kingdom-927",
      name: "Kingdom 927"
    }
  });

  let owner = await prisma.user.findFirst({
    where: {
      memberships: {
        some: {
          role: MembershipRole.OWNER
        }
      }
    },
    include: {
      memberships: true
    }
  });

  if (owner) {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: {
        username: ownerUsername,
        displayName: owner.displayName || "Primary Owner",
        passwordHash,
        isActive: true
      },
      include: {
        memberships: true
      }
    });
  } else {
    owner = await prisma.user.create({
      data: {
        username: ownerUsername,
        displayName: "Primary Owner",
        passwordHash,
        isActive: true
      },
      include: {
        memberships: true
      }
    });
  }

  const existingOwnerMembership = owner.memberships.find((membership) => membership.role === MembershipRole.OWNER);

  if (!existingOwnerMembership) {
    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        role: MembershipRole.OWNER
      }
    });
  }

  await prisma.user.updateMany({
    where: {
      NOT: { id: owner.id },
      username: "owner"
    },
    data: {
      isActive: false
    }
  });

  console.log(`Owner login updated: ${ownerUsername}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
