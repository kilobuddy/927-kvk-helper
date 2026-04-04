# 927-kvk-helper

Small static site for building Kingshot KvK Prep Week castle-role schedules.

## What it does

- Collects player submissions with speedup totals and preferred UTC windows
- Lets you choose which speedup type each prep day should prioritize
- Fills up to 48 half-hour slots per day for scheduled days
- Maximizes total assigned speedup value for that day within each player's allowed window
- Supports `Auto Approve` days that do not generate a schedule

## GitHub Pages

This repo is ready to publish as a static site on GitHub Pages.

1. Push this repo to GitHub.
2. In GitHub, open `Settings` > `Pages`.
3. Under `Build and deployment`, choose `GitHub Actions`.
4. Push to `main` or run the `Deploy static site to Pages` workflow manually.
5. GitHub will give you a public Pages URL like:

```text
https://<your-user-or-org>.github.io/927-kvk-helper/
```

Important:

- This version stores data in each browser's `localStorage`
- Shared login, shared records, and a real database are not included yet
- Every user who opens the Pages link gets their own local browser copy of the data

## Run it

Open [index.html](/c:/GIT/927-kvk-helper/index.html) in a browser.

If you prefer a local server, any static file server will work.

## Input format

Each player includes:

- Name
- General speedups in days
- Research speedups in days
- Construction speedups in days
- Troop training speedups in days
- Preferred UTC start and end in 1-hour intervals

The quick-paste box accepts:

```text
name,general,research,construction,troops,start,end
[PNX]Mando,13,12,13,22,00:00,01:00
```

## Scheduling assumptions

- One player can receive at most one slot per day
- Preferred windows are evaluated in UTC
- Start and end are selected in 1-hour UTC intervals from `00:00` to `24:00`
- `00:00` to `24:00` means full-day UTC availability
- Day 3 and Day 5 default to `Auto Approve`, which means no schedule is generated and whoever applies in game gets it

## Full App Direction

The repo now also includes backend-planning artifacts for the next version:

- [full-stack-plan.md](/c:/GIT/927-kvk-helper/docs/full-stack-plan.md)
- [schema.prisma](/c:/GIT/927-kvk-helper/prisma/schema.prisma)

That target version is intended to support:

- owner-approved user accounts
- editor permissions for schedule changes
- read-only viewer accounts
- shared database-backed prep weeks, submissions, and schedules

This branch now also includes an initial Next.js full-stack foundation:

- [package.json](/c:/GIT/927-kvk-helper/package.json)
- [layout.tsx](/c:/GIT/927-kvk-helper/app/layout.tsx)
- [page.tsx](/c:/GIT/927-kvk-helper/app/dashboard/page.tsx)
- [page.tsx](/c:/GIT/927-kvk-helper/app/admin/users/page.tsx)
- [page.tsx](/c:/GIT/927-kvk-helper/app/prep-weeks/[prepWeekId]/page.tsx)
- [auth.ts](/c:/GIT/927-kvk-helper/lib/auth.ts)
- [seed.ts](/c:/GIT/927-kvk-helper/prisma/seed.ts)

## Vercel Deploy

For the full-stack app, use the Vercel deployment guide here:

- [vercel-deploy.md](/c:/GIT/927-kvk-helper/docs/vercel-deploy.md)

Key runtime env vars:

- `DATABASE_URL`
- `SESSION_COOKIE_NAME`

## Full-Stack Local Setup

When you are ready to test the backend version locally:

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL` to a local Postgres database
3. Set `OWNER_USERNAME` and `OWNER_PASSWORD` for the seeded owner account
4. Optionally set `E2E_USERNAME` and `E2E_PASSWORD` for Playwright, or let them reuse the owner credentials
5. Install dependencies
6. Run Prisma generate and migration
7. Seed the owner account
8. Start Next.js

Example:

```powershell
copy .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Then open:

```text
http://localhost:3000/login
```

Seeded owner defaults:

- loaded from `OWNER_USERNAME`
- loaded from `OWNER_PASSWORD`

## What Works In The Full-Stack Branch

- owner-created users
- editor and viewer logins
- owner-only user management
- database-backed prep week creation
- database-backed player submissions
- read-only viewing for viewers
- write access for owners and editors

## Regression Testing

This repo now includes:

- unit tests for scheduler logic in [scheduler.test.ts](/c:/GIT/927-kvk-helper/tests/unit/scheduler.test.ts)
- Playwright end-to-end regression coverage in [regression.spec.ts](/c:/GIT/927-kvk-helper/tests/e2e/regression.spec.ts)

Install the browser once:

```powershell
npm run playwright:install
```

Run the fast unit checks:

```powershell
npm run test:unit
```

Run the browser regression suite:

```powershell
npm run test:e2e
```

Run the full regression pass:

```powershell
npm run test:regression
```

Playwright owner credentials are loaded from:

- `E2E_USERNAME` and `E2E_PASSWORD`, or
- `OWNER_USERNAME` and `OWNER_PASSWORD` as a fallback
