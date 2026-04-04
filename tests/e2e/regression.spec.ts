import { test, expect } from "@playwright/test";

import { prisma } from "../../lib/prisma";

const ownerUsername = process.env.E2E_USERNAME || process.env.OWNER_USERNAME;
const ownerPassword = process.env.E2E_PASSWORD || process.env.OWNER_PASSWORD;
const prepWeekPrefix = "E2E Regression";
const usernamePrefix = "e2e-regression-";

async function login(page: import("@playwright/test").Page) {
  if (!ownerUsername || !ownerPassword) {
    throw new Error("OWNER_USERNAME/OWNER_PASSWORD or E2E_USERNAME/E2E_PASSWORD must be set for Playwright tests.");
  }

  await page.goto("/login");
  await page.getByLabel("Username").fill(ownerUsername);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("full regression flows", () => {
  test.beforeAll(async () => {
    await prisma.prepWeek.deleteMany({
      where: {
        name: {
          startsWith: prepWeekPrefix
        }
      }
    });

    const users = await prisma.user.findMany({
      where: {
        username: {
          startsWith: usernamePrefix
        }
      },
      select: {
        id: true
      }
    });

    const userIds = users.map((user) => user.id);

    if (userIds.length) {
      await prisma.session.deleteMany({
        where: {
          userId: {
            in: userIds
          }
        }
      });

      await prisma.membership.deleteMany({
        where: {
          userId: {
            in: userIds
          }
        }
      });

      await prisma.user.deleteMany({
        where: {
          id: {
            in: userIds
          }
        }
      });
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("owner can create and edit a user from the admin screen", async ({ page }) => {
    const createdUsername = `${usernamePrefix}${Date.now()}`;

    await login(page);
    await page.getByRole("link", { name: "Manage Users" }).click();
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    const createUserCard = page.locator("section.card").filter({ hasText: "Create user" }).first();
    await createUserCard.getByLabel("Username").fill(createdUsername);
    await createUserCard.getByLabel("Temporary password").fill("Password123!");
    await createUserCard.getByLabel("Role").selectOption("VIEWER");
    await createUserCard.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByText(createdUsername, { exact: true })).toBeVisible();

    const userCard = page.locator("details.card").filter({ hasText: createdUsername }).first();
    await userCard.getByText("Edit", { exact: true }).click();
    await userCard.getByLabel("New password").fill("Password456!");
    await userCard.getByLabel("Access role").selectOption("EDITOR");
    await userCard.getByLabel("Status").selectOption("false");
    await userCard.getByRole("button", { name: "Save User" }).click();

    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByText(`${createdUsername}EDITOR | Disabled`)).toBeVisible();
  });

  test("owner prep-week workflow covers manual add, bulk paste, generation, override, and delete", async ({ page }) => {
    const prepWeekName = `${prepWeekPrefix} ${Date.now()}`;

    await login(page);
    const createPrepWeekCard = page.locator("section.card").filter({ hasText: "Create prep week" }).first();
    await createPrepWeekCard.getByLabel("Prep week name").fill(prepWeekName);
    await createPrepWeekCard.getByRole("button", { name: "Create Prep Week" }).click();

    let createdPrepWeekId: string | null = null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const prepWeek = await prisma.prepWeek.findFirst({
        where: { name: prepWeekName },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      });

      if (prepWeek?.id) {
        createdPrepWeekId = prepWeek.id;
        break;
      }

      await page.waitForTimeout(250);
    }

    expect(createdPrepWeekId).not.toBeNull();

    await page.waitForURL(new RegExp(`/prep-weeks/${createdPrepWeekId}`));
    await expect(page.locator("h1")).toContainText(prepWeekName);
    await expect(page.getByText("0 saved players")).toBeVisible();

    const addPlayerCard = page.locator("section.card").filter({ hasText: "Add player" }).first();
    await addPlayerCard.locator('select[name="allianceTag"]').selectOption("HEL");
    await addPlayerCard.locator('input[name="playerName"]').fill("KILO");
    await addPlayerCard.locator('input[name="generalSpeedups"]').fill("0");
    await addPlayerCard.locator('input[name="researchSpeedups"]').fill("0");
    await addPlayerCard.locator('input[name="constructionSpeedups"]').fill("4000");
    await addPlayerCard.locator('input[name="troopTrainingSpeedups"]').fill("0");
    await addPlayerCard.locator('select[name="preferredStartUtc"]').selectOption("00:00");
    await addPlayerCard.locator('select[name="preferredEndUtc"]').selectOption("03:00");
    await addPlayerCard.getByRole("button", { name: "Add Player" }).click();

    await expect(page.getByText("1 saved player")).toBeVisible();

    const bulkPasteCard = page.locator("section.card").filter({ hasText: "Quick paste" }).first();
    await bulkPasteCard.locator('textarea[name="bulkInput"]').fill(
      "Player024,OTHER,0,0,1000,0,00:00,03:00\nPlayer003,SKY,0,0,2000,0,02:00,05:00"
    );
    await bulkPasteCard.getByRole("button", { name: "Import Lines" }).click();

    await expect(page.getByText("3 saved players")).toBeVisible();

    await page.getByRole("button", { name: "Generate Schedule" }).first().click();
    const dayOneCard = page.locator("section.schedule-card").filter({ hasText: "Day 1 - Construction" }).first();
    await expect(page.getByRole("heading", { name: "Day 1 - Construction" })).toBeVisible();
    await expect(dayOneCard.locator("tbody")).toContainText("[HEL]KILO");
    const firstSlotRow = dayOneCard.locator("tr").filter({ hasText: "00:00 - 00:30" }).first();
    await firstSlotRow.getByText("Edit", { exact: true }).click();
    const player024Value = await firstSlotRow.locator("option").filter({ hasText: "[OTHER]Player024" }).first().getAttribute("value");
    expect(player024Value).toBeTruthy();
    await firstSlotRow.getByRole("combobox").selectOption(player024Value!);

    await expect(page).toHaveURL(new RegExp("/prep-weeks/.+"));
    await expect(firstSlotRow.locator("td").nth(1)).toContainText("[OTHER]Player024");
    await expect(firstSlotRow.locator("td").nth(2)).toContainText("Construction: 1000 days");

    await page.getByText("View", { exact: true }).click();
    const playerRow = page.locator("tr").filter({ hasText: "[SKY]Player003" }).first();
    await playerRow.getByText("Edit", { exact: true }).click();
    await playerRow.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("2 saved players")).toBeVisible();
  });
});
