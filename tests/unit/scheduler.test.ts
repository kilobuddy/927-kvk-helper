import test from "node:test";
import assert from "node:assert/strict";
import { DayMode, type AssignmentSlot, type PlayerSubmission, type PrepDay } from "@prisma/client";

import { buildEligibleOptionsForSlot, computeDaySchedule, isSubmissionEligibleForSlot, mergeManualAssignments } from "../../lib/scheduler";

function createSubmission(overrides: Partial<PlayerSubmission> & Pick<PlayerSubmission, "id" | "playerName">): PlayerSubmission {
  return {
    id: overrides.id,
    prepWeekId: overrides.prepWeekId || "prep-week-1",
    playerName: overrides.playerName,
    allianceTag: overrides.allianceTag ?? null,
    generalSpeedups: overrides.generalSpeedups ?? (0 as never),
    researchSpeedups: overrides.researchSpeedups ?? (0 as never),
    constructionSpeedups: overrides.constructionSpeedups ?? (0 as never),
    troopTrainingSpeedups: overrides.troopTrainingSpeedups ?? (0 as never),
    preferredStartUtc: overrides.preferredStartUtc || "00:00",
    preferredEndUtc: overrides.preferredEndUtc || "24:00",
    notes: overrides.notes ?? null,
    createdById: overrides.createdById || "user-1",
    createdAt: overrides.createdAt || new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt || new Date("2026-04-01T00:00:00.000Z")
  };
}

function createDay(mode: DayMode): PrepDay {
  return {
    id: "day-1",
    prepWeekId: "prep-week-1",
    dayNumber: 1,
    label: "Day 1 - Construction",
    mode,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z")
  };
}

test("computeDaySchedule keeps only the top players when slots are limited", () => {
  const day = createDay(DayMode.CONSTRUCTION);
  const submissions = [
    createSubmission({
      id: "high",
      playerName: "High",
      constructionSpeedups: 300 as never,
      preferredStartUtc: "00:00",
      preferredEndUtc: "01:00"
    }),
    createSubmission({
      id: "mid",
      playerName: "Mid",
      constructionSpeedups: 200 as never,
      preferredStartUtc: "00:00",
      preferredEndUtc: "01:00"
    }),
    createSubmission({
      id: "low",
      playerName: "Low",
      constructionSpeedups: 100 as never,
      preferredStartUtc: "00:00",
      preferredEndUtc: "01:00"
    })
  ];

  const result = computeDaySchedule(day, submissions);

  assert.equal(result.autoApprove, false);
  const assignedIds = result.slots.filter((slot) => slot.submission).map((slot) => slot.submission!.id);

  assert.deepEqual(new Set(assignedIds), new Set(["high", "mid"]));
  assert.equal(result.overflow[0]?.id, "low");
});

test("buildEligibleOptionsForSlot includes outside-window players but keeps in-window players first", () => {
  const slotIndex = 0;
  const inWindow = createSubmission({
    id: "in-window",
    playerName: "InWindow",
    constructionSpeedups: 100 as never,
    preferredStartUtc: "00:00",
    preferredEndUtc: "02:00"
  });
  const outOfWindow = createSubmission({
    id: "out-window",
    playerName: "OutWindow",
    constructionSpeedups: 999 as never,
    preferredStartUtc: "02:00",
    preferredEndUtc: "04:00"
  });

  const options = buildEligibleOptionsForSlot([outOfWindow, inWindow], [], slotIndex, DayMode.CONSTRUCTION);

  assert.equal(options.length, 2);
  assert.equal(options[0]?.id, "in-window");
  assert.equal(options[1]?.id, "out-window");
});

test("mergeManualAssignments recalculates the displayed day value for manual swaps", () => {
  const playerOne = createSubmission({
    id: "one",
    playerName: "One",
    constructionSpeedups: 4000 as never,
    preferredStartUtc: "00:00",
    preferredEndUtc: "03:00"
  });
  const playerTwo = createSubmission({
    id: "two",
    playerName: "Two",
    constructionSpeedups: 1000 as never,
    preferredStartUtc: "00:00",
    preferredEndUtc: "03:00"
  });

  const generated = computeDaySchedule(createDay(DayMode.CONSTRUCTION), [playerOne, playerTwo]).slots;
  const manualSlots: AssignmentSlot[] = [
    {
      id: "slot-0",
      prepDayId: "day-1",
      slotIndex: 0,
      startsAtUtc: "00:00",
      endsAtUtc: "00:30",
      submissionId: "two",
      isManualOverride: true,
      updatedById: "user-1",
      updatedAt: new Date("2026-04-01T00:00:00.000Z")
    },
    {
      id: "slot-1",
      prepDayId: "day-1",
      slotIndex: 1,
      startsAtUtc: "00:30",
      endsAtUtc: "01:00",
      submissionId: "one",
      isManualOverride: true,
      updatedById: "user-1",
      updatedAt: new Date("2026-04-01T00:00:00.000Z")
    }
  ];

  const merged = mergeManualAssignments(generated, manualSlots, [playerOne, playerTwo], DayMode.CONSTRUCTION);

  assert.equal(merged[0]?.submission?.id, "two");
  assert.equal(merged[0]?.focusValue, 1000);
  assert.equal(merged[0]?.manual, true);
  assert.equal(merged[1]?.submission?.id, "one");
  assert.equal(merged[1]?.focusValue, 4000);
  assert.equal(merged[1]?.manual, true);
});

test("isSubmissionEligibleForSlot supports overnight UTC windows", () => {
  const overnight = createSubmission({
    id: "overnight",
    playerName: "Overnight",
    preferredStartUtc: "23:00",
    preferredEndUtc: "01:00"
  });

  assert.equal(isSubmissionEligibleForSlot(46, overnight), true);
  assert.equal(isSubmissionEligibleForSlot(47, overnight), true);
  assert.equal(isSubmissionEligibleForSlot(0, overnight), true);
  assert.equal(isSubmissionEligibleForSlot(1, overnight), true);
  assert.equal(isSubmissionEligibleForSlot(2, overnight), false);
});

test("buildEligibleOptionsForSlot still returns choices for auto-approve days", () => {
  const early = createSubmission({
    id: "early",
    playerName: "Early",
    preferredStartUtc: "00:00",
    preferredEndUtc: "02:00"
  });
  const late = createSubmission({
    id: "late",
    playerName: "Late",
    preferredStartUtc: "03:00",
    preferredEndUtc: "05:00"
  });

  const options = buildEligibleOptionsForSlot([late, early], [], 0, DayMode.AUTO_APPROVE);

  assert.equal(options[0]?.id, "early");
  assert.equal(options[1]?.id, "late");
});
