import test from "node:test";
import assert from "node:assert/strict";

import { playerSubmissionSchema } from "../../lib/validation";

function buildSubmission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    playerName: "Player One",
    allianceTag: "",
    generalSpeedups: 0,
    researchSpeedups: 0,
    constructionSpeedups: 1,
    troopTrainingSpeedups: 0,
    preferredStartUtc: "00:00",
    preferredEndUtc: "02:00",
    notes: "",
    ...overrides
  };
}

test("playerSubmissionSchema accepts overnight UTC windows", () => {
  const result = playerSubmissionSchema.safeParse(
    buildSubmission({
      preferredStartUtc: "23:00",
      preferredEndUtc: "01:00"
    })
  );

  assert.equal(result.success, true);
});

test("playerSubmissionSchema rejects zero-length UTC windows", () => {
  const result = playerSubmissionSchema.safeParse(
    buildSubmission({
      preferredStartUtc: "23:00",
      preferredEndUtc: "23:00"
    })
  );

  assert.equal(result.success, false);
});
