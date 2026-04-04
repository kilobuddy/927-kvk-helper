# Vercel Deploy

This app is ready to deploy to Vercel as a Next.js app backed by PostgreSQL.

## Recommended stack

- App hosting: `Vercel`
- Database: `Neon Postgres` or another hosted PostgreSQL provider

## Required environment variables

Set these in the Vercel project settings:

```text
DATABASE_URL=
SESSION_COOKIE_NAME=kvk_prep_session
```

For one-time owner bootstrap or manual owner reset, also set these in the environment you use to run the scripts:

```text
OWNER_USERNAME=
OWNER_PASSWORD=
```

Optional for Playwright:

```text
E2E_USERNAME=
E2E_PASSWORD=
```

## Build and install behavior

This repo now includes:

- `postinstall`: `prisma generate`
- `build`: `next build`

That means Vercel will generate the Prisma client automatically during install/build.

## Database migration workflow

Do not use `prisma migrate dev` in production.

For production deployment use:

```powershell
npm run prisma:migrate:deploy
```

You can run that from your local machine against the production `DATABASE_URL`, or from a trusted CI/deployment step.

## Suggested first deploy flow

1. Create the Postgres database.
2. Add `DATABASE_URL` and `SESSION_COOKIE_NAME` in Vercel.
3. Deploy the app to Vercel.
4. Run production migrations:

```powershell
npm run prisma:migrate:deploy
```

5. Seed or reset the owner account using the production database URL plus owner env vars:

```powershell
npm run user:set-owner
```

6. Sign in on the live site with the owner username and password you supplied through environment variables.

## Important notes

- Do not commit real credentials into `.env.example` or source files.
- Do not run `prisma:seed` automatically on every deploy.
- Keep `OWNER_PASSWORD` out of Vercel long-term unless you intentionally need it there for a one-off job.
- After owner bootstrap, store the password securely and remove temporary secrets where possible.
