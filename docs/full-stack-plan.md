# Full Backend Plan

## Goal

Turn the current browser-only scheduler into a shared web app with:

- owner-created user accounts
- role-based permissions
- shared roster and schedule data
- saved prep weeks and manual edits

## Recommended stack

- Frontend and backend: `Next.js`
- Database: `PostgreSQL`
- ORM: `Prisma`
- Auth: `Auth.js` or `Clerk`
- Hosting: `Vercel` + `Neon` or `Supabase`

## Access model

Use two separate concepts:

1. `role`
- controls what an approved person may do

Suggested roles:

- `OWNER`
  The true administrator. Can create user accounts, change roles, and edit everything.
- `EDITOR`
  Can add players, edit submissions, generate schedules, and manually adjust slots.
- `VIEWER`
  Can view schedules and rosters but cannot change anything.

## Intended flows

### Owner bootstrap

1. The first owner account is created manually.
2. That owner is the only person who can create additional users.
3. New users are created directly with a role and workspace membership.

### Owner-created accounts

1. The owner opens an admin screen.
2. The owner creates a user account with username and role.
3. The owner assigns a temporary password or a permanent password directly.
4. The new user signs in and gets only the access allowed by their role.

### Approved editor

An editor can:

- create and update player submissions
- import roster data
- generate schedules
- manually override scheduled slots
- change day priorities

### Approved viewer

A viewer can:

- open prep weeks
- read submissions
- read schedules
- not write to any scheduling or roster endpoints

## Security rules

Do not rely on the UI alone.

The frontend should hide edit controls for viewers, but the backend must also reject unauthorized writes.

Example API rules:

- `GET /api/prep-weeks/:id`
  Allowed for `OWNER`, `EDITOR`, `VIEWER`
- `POST /api/player-submissions`
  Allowed for `OWNER`, `EDITOR`
- `POST /api/prep-weeks/:id/generate`
  Allowed for `OWNER`, `EDITOR`
- `PATCH /api/assignment-slots/:id`
  Allowed for `OWNER`, `EDITOR`
- `POST /api/admin/users`
  Allowed for `OWNER`
- `PATCH /api/admin/users/:id`
  Allowed for `OWNER`

## Data model summary

Core records:

- `User`
  Login identity and role ownership metadata
- `Workspace`
  A kingdom or scheduling space
- `Membership`
  Connects users to a workspace with a role
- `PrepWeek`
  A single KvK prep event
- `PlayerSubmission`
  A player's submitted speedups and availability for a prep week
- `PrepDay`
  Day rules such as construction, tech, troops, or auto approve
- `AssignmentSlot`
  Saved slot-level output for a day

## Migration plan

### Phase 1

- Create Next.js app shell
- Add Prisma and Postgres
- Add login
- Add owner-only user management screen

### Phase 2

- Move roster storage from `localStorage` into database tables
- Save prep weeks and submissions
- Save generated schedules

### Phase 3

- Add viewer/editor permissions in UI and backend
- Add manual slot override persistence
- Add audit history

### Phase 4

- Add CSV import/export
- Add password reset or password setup
- Add multi-workspace support if needed

## Short recommendation

If you want the cleanest path forward, rebuild this as a Next.js app while reusing the scheduling logic from the current `app.js` inside a server-side scheduling module.
