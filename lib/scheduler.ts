import { AssignmentSlot, DayMode, PlayerSubmission, PrepDay } from "@prisma/client";

export const SLOT_COUNT = 48;
const SLOT_MINUTES = 30;

type SchedulablePrepDay = PrepDay;
type SchedulableSubmission = PlayerSubmission;

const dayModeLabels: Record<DayMode, string> = {
  AUTO_APPROVE: "Auto Approve",
  CONSTRUCTION: "Construction",
  RESEARCH: "Research",
  GENERAL: "General",
  TROOP_TRAINING: "Troop Training"
};

type SpeedupKey =
  | "generalSpeedups"
  | "researchSpeedups"
  | "constructionSpeedups"
  | "troopTrainingSpeedups";

function modeToSpeedupKey(mode: DayMode): SpeedupKey | null {
  switch (mode) {
    case DayMode.CONSTRUCTION:
      return "constructionSpeedups";
    case DayMode.RESEARCH:
      return "researchSpeedups";
    case DayMode.GENERAL:
      return "generalSpeedups";
    case DayMode.TROOP_TRAINING:
      return "troopTrainingSpeedups";
    case DayMode.AUTO_APPROVE:
      return null;
  }
}

function parseTime(value: string) {
  if (value === "24:00") {
    return 24 * 60;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatClock(totalMinutes: number) {
  if (totalMinutes === 24 * 60) {
    return "24:00";
  }

  const wrappedMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(wrappedMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (wrappedMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatSlot(slotIndex: number) {
  const start = slotIndex * SLOT_MINUTES;
  const end = start + SLOT_MINUTES;

  return {
    startsAtUtc: formatClock(start),
    endsAtUtc: formatClock(end),
    label: `${formatClock(start)} - ${formatClock(end)}`
  };
}

export function isSubmissionEligibleForSlot(slotIndex: number, submission: SchedulableSubmission) {
  const slotStart = slotIndex * SLOT_MINUTES;
  const startMinutes = parseTime(submission.preferredStartUtc);
  const endMinutes = parseTime(submission.preferredEndUtc);

  if (startMinutes < endMinutes) {
    return slotStart >= startMinutes && slotStart < endMinutes;
  }

  return slotStart >= startMinutes || slotStart < endMinutes;
}

function totalSpeedups(submission: SchedulableSubmission) {
  return (
    Number(submission.generalSpeedups) +
    Number(submission.researchSpeedups) +
    Number(submission.constructionSpeedups) +
    Number(submission.troopTrainingSpeedups)
  );
}

function windowLength(submission: SchedulableSubmission) {
  const startMinutes = parseTime(submission.preferredStartUtc);
  const endMinutes = parseTime(submission.preferredEndUtc);

  if (startMinutes < endMinutes) {
    return endMinutes - startMinutes;
  }

  return 24 * 60 - startMinutes + endMinutes;
}

function compareSubmissions(left: SchedulableSubmission, right: SchedulableSubmission, speedupKey: SpeedupKey) {
  return (
    Number(right[speedupKey]) - Number(left[speedupKey]) ||
    windowLength(left) - windowLength(right) ||
    totalSpeedups(right) - totalSpeedups(left) ||
    left.preferredStartUtc.localeCompare(right.preferredStartUtc) ||
    left.playerName.localeCompare(right.playerName)
  );
}

function maximizeAssignments(submissions: SchedulableSubmission[], speedupKey: SpeedupKey) {
  const candidateSubmissions = [...submissions]
    .filter((submission) => Number(submission[speedupKey]) > 0)
    .sort((left, right) => compareSubmissions(left, right, speedupKey));

  const source = 0;
  const submissionOffset = 1;
  const slotOffset = submissionOffset + candidateSubmissions.length;
  const sink = slotOffset + SLOT_COUNT;
  const graph = Array.from({ length: sink + 1 }, () => [] as Array<{ to: number; rev: number; capacity: number; cost: number }>);

  function addEdge(from: number, to: number, capacity: number, cost: number) {
    const forward = { to, rev: graph[to].length, capacity, cost };
    const reverse = { to: from, rev: graph[from].length, capacity: 0, cost: -cost };
    graph[from].push(forward);
    graph[to].push(reverse);
  }

  candidateSubmissions.forEach((submission, index) => {
    const submissionNode = submissionOffset + index;
    addEdge(source, submissionNode, 1, 0);

    for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
      if (isSubmissionEligibleForSlot(slotIndex, submission)) {
        addEdge(submissionNode, slotOffset + slotIndex, 1, -Number(submission[speedupKey]));
      }
    }
  });

  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
    addEdge(slotOffset + slotIndex, sink, 1, 0);
  }

  const assignments = Array<SchedulableSubmission | null>(SLOT_COUNT).fill(null);

  while (true) {
    const distance = Array(sink + 1).fill(Infinity);
    const previousNode = Array(sink + 1).fill(-1);
    const previousEdge = Array(sink + 1).fill(-1);
    const inQueue = Array(sink + 1).fill(false);
    const queue = [source];

    distance[source] = 0;
    inQueue[source] = true;

    while (queue.length) {
      const node = queue.shift()!;
      inQueue[node] = false;

      graph[node].forEach((edge, edgeIndex) => {
        if (edge.capacity <= 0) {
          return;
        }

        const nextDistance = distance[node] + edge.cost;

        if (nextDistance < distance[edge.to]) {
          distance[edge.to] = nextDistance;
          previousNode[edge.to] = node;
          previousEdge[edge.to] = edgeIndex;

          if (!inQueue[edge.to]) {
            queue.push(edge.to);
            inQueue[edge.to] = true;
          }
        }
      });
    }

    if (!Number.isFinite(distance[sink]) || distance[sink] >= 0) {
      break;
    }

    let current = sink;
    while (current !== source) {
      const node = previousNode[current];
      const edge = graph[node][previousEdge[current]];
      edge.capacity -= 1;
      graph[current][edge.rev].capacity += 1;
      current = node;
    }
  }

  candidateSubmissions.forEach((submission, index) => {
    const submissionNode = submissionOffset + index;
    graph[submissionNode].forEach((edge) => {
      if (edge.to >= slotOffset && edge.to < sink && edge.capacity === 0) {
        assignments[edge.to - slotOffset] = submission;
      }
    });
  });

  return assignments;
}

export function formatDays(value: number | string | { toString(): string }) {
  const numberValue = Number(value);
  return numberValue.toFixed(numberValue % 1 === 0 ? 0 : 1);
}

export function getDayModeLabel(mode: DayMode) {
  return dayModeLabels[mode];
}

export function formatWindowLabel(start: string, end: string) {
  if (start === "00:00" && end === "24:00") {
    return "Full day UTC";
  }

  if (parseTime(start) >= parseTime(end)) {
    return `${start} - ${end} (overnight UTC)`;
  }

  return `${start} - ${end}`;
}

export function getModeSpeedupKey(mode: DayMode) {
  return modeToSpeedupKey(mode);
}

export function buildEligibleOptionsForSlot(
  submissions: SchedulableSubmission[],
  _slots: Array<{ slotIndex: number; submission: SchedulableSubmission | null }>,
  slotIndex: number,
  mode: DayMode
) {
  const speedupKey = modeToSpeedupKey(mode);

  if (!speedupKey) {
    return submissions.sort((left, right) => {
      const leftEligible = isSubmissionEligibleForSlot(slotIndex, left);
      const rightEligible = isSubmissionEligibleForSlot(slotIndex, right);

      return (
        Number(rightEligible) - Number(leftEligible) ||
        left.preferredStartUtc.localeCompare(right.preferredStartUtc) ||
        left.playerName.localeCompare(right.playerName)
      );
    });
  }

  return submissions
    .sort((left, right) => {
      const leftEligible = isSubmissionEligibleForSlot(slotIndex, left);
      const rightEligible = isSubmissionEligibleForSlot(slotIndex, right);

      return Number(rightEligible) - Number(leftEligible) || compareSubmissions(left, right, speedupKey);
    });
}

export function buildOverflowForDay(
  mode: DayMode,
  submissions: SchedulableSubmission[],
  assignedSubmissionIds: Set<string>
) {
  const speedupKey = modeToSpeedupKey(mode);

  if (!speedupKey) {
    return [];
  }

  return submissions
    .filter((submission) => !assignedSubmissionIds.has(submission.id))
    .sort((left, right) => compareSubmissions(left, right, speedupKey));
}

export function computeDaySchedule(day: SchedulablePrepDay, submissions: SchedulableSubmission[]) {
  const speedupKey = modeToSpeedupKey(day.mode);

  if (!speedupKey) {
    return {
      autoApprove: true,
      slots: [],
      overflow: [] as SchedulableSubmission[]
    };
  }

  const assignments = maximizeAssignments(submissions, speedupKey);
  const slots = Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
    const slot = formatSlot(slotIndex);
    const submission = assignments[slotIndex];

    return {
      slotIndex,
      startsAtUtc: slot.startsAtUtc,
      endsAtUtc: slot.endsAtUtc,
      label: slot.label,
      submission,
      focusValue: submission ? Number(submission[speedupKey]) : null
    };
  });

  const assignedIds = new Set(slots.filter((slot) => slot.submission).map((slot) => slot.submission!.id));
  const overflow = submissions
    .filter((submission) => !assignedIds.has(submission.id))
    .sort((left, right) => compareSubmissions(left, right, speedupKey));

  return {
    autoApprove: false,
    slots,
    overflow
  };
}

export function mergeManualAssignments(
  generatedSlots: ReturnType<typeof computeDaySchedule>["slots"],
  manualSlots: AssignmentSlot[],
  submissions: SchedulableSubmission[],
  mode: DayMode
) {
  const submissionsById = new Map(submissions.map((submission) => [submission.id, submission]));
  const speedupKey = modeToSpeedupKey(mode);
  const slots = generatedSlots.map((slot) => ({
    ...slot,
    manual: false
  }));

  manualSlots.forEach((manualSlot) => {
    const target = slots.find((slot) => slot.slotIndex === manualSlot.slotIndex);

    if (!target) {
      return;
    }

    const submission = manualSlot.submissionId ? submissionsById.get(manualSlot.submissionId) || null : null;

    slots.forEach((slot) => {
      if (submission && slot.slotIndex !== manualSlot.slotIndex && slot.submission?.id === submission.id) {
        slot.submission = null;
        slot.focusValue = null;
      }
    });

    target.submission = submission;
    target.focusValue = submission && speedupKey ? Number(submission[speedupKey]) : null;
    target.manual = manualSlot.isManualOverride;
  });

  return slots;
}
