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
